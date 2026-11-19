/* Detalle día por día del reporte de Nutrición, paginado por semana.

   El oficio son dos reportes —Comensales y Pacientes—, cada uno en
   hospitalización y emergencia, con una columna por día. Mostrarlo tal cual
   son 36 filas por 31 columnas: nadie revisa eso, lo recorre. Aquí:

     - los cuatro cuadros en una sola tira, en el orden del oficio (1 a 4),
       cada uno con su total: se recorren en orden, sin pestañas anidadas;
     - el calendario del mes a la izquierda, con el estado de cada día;
     - una semana a la vez (lunes a domingo), como se organiza el servicio:
       los ceros de domingo y feriado se ven juntos;
     - por grupo, los días en filas y las comidas en columnas, en dos
       columnas cuando el ancho lo permite;
     - todos los grupos a la vista, en el orden del oficio. Los que no cambian
       en todo el mes (los internos: 20 cada día) lo dicen en su cabecera; ya no
       se pliegan, porque un botón para ver lo que se vino a revisar estorba.

   Sirve para revisar lo que leyó el bot y, sin Excel, para digitar: flechas y
   Enter mueven entre casillas, se puede pegar un bloque copiado de Excel y
   cada día tiene «copiar del día anterior». Al pararse en una casilla se ve
   de qué celda del archivo salió. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, DataTable, Icon, IconButton, NumberCell, SelectionStrip, Tooltip, cx } from '@hrl/core-ui';
import { FORMATOS, claveCasilla } from '@/app/datos/formatos/nutricion.js';
import { valoresDe, totalFormato } from '@/app/datos/formatos/nutricion-calculos.js';
import { celdaDeOrigen } from '@/app/servicios/bot-validador.js';
import { diasDelMes, nombreDeDia, esFinDeSemana, etiquetaMes } from '@/app/dominio/periodos.js';
import { numero } from '@/app/dominio/formato.js';
import { CalendarioPeriodo } from '../Comunes.jsx';

const COMIDAS = ['desayuno', 'almuerzo', 'cena'];
const ETIQUETA_COMIDA = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena' };

/* ------------------------------------------------------------- marcas */

/* Lo que el bot encontró, casilla por casilla: error, aviso o vacía. */
export function marcasDe(informe) {
  const marcas = new Map();
  if (!informe) return marcas;
  for (const e of informe.errores ?? []) {
    if (e.id === 'incompleto') {
      for (const c of e.casillas ?? []) marcas.set(claveCasilla(e.formato, c.fila, c.dia), { nivel: 'vacia', titulo: 'Casilla sin dato' });
    } else if (e.dia) {
      marcas.set(claveCasilla(e.formato, e.fila, e.dia), { nivel: 'error', titulo: e.titulo });
    } else if (e.fila) {
      marcas.set(`${e.formato}|${e.fila}|total`, { nivel: 'error', titulo: e.titulo });
    }
  }
  for (const a of informe.avisos ?? []) {
    if (a.dia) marcas.set(claveCasilla(a.formato, a.fila, a.dia), { nivel: 'aviso', titulo: a.titulo });
  }
  return marcas;
}

function tieneMarca(marcas, idFormato, filas) {
  for (const k of marcas.keys()) if (filas.some((f) => k.startsWith(`${idFormato}|${f.clave}|`))) return true;
  return false;
}

/* ------------------------------------------------------ semanas y grupos */

/* Semanas de lunes a domingo; la primera y la última pueden ser cortas. */
export function semanasDe(periodo) {
  const semanas = [];
  let actual = [];
  for (let d = 1; d <= diasDelMes(periodo); d += 1) {
    actual.push(d);
    if (nombreDeDia(periodo, d) === 'Domingo') {
      semanas.push(actual);
      actual = [];
    }
  }
  if (actual.length) semanas.push(actual);
  return semanas;
}

/* Los grupos del cuadro que aplican ese mes: un grupo que el Excel de ese mes
   no trae (Patrimonio fuera de abril) no se pinta como casillas vacías. */
function gruposDe(f, datos) {
  const ausentes = datos?.ausentes?.[f.id] ?? [];
  const grupos = [];
  for (const fila of f.filas.filter((x) => !ausentes.includes(x.clave))) {
    const ultimo = grupos.at(-1);
    if (ultimo?.grupo === fila.grupo) ultimo.filas.push(fila);
    else grupos.push({ grupo: fila.grupo, label: fila.grupoLabel, ayuda: fila.ayuda, filas: [fila] });
  }
  return grupos;
}

/* Un grupo es fijo si en todo el mes cada comida sirve la misma cantidad los
   días que hay servicio (los ceros se permiten: domingos, feriados). */
function fijoDe(datos, f, g, periodo) {
  const porComida = {};
  const ceros = new Set();
  for (const fila of g.filas) {
    const vs = valoresDe(datos, f.id, fila.clave, periodo);
    if (vs.some((v) => v == null)) return null;
    const distintos = new Set(vs.filter((v) => v !== 0));
    if (distintos.size !== 1) return null;
    porComida[fila.comida] = [...distintos][0];
    vs.forEach((v, i) => v === 0 && ceros.add(i + 1));
  }
  const cantidades = new Set(Object.values(porComida));
  const total = g.filas.reduce((s, fila) => s + valoresDe(datos, f.id, fila.clave, periodo).reduce((a, b) => a + b, 0), 0);
  return {
    texto: cantidades.size === 1 ? `${[...cantidades][0]} por comida` : g.filas.map((fila) => `${fila.comidaLabel.slice(0, 3)}. ${porComida[fila.comida]}`).join(' · '),
    ceros: [...ceros].sort((a, b) => a - b),
    total,
  };
}

/* ----------------------------------------------------------- la semana */

function TablaGrupo({ f, g, indice, dias, datos, periodo, editable, marcas, diaElegido, onCambiar }) {
  const comidas = COMIDAS.filter((c) => g.filas.some((fila) => fila.comida === c));
  const filaDe = (comida) => g.filas.find((fila) => fila.comida === comida);
  const valor = (comida, d) => valoresDe(datos, f.id, filaDe(comida).clave, periodo)[d - 1];

  const columnas = [
    {
      key: 'dia',
      label: 'Día',
      width: 76,
      render: (d) => (
        <span className={cx('hrl-semana__dia', esFinDeSemana(periodo, d) && 'hrl-semana__dia--finde')}>
          {nombreDeDia(periodo, d).slice(0, 3)} {d}
        </span>
      ),
    },
    ...comidas.map((comida, c) => ({
      key: comida,
      label: ETIQUETA_COMIDA[comida],
      align: 'right',
      render: (d) => {
        const fila = filaDe(comida);
        const clave = claveCasilla(f.id, fila.clave, d);
        const marca = marcas.get(clave);
        const editada = datos?.editadas && Object.prototype.hasOwnProperty.call(datos.editadas, clave);
        const ilegible = datos?.ilegibles?.[clave];
        const v = valor(comida, d);
        return (
          <span
            className={cx('hrl-casilla', marca && `hrl-casilla--${marca.nivel}`, editada && 'hrl-casilla--editada')}
            data-g={indice}
            data-r={dias.indexOf(d)}
            data-c={c}
            data-fila={fila.clave}
            data-dia={d}
          >
            {editable ? (
              <NumberCell
                value={v}
                onChange={(nuevo) => onCambiar([{ fila: fila.clave, dia: d, valor: nuevo }])}
                aria-label={`${g.label}, ${fila.comidaLabel}, ${nombreDeDia(periodo, d)} ${d}`}
                width={84}
                error={marca?.nivel === 'error'}
                placeholder={ilegible ?? ''}
              />
            ) : (
              <span className="hrl-mono">{v ?? ilegible ?? '—'}</span>
            )}
            {marca && marca.nivel !== 'vacia' && (
              <span className="hrl-casilla__marca" aria-hidden="true">
                <Icon name={marca.nivel === 'aviso' ? 'sh-warn' : 'sh-crit'} size={13} />
              </span>
            )}
          </span>
        );
      },
    })),
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      width: 80,
      render: (d) => {
        const vs = comidas.map((c) => valor(c, d)).filter((v) => v != null);
        return <strong className="hrl-mono">{vs.length ? numero(vs.reduce((a, b) => a + b, 0)) : '—'}</strong>;
      },
    },
  ];

  if (editable) {
    columnas.push({
      key: 'accion',
      label: '',
      width: 52,
      render: (d) =>
        d > 1 ? (
          <Tooltip title="Copiar del día anterior" body={`Repite en el ${d} lo registrado el ${d - 1} para ${g.label}.`} focusable={false}>
            <IconButton
              icon="sh-swap"
              aria-label={`Copiar el ${d - 1} en el ${d}, ${g.label}`}
              onClick={() => onCambiar(comidas.map((c) => ({ fila: filaDe(c).clave, dia: d, valor: valor(c, d - 1) })))}
            />
          </Tooltip>
        ) : null,
    });
  }

  return (
    <DataTable
      columns={columnas}
      rows={dias}
      rowKey={(d) => d}
      rowClass={(d) => cx(d === diaElegido && 'hrl-semana__fila--elegida', esFinDeSemana(periodo, d) && 'hrl-semana__fila--finde')}
    />
  );
}

/* ------------------------------------------------------------ el detalle */

/* props:
     datos, periodo, editable, onCambiar(idFormato, cambios)
     origen     de qué celda del Excel salió cada fila
     informe    último informe del bot (para marcar casillas y días)
     foco       { formato, fila, dia, n }: abrir ese día y enfocar la casilla
     soloFormato  mostrar un único cuadro, sin pestañas (visor de Estadística) */
export default function Detalle({ datos, periodo, editable, onCambiar = () => {}, origen, informe, foco, soloFormato }) {
  const [cuadro, setCuadro] = useState(soloFormato ?? FORMATOS[0].id);
  const [dia, setDia] = useState(1);
  const [activa, setActiva] = useState(null);
  const contenedor = useRef(null);

  const f = FORMATOS.find((x) => x.id === (soloFormato ?? cuadro)) ?? FORMATOS[0];
  const marcas = useMemo(() => marcasDe(informe), [informe]);
  const semanas = semanasDe(periodo);
  const semana = semanas.find((s) => s.includes(dia)) ?? semanas[0];
  const iSemana = semanas.indexOf(semana);
  const grupos = gruposDe(f, datos);
  const filasQueAplican = grupos.flatMap((g) => g.filas);

  /* Un hallazgo pide un día: se abre su reporte, su servicio, su semana y su
     grupo, y se enfoca la casilla. */
  useEffect(() => {
    if (!foco) return;
    const destino = FORMATOS.find((x) => x.id === foco.formato);
    if (!destino) return;
    setCuadro(destino.id);
    setDia(foco.dia ?? 1);
    setActiva({ fila: foco.fila, dia: foco.dia ?? 1 });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = contenedor.current?.querySelector(`[data-fila="${foco.fila}"][data-dia="${foco.dia ?? 1}"]`);
        (el?.querySelector('input') ?? el)?.focus();
        el?.scrollIntoView({ block: 'center' });
      }),
    );
    // Se atiende una vez por pedido (foco.n).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.n]);

  const estadoDelDia = (d) => {
    const vs = filasQueAplican.map((fila) => valoresDe(datos, f.id, fila.clave, periodo)[d - 1]);
    const llenas = vs.filter((v) => v != null).length;
    return llenas === 0 ? 'vacio' : llenas === vs.length ? 'lleno' : 'parcial';
  };
  const hallazgosDelDia = (d) => filasQueAplican.map((fila) => marcas.get(claveCasilla(f.id, fila.clave, d))).filter((m) => m && m.nivel !== 'vacia');

  /* Flechas y Enter entre casillas de un mismo grupo. */
  const alTeclear = (e) => {
    const el = e.target.closest?.('[data-g]');
    if (!el) return;
    const m = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [e.shiftKey ? -1 : 1, 0] }[e.key];
    if (!m) return;
    const destino = contenedor.current.querySelector(`[data-g="${el.dataset.g}"][data-r="${Number(el.dataset.r) + m[0]}"][data-c="${Number(el.dataset.c) + m[1]}"] input`);
    if (destino) {
      e.preventDefault();
      destino.focus();
      destino.select();
    }
  };

  /* Pegar un bloque copiado de Excel: filas = días, columnas = comidas. */
  const alPegar = (e) => {
    if (!editable) return;
    const el = e.target.closest?.('[data-g]');
    const texto = e.clipboardData?.getData('text/plain') ?? '';
    if (!el || !/[\t\n]/.test(texto.trim())) return;
    e.preventDefault();
    const g = grupos[Number(el.dataset.g)];
    const comidas = COMIDAS.filter((c) => g.filas.some((fila) => fila.comida === c));
    const lineas = texto.replace(/\r/g, '').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
    const cambios = [];
    lineas.forEach((linea, i) =>
      linea.split('\t').forEach((celda, j) => {
        const d = Number(el.dataset.dia) + i;
        const comida = comidas[Number(el.dataset.c) + j];
        const limpio = celda.trim().replace(/\s/g, '');
        if (!comida || d > diasDelMes(periodo) || (limpio && !/^\d+$/.test(limpio))) return;
        cambios.push({ fila: g.filas.find((x) => x.comida === comida).clave, dia: d, valor: limpio === '' ? null : Number(limpio) });
      }),
    );
    if (cambios.length) onCambiar(f.id, cambios);
  };

  const procedencia = () => {
    if (!activa) return null;
    const fila = f.filas.find((x) => x.clave === activa.fila);
    if (!fila) return null;
    const clave = claveCasilla(f.id, fila.clave, activa.dia);
    const editada = datos?.editadas && Object.prototype.hasOwnProperty.call(datos.editadas, clave);
    const celda = celdaDeOrigen(origen, f.id, fila.clave, activa.dia);
    const texto = editada
      ? `corregido a mano; el archivo decía ${datos.editadas[clave] ?? '(vacío)'}`
      : celda
        ? `leído del archivo, hoja «${celda.hoja}», celda ${celda.ref}`
        : 'digitado en el sistema';
    return `${fila.grupoLabel} · ${fila.comidaLabel} · ${nombreDeDia(periodo, activa.dia)} ${activa.dia}: ${texto}.`;
  };

  const mes = etiquetaMes(periodo).toLowerCase();

  /* «Repetir en los días vacíos»: el día elegido está completo para el grupo
     y quedan días del mes sin dato. Llenar a los internos es escribir 20 una
     vez, no 93 veces. */
  const vaciosDe = (g) =>
    Array.from({ length: diasDelMes(periodo) }, (_, i) => i + 1).filter((d) => g.filas.some((fila) => valoresDe(datos, f.id, fila.clave, periodo)[d - 1] == null));
  const repetible = (g) => g.filas.every((fila) => valoresDe(datos, f.id, fila.clave, periodo)[dia - 1] != null) && vaciosDe(g).some((d) => d !== dia);
  const repetir = (g) =>
    vaciosDe(g).flatMap((d) =>
      g.filas
        .filter((fila) => valoresDe(datos, f.id, fila.clave, periodo)[d - 1] == null)
        .map((fila) => ({ fila: fila.clave, dia: d, valor: valoresDe(datos, f.id, fila.clave, periodo)[dia - 1] })),
    );

  const pintarGrupo = (g, i) => {
    const clave = `${f.id}|${g.grupo}`;
    const fijo = fijoDe(datos, f, g, periodo);
    const totalSemana = g.filas.reduce(
      (s, fila) => s + semana.reduce((a, d) => a + (valoresDe(datos, f.id, fila.clave, periodo)[d - 1] ?? 0), 0),
      0,
    );
    return (
      <section key={clave} className="hrl-grupo">
        <header className="hrl-grupo__cabeza">
          {g.ayuda ? (
            <Tooltip title={g.label} body={g.ayuda}>
              <strong>{g.label}</strong>
            </Tooltip>
          ) : (
            <strong>{g.label}</strong>
          )}
          <span className="hrl-grupo__resumen">
            Esta semana: {numero(totalSemana)}
            {fijo && (
              <span className="hrl-grupo__fijo">
                Igual todo el mes: {fijo.texto}
                {fijo.ceros.length ? ` (0 los días ${fijo.ceros.join(', ')})` : ''}
              </span>
            )}
          </span>
          {editable && repetible(g) && (
            <Tooltip
              title={`Repetir el día ${dia} en los días vacíos`}
              body={`Copia las cifras de ${g.label} del día ${dia} en todos los días del mes que todavía no tienen dato. Sirve para los grupos que reciben lo mismo cada día; los ceros de domingos y feriados se corrigen después.`}
              focusable={false}
            >
              <Button tone="ghost" size="sm" icon="sh-swap" onClick={() => onCambiar(f.id, repetir(g))}>
                Repetir el {dia} en los días vacíos
              </Button>
            </Tooltip>
          )}
        </header>
        <TablaGrupo
          f={f}
          g={g}
          indice={i}
          dias={semana}
          datos={datos}
          periodo={periodo}
          editable={editable}
          marcas={marcas}
          diaElegido={dia}
          onCambiar={(cambios) => onCambiar(f.id, cambios)}
        />
      </section>
    );
  };

  return (
    <div className="hrl-dias">
      {!soloFormato && (
        <SelectionStrip
          label="Cuadro del oficio"
          active={f.id}
          onChange={setCuadro}
          items={FORMATOS.map((fx) => {
            const t = totalFormato(datos, fx.id, periodo);
            return {
              key: fx.id,
              title: `${fx.numero}. ${fx.titulo}`,
              subtitle: t == null ? 'Sin datos' : `${numero(t)} raciones`,
              marked: tieneMarca(marcas, fx.id, fx.filas),
              tip: tieneMarca(marcas, fx.id, fx.filas) ? 'Tiene casillas por revisar' : undefined,
              description: fx.descripcion,
            };
          })}
        />
      )}

      <div className="hrl-registro">
        <CalendarioPeriodo
          periodo={periodo}
          dia={dia}
          onCambiar={setDia}
          estadoDe={estadoDelDia}
          descripcionDe={(d) => {
            const h = hallazgosDelDia(d);
            const base = { vacio: 'Sin registrar.', parcial: 'Faltan casillas.', lleno: 'Completo.' }[estadoDelDia(d)];
            return h.length ? `${base} ${h.map((x) => x.titulo).join(' ')}` : base;
          }}
        />

        <div className="hrl-semana" ref={contenedor} onKeyDown={alTeclear} onPaste={alPegar} onFocus={(e) => {
          const el = e.target.closest?.('[data-fila]');
          if (el) {
            setActiva({ fila: el.dataset.fila, dia: Number(el.dataset.dia) });
            e.target.select?.();
          }
        }}>
          <div className="hrl-semana__cabeza">
            <IconButton icon="sh-chevron" aria-label="Semana anterior" disabled={iSemana === 0} onClick={() => setDia(semanas[iSemana - 1][0])} style={{ transform: 'rotate(180deg)' }} />
            <strong>
              Semana {iSemana + 1} de {semanas.length} · {semana[0]} al {semana.at(-1)} de {mes}
            </strong>
            <IconButton icon="sh-chevron" aria-label="Semana siguiente" disabled={iSemana === semanas.length - 1} onClick={() => setDia(semanas[iSemana + 1][0])} />
            <span className="hrl-semana__paginas" role="group" aria-label="Ir a la semana">
              {semanas.map((s, i) => (
                <Button key={s[0]} size="sm" tone={i === iSemana ? 'blue' : 'ghost'} onClick={() => setDia(s[0])} aria-label={`Semana ${i + 1}, ${s[0]} al ${s.at(-1)}`}>
                  {i + 1}
                </Button>
              ))}
            </span>
          </div>

          <p className="hrl-semana__origen" aria-live="polite">
            <Icon name="sh-info" size={14} />
            {procedencia() ?? (editable ? 'Flechas y Enter para moverse; puede pegar un bloque copiado de Excel.' : 'Párese en una casilla para ver de dónde salió.')}
          </p>

          <div className="hrl-semana__tablas">{grupos.map(pintarGrupo)}</div>
        </div>
      </div>
    </div>
  );
}
