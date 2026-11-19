/* Herramientas de prueba del reporte de Nutrición: entregar en un clic, o
   deshacer la entrega y volver al paso 1, para ensayar el flujo las veces que
   haga falta.

   Solo aparecen en las sesiones que abrió `admin` («Ver como…»). No son pasos
   del flujo —la máquina de estados no tiene «retirar una entrega»—: las
   funciones de datos/store.js explican por qué no lo rompen.

   Con el backend (modo real) se muestran desactivadas: el reporte vive en la
   base de datos, y el backend no tiene todavía cómo deshacer una entrega.
   Borrarlo solo aquí duraría hasta la siguiente sincronización. */

import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Stack, Tooltip } from '@hrl/core-ui';
import { descartarReporte, devolverABorrador, simularEntrega } from '@/app/datos/store.js';
import { estaEntregado } from '@/app/dominio/estados.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';

/* La usan las dos áreas que suben su Excel: `clave` y `nombre` dicen cuál. */
export default function HerramientasPrueba({ reporte, periodo, real, onHecho, clave: CLAVE = 'nutricion', nombre = 'Nutrición y Dietética' }) {
  const [confirmar, setConfirmar] = useState(null);
  const entregado = reporte && estaEntregado(reporte.estado);
  const mes = etiquetaPeriodo(periodo).toLowerCase();

  const simular = () => {
    const r = simularEntrega(CLAVE, periodo);
    if (r) onHecho({ mensaje: `Entrega simulada: ${mes} quedó enviado con los datos de ejemplo.`, constancia: r });
  };

  const ACCIONES = {
    deshacer: {
      titulo: '¿Deshacer la entrega?',
      texto: `El reporte de ${mes} vuelve a «en llenado» con las mismas cifras y el mismo archivo, y la pantalla vuelve al paso 1. Se pierden el folio, la constancia y las entregas a las oficinas; el historial empieza de nuevo.`,
      boton: 'Deshacer la entrega',
      icono: 'sh-swap',
      hacer: () => devolverABorrador(CLAVE, periodo),
      mensaje: `Entrega deshecha: ${mes} vuelve a estar en llenado.`,
    },
    eliminar: {
      titulo: '¿Eliminar el reporte del mes?',
      texto: `Se borra todo lo del reporte de ${mes}: las cifras, el archivo, las justificaciones y, si se había enviado, la entrega. Queda como «no iniciado», en el paso 1, como si nadie lo hubiera abierto.`,
      boton: 'Eliminar el reporte',
      icono: 'sh-trash',
      hacer: () => descartarReporte(CLAVE, periodo),
      mensaje: `Reporte de ${mes} eliminado: vuelve al paso 1.`,
    },
  };
  const accion = confirmar && ACCIONES[confirmar];

  return (
    <Card
      accent="var(--warning)"
      icon="sh-flask"
      title="Herramientas de prueba"
      subtitle="Para repetir el flujo. Solo en sesiones abiertas por administración; no forman parte del sistema"
      meta={<Badge label="Solo pruebas" tone="warn" />}
    >
      <Stack gap={4} className="hrl-cuerpo">
        {real && (
          <Alert tone="info" title="No disponibles con el backend">
            En modo real el reporte vive en la base de datos y el backend todavía no tiene cómo deshacer una entrega. Para probar el flujo en memoria,
            arranque el frontend sin VITE_API_URL.
          </Alert>
        )}
        <Stack direction="row" gap={3} wrap>
          {!entregado && (
            <Tooltip title="Simular la entrega" body="Llena el mes con los datos de ejemplo y lo envía por las transiciones de siempre: abrir, guardar, enviar.">
              <Button tone="ghost" icon="sh-send" disabled={real} onClick={simular}>
                Simular la entrega
              </Button>
            </Tooltip>
          )}
          {entregado && (
            <Tooltip title="Deshacer la entrega" body="Vuelve a «en llenado» conservando las cifras y el archivo, y regresa al paso 1.">
              <Button tone="ghost" icon="sh-swap" disabled={real} onClick={() => setConfirmar('deshacer')}>
                Deshacer la entrega
              </Button>
            </Tooltip>
          )}
          {reporte && (
            <Tooltip title="Eliminar el reporte del mes" body="Borra cifras, archivo y entrega. Queda «no iniciado», en el paso 1.">
              <Button tone="danger" icon="sh-trash" disabled={real} onClick={() => setConfirmar('eliminar')}>
                Eliminar el reporte
              </Button>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {accion && (
        <Dialog
          title={accion.titulo}
          subtitle={`${nombre} · ${etiquetaPeriodo(periodo)} · herramienta de prueba`}
          onClose={() => setConfirmar(null)}
          maxWidth={540}
          footer={
            <Stack direction="row" gap={3} justify="end">
              <Button tone="ghost" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button
                tone="danger"
                icon={accion.icono}
                onClick={() => {
                  accion.hacer();
                  setConfirmar(null);
                  onHecho({ mensaje: accion.mensaje, alPaso1: true });
                }}
              >
                {accion.boton}
              </Button>
            </Stack>
          }
        >
          <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>{accion.texto}</p>
        </Dialog>
      )}
    </Card>
  );
}
