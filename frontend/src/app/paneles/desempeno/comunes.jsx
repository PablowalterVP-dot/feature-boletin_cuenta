/* Piezas compartidas de los indicadores de desempeño. */

import { useCallback, useEffect, useState } from 'react';
import { Badge, EmptyState, Mosaic, SplitBar, Tooltip } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { fijarDesempeno } from '@/app/datos/store.js';
import { cifra, fraccion, puntos, textoMeta, ESTADO_CARGA } from '@/app/dominio/desempeno.js';
import { Cargando, ErrorDeCarga } from '@/app/paneles/superadmin/comunes.jsx';

export { Cargando };

/* Lee un recurso de /api/desempeno. `recargar` lo vuelve a pedir (tras cargar
   un archivo o guardar algo). `params` viaja en la consulta; los nulos no. */
export function useDesempeno(ruta, params) {
  const clave = JSON.stringify(params ?? null);
  const [estado, setEstado] = useState({ datos: null, cargando: Boolean(ruta), error: null, status: null });
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!ruta) return undefined;
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    api.desempeno('GET', ruta, { params: JSON.parse(clave) ?? undefined }).then((r) => {
      if (!vigente) return;
      setEstado(r.ok ? { datos: r.body, cargando: false, error: null, status: null } : { datos: null, cargando: false, error: r.error, status: r.status });
    });
    return () => {
      vigente = false;
    };
  }, [ruta, clave, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recargar };
}

/* La cabecera del módulo dice de cuándo son los datos: se lo cuenta el resumen. */
export function useCabeceraDesempeno(resumen) {
  useEffect(() => {
    if (!resumen) return;
    fijarDesempeno({ anio: resumen.anio, hoy: resumen.hoy, datosAl: resumen.datos_al, ventana: resumen.ventana, puedeCargar: resumen.puede_cargar, porSubir: resumen.por_subir_ahora ?? 0 });
  }, [resumen]);
}

/* El error de una lectura. Un 403 no es una falla: la cuenta no tiene el
   permiso, o entró antes de que se instalara (los permisos van en el token). */
export function SinAcceso({ error, status, recargar }) {
  if (status === 403) {
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState icon="sh-shield" title="Su cuenta no tiene acceso a esta parte" body={`${error} Si se lo acaban de asignar, cierre sesión y vuelva a entrar: los permisos se leen al ingresar.`} />
      </Mosaic>
    );
  }
  return <ErrorDeCarga error={error} recargar={recargar} />;
}

/* «7,3 %» con «6 de 82» debajo. */
export function Cifra({ valor, fuera, preliminar }) {
  const c = cifra(valor);
  return (
    <Tooltip title={c.texto} body={`${c.explicacion ?? c.detalle}${preliminar ? ' Incluye meses sin cerrar: puede cambiar.' : ''}`} focusable={false}>
      <span className={`hrl-cifra${fuera ? ' hrl-cifra--fuera' : ''}`}>
        <strong>{c.texto}{preliminar ? ' *' : ''}</strong>
        {valor && <span>{c.detalle}</span>}
      </span>
    </Tooltip>
  );
}

/* La barra del logro en una escala de 0 a 100 %, con la distancia a la meta. */
export function FrenteAMeta({ porcentaje, meta, diferencia }) {
  if (porcentaje == null) return <span>—</span>;
  const cumple = meta != null && porcentaje >= meta;
  return (
    <Tooltip
      title={`Logro ${fraccion(porcentaje)} · meta ${textoMeta(meta)}`}
      body={meta == null ? 'La ficha no tiene meta registrada: no hay contra qué comparar.' : `La barra va de 0 a 100 %. ${cumple ? 'Alcanza' : 'No alcanza'} la meta: ${puntos(diferencia)}.`}
      focusable={false}
    >
      <span className="hrl-frente-meta">
        <SplitBar value={porcentaje * 100} total={100} color={cumple ? 'var(--success)' : 'var(--destructive)'} />
        <span>
          {puntos(diferencia)} · meta {textoMeta(meta)}
        </span>
      </span>
    </Tooltip>
  );
}

/* El estado de una fuente en un mes, como insignia con su explicación. */
export function EstadoDeCarga({ estado, detalle }) {
  const e = ESTADO_CARGA[estado] ?? ESTADO_CARGA.futuro;
  return (
    <Tooltip title={e.etiqueta} body={`${e.ayuda}${detalle ? ` ${detalle}` : ''}`}>
      <Badge label={e.corto} tone={e.tono} />
    </Tooltip>
  );
}

/* Pulsar cualquier parte de una fila abre su registro. La tabla del kit no
   avisa qué fila se pulsó, así que se lee aquí: la posición de la fila en la
   página dice cuál es. No reemplaza al enlace de la fila ni a su botón, que
   siguen siendo el camino con teclado (CLAUDE.md § 4.4): solo agranda el
   blanco. Si se pulsó un control de la fila, o se estaba seleccionando texto,
   no hace nada. */
export function FilasQueAbren({ filas, abrir, children }) {
  const alPulsar = (e) => {
    if (e.target.closest('button, a, input, select, label')) return;
    if (window.getSelection?.()?.toString()) return;
    const tr = e.target.closest('tbody tr');
    if (!tr) return;
    const fila = filas[[...tr.parentElement.children].indexOf(tr)];
    if (fila) abrir(fila);
  };
  return (
    // oxlint-disable-next-line click-events-have-key-events, no-static-element-interactions -- el teclado entra por el enlace de cada fila
    <div className="hrl-filas-que-abren" onClick={alPulsar}>
      {children}
    </div>
  );
}
