/* Cargar el reporte DL 1153 de MINSA: primero se revisa qué cambiaría, y solo se guarda al
   confirmar. Reemplaza las cifras oficiales de esos meses, y deja de valer lo anterior. */

import { useRef, useState } from 'react';
import { Alert, Button, DataTable, Dialog, Stack } from '@hrl/core-ui';
import { fechaCorta } from '@/app/dominio/formato.js';
import * as api from '@/app/servicios/api.js';

const COLUMNAS = [
  { key: 'ficha', label: 'Ficha', render: (f) => `Ficha ${f.ficha}` },
  { key: 'nuevas', label: 'Meses nuevos', align: 'right', render: (f) => f.nuevas },
  { key: 'cambios', label: 'Cambian', align: 'right', tooltip: 'Meses cuya cifra oficial cambió desde la última carga. MINSA corrige sus cifras de un corte a otro.', render: (f) => f.cambios },
  { key: 'iguales', label: 'Iguales', align: 'right', render: (f) => f.iguales },
];

export default function CargarReporte({ onClose, onCargado }) {
  const entrada = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [revision, setRevision] = useState(null);
  const [fase, setFase] = useState('elegir');
  const [error, setError] = useState(null);

  const revisar = async (elegido) => {
    if (!elegido) return;
    setArchivo(elegido);
    setError(null);
    setRevision(null);
    setFase('revisando');
    const r = await api.subirReporteDL1153('/dl1153/revision', elegido);
    if (r.ok) {
      setRevision(r.body);
      setFase('revisado');
    } else {
      setError(r.error);
      setFase('elegir');
    }
  };

  const confirmar = async () => {
    setFase('cargando');
    const r = await api.subirReporteDL1153('/dl1153', archivo);
    if (r.ok) {
      onCargado?.();
      onClose();
    } else {
      setError(r.error);
      setFase('revisado');
    }
  };

  const cambian = revision?.fichas.reduce((a, f) => a + f.cambios, 0) ?? 0;

  return (
    <Dialog
      title="Cargar reporte DL 1153"
      subtitle="El Excel tal como lo publica MINSA. Se lee por dentro: no importa qué filtro tenga guardado cada hoja."
      onClose={onClose}
      maxWidth={640}
      footer={
        <>
          <Button tone="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {revision && (
            <Button icon="sh-upload" loading={fase === 'cargando'} loadingText="Cargando…" onClick={confirmar}>
              Cargar estas cifras
            </Button>
          )}
        </>
      }
    >
      <Stack gap={3}>
        {error && (
          <Alert tone="error" title="No se pudo leer el archivo">
            {error}
          </Alert>
        )}
        <div>
          <Button tone="ghost" icon="sh-folder" loading={fase === 'revisando'} loadingText="Revisando…" onClick={() => entrada.current?.click()}>
            {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
          </Button>
        </div>
        {/* hrl-nativo: el kit no tiene selector de archivos; el botón de arriba lo abre. */}
        <input
          ref={entrada}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            revisar(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {revision && (
          <>
            <Alert tone={cambian > 0 ? 'warning' : 'info'} title={`Reporte ${revision.anio}, hasta el mes ${revision.ultimo_mes}${revision.fecha_corte ? `, corte al ${fechaCorta(revision.fecha_corte)}` : ''}`}>
              {revision.fichas.length} fichas leídas de «{revision.documento}».
              {cambian > 0 ? ` ${cambian} cifras ya cargadas cambiarían por las de este corte.` : ' No cambia ninguna cifra ya cargada.'}
            </Alert>
            {revision.avisos.map((a) => (
              <Alert key={a} tone="warning" title="Una ficha no se pudo leer">
                {a}
              </Alert>
            ))}
            <DataTable columns={COLUMNAS} rows={revision.fichas} rowKey={(f) => f.ficha} />
          </>
        )}
      </Stack>
    </Dialog>
  );
}
