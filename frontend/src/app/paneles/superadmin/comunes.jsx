/* Piezas compartidas del panel del superadministrador. */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Dialog, Input, Mosaic, Skeleton, Stack } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';

/* Lee un recurso de /api/admin. `recargar` vuelve a pedirlo (tras guardar algo).
   El error se muestra como viene del servidor: ya está escrito para personas. */
export function useAdmin(ruta, params) {
  const clave = JSON.stringify(params ?? null);
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    api.adminGet(ruta, JSON.parse(clave) ?? undefined).then((r) => {
      if (!vigente) return;
      setEstado(r.ok ? { datos: r.body, cargando: false, error: null } : { datos: null, cargando: false, error: r.error });
    });
    return () => {
      vigente = false;
    };
  }, [ruta, clave, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recargar };
}

/* Mientras llega: bloques del tamaño de una tarjeta, no una página en blanco. */
export function Cargando() {
  return (
    <Mosaic stacked className="hrl-panel" aria-busy="true">
      <Skeleton height={120} radius="var(--radius-card)" />
      <Skeleton height={280} radius="var(--radius-card)" />
    </Mosaic>
  );
}

export function ErrorDeCarga({ error, recargar }) {
  return (
    <Mosaic stacked className="hrl-panel">
      <Alert
        tone="error"
        title="No se pudo leer del servidor"
        action={
          <Button tone="ghost" icon="sh-swap" onClick={recargar}>
            Reintentar
          </Button>
        }
      >
        {error}
      </Alert>
    </Mosaic>
  );
}

/* Mínimo que pide el servidor (dominio/configuracion.py: LARGO_MINIMO_JUSTIFICACION). */
export const LARGO_JUSTIFICACION = 15;

/* Confirmación con justificación obligatoria: lo que cambia cómo trabajan
   otras personas (pausar un área, retirar un destino, reabrir un reporte, mirar
   como otra cuenta) queda explicado en la bitácora. `alConfirmar(texto)`
   devuelve `{ ok, error? }`; el diálogo se queda abierto si falla. */
export function DialogoJustificado({ titulo, subtitulo, consecuencia, etiqueta = 'Justificación', textoBoton, tono = 'cta', icono, alConfirmar, alCerrar }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const corto = texto.trim().length < LARGO_JUSTIFICACION;

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    const r = await alConfirmar(texto.trim());
    setEnviando(false);
    if (!r.ok) setError(r.error);
  };

  return (
    <Dialog
      title={titulo}
      subtitle={subtitulo}
      onClose={alCerrar}
      maxWidth={560}
      footer={
        <Stack direction="row" gap={3} justify="end">
          <Button tone="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button tone={tono} icon={icono} disabled={corto} loading={enviando} loadingText="Guardando…" onClick={confirmar}>
            {textoBoton}
          </Button>
        </Stack>
      }
    >
      <Stack gap={4}>
        {consecuencia && <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>{consecuencia}</p>}
        <Input
          label={etiqueta}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          hint={`Queda en la bitácora. Al menos ${LARGO_JUSTIFICACION} caracteres: el motivo, no «porque sí».`}
          autoFocus
          required
        />
        {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

/* «5 oct. 2026, 3:04 p. m.»: fecha y hora de algo que pasó, en Lima. */
export function cuando(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });
}

export function dia(isoFecha) {
  if (!isoFecha) return '—';
  const [a, m, d] = isoFecha.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('es-PE', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}
