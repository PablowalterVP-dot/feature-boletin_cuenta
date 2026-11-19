"""Concurrencia real: dos conexiones independientes sobre la misma base.

Es lo que `SELECT … FOR UPDATE` existe para resolver: dos personas de Estadística que
validan o remiten el mismo reporte a la vez, o dos que abren el mismo periodo. Las demás
pruebas corren en una sola transacción y no pueden ver esto.

Para que dos conexiones vean los mismos datos, el escenario se **confirma** de verdad; al
terminar se reinstala la base de pruebas para dejarla como estaba (unos segundos por
prueba). Por eso son pocas y cada una cuenta una historia completa.

La secuencia de cada una:

    1. la conexión A transiciona y retiene el bloqueo de la fila (NO confirma todavía);
    2. la conexión B intenta lo mismo y **debe quedarse esperando** (se comprueba);
    3. A confirma; B despierta, ve el estado nuevo y recibe el error que corresponde.
"""

import threading
import time

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

import escenario as e
from app.datos import reportes as repo
from app.datos.modelos import Remision, Reporte, ReporteHistorialEstado
from app.dominio.reloj import RelojFijo
from app.dominio.transiciones import EstadoNoPermite, ReporteYaExiste
from app.servicios.transiciones import transicionar
from conftest import instalar_bd

pytestmark = pytest.mark.bd

RELOJ = RelojFijo(e.AHORA)
ESPERA_PARA_CONFIRMAR_QUE_B_SE_BLOQUEA = 0.8  # segundos


@pytest.fixture
def base_confirmada(motor_bd):
    """Una base con lo preparado ya confirmado; al terminar, reinstalada."""
    try:
        yield motor_bd
    finally:
        instalar_bd(motor_bd)


def preparar(motor, hasta: str | None):
    """Confirma el escenario: catálogo de ejemplo, personas y un reporte de agosto en el
    estado pedido (`None` = sin reporte). Devuelve (área, revisor A, revisor B)."""
    with Session(motor) as s:
        e.montar_catalogo_de_ejemplo(s)
        dig = e.digitador_de_nutricion(s)
        rev_a = e.revisor_de_estadistica(s, "rev.a")
        rev_b = e.revisor_de_estadistica(s, "rev.b")
        if hasta is not None:
            transicionar(s, dig, RELOJ, formato="NUT", periodo="2026-08", accion="crear")
            e.dar_carga_aceptada(s, e.reporte_de(s))
            for accion, actor in {"borrador": [], "remitido": [("enviar", dig)]}[hasta]:
                transicionar(s, actor, RELOJ, formato="NUT", periodo="2026-08", accion=accion)
        s.commit()
    return dig, rev_a, rev_b


class Corrida:
    """Una transición en su propio hilo y su propia conexión, con el resultado a mano."""

    def __init__(self, motor, actor, accion, *, confirmar_cuando: threading.Event | None = None):
        self.motor, self.actor, self.accion = motor, actor, accion
        self.confirmar_cuando = confirmar_cuando
        self.termino = threading.Event()
        self.lista = threading.Event()  # ya transicionó (y retiene el bloqueo, si confirma después)
        self.resultado = None
        self.error: BaseException | None = None
        self.hilo = threading.Thread(target=self._correr, daemon=True)

    def _correr(self):
        with Session(self.motor) as s:
            try:
                # Si el bloqueo no llegara a soltarse, que el hilo falle y no se cuelgue la prueba.
                s.execute(text("SET LOCAL lock_timeout = '12s'"))
                self.resultado = transicionar(s, self.actor, RELOJ, formato="NUT", periodo="2026-08", accion=self.accion)
                self.lista.set()
                if self.confirmar_cuando is not None:
                    self.confirmar_cuando.wait(timeout=15)
                s.commit()
            except BaseException as error:  # noqa: BLE001 - se guarda para que la prueba lo inspeccione
                self.error = error
                s.rollback()
            finally:
                self.lista.set()
                self.termino.set()

    def iniciar(self) -> "Corrida":
        self.hilo.start()
        return self


def dos_a_la_vez(motor, a: Corrida, b_actor, accion) -> Corrida:
    """A retiene el bloqueo; B se queda esperando (se comprueba); A confirma; B despierta."""
    a.iniciar()
    assert a.lista.wait(timeout=15), "la conexión A no llegó a transicionar"
    assert a.error is None, f"A falló: {a.error!r}"
    b = Corrida(motor, b_actor, accion).iniciar()
    time.sleep(ESPERA_PARA_CONFIRMAR_QUE_B_SE_BLOQUEA)
    assert not b.termino.is_set(), "B terminó sin esperar: el bloqueo de fila no la detuvo"
    a.confirmar_cuando.set()  # A confirma: B despierta
    assert b.termino.wait(timeout=15), "B no despertó tras la confirmación de A"
    a.termino.wait(timeout=5)
    return b


def leer(motor, consulta):
    with Session(motor) as s:
        return consulta(s)


# ---------------------------------------------------------------------- enviar y rectificar


def prueba_dos_envios_simultaneos_no_duplican_ni_las_remisiones_ni_el_historial(base_confirmada):
    """Desde el 12/10/2026 enviar entrega a la matriz: dos envíos a la vez (dos pestañas,
    un doble clic) no pueden dejar dos constancias ni dos remisiones por oficina."""
    dig, _, _ = preparar(base_confirmada, "borrador")
    a = Corrida(base_confirmada, dig, "enviar", confirmar_cuando=threading.Event())
    b = dos_a_la_vez(base_confirmada, a, dig, "enviar")

    assert a.error is None and a.resultado.estado_destino == "remitido"
    assert [(x.destino, x.es_sin_validar) for x in a.resultado.remisiones] == [("planeamiento", False)]
    assert isinstance(b.error, EstadoNoPermite) and b.error.datos["estado"] == "remitido"  # vio el estado nuevo

    def remisiones(s):
        r = e.reporte_de(s)
        return repo.remisiones_de(s, r.id), [h[0] for h in repo.historial_de(s, r.id)]

    todas, acciones = leer(base_confirmada, remisiones)
    assert acciones == ["crear", "enviar"]  # un solo envío en el historial
    assert [(d, sv, v) for d, sv, v, *_ in todas] == [("planeamiento", False, True)]  # una sola remisión


def prueba_dos_rectificaciones_simultaneas_reabren_una_sola_vez(base_confirmada):
    _, rev_a, rev_b = preparar(base_confirmada, "remitido")
    a = Corrida(base_confirmada, rev_a, "rectificar", confirmar_cuando=threading.Event())
    b = dos_a_la_vez(base_confirmada, a, rev_b, "rectificar")

    assert a.error is None and a.resultado.numero_rectificacion == 1
    assert isinstance(b.error, EstadoNoPermite) and b.error.datos["estado"] == "borrador"

    def acciones(s):
        return [h[0] for h in repo.historial_de(s, e.reporte_de(s).id)]

    assert leer(base_confirmada, acciones) == ["crear", "enviar", "rectificar"]


# ------------------------------------------------------------------------ crear


def prueba_dos_personas_que_abren_el_mismo_periodo_a_la_vez_crean_un_solo_reporte(base_confirmada):
    """No hay fila que bloquear todavía: la que llega segunda espera en el `INSERT … ON
    CONFLICT DO NOTHING` sobre el índice único, y al despertar no encuentra su fila."""
    dig, _, _ = preparar(base_confirmada, None)
    a = Corrida(base_confirmada, dig, "crear", confirmar_cuando=threading.Event())
    b = dos_a_la_vez(base_confirmada, a, dig, "crear")

    assert a.error is None and a.resultado.estado_destino == "borrador"
    assert isinstance(b.error, ReporteYaExiste)

    def contar(s):
        return (
            s.scalar(select(func.count()).select_from(Reporte)),
            s.scalar(select(func.count()).select_from(ReporteHistorialEstado)),
        )

    assert leer(base_confirmada, contar) == (1, 1)  # un reporte, un solo «crear» en el historial


# ------------------------------------------------------- el bloqueo es de la fila: lo demás no espera


def prueba_el_bloqueo_es_solo_del_reporte_transicionado_y_no_frena_a_otro_periodo(base_confirmada):
    """Un reporte bloqueado no debe frenar a quien trabaja en otro: el bloqueo es por fila."""
    dig, _, _ = preparar(base_confirmada, "borrador")
    a = Corrida(base_confirmada, dig, "enviar", confirmar_cuando=threading.Event()).iniciar()
    assert a.lista.wait(timeout=15) and a.error is None  # A retiene el bloqueo del reporte de agosto

    with Session(base_confirmada) as s:  # C abre julio mientras A sigue sin confirmar
        s.execute(text("SET LOCAL lock_timeout = '3s'"))
        inicio = time.monotonic()
        r = transicionar(s, dig, RELOJ, formato="NUT", periodo="2026-07", accion="crear")
        s.commit()
    assert r.estado_destino == "borrador" and time.monotonic() - inicio < 2.5  # no esperó a A

    a.confirmar_cuando.set()
    a.termino.wait(timeout=10)


# ------------------------------------------------------------- las pruebas se limpian solas


def prueba_la_base_queda_como_estaba_tras_las_pruebas_de_concurrencia(motor_bd):
    """Guarda de las anteriores: el `finally` reinstala la base, así que las pruebas que
    vienen después empiezan con la semilla intacta y sin reportes."""
    with Session(motor_bd) as s:
        assert s.scalar(select(func.count()).select_from(Reporte)) == 0
        assert s.scalar(select(func.count()).select_from(Remision)) == 0
        assert s.scalar(text("SELECT count(*) FROM seguridad.usuario")) == 1  # solo el superadmin sembrado
