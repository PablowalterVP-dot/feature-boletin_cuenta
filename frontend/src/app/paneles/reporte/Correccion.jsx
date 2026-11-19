/* Corrección guiada del archivo del área, con Dr. Mochi. La comparten todas
   las áreas que suben su reporte (Nutrición, Laboratorio, Lavandería, Centro
   Quirúrgico y Gineco-Obstetricia con un Excel; Farmacia y Nefrología con un
   Word, donde cada tabla hace de hoja): lo propio de cada una —qué es cada
   casilla, cuántas hojas, cómo se ajustan sus fórmulas— está en
   servidor/bot-validador/src/areas/<área>/correccion.js. Sirve para cualquier
   mes que el área haya subido, también uno pasado (CargaDeMeses.jsx recuerda
   el archivo igual que la carga del mes).

   Un diálogo de tamaño fijo —el mismo para todos los errores—, sin X ni botón
   de salir (los errores se recorren con ‹ y ›): se termina con «Finalizar corrección» (que carga el libro si ya no
   queda ningún error y, si quedan, cierra conservando lo corregido) o con Esc.
   UNA columna, de arriba abajo, en el orden en que se piensa (21/10/2026):
     1. el selector de errores entre ‹ y ›;
     2. QUÉ NO COINCIDE (22/10/2026): la balanza (Balanza.jsx), con los dos
        lados en cifras y ≠ en medio —el RESUMEN frente a la hoja, las cifras
        de una suma frente al total escrito—, o la celda misma si el error no
        es una cuenta. Debajo, los arreglos: solo las celdas que cambian
        («E5 177 › 170») y «Aplicar». Sin párrafos: el porqué va en tooltips.
        Resuelto, la balanza queda en = , con deshacer y «Siguiente»;
     3. LA EVIDENCIA: su hoja recortada alrededor del error (HojaEnVista.jsx),
        con sus letras, números, rótulos y cabeceras, y la barra de la celda
        elegida (como la de fórmulas de Excel). La hoja muestra la respuesta
        por la que pasa el puntero («177 → 170», punteado) y lo aplicado como
        «~~177~~ 170». La hoja y la barra SOLO SE MIRAN (22/10/2026): las
        cifras cambian con los botones, nunca escribiendo en la tabla.
   Antes eran dos paneles —la hoja a la izquierda y Dr. Mochi a la derecha
   con sus causas en texto— y luego una pregunta con tarjetas descriptivas:
   el texto saturaba y no se veía qué estaba mal. El problema y la decisión quedaban lejos, se
   mostraba todo a la vez y la decisión no se preguntaba nunca: el área no
   sabía por dónde empezar. (Antes aún, una tabla «Celda · Qué es · Su Excel
   · Corregido»: el área reconoce su hoja, no una lista.)

   Responder NO pasa al error siguiente: el área se queda viendo el arreglo,
   y avanza con «Siguiente» cuando quiere. Saltar solo escondía justo lo que
   había que ver.

   Un área puede añadir tablas propias (`comparacion` en su correccion.js):
   Centro Quirúrgico, especialidad por especialidad. Se abren cuando una
   respuesta las pide (`detalle`): mostradas siempre, repetían lo que ya
   decían la balanza y la hoja.

   Con cada cambio el bot vuelve a revisar. Cuando ya no queda ningún error,
   «Finalizar corrección» aplica lo corregido al reporte, sin más preguntas:
   el área solo corrige en la hoja de la pantalla. Ya no se le ofrece descargar un
   Excel corregido (12/10/2026): era un paso más que nadie necesitaba.

   Por dentro, finalizar sigue armando SU libro con las celdas corregidas y lo
   carga como cualquier otro archivo, pasando por el bot. Así el sistema sigue
   guardando solo lo que se leyó de un Excel (la decisión del 28/09/2026), y
   el reemplazo no se vuelve a confirmar: el área ya vio, celda por celda, qué
   cambia. Antes pasaba por la confirmación de «Subir y reemplazar» de una
   carga cualquiera, y eso confundía: nadie estaba subiendo nada.

   La explicación no la escribe un modelo de lenguaje: sale de la evidencia del
   bot y de comprobaciones exactas (servidor/bot-validador/src/correccion.js). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, DataTable, Dialog, Icon, Stack, Toast, Tooltip } from '@hrl/core-ui';
import {
  abrirCorreccion,
  archivoGuardado,
  archivoRecordado,
  comoArchivo,
  recordarArchivo,
  correccionDe,
  excelCorregido,
  explicarHallazgo,
  revalidarCorreccion,
} from '@/app/servicios/bot-validador.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import { leerEstado, reporteDe } from '@/app/datos/store.js';
import { numero } from '@/app/dominio/formato.js';
import Mascota from '@/app/paneles/Mascota.jsx';
import { Balanza } from '@/app/paneles/reporte/Balanza.jsx';
import { AUTOR, BarraDeCelda, HojaEnVista, cifra } from '@/app/paneles/reporte/HojaEnVista.jsx';

/* Lo corregido —y lo confirmado— sobrevive a cerrar y volver a entrar mientras
   dure la sesión, por mes y archivo: cerrar no debe costar el trabajo hecho. */
const borradores = new Map();

/* Las ALERTAS también pasan por aquí (12/10/2026): ya no se justifican con un
   texto aparte. Una alerta es una cifra rara pero posible: se corrige como un
   error o, si es real, se confirma con un clic. La confirmación queda como su
   justificación, que es lo que el envío exige y lo que lee Estadística. */
export const TEXTO_CONFIRMADA = 'Confirmada en la revisión con Dr. Mochi: la cifra es correcta.';

const refDe = (o) => `${o.columna}${o.fila}`;

/* Un hallazgo, sin ambigüedad: los errores de Nutrición repiten su `id` (es el
   código de la regla), así que se distinguen por cuadro, fila y día. */
const claveDe = (h) => [h.id, h.formato, h.fila, h.dia].filter((x) => x != null).join('|');
const columnaANumero = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/* Las celdas que muestra un hallazgo, una por fila: primero el total que no
   cuadra (o la casilla con el error) y luego los sumandos, en el orden de la
   hoja. Un sumando calculado —el total de un examen, de una sección o de una
   fila de Nutrición— se muestra por la celda de su TOTAL en el Excel (`total`
   en la evidencia): sus casillas, una por una, harían una tabla de cien filas. */
function filasDelHallazgo(h, origen, corr) {
  const vistas = new Set();
  const filas = [];
  const poner = (casilla, papel) => {
    const o = origen[casilla];
    if (!o || vistas.has(casilla)) return;
    vistas.add(casilla);
    filas.push({ casilla, ref: refDe(o), fila: o.fila, columna: columnaANumero(o.columna), papel });
  };
  const { total, sumandos } = corr.casillasDelHallazgo(h);
  if (total) poner(total, 'total');
  if (h.evidencia) {
    for (const s of h.evidencia.sumandos) {
      if (s.casilla) poner(s.casilla, 'sumando');
      else if (s.total) poner(s.total, 'sumando');
    }
  } else {
    /* Un cruce entre hojas compara celdas: ninguna es por sí sola «la del
       error», y pintarlas todas de rojo decía que todas estaban mal. */
    const papel = String(h.regla ?? h.id).startsWith('cruce') ? 'sumando' : 'error';
    sumandos.forEach((c) => poner(c, papel));
  }
  const [primera, ...resto] = filas;
  if (primera?.papel !== 'total') return filas.sort((a, b) => a.fila - b.fila || a.columna - b.columna);
  return [primera, ...resto.sort((a, b) => a.fila - b.fila || a.columna - b.columna)];
}

/* El aviso que da el reporte al aplicar una corrección (lo usan Nutrición y
   Laboratorio): cuántas celdas se corrigieron y qué queda después de que el
   bot volviera a revisar. */
export function avisoDeCorreccion(celdas, inf) {
  const corregidas = `${celdas} ${celdas === 1 ? 'celda corregida' : 'celdas corregidas'}`;
  const n = inf.errores.length + inf.avisos.length;
  return `Corrección aplicada al reporte: ${corregidas}. ${n ? `El bot volvió a revisarlo y quedan ${n} ${n === 1 ? 'punto' : 'puntos'} por resolver.` : 'El bot volvió a revisarlo: sin observaciones.'}`;
}

/* -------------------------------------------------------------- piezas */

/* Exportada para la prueba de humo: el diálogo va en un portal, que el render
   del servidor no pinta. */
export function ElegirArchivo({ periodo, onArchivo, motivo }) {
  const entrada = useRef(null);
  return (
    <Stack gap={4}>
      <div className="hrl-mochi">
        <Mascota estado="reposo" tamano="lg" />
        <p className="hrl-mochi__bocadillo">
          {motivo ??
            `Para corregir necesito su archivo: el sistema no guarda una copia que se pueda editar. Elija el mismo archivo que subió para ${etiquetaPeriodo(periodo).toLowerCase()} y le muestro dónde está cada error.`}
        </p>
      </div>
      <Button data-guia="correccion-elegir" icon="sh-folder" onClick={() => entrada.current?.click()} style={{ alignSelf: 'flex-start', minHeight: 'var(--touch-target-lg)' }}>
        Elegir el archivo
      </Button>
      <input
        ref={entrada}
        type="file"
        accept=".xlsx,.docx,.doc,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) onArchivo(archivo);
        }}
      />
    </Stack>
  );
}

/* Una tabla propia del área bajo la comparación (`comparacion` en su
   correccion.js): columnas y filas tal como las arma el bot. */
function TablaDelArea({ tabla }) {
  const columnas = tabla.columnas.map((c) => ({
    key: c.clave,
    label: c.rotulo,
    align: c.numero ? 'right' : undefined,
    tooltip: c.ayuda,
    group: c.grupo,
    groupTooltip: c.grupoAyuda,
    render: (f) => {
      const v = f[c.clave];
      if (!c.numero) return <span className="hrl-comparar__que">{v ?? '—'}</span>;
      const mal = c.marcar && v != null && v !== 0;
      return <span className={['hrl-celda', mal ? 'hrl-celda--total' : c.marcar && v === 0 ? 'hrl-celda--bien' : null].filter(Boolean).join(' ')}>{v == null ? '—' : numero(v)}</span>;
    },
  }));
  return (
    <section className="hrl-tabla-area" aria-label={tabla.titulo}>
      <h3 className="hrl-comparar__titulo">
        <Icon name="sh-table" size={16} /> {tabla.titulo}
      </h3>
      {tabla.nota && <p className="hrl-comparar__leyenda">{tabla.nota}</p>}
      <DataTable columns={columnas} rows={tabla.filas} rowKey={(f) => f.clave} />
    </section>
  );
}

/* Las celdas que cambia un arreglo, a la vista: «E5 [177] › [170]». Con
   muchas (poner 0 en veinte casillas vacías) se cuentan las demás. */
function CeldasQueCambian({ cambios }) {
  if (!cambios.length) return null;
  return (
    <ul className="hrl-opcion__cambios">
      {cambios.slice(0, 3).map((c) => (
        <li key={c.casilla}>
          <span className="hrl-opcion__ref">{c.ref}</span>
          <span className="hrl-hoja__muestra hrl-hoja__celda--total">{cifra(c.antes)}</span>
          <Icon name="sh-chevron" size={12} />
          <span className="hrl-hoja__muestra hrl-hoja__celda--cambiada">{cifra(c.ahora)}</span>
        </li>
      ))}
      {cambios.length > 3 && <li className="hrl-opcion__mas">y {cambios.length - 3} más</li>}
    </ul>
  );
}

/* Un arreglo: las celdas que cambia y «Aplicar». Por qué se propone va en el
   tooltip, no a la vista. Pasar por él lo muestra en la hoja de abajo. */
function Arreglo({ causa, recomendada, activa, cambios, onVer, onDejar, onAplicar }) {
  return (
    <div className={`hrl-arreglo${activa ? ' hrl-arreglo--activa' : ''}`} onMouseEnter={onVer} onMouseLeave={onDejar} onFocus={onVer} onBlur={onDejar}>
      {recomendada && (
        <Tooltip title="Recomendado" body="La cifra parece mal tecleada." focusable={false}>
          <span className="hrl-arreglo__marca">
            <Icon name="sh-diamond" size={14} />
          </span>
        </Tooltip>
      )}
      <CeldasQueCambian cambios={cambios} />
      <Tooltip title={causa.sugerencia.texto} body={`${causa.texto} Se aplica en pantalla; el reporte cambia al finalizar.`} focusable={false}>
        <Button data-guia="aplicar" tone={recomendada ? 'cta' : 'ghost'} size="sm" icon="sh-check" onClick={onAplicar}>
          Aplicar
        </Button>
      </Tooltip>
    </div>
  );
}

/* LOS OTROS DOS TIPOS DE ERROR (22/10/2026). La balanza dibuja una cuenta que
   no cuadra; estos dibujan los otros dos, igual en todas las áreas (Excel o
   Word), según el `tipo` que da el bot:
     · ESCRITURA: lo escrito en la celda, con lo que sobra marcado —la «a» de
       «12a», el signo de «-3», los decimales de «2.5»— y al lado lo que
       debería ser (lo que propone Dr. Mochi, o ya corregido);
     · FALTAN: las casillas sin dato, cada una con su celda y su rótulo, como
       recuadros vacíos que se llenan al aplicar el arreglo. */

const crudo = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : typeof v === 'object' && v.error ? v.error : String(v));

function motivoDe(texto) {
  if (!texto.trim()) return 'No tiene cifra';
  if (/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(texto)) return 'Tiene letras';
  if (/^-\d/.test(texto)) return 'Es negativa';
  if (/^-?\d+[.,]\d+$/.test(texto)) return 'Tiene decimales';
  return 'Tiene símbolos';
}

/* Lo que sobra, marcado: el signo y los decimales de una cifra, o cada
   carácter que no es un dígito. */
function resaltar(texto) {
  const m = /^(-?)(\d+)([.,]\d+)?$/.exec(texto);
  if (m) {
    return (
      <>
        {m[1] && <mark className="hrl-escrito__sobra">{m[1]}</mark>}
        {m[2]}
        {m[3] && <mark className="hrl-escrito__sobra">{m[3]}</mark>}
      </>
    );
  }
  return [...texto].map((ch, i) =>
    /\d/.test(ch) ? (
      ch
    ) : (
      <mark key={i} className="hrl-escrito__sobra">
        {ch === ' ' ? '␣' : ch}
      </mark>
    ),
  );
}

/* La etiqueta de una casilla, sin el cuadro: «Cirugías mayores · programada». */
const etiquetaCorta = (etiqueta) => String(etiqueta ?? '').split(' · ').slice(-2).join(' · ');

function Escritos({ celdas }) {
  return (
    <div className="hrl-escritos">
      {celdas.slice(0, 4).map((c) => {
        const escrito = crudo(c.cambio ? c.antes : c.valor);
        const nuevo = c.cambio ? c.valor : c.propuesta;
        return (
          <div key={c.casilla} className="hrl-escrito">
            <span className="hrl-escrito__donde">
              <span className="hrl-balanza__ref">{c.ref}</span> {etiquetaCorta(c.etiqueta)}
            </span>
            <div className="hrl-escrito__fila">
              <div className="hrl-escrito__caja hrl-escrito__caja--mal">
                <span className="hrl-escrito__rotulo">Escrito</span>
                <span className="hrl-escrito__texto">{escrito ? resaltar(escrito) : '—'}</span>
              </div>
              <Icon name="sh-chevron" size={16} />
              <div className={`hrl-escrito__caja hrl-escrito__caja--${nuevo === undefined ? 'pendiente' : 'bien'}`}>
                <span className="hrl-escrito__rotulo">{c.cambio ? 'Corregido' : 'Debería ser'}</span>
                <span className="hrl-escrito__texto">{nuevo === undefined ? '?' : cifra(nuevo)}</span>
              </div>
              <span className="hrl-escrito__motivo">
                <Icon name="sh-warn" size={14} /> {motivoDe(escrito)}
              </span>
            </div>
          </div>
        );
      })}
      {celdas.length > 4 && <span className="hrl-opcion__mas">y {celdas.length - 4} celdas más (en la hoja)</span>}
    </div>
  );
}

function Vacias({ celdas }) {
  const llenas = celdas.filter((c) => c.cambio).length;
  const faltan = celdas.length - llenas;
  return (
    <div className="hrl-vacias">
      <span className={`hrl-vacias__cuenta${faltan ? '' : ' hrl-vacias__cuenta--completa'}`}>
        <Icon name={faltan ? 'sh-none' : 'sh-ok'} size={16} /> {faltan ? `${faltan} de ${celdas.length} ${celdas.length === 1 ? 'casilla' : 'casillas'} sin dato` : 'Todas las casillas tienen dato'}
      </span>
      <ul className="hrl-vacias__lista">
        {celdas.slice(0, 12).map((c) => (
          <li key={c.casilla} className={`hrl-vacias__celda hrl-vacias__celda--${c.cambio ? 'llena' : c.propuesta !== undefined ? 'propuesta' : 'vacia'}`}>
            <span className="hrl-balanza__ref">{c.ref}</span>
            <span className="hrl-vacias__etiqueta">{etiquetaCorta(c.etiqueta)}</span>
            <span className="hrl-vacias__valor">{c.cambio ? cifra(c.valor) : c.propuesta !== undefined ? `→ ${cifra(c.propuesta)}` : 'vacía'}</span>
          </li>
        ))}
        {celdas.length > 12 && <li className="hrl-opcion__mas">y {celdas.length - 12} más (en la hoja)</li>}
      </ul>
    </div>
  );
}

/* Las celdas de un error que no es de ninguno de los tres tipos (una cifra
   fuera de lo habitual, un cruce sin comparación): la celda misma, grande. */
function CeldasDelError({ celdas, nota }) {
  return (
    <div className="hrl-pregunta__celdas">
      {celdas.slice(0, 8).map((c) => (
        <span key={c.casilla} className="hrl-pregunta__celda">
          <span className="hrl-opcion__ref">{c.ref}</span>
          <span className={`hrl-hoja__muestra hrl-hoja__celda--${c.cambio ? 'cambiada' : 'total'}`}>{cifra(c.valor)}</span>
        </span>
      ))}
      {celdas.length > 8 && <span className="hrl-opcion__mas">y {celdas.length - 8} más</span>}
      {nota && <span className="hrl-pregunta__nota-corta">{nota}</span>}
    </div>
  );
}

/* EL ERROR, A LA VISTA (22/10/2026). Lo primero es QUÉ NO COINCIDE: la
   balanza (Balanza.jsx) con los dos lados en cifras y ≠ en medio, o la celda
   misma si el error no es una cuenta. Debajo de cada balanza, sus arreglos:
   solo las celdas que cambian y «Aplicar». Sin párrafos: la frase de Dr.
   Mochi y el porqué de cada arreglo van en tooltips. Dos intentos previos
   explicaban con texto —un panel de causas; luego una pregunta con tarjetas
   descriptivas— y el área seguía sin ver qué estaba mal.
   Respondido, la balanza queda en = y aparece deshacer y «Siguiente»: no se
   salta solo. */
export function Pregunta({ h, numeroDeError, total, estado, explicacion, comparaciones, celdasDelError, notaDelError, clavePropuesta, cambiosDe, arreglo, siguiente, aviso, verDetalle, doc, onAplicar, onPrevia, onConfirmar, onDesconfirmar, onDetalle, onDeshacer, onSiguiente }) {
  const esAlerta = h.nivel === 'aviso';
  const confirmada = estado === 'confirmado';
  const resuelto = estado === 'resuelto' || confirmada;
  const conArreglo = explicacion.causas.filter((c) => c.sugerencia);
  const confirmar = explicacion.causas.find((c) => c.confirmar);
  const porque = [explicacion.conclusion, ...explicacion.causas.filter((c) => !c.sugerencia && !c.detalle && !c.confirmar).map((c) => c.texto)].filter(Boolean).join(' ');
  const etiquetaEstado = confirmada ? 'confirmada' : resuelto ? 'resuelto' : estado === 'nuevo' ? 'nuevo' : esAlerta ? 'por revisar' : 'por corregir';
  const unaSola = (comparaciones?.length ?? 0) <= 1;
  /* Los arreglos de una comparación: los de su grupo o, si es la única, todos. */
  const deLaComparacion = (clave) => (c) => (c.grupo ? c.grupo === clave : unaSola);
  const sueltos = unaSola ? [] : conArreglo.filter((c) => !c.grupo);

  const arreglos = (lista, buscar) =>
    !resuelto && (lista.length > 0 || buscar) ? (
      <div className="hrl-pregunta__arreglos">
        <span className="hrl-pregunta__etiqueta">Arreglar</span>
        {lista.map((c, i) => (
          <Arreglo
            key={c.texto}
            causa={c}
            recomendada={c.recomendada ?? (i === 0 && lista.length > 1)}
            activa={JSON.stringify(c.sugerencia.cambios) === clavePropuesta}
            cambios={cambiosDe(c.sugerencia)}
            onVer={() => onPrevia(c.sugerencia, c.casillas ?? [])}
            onDejar={() => onPrevia(null, [])}
            onAplicar={() => onAplicar(c.sugerencia)}
          />
        ))}
        {buscar && (
          <span onMouseEnter={() => onPrevia(false, buscar.casillas ?? [])} onMouseLeave={() => onPrevia(null, [])}>
            <Tooltip title="Buscar en la hoja" body={buscar.texto} focusable={false}>
              <Button tone="ghost" size="sm" icon={verDetalle ? 'sh-eye-off' : 'sh-table'} onClick={onDetalle}>
                {verDetalle ? 'Ocultar especialidades' : 'Ver especialidades'}
              </Button>
            </Tooltip>
          </span>
        )}
      </div>
    ) : null;

  return (
    <section data-guia="pregunta" className={`hrl-pregunta${resuelto ? ' hrl-pregunta--resuelta' : ''}`} aria-label={`${esAlerta ? 'Alerta' : 'Error'} ${numeroDeError} de ${total}`}>
      <div className="hrl-pregunta__cabeza">
        <Mascota estado={resuelto ? 'listo' : 'problema'} tamano="sm" />
        <span className={`hrl-pregunta__numero hrl-pregunta__numero--${resuelto ? 'bien' : esAlerta ? 'alerta' : 'error'}`}>
          <Icon name={resuelto ? 'sh-ok' : esAlerta ? 'sh-warn' : 'sh-crit'} size={14} /> {esAlerta ? 'Alerta' : 'Error'} {numeroDeError}/{total} · {etiquetaEstado}
        </span>
        <Tooltip title={h.titulo} body={porque || h.detalle || h.titulo} focusable={false} as="div" style={{ minWidth: 0 }}>
          <strong className="hrl-pregunta__titulo">{h.titulo}</strong>
        </Tooltip>
      </div>

      {comparaciones?.length ? (
        comparaciones.map((c) => (
          <div key={c.clave} className="hrl-pregunta__bloque">
            <Balanza titulo={unaSola ? null : c.titulo} izquierda={c.izquierda} derecha={c.derecha} tolerancia={c.tolerancia} />
            {arreglos(conArreglo.filter(deLaComparacion(c.clave)), explicacion.causas.find((x) => x.detalle && (x.grupo ? x.grupo === c.clave : unaSola)))}
          </div>
        ))
      ) : celdasDelError.length ? (
        <div className="hrl-pregunta__bloque">
          {explicacion.tipo === 'escritura' ? (
            <Escritos celdas={celdasDelError} />
          ) : explicacion.tipo === 'faltan' ? (
            <Vacias celdas={celdasDelError} />
          ) : (
            <CeldasDelError celdas={celdasDelError} nota={notaDelError} />
          )}
          {arreglos(conArreglo, null)}
        </div>
      ) : (
        !esAlerta && (
          <Alert tone="info" title={`Corríjalo en su ${doc} y vuelva a subirlo`}>
            {h.detalle}
          </Alert>
        )
      )}
      {sueltos.length > 0 && arreglos(sueltos, null)}
      {!resuelto && !esAlerta && !conArreglo.length && !explicacion.causas.some((c) => c.detalle) && (comparaciones?.length || celdasDelError.length) ? (
        <Alert tone="info" title={`Dr. Mochi no tiene un arreglo seguro: corríjalo en su ${doc} y vuelva a subirlo`} />
      ) : null}

      {resuelto ? (
        <div className="hrl-pregunta__hecho">
          <strong>
            <Icon name="sh-ok" size={16} /> {confirmada ? 'Confirmada: se envía tal cual.' : 'Resuelto.'}
          </strong>
          {aviso && <span>{aviso}</span>}
          <div className="hrl-pregunta__hecho-acciones">
            {confirmada && onDesconfirmar && (
              <Tooltip title="Deshacer la confirmación" body="La alerta vuelve a quedar por revisar." focusable={false}>
                <Button data-guia="deshacer" tone="ghost" size="sm" icon="sh-close" onClick={onDesconfirmar}>
                  Deshacer
                </Button>
              </Tooltip>
            )}
            {!confirmada && arreglo.some((c) => c.deshacible) && (
              <Tooltip title="Deshacer" body={`Las celdas de este punto vuelven a lo que decía su ${doc}.`} focusable={false}>
                <Button data-guia="deshacer" tone="ghost" size="sm" icon="sh-close" onClick={onDeshacer}>
                  Deshacer
                </Button>
              </Tooltip>
            )}
            {siguiente && (
              <Tooltip title="Ir al siguiente" body="El siguiente error o alerta por resolver." focusable={false}>
                <Button data-guia="siguiente" icon="sh-chevron" onClick={onSiguiente}>
                  {siguiente}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      ) : (
        esAlerta &&
        onConfirmar && (
          <div className="hrl-pregunta__arreglos">
            <Tooltip title="La cifra es correcta" body={confirmar?.texto ?? 'Si es real, confírmela: se envía con ella y queda constancia de que se revisó.'} focusable={false}>
              <Button data-guia="confirmar-alerta" tone={conArreglo.length ? 'ghost' : 'cta'} size="sm" icon="sh-ok" onClick={onConfirmar}>
                Es correcto: confirmar
              </Button>
            </Tooltip>
          </div>
        )
      )}
    </section>
  );
}

/* ------------------------------------------------------------- el panel */

/* `onFinalizar(archivo, celdas, confirmadas)`: el libro con lo corregido (o
   null si no se cambió ninguna celda), listo para cargarse sin volver a
   confirmar el reemplazo; cuántas celdas cambian; y los ids de las alertas
   confirmadas, que el reporte guarda como justificadas.
   `justificadas`: { idDeAlerta: texto } que el reporte ya tiene. */
export default function Correccion({ area, periodo, carga, anterior, procesando, justificadas = {}, onSalir, onFinalizar }) {
  const corr = correccionDe(area);
  const [archivo, setArchivo] = useState(() => archivoRecordado(area, periodo));
  /* Tras recargar la página el archivo no está en memoria: se busca en el
     navegador antes de pedirlo (bot-validador.js, `archivoGuardado`). */
  const [buscando, setBuscando] = useState(() => !archivoRecordado(area, periodo));
  const [abierto, setAbierto] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [cambios, setCambios] = useState({});
  /* casilla → 'mochi': quién la cambió (lo demás lo cambió una fórmula). */
  const [autores, setAutores] = useState({});
  /* claveDe(error) → casillas que se le corrigieron. Un cruce que tenía dos
     problemas deja de señalar las celdas del que ya se corrigió: sin esto, lo
     corregido desaparecía de la vista y el área no sabía si se había hecho. */
  const [porError, setPorError] = useState({});
  const [confirmadas, setConfirmadas] = useState(() => new Set());
  const [seleccion, setSeleccion] = useState(null);
  const [senaladas, setSenaladas] = useState([]);
  /* La respuesta por la que pasa el puntero: la hoja muestra su corrección
     en vez de la recomendada; `false`, ninguna (una respuesta sin arreglo). */
  const [previa, setPrevia] = useState(null);
  /* La celda que muestra la barra de arriba (una casilla). */
  const [elegida, setElegida] = useState(null);
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);
  const [verCeros, setVerCeros] = useState(false);
  /* Las tablas propias del área (Centro Quirúrgico: especialidad por
     especialidad): se abren cuando la respuesta las pide. */
  const [verDetalle, setVerDetalle] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!buscando) return undefined;
    let sigue = true;
    archivoGuardado(area, periodo).then((guardado) => {
      if (!sigue) return;
      if (guardado) setArchivo(guardado);
      setBuscando(false);
    });
    return () => {
      sigue = false;
    };
  }, [area, buscando, periodo]);

  /* Abrir el archivo: se lee con el bot, como en una carga, más sus celdas. */
  useEffect(() => {
    if (!archivo) return undefined;
    let sigue = true;
    setAbriendo(true);
    abrirCorreccion(archivo, { area, periodo, anterior }).then((r) => {
      if (!sigue) return;
      setAbriendo(false);
      setAbierto(r);
      const guardado = borradores.get(`${periodo}|${r?.informe?.archivo?.huella}`);
      setCambios(guardado?.cambios ?? {});
      setAutores(guardado?.autores ?? {});
      setPorError(guardado?.porError ?? {});
      setConfirmadas(new Set(guardado?.confirmadas ?? []));
      const primero = r?.informe?.errores?.[0] ?? r?.informe?.avisos?.[0];
      setSeleccion(primero ? claveDe(primero) : null);
    }).catch(() => {
      /* Sin esto, un fallo inesperado dejaba «Abriendo su archivo» para siempre. */
      if (!sigue) return;
      setAbriendo(false);
      setAbierto({ informe: { bloqueo: { titulo: 'No se pudo abrir este archivo', detalle: 'Revise que sea el archivo correcto y que se abra bien en su computadora.' } } });
    });
    return () => {
      sigue = false;
    };
  }, [area, archivo, periodo, anterior]);

  const informe = abierto?.informe;
  const origen = useMemo(() => informe?.origen ?? {}, [informe]);
  const base = informe?.datos;
  const huella = informe?.archivo?.huella;
  /* Cómo se llama el archivo del área en los textos: Farmacia y Nefrología suben un Word. */
  const doc = (abierto?.tipo ?? (/\.docx?$/i.test(archivo?.name ?? '') ? 'docx' : 'xlsx')) === 'docx' ? 'Word' : 'Excel';

  useEffect(() => {
    if (huella) borradores.set(`${periodo}|${huella}`, { cambios, autores, porError, confirmadas: [...confirmadas] });
  }, [cambios, autores, porError, confirmadas, huella, periodo]);

  const revisado = useMemo(() => (base && !informe.bloqueo ? revalidarCorreccion(area, base, cambios, { origen, periodo, anterior }) : null), [area, base, informe, cambios, origen, periodo, anterior]);

  /* Los errores y las alertas: los que traía el archivo y los que aparezcan al
     corregir. Primero los errores, que son los que impiden enviar. Una alerta
     ya justificada en el reporte (o confirmada aquí) cuenta como resuelta. */
  /* LA VARIACIÓN FRENTE AL MES ANTERIOR (22/10/2026). Con el servidor, la
     carga se compara con el mes anterior ya entregado y el reporte guarda la
     alerta; este diálogo revalida sin ese mes (`anterior` no llega en todas
     las áreas), así que no la veía: decía «sin errores» mientras el reporte
     no dejaba enviar. Las alertas de variación del reporte se suman aquí tal
     cual —no tienen celda que corregir: se confirman— salvo que el diálogo
     tenga su propio mes anterior y las calcule él. */
  const delReporte = useMemo(
    () => (anterior ? [] : (reporteDe(leerEstado().reportes, area, periodo)?.informe?.avisos ?? []).filter((h) => (h.regla ?? h.id) === 'variacion')),
    [anterior, area, periodo],
  );

  const lista = useMemo(() => {
    if (!informe?.errores || !revisado) return [];
    const yaConfirmada = (h) => h.nivel === 'aviso' && (confirmadas.has(h.id) || Boolean((justificadas[h.id] ?? '').trim()));
    const marcar = (nivel) => (h) => ({ ...h, nivel });
    const sumar = (avisos) => [...avisos, ...delReporte.filter((x) => !avisos.some((a) => claveDe(a) === claveDe(x)))];
    const antes = [...informe.errores.map(marcar('error')), ...sumar(informe.avisos ?? []).map(marcar('aviso'))];
    const ahora = [...revisado.informe.errores.map(marcar('error')), ...sumar(revisado.informe.avisos ?? []).map(marcar('aviso'))];
    const actuales = new Map(ahora.map((h) => [claveDe(h), h]));
    const iniciales = antes.map((h) => {
      const vigente = actuales.get(claveDe(h));
      return { h: vigente ?? h, estado: !vigente ? 'resuelto' : yaConfirmada(vigente) ? 'confirmado' : 'pendiente' };
    });
    const nuevos = ahora.filter((h) => !antes.some((x) => claveDe(x) === claveDe(h))).map((h) => ({ h, estado: yaConfirmada(h) ? 'confirmado' : 'nuevo' }));
    return [...iniciales, ...nuevos];
  }, [informe, revisado, confirmadas, justificadas, delReporte]);

  const celdasCambiadas = useMemo(() => (revisado ? corr.celdasCambiadas(base, revisado.datos, origen) : {}), [corr, base, revisado, origen]);

  const celda = (casilla) => (origen[casilla] ? refDe(origen[casilla]) : null);
  /* Lo que dice una celda en el Excel tal como llegó, en su hoja. */
  const valorExcel = (casilla) => {
    const o = origen[casilla];
    return o ? abierto?.hojas?.[o.hoja]?.valores[refDe(o)] : undefined;
  };
  const esFormula = (casilla) => {
    const o = origen[casilla];
    return Boolean(o?.formula) || Boolean(o && abierto?.hojas?.[o.hoja]?.formulas.includes(refDe(o)));
  };
  const variasHojas = Object.keys(abierto?.hojas ?? {}).length > 1;

  const pendientes = lista.filter((x) => x.estado === 'pendiente' || x.estado === 'nuevo').length;
  const resueltos = lista.length - pendientes;
  const indice = Math.max(0, lista.findIndex((x) => claveDe(x.h) === seleccion));
  const actual = lista[indice] ?? null;
  const h = actual?.h ?? null;
  const pendiente = actual?.estado === 'pendiente' || actual?.estado === 'nuevo';
  const explicacion = h ? explicarHallazgo(h, { celda, esFormula, area, datos: revisado?.datos }) : null;
  /* Lo que la hoja muestra como propuesta: la causa por la que pasa el
     puntero o, si no, la principal. Se revalida entera para que también los
     totales con fórmula digan lo que dirían. */
  const propuesta = pendiente && previa !== false ? (previa ?? explicacion?.causas.find((c) => c.sugerencia)?.sugerencia ?? null) : null;
  const clavePropuesta = propuesta ? JSON.stringify(propuesta.cambios) : '';
  const datosPrevios = useMemo(
    () => (clavePropuesta && base ? revalidarCorreccion(area, base, { ...cambios, ...JSON.parse(clavePropuesta) }, { origen, periodo, anterior }).datos : null),
    [clavePropuesta, area, base, cambios, origen, periodo, anterior],
  );
  const nCambiadas = Object.keys(celdasCambiadas).length;
  /* Las confirmadas aquí que siguen siendo alerta tras corregir y que el
     reporte aún no tiene justificadas: las que hay que guardar al finalizar. */
  const porGuardar = lista.filter((x) => x.estado === 'confirmado' && confirmadas.has(x.h.id) && !(justificadas[x.h.id] ?? '').trim()).map((x) => x.h.id);
  const listo = Boolean(revisado) && pendientes === 0 && (nCambiadas > 0 || porGuardar.length > 0);

  /* El siguiente que se puede resolver aquí, para el tutorial: pasar de uno en uno
     daría vueltas entre un error sin arreglo y los ya resueltos. */
  const otroConArreglo = lista.find((x) => (x.estado === 'pendiente' || x.estado === 'nuevo') && x !== actual && (x.h.nivel === 'aviso' || explicarHallazgo(x.h, { celda, esFormula, area, datos: revisado?.datos }).causas.some((c) => c.sugerencia)));

  /* Lo que el tutorial necesita para explicar el error que se está viendo. Sale
     de lo mismo que se pinta: la explicación del bot, no un texto aparte. */
  usePublicarGuia('correccion', {
    doc,
    cargando: buscando || abriendo || (Boolean(archivo) && !abierto),
    sinArchivo: !archivo && !buscando,
    bloqueado: Boolean(informe?.bloqueo),
    total: lista.length,
    pendientes,
    listo,
    otroConArreglo: Boolean(otroConArreglo),
    actual: h
      ? {
          numero: indice + 1,
          titulo: h.titulo,
          esAlerta: h.nivel === 'aviso',
          resuelto: !pendiente,
          tipo: explicacion?.tipo ?? null,
          balanza: Boolean(explicacion?.comparaciones?.length || h.evidencia || (h.regla ?? h.id) === 'variacion'),
          hayArreglo: Boolean(explicacion?.causas.some((c) => c.sugerencia)),
        }
      : null,
  });

  /* ----------------------------------------------------------- acciones */

  /* Un libro elegido aquí también se guarda: recargar no debe pedirlo otra vez. */
  const tomarArchivo = (nuevo) => {
    recordarArchivo(area, periodo, nuevo);
    setArchivo(nuevo);
  };

  const elegir = (id) => {
    setSeleccion(id);
    setSenaladas([]);
    setPrevia(null);
    setElegida(null);
    setVerDetalle(false);
    setVerCeros(false);
  };

  const quedanTexto = (n) => (n ? `${n === 1 ? 'Queda 1' : `Quedan ${n}`} por resolver: pase al siguiente con ›.` : 'Ya no queda nada por resolver: puede finalizar.');

  /* Se queda en el mismo error: el arreglo se ve en la hoja, en su celda. */
  const aplicar = (sugerencia) => {
    const sig = { ...cambios, ...sugerencia.cambios };
    setCambios(sig);
    setAutores((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(sugerencia.cambios).map((c) => [c, 'mochi'])) }));
    if (h) setPorError((prev) => ({ ...prev, [claveDe(h)]: [...new Set([...(prev[claveDe(h)] ?? []), ...Object.keys(sugerencia.cambios)])] }));
    setSenaladas(Object.keys(sugerencia.cambios));
    setPrevia(null);
    setElegida(Object.keys(sugerencia.cambios)[0] ?? null);
    const r = revalidarCorreccion(area, base, sig, { origen, periodo, anterior });
    const sinConfirmar = (h) => !confirmadas.has(h.id) && !(justificadas[h.id] ?? '').trim();
    const quedan = new Set([...r.informe.errores, ...(r.informe.avisos ?? []).filter(sinConfirmar)].map(claveDe));
    setToast(`${sugerencia.texto}. ${quedanTexto(quedan.size)}`);
  };

  /* Confirmar una alerta: la cifra es real y se envía tal cual. */
  const confirmar = (h) => {
    const sig = new Set(confirmadas).add(h.id);
    setConfirmadas(sig);
    const quedan = lista.filter((x) => (x.estado === 'pendiente' || x.estado === 'nuevo') && x.h.id !== h.id).length;
    setToast(`Alerta confirmada. ${quedanTexto(quedan)}`);
  };

  const desconfirmar = (h) => {
    const sig = new Set(confirmadas);
    sig.delete(h.id);
    setConfirmadas(sig);
  };

  const ir = (paso) => {
    const destino = lista[indice + paso];
    if (destino) elegir(claveDe(destino.h));
  };

  const deshacer = (casilla) => {
    setCambios((prev) => {
      const sig = { ...prev };
      delete sig[casilla];
      return sig;
    });
    setAutores((prev) => {
      const sig = { ...prev };
      delete sig[casilla];
      return sig;
    });
  };

  /* Sin celdas cambiadas no hay libro que cargar: solo se guardan las alertas
     confirmadas. */
  const aplicarAlReporte = async () => {
    if (!nCambiadas) {
      onFinalizar(null, 0, porGuardar);
      return;
    }
    setGenerando(true);
    try {
      const corregido = await excelCorregido(area, abierto, revisado.datos, archivo.name);
      onFinalizar(comoArchivo(corregido.bytes, corregido.nombre), nCambiadas, porGuardar);
    } catch {
      setToast('No se pudo preparar lo corregido. Lo que hizo sigue aquí: intente de nuevo; si continúa, corrija su archivo y súbalo.');
    } finally {
      setGenerando(false);
    }
  };

  /* -------------------------------------------------------------- cuerpo */

  let cuerpo;
  /* Lo que va sobre la hoja: cómo leer sus colores y las cifras en cero. */
  let alternarCeros = null;
  let leyenda = null;
  if (!archivo && !buscando) cuerpo = <ElegirArchivo periodo={periodo} onArchivo={tomarArchivo} />;
  else if (buscando || abriendo || !abierto) {
    cuerpo = (
      <div className="hrl-mochi">
        <Mascota estado="pensando" tamano="lg" />
        <p className="hrl-mochi__bocadillo" role="status">
          Abriendo su archivo y buscando cada error…
        </p>
      </div>
    );
  } else if (informe.bloqueo) {
    cuerpo = (
      <Stack gap={4}>
        <Alert tone="error" title={informe.bloqueo.titulo}>
          {informe.bloqueo.detalle}
        </Alert>
        <ElegirArchivo periodo={periodo} onArchivo={tomarArchivo} motivo="Ese archivo no se pudo leer como el reporte de este mes. Elija el que subió." />
      </Stack>
    );
  } else {
    const { editables: listaEditables, total: totalDelHallazgo } = h ? corr.casillasDelHallazgo(h) : { editables: [], total: null };
    const editables = new Set(listaEditables);
    const senaladasSet = new Set(senaladas);
    const otroArchivo = carga?.archivo?.huella && huella && carga.archivo.huella !== huella;

    /* Las filas del error. Un sumando en cero no explica una suma que no
       cuadra: se oculta (nunca el total) y un botón lo muestra. */
    const todas = h ? filasDelHallazgo(h, origen, corr) : [];
    const enCero = todas.filter((f) => f.papel === 'sumando' && !valorExcel(f.casilla));
    const ocultar = enCero.length > 0 && enCero.length < todas.length && !verCeros;
    const filas = ocultar ? todas.filter((f) => !enCero.includes(f)) : todas;

    if (todas.length) {
      leyenda = (
        <p className="hrl-comparar__leyenda">
          <span className="hrl-hoja__muestra hrl-hoja__celda--total">total</span> no cuadra · <span className="hrl-hoja__muestra hrl-hoja__celda--sumando">cifra</span> de la suma ·{' '}
          <span className="hrl-hoja__muestra hrl-hoja__celda--propuesta">→ propuesta</span> de Dr. Mochi · <span className="hrl-hoja__muestra hrl-hoja__celda--cambiada">corregida</span> ·{' '}
          <span className="hrl-celda__fx">fx</span> fórmula
        </p>
      );
    }
    if (enCero.length > 0 && enCero.length < todas.length) {
      alternarCeros = (
        <Tooltip title={verCeros ? 'Ocultar las cifras en cero' : 'Mostrar las cifras en cero'} body="Celdas de esta suma que están en cero: no explican la diferencia, pero puede revisarlas." focusable={false}>
          <Button tone="ghost" icon={verCeros ? 'sh-eye-off' : 'sh-eye'} onClick={() => setVerCeros(!verCeros)}>
            {verCeros ? 'Ocultar las cifras en cero' : `Mostrar ${enCero.length === 1 ? 'la cifra' : `las ${enCero.length} cifras`} en cero`}
          </Button>
        </Tooltip>
      );
    }

    /* Cada celda del error, para la hoja: lo que dice su archivo, lo que dirá
       (ya corregido o propuesto) y quién la cambió. Se agrupan por hoja en el
       orden en que aparecen: primero la del total. Una celda que solo toca la
       propuesta (no está en la cuenta) también se marca. */
    const marcar = (casilla, papel) => {
      const ahora = corr.leer(revisado.datos, casilla);
      const original = corr.leer(base, casilla);
      const cambio = ahora.valor !== original.valor || ahora.ilegible !== original.ilegible;
      const delArchivo = valorExcel(casilla) ?? original.ilegible ?? original.valor;
      const previo = datosPrevios ? corr.leer(datosPrevios, casilla) : null;
      return {
        casilla,
        papel,
        etiqueta: corr.etiquetaDe(casilla),
        ahora: cambio ? ahora.valor : delArchivo,
        antes: cambio ? delArchivo : undefined,
        cambio,
        autor: casilla in cambios ? (autores[casilla] ?? 'mochi') : 'formula',
        propuesta: previo && previo.valor !== ahora.valor ? previo.valor : undefined,
        formula: esFormula(casilla),
        editable: editables.has(casilla) && (!esFormula(casilla) || casilla === totalDelHallazgo),
        senalada: senaladasSet.has(casilla),
      };
    };
    const marcadas = [
      ...filas.map((f) => [f.casilla, f.papel]),
      ...Object.keys(propuesta?.cambios ?? {}).filter((c) => origen[c] && !filas.some((f) => f.casilla === c)).map((c) => [c, 'propuesta']),
      ...(h ? (porError[claveDe(h)] ?? []) : []).filter((c) => origen[c] && c in cambios && !filas.some((f) => f.casilla === c) && !(c in (propuesta?.cambios ?? {}))).map((c) => [c, 'sumando']),
    ].map(([casilla, papel]) => marcar(casilla, papel));
    const hojasDelError = new Map();
    for (const m of marcadas) {
      const o = origen[m.casilla];
      if (!hojasDelError.has(o.hoja)) hojasDelError.set(o.hoja, new Map());
      hojasDelError.get(o.hoja).set(refDe(o), m);
    }
    /* La celda de la barra: la que pulsó el área o, si no, la que cambia la
       respuesta que se está mirando, o una de las que el error deja corregir. */
    const marcaElegida =
      marcadas.find((m) => m.casilla === elegida) ?? marcadas.find((m) => m.propuesta !== undefined && m.editable) ?? marcadas.find((m) => m.editable) ?? marcadas[0] ?? null;

    /* Las celdas que cambia una respuesta: lo que dicen ahora y lo que dirán. */
    const cambiosDe = (sugerencia) =>
      Object.entries(sugerencia.cambios)
        .filter(([c]) => origen[c])
        .map(([c, v]) => {
          const ahora = corr.leer(revisado.datos, c);
          const cambio = c in cambios;
          return { casilla: c, ref: celda(c), antes: cambio ? ahora.valor : (valorExcel(c) ?? ahora.ilegible ?? ahora.valor), ahora: v };
        });
    /* Lo que ya cambió en las celdas de este error, para decirlo al responder. */
    const arreglo = marcadas
      .filter((m) => m.cambio)
      .map((m) => ({ casilla: m.casilla, ref: celda(m.casilla), antes: m.antes, ahora: m.ahora, autor: AUTOR[m.autor]?.texto, deshacible: m.casilla in cambios }));

    /* Lo que no coincide, para la balanza, con las cifras de ahora (al
       corregir, pasa de ≠ a =). Un área que compara hojas la da en su
       explicación; una suma que no cuadra se arma con su evidencia: las
       cifras con valor (hasta seis; las demás se cuentan) frente al total. */
    const ahoraEn = (c) => (c && origen[c] ? corr.leer(revisado.datos, c).valor : undefined);
    const conRef = (lado) => ({ ...lado, celdas: lado.celdas.map((x) => ({ ...x, ref: x.ref ?? celda(x.casilla), cambiada: x.casilla in cambios })) });
    let comparaciones = explicacion?.comparaciones?.map((c) => ({ ...c, izquierda: conRef(c.izquierda), derecha: conRef(c.derecha) })) ?? null;
    if (!comparaciones && h?.evidencia) {
      const ev = h.evidencia;
      const cifras = ev.sumandos.map((s) => {
        const c = s.casilla ?? s.total;
        const v = ahoraEn(c);
        return { casilla: c, ref: c ? celda(c) : null, etiqueta: s.etiqueta, valor: v === undefined ? s.valor : v, cambiada: Boolean(c) && c in cambios };
      });
      const conCifra = cifras.filter((x) => x.valor);
      const totalAhora = ahoraEn(ev.total.casilla);
      const escrito = totalAhora === undefined ? ev.total.valor : totalAhora;
      comparaciones = [
        {
          clave: 'suma',
          izquierda: { titulo: 'Las cifras', celdas: conCifra.slice(0, 6), mas: Math.max(0, conCifra.length - 6), resultado: Math.round(cifras.reduce((s, x) => s + (x.valor ?? 0), 0) * 1e6) / 1e6 },
          derecha: { titulo: 'El total escrito', celdas: [{ casilla: ev.total.casilla, ref: celda(ev.total.casilla), etiqueta: ev.total.etiqueta, valor: escrito }], resultado: escrito },
        },
      ];
    }
    /* La variación: este mes frente al anterior. Una alerta guardada antes de
       que el bot diera sus cifras se lee de su detalle («56 … este mes y 46
       el anterior»). */
    if (!comparaciones && h && (h.regla ?? h.id) === 'variacion') {
      const cifras = String(h.detalle ?? '').match(/^([\d.,]+)\D+?este mes y ([\d.,]+) el anterior/);
      const leer = (texto) => Number(String(texto).replace(/,/g, ''));
      const actual = h.actual ?? (cifras ? leer(cifras[1]) : null);
      const previo = h.previo ?? (cifras ? leer(cifras[2]) : null);
      const mesAnterior = h.anterior ? etiquetaPeriodo(h.anterior) : (String(h.titulo).split(' frente a ')[1] ?? 'Mes anterior');
      if (actual != null && previo != null) {
        comparaciones = [
          {
            clave: 'variacion',
            izquierda: { titulo: etiquetaPeriodo(periodo), celdas: [], resultado: actual },
            derecha: { titulo: mesAnterior, celdas: [], resultado: previo },
          },
        ];
      }
    }
    /* Un error que no es una cuenta: sus celdas, con lo que dicen ahora. */
    const celdasDelError = comparaciones
      ? []
      : marcadas.map((m) => ({ casilla: m.casilla, ref: celda(m.casilla), etiqueta: m.etiqueta, valor: m.ahora, antes: m.antes, cambio: m.cambio, propuesta: m.propuesta }));
    const notaDelError = h?.referencia != null ? `Lo habitual en la fila: ${cifra(h.referencia)}` : null;

    /* El siguiente por resolver, después de este (o, si no hay, antes). */
    const porResolver = (x) => x.estado === 'pendiente' || x.estado === 'nuevo';
    const siguiente = lista.find((x, i) => i > indice && porResolver(x)) ?? lista.find((x, i) => i < indice && porResolver(x));
    const detalleDelArea = h ? (corr.comparacion?.(h, revisado.datos) ?? []) : [];
    const pideDetalle = Boolean(explicacion?.causas.some((c) => c.detalle));

    const aviso = !pendientes && (nCambiadas || porGuardar.length)
      ? 'Todo listo: pulse «Finalizar corrección».'
      : null;

    cuerpo = (
      <div className="hrl-correccion">
        {lista.length > 0 && (
          <div data-guia="correccion-chips" className="hrl-correccion__selector">
            <Tooltip title="Error anterior" body="Va al error anterior de la lista." focusable={false}>
              <Button data-guia="error-anterior" tone="ghost" icon="sh-chevron" className="hrl-correccion__flecha hrl-correccion__flecha--atras" aria-label="Error anterior" disabled={indice === 0} onClick={() => ir(-1)} />
            </Tooltip>
            <nav className="hrl-correccion__chips" aria-label="Errores del archivo">
              {lista.map(({ h: x, estado }, i) => (
                <Tooltip key={claveDe(x)} title={`${x.nivel === 'aviso' ? 'Alerta' : 'Error'} ${i + 1} · ${estado === 'confirmado' ? 'confirmada' : estado === 'resuelto' ? 'corregido' : estado === 'nuevo' ? 'apareció al corregir' : x.nivel === 'aviso' ? 'por revisar' : 'por corregir'}`} body={x.titulo} focusable={false}>
                  <Button
                    data-guia={x === otroConArreglo?.h ? 'chip-con-arreglo' : undefined}
                    tone="plain"
                    className={`hrl-correccion__chip hrl-correccion__chip--${estado === 'confirmado' ? 'resuelto' : estado === 'pendiente' && x.nivel === 'aviso' ? 'nuevo' : estado}${i === indice ? ' hrl-correccion__chip--activo' : ''}`}
                    aria-current={i === indice ? 'step' : undefined}
                    aria-label={`Error ${i + 1}: ${x.titulo}`}
                    onClick={() => elegir(claveDe(x))}
                  >
                    <Icon name={estado === 'resuelto' || estado === 'confirmado' ? 'sh-ok' : estado === 'nuevo' || x.nivel === 'aviso' ? 'sh-warn' : 'sh-crit'} size={14} />
                    {i + 1}
                  </Button>
                </Tooltip>
              ))}
            </nav>
            <Tooltip title="Error siguiente" body="Va al error siguiente de la lista." focusable={false}>
              <Button tone="ghost" icon="sh-chevron" className="hrl-correccion__flecha" aria-label="Error siguiente" disabled={indice >= lista.length - 1} onClick={() => ir(1)} />
            </Tooltip>
          </div>
        )}

        {otroArchivo && (
          <Alert tone="warning" title="Este no es el archivo que está cargado">
            <Stack gap={2}>
              <span>Corrige este archivo y, al finalizar, reemplaza lo que hay. Si quería corregir el que ya subió, elíjalo.</span>
              {/* El navegador recuerda el último archivo de este mes (bot-validador.js); si el cargado es otro —subido desde otra sesión o
                  por el servidor—, aquí se cambia sin salir (22/10/2026: antes había que cerrar y no había dónde elegirlo). */}
              <Button tone="ghost" size="sm" icon="sh-folder" style={{ alignSelf: 'flex-start' }} onClick={() => { setAbierto(null); setArchivo(null); }}>
                Elegir el archivo
              </Button>
            </Stack>
          </Alert>
        )}

        {h ? (
          <Pregunta
            key={claveDe(h)}
            h={h}
            numeroDeError={indice + 1}
            total={lista.length}
            estado={actual.estado}
            explicacion={explicacion}
            clavePropuesta={clavePropuesta}
            cambiosDe={cambiosDe}
            arreglo={arreglo}
            siguiente={siguiente ? `Siguiente: ${siguiente.h.nivel === 'aviso' ? 'alerta' : 'error'} ${lista.indexOf(siguiente) + 1}` : null}
            aviso={aviso}
            verDetalle={verDetalle}
            comparaciones={comparaciones}
            celdasDelError={celdasDelError}
            notaDelError={notaDelError}
            doc={doc}
            onAplicar={aplicar}
            onPrevia={(sugerencia, casillas) => {
              setPrevia(sugerencia);
              setSenaladas(casillas);
            }}
            onConfirmar={() => confirmar(h)}
            onDesconfirmar={confirmadas.has(h.id) ? () => desconfirmar(h) : null}
            onDetalle={() => setVerDetalle(!verDetalle)}
            onDeshacer={() => arreglo.filter((c) => c.deshacible).forEach((c) => deshacer(c.casilla))}
            onSiguiente={() => siguiente && elegir(claveDe(siguiente.h))}
          />
        ) : (
          <div className="hrl-mochi hrl-mochi--arriba hrl-correccion__vacio">
            <Mascota estado="listo" tamano="md" />
            <p className="hrl-mochi__bocadillo" aria-live="polite">
              Este archivo no tiene errores ni alertas que revisar.
            </p>
          </div>
        )}

        {/* La evidencia: su hoja, con las celdas del error y la respuesta a la vista. */}
        {h && marcaElegida && (
          <section className="hrl-comparar" aria-label={`Así se ve en su ${doc}`}>
            <div className="hrl-comparar__cabeza">
              <h3 className="hrl-comparar__titulo">
                <Icon name="sh-eye" size={16} /> Así se ve en su {doc}
              </h3>
              {leyenda}
              {alternarCeros}
            </div>
            <BarraDeCelda
              refCelda={celda(marcaElegida.casilla)}
              hoja={origen[marcaElegida.casilla].hoja}
              m={marcaElegida}
              doc={doc}
              onDeshacer={marcaElegida.casilla in cambios ? () => deshacer(marcaElegida.casilla) : null}
            />
            {[...hojasDelError].map(([hoja, marcas]) => (
              <HojaEnVista key={hoja} titulo={hoja} valores={abierto.hojas?.[hoja]?.valores} marcas={marcas} elegida={marcaElegida.casilla} onElegir={setElegida} />
            ))}
          </section>
        )}
        {(verDetalle || !pideDetalle) && detalleDelArea.map((tabla) => <TablaDelArea key={tabla.titulo} tabla={tabla} />)}
      </div>
    );
  }

  /* ---------------------------------------------------------------- pie */

  /* Sin botón de salir: «Finalizar corrección» aplica lo corregido si ya no
     queda ningún error y, si quedan, cierra conservando lo corregido. Esc hace
     lo mismo que cerrar. A la izquierda, el avance y deshacer todo. */
  const finalizar = () => (listo ? aplicarAlReporte() : onSalir());
  const pie = (
    <div className="hrl-correccion__pie">
      <div className="hrl-correccion__pie-info">
        {lista.length > 0 && (
          <span className="hrl-correccion__avance">
            <Icon name="sh-ok" size={14} /> {resueltos} de {lista.length} resueltos · {nCambiadas} {nCambiadas === 1 ? 'celda corregida' : 'celdas corregidas'}
          </span>
        )}
        {nCambiadas > 0 &&
          (confirmarDeshacer ? (
            <span className="hrl-correccion__deshacer">
              ¿Deshacer las {nCambiadas}? Su archivo no cambia.
              <Button tone="ghost" size="sm" onClick={() => setConfirmarDeshacer(false)}>
                Conservarlas
              </Button>
              <Button
                tone="danger"
                size="sm"
                icon="sh-close"
                onClick={() => {
                  setCambios({});
                  setPorError({});
                  setAutores({});
                  setConfirmarDeshacer(false);
                }}
              >
                Sí, deshacer todo
              </Button>
            </span>
          ) : (
            <Tooltip title="Deshacer todo" body={`Vuelve todas las celdas a lo que decía su ${doc}. Pide confirmación.`} focusable={false}>
              <Button tone="ghost" size="sm" icon="sh-close" onClick={() => setConfirmarDeshacer(true)}>
                Deshacer todo
              </Button>
            </Tooltip>
          ))}
      </div>
      <div className="hrl-correccion__pie-acciones">
        <Tooltip
          title="Finalizar corrección"
          body={
            listo
              ? nCambiadas
                ? 'Aplica lo corregido al reporte: el bot lo vuelve a revisar y las cifras corregidas reemplazan a las actuales. Las alertas confirmadas quedan resueltas. No pide subir ni reemplazar ningún archivo.'
                : 'Las alertas confirmadas quedan resueltas en el reporte. Las cifras no cambian.'
              : `${pendientes ? `Quedan ${pendientes} por resolver: ` : ''}se cierra sin cambiar el reporte, y lo corregido se conserva mientras no cierre la página.`
          }
          focusable={false}
        >
          <Button data-guia="finalizar" icon="sh-ok" disabled={Boolean(procesando)} loading={generando || Boolean(procesando)} onClick={finalizar} style={{ minHeight: 'var(--touch-target-lg)' }}>
            Finalizar corrección
          </Button>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <>
      <Dialog
        size="full"
        closeButton={false}
        title="Corregir con Dr. Mochi"
        subtitle={abierto?.hoja && archivo ? [archivo.name, !variasHojas && (doc === 'Word' ? abierto.hoja : `hoja «${abierto.hoja}»`), etiquetaPeriodo(periodo)].filter(Boolean).join(' · ') : etiquetaPeriodo(periodo)}
        onClose={onSalir}
      >
        <div className="hrl-correccion-marco">
          {cuerpo}
          {pie}
        </div>
      </Dialog>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
