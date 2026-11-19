"""Las herramientas que instalan el módulo de indicadores de desempeño y que
muestran qué datos crudos hay cargados."""

import pytest
from sqlalchemy import text

from app.herramientas import instalar_desempeno, ver_fuentes
from app.servicios import fuentes as servicio
from prueba_cargar_his import TRAMA_28_SET, trama

pytestmark = pytest.mark.bd


def _tablas(sesion) -> int:
    return sesion.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN ('fuente', 'desempeno')")).scalar()


TABLAS = 15


def _permisos_del_modulo(sesion) -> int:
    return sesion.execute(text("SELECT count(*) FROM seguridad.permiso WHERE modulo = 'desempeno' AND fecha_eliminacion IS NULL")).scalar()


def prueba_los_scripts_se_aplican_en_el_orden_correcto():
    nombres = [s.name for s in instalar_desempeno.scripts()]
    assert nombres == [
        "0005_desempeno_esquema.sql",
        "0006_desempeno_tablero.sql",
        "0003_desempeno_catalogos.sql",
    ]


def prueba_instalar_sobre_una_base_que_ya_lo_tiene_no_toca_nada(sesion):
    assert instalar_desempeno.instalar(sesion) == []
    assert _tablas(sesion) == TABLAS


def prueba_instala_los_dos_esquemas_en_una_base_que_solo_tiene_el_esquema_base(sesion):
    sesion.execute(text("DROP SCHEMA desempeno CASCADE"))
    sesion.execute(text("DROP SCHEMA fuente CASCADE"))
    assert _tablas(sesion) == 0
    assert instalar_desempeno.instalar(sesion) == [
        "0005_desempeno_esquema.sql",
        "0006_desempeno_tablero.sql",
        "0003_desempeno_catalogos.sql",
    ]
    assert _tablas(sesion) == TABLAS
    assert sesion.execute(text("SELECT count(*) FROM desempeno.ficha")).scalar() == 34
    assert _permisos_del_modulo(sesion) == 2


def prueba_una_base_con_solo_el_primer_script_recibe_lo_que_le_falta_sin_perder_datos(sesion):
    sesion.execute(text("DROP SCHEMA desempeno CASCADE"))
    sesion.execute(text("DROP SCHEMA fuente CASCADE"))
    instalar_desempeno._correr(sesion, instalar_desempeno.MIGRACION_ESQUEMA)
    assert instalar_desempeno.instalar(sesion) == [
        "0006_desempeno_tablero.sql",
        "0003_desempeno_catalogos.sql",
    ]
    assert _tablas(sesion) == TABLAS
    assert sesion.execute(text("SELECT count(*) FROM desempeno.ficha")).scalar() == 34
    assert instalar_desempeno.instalar(sesion) == []


def prueba_una_instalacion_a_medias_se_dice_y_no_se_parcha(sesion):
    sesion.execute(text("DROP SCHEMA desempeno CASCADE"))
    with pytest.raises(instalar_desempeno.NoSePuede, match="quedó a medias"):
        instalar_desempeno.instalar(sesion)


def prueba_ver_fuentes_dice_hasta_que_mes_hay_y_de_que_archivo(sesion, tmp_path):
    servicio.cargar_his(sesion, trama(tmp_path, TRAMA_28_SET, ["2026-06-01", "2026-08-01", "2026-08-02"]))
    nombres = {"his_minsa": "HIS MINSA", "sinadef_hrl": "SINADEF del hospital", "sinadef_verificado": "Verificados"}
    texto = "\n".join(ver_fuentes.lineas_de(servicio.estado_de_fuentes(sesion), nombres, 0))
    assert "HIS MINSA (his_minsa): 2026-06 a 2026-08 · 2 meses · 3 filas" in texto
    assert "ATENCIÓN: faltan meses en medio: 2026-07" in texto
    assert f"{TRAMA_28_SET} · extraído el 28/09/2026" in texto
    assert "SINADEF del hospital (sinadef_hrl): sin datos cargados." in texto
    assert "Verificados (sinadef_verificado): 0 defunciones verificadas." in texto
