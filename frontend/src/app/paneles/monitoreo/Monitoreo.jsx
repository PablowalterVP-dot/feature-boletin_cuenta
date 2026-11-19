/* Monitoreo Indicadores: lo primero que ven Estadística y Dirección al entrar.

   Tres pestañas, una por cada cosa que le piden al hospital, y Cumplimiento al lado:

     Desempeño DL 1153     lo que el Anexo I evalúa al hospital y lo que no.
     Gestión hospitalaria  los 22 del formato de GERESA.
     Compromisos de mejora los entregables con plazo.

   Qué es cada indicador y de dónde sale está en `datos/monitoreo.js`. Regla de las tres:
   lo que no se mide no se dibuja. Un mes sin dato es un hueco, una cifra de la región se
   rotula como de la región, y la cifra oficial no se mezcla con la del hospital. */

import { lazy, Suspense, useMemo } from 'react';
import { indicadorDe } from '@/app/datos/monitoreo.js';
import { mesesDelAnioHasta, periodoVigente } from '@/app/dominio/periodos.js';
import { Cargando } from '@/app/paneles/desempeno/comunes.jsx';
import DetalleFicha from '@/app/paneles/monitoreo/DetalleFicha.jsx';
import PanelCompromisos from '@/app/paneles/monitoreo/PanelCompromisos.jsx';
import PanelDesempeno from '@/app/paneles/monitoreo/PanelDesempeno.jsx';
import PanelGestion from '@/app/paneles/monitoreo/PanelGestion.jsx';
import { puedeCargarReporte, puedeRegistrar, useMonitoreo } from '@/app/paneles/monitoreo/comunes.jsx';
import { veCifrasDeHospitalizacion } from '@/app/servicios/hospitalizacion.js';

const Ficha = lazy(() => import('@/app/paneles/desempeno/Ficha.jsx'));

const PANEL = Object.freeze({ desempeno: 'monitoreo', gestion: 'monitoreo-gestion', compromisos: 'monitoreo-compromisos' });

export default function Monitoreo({ pestana = 'desempeno', reportes, propios, hoy, params = {}, irA, sesion }) {
  const vigenteReal = periodoVigente(hoy);
  const anio = Number(String(vigenteReal).slice(0, 4));
  const consultado = useMonitoreo(anio);
  const panelId = PANEL[pestana];
  const puede = puedeRegistrar(sesion);

  /* El corte se aplica aquí, una vez: las pantallas reciben menos meses y menos cifras, y todo lo
     que calculan (cuentas, gráficos, mensajes) sale de eso, sin saber que hay un corte. */
  const resultados = consultado.datos?.resultados ?? [];
  const mesMayor = resultados.reduce((m, r) => Math.max(m, r.mes), 0);
  const mesesConCifra = useMemo(() => mesesDelAnioHasta(mesMayor ? `${anio}-${String(mesMayor).padStart(2, '0')}` : `${anio}-01`).filter((p) => mesMayor && Number(p.slice(5)) <= mesMayor), [anio, mesMayor]);
  const hasta = pestana !== 'compromisos' && mesesConCifra.includes(params.hasta) ? params.hasta : null;
  const vigente = hasta ?? vigenteReal;
  const panel = useMemo(() => {
    if (!hasta || !consultado.datos) return consultado;
    const mes = Number(hasta.slice(5));
    return { ...consultado, datos: { ...consultado.datos, resultados: consultado.datos.resultados.filter((r) => r.mes <= mes) } };
  }, [consultado, hasta]);
  const conCorte = (extra = {}) => ({ ...extra, ...(hasta ? { hasta } : {}) });
  const corte = {
    hasta,
    meses: mesesConCifra,
    cambiar: (nuevo) => irA(panelId, { ...(params.ver ? { ver: params.ver } : {}), ...(nuevo ? { hasta: nuevo } : {}) }, { quieto: true }),
  };
  /* Las cifras de hospitalización van al lado de las propias en el detalle (fase 4 de la decisión 0011). */
  const veHospitalizacion = veCifrasDeHospitalizacion(sesion?.usuario?.permisos);
  const contexto = { reportes, propios, hoy, anio, vigente, panel, puede, corte, veHospitalizacion };

  if (pestana === 'compromisos') return <PanelCompromisos {...contexto} abrirFicha={(ficha) => irA(PANEL.desempeno, { ficha: String(ficha) })} />;
  if (pestana === 'gestion') return <PanelGestion {...contexto} params={params} abrir={(n) => irA(panelId, conCorte({ indicador: String(n) }))} abrirFicha={(ficha) => irA(PANEL.desempeno, conCorte({ ficha: String(ficha) }))} volver={() => irA(panelId, conCorte())} cambiarVista={(ver) => irA(panelId, conCorte(ver === 'lista' ? { ver } : {}), { quieto: true })} />;

  const pedido = indicadorDe(params.ficha);
  /* La ficha 14 tiene su pantalla completa en el módulo; desde ahí, «ver del módulo». La
     lista de pacientes queda para quien tiene el permiso, no para todo el que mira. */
  if (pedido?.modulo && params.modulo) {
    const conPacientes = (sesion?.usuario?.permisos ?? []).includes('desempeno.ver');
    return (
      <Suspense fallback={<Cargando />}>
        <Ficha numero={pedido.ficha} params={params} irA={irA} panel={panelId} conPacientes={conPacientes} />
      </Suspense>
    );
  }
  if (pedido) return <DetalleFicha indicador={pedido} {...contexto} volver={() => irA(panelId, conCorte(params.ver ? { ver: params.ver } : {}))} abrirModulo={() => irA(panelId, { ficha: String(pedido.ficha), modulo: '1' })} />;

  return <PanelDesempeno {...contexto} puedeCargar={puedeCargarReporte(sesion)} ver={params.ver === 'lista' ? 'lista' : 'tarjetas'} abrir={(ficha) => irA(panelId, conCorte({ ficha: String(ficha), ...(params.ver ? { ver: params.ver } : {}) }))} cambiarVista={(ver) => irA(panelId, conCorte(ver === 'lista' ? { ver } : {}), { quieto: true })} />;
}
