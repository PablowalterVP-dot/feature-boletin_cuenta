/* Reporte del mes del área que tiene la sesión abierta.

   Cada área tiene sus propios cuadros, así que cada una necesita su propio
   formulario, y las nueve tienen ya el suyo. Nutrición, Laboratorio, Lavandería,
   Gineco-Obstetricia y Centro Quirúrgico se llenan subiendo su Excel; Farmacia,
   Nefrología, Imágenes y Epidemiología, subiendo su Word. Un área sin formulario
   mostraría qué falta para construirlo, en lugar de uno genérico que no se
   parecería al que usa. */

import { useEffect } from 'react';
import { Alert, Badge, Card, EmptyState, Icon, Mosaic } from '@hrl/core-ui';
import { motivoSinServidor } from '@/app/servicios/api.js';
import { abrirMesEnPractica, useEpocaPractica } from '@/app/servicios/practica.js';
import { area } from '@/app/datos/areas.js';
import { reporteDe, useHoy } from '@/app/datos/store.js';
import { formularioDe, areasLevantadas } from '@/app/datos/formatos/levantados.js';
import { periodoVigente, etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { estado, esEditable, estaEntregado } from '@/app/dominio/estados.js';
import { usePublicarGuia } from '@/app/guia/senales.js';
import BotonGuia from '@/app/guia/BotonGuia.jsx';
import ReporteWord from './reporte/ReporteWord.jsx';
import ReporteNutricion from './reporte/nutricion/ReporteNutricion.jsx';
import ReporteLaboratorio from './reporte/laboratorio/ReporteLaboratorio.jsx';
import ReporteLavanderia from './reporte/lavanderia/ReporteLavanderia.jsx';
import ReporteGinecologia from './reporte/ginecologia/ReporteGinecologia.jsx';
import ReporteCentroQuirurgico from './reporte/centro-quirurgico/ReporteCentroQuirurgico.jsx';

/* El recorrido propio de cada área que se llena subiendo su Excel. */
const POR_CARGA = Object.freeze({ nutricion: ReporteNutricion, laboratorio: ReporteLaboratorio, lavanderia: ReporteLavanderia, ginecologia: ReporteGinecologia, 'centro-quirurgico': ReporteCentroQuirurgico });

const SIN_SERVIDOR = Object.freeze({
  'sin-configuracion': {
    tono: 'info',
    titulo: 'Conectando con el servidor…',
    texto: 'Todavía no se sabe si esta área puede guardar en el servidor. Se vuelve a intentar solo; no hace falta recargar la página.',
  },
  'fuera-del-flujo': {
    tono: 'warning',
    titulo: 'Esta área no puede recibir reportes en este momento',
    texto: 'Su formato no está activo en el servidor, o se pausó. No se puede subir nada para que no se pierda: el archivo quedaría solo en esta ventana y desaparecería al recargarla. Avise a Estadística.',
  },
});

/* Con servidor, un área que no puede guardar en él no ve el recorrido del reporte
   (`api.motivoSinServidor` dice por qué se perdió lo de Gineco-Obstetricia). */
function SinServidor({ motivo, nombre, periodo }) {
  const { tono, titulo, texto } = SIN_SERVIDOR[motivo];
  return (
    <Mosaic stacked className="hrl-panel">
      <Card accent="var(--info)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={nombre}>
        <div className="hrl-cuerpo">
          <Alert tone={tono} title={titulo}>
            {texto}
          </Alert>
        </div>
      </Card>
    </Mosaic>
  );
}

function Pendiente({ claveArea, reporte, periodo }) {
  const a = area(claveArea);
  const estadoObj = estado(reporte?.estado);

  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--info)" icon="sh-calendar" title={`Reporte de ${etiquetaPeriodo(periodo)}`} subtitle={a.nombre} total={estadoObj.label}>
        <div style={{ padding: '16px 20px 0' }}>
          <Alert tone="info" title="El formulario de esta área todavía no está construido">
            Cada área tiene cuadros propios: los de Lavandería se miden en kilos y prendas, los de Imágenes en exámenes
            por modalidad y financiamiento. Un formulario genérico no se parecería al oficio que el área usa, así que se
            construye uno por área a partir de su propio oficio.
          </Alert>
        </div>

        <EmptyState
          icon={a.icono}
          tone="var(--info)"
          title={`Falta levantar el oficio de ${a.nombreCorto}`}
          body="Con una foto de las hojas que llevan cuadros de datos —solo esas, sin membrete ni firmas— se modela el formulario con sus indicadores, sus sumas automáticas y sus validaciones."
        >
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-base)', color: 'var(--muted-foreground)' }}>
              <Icon name="sh-doc" size={16} />
              Ya construidos: {areasLevantadas().map((f) => f.nombre).join(' y ')}
            </span>
            <Badge
              label={a.profundidad === 'completa' ? 'Prevista a fondo' : 'Prevista con formulario simplificado'}
              tone={a.profundidad === 'completa' ? 'info' : 'none'}
            />
          </div>
        </EmptyState>
      </Card>
    </Mosaic>
  );
}

export default function Reporte({ reportes, usuario, periodo: periodoPedido, paso, pruebas = false, irA }) {
  const periodo = periodoPedido ?? periodoVigente(useHoy());
  const claveArea = usuario.area;
  const reporte = reporteDe(reportes, claveArea, periodo);
  const formulario = formularioDe(claveArea);
  const estadoActual = reporte?.estado ?? 'no_iniciado';

  /* Lo que el tutorial guiado necesita saber de cualquier área (dominio/guia.js).
     Un área sin formulario construido no tiene nada que guiar. */
  /* La práctica del tutorial: cada mes que se abre empieza vacío, y la clave remonta
     el reporte al entrar, al salir y al cambiar de mes, para que ninguna pantalla
     conserve lo que recordaba de antes. */
  const epoca = useEpocaPractica();
  useEffect(() => {
    abrirMesEnPractica(periodo);
  }, [epoca, periodo]);

  usePublicarGuia(
    'reporte',
    formulario
      ? {
          mes: etiquetaPeriodo(periodo).toLowerCase(),
          doc: formulario.carga ? 'Excel' : 'Word',
          entregado: estaEntregado(estadoActual),
          editable: esEditable(estadoActual) || estadoActual === 'no_iniciado',
        }
      : null,
  );

  if (!formulario) return <Pendiente claveArea={claveArea} reporte={reporte} periodo={periodo} />;

  const motivo = motivoSinServidor(claveArea);
  if (motivo) return <SinServidor motivo={motivo} nombre={area(claveArea).nombre} periodo={periodo} />;

  /* Las áreas que se llenan subiendo su Excel tienen su propio recorrido:
     subir, revisar y enviar. Las que suben un Word siguen los mismos pasos. */
  if (formulario.carga) {
    const PorCarga = POR_CARGA[claveArea];
    return (
      <>
        <BotonGuia usuario={usuario} />
        <PorCarga key={`${periodo}:${epoca}`} reportes={reportes} periodo={periodo} usuario={usuario} pruebas={pruebas} pasoPedido={paso} irA={irA} />
      </>
    );
  }

  /* La clave remonta el recorrido al cambiar de periodo: el paso de un mes no
     tiene por qué valer para otro. */
  return (
    <>
      <BotonGuia usuario={usuario} />
      <ReporteWord key={`${claveArea}:${periodo}:${epoca}`} claveArea={claveArea} reportes={reportes} periodo={periodo} usuario={usuario} pruebas={pruebas} pasoPedido={paso} irA={irA} />
    </>
  );
}
