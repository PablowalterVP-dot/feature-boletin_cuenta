/* Personalización: el nombre del sistema, el mensaje de la pantalla de
   ingreso, un aviso general para todos (con fecha de fin) y las preferencias
   de lectura que recibe quien todavía no eligió las suyas.

   Nada de esto cambia colores ni tipografías: eso es del sistema de diseño
   del hospital (el kit), igual para todos sus sistemas. */

import { useState } from 'react';
import { Alert, Button, Card, Input, Mosaic, SegmentedControl, Stack, Toast } from '@hrl/core-ui';
import * as api from '@/app/servicios/api.js';
import { useAdmin, Cargando, ErrorDeCarga } from './comunes.jsx';

const SIN_FIJAR = 'sin_fijar';

function Formulario({ inicial, alGuardar }) {
  const [p, setP] = useState({ ...inicial, aviso_hasta: inicial.aviso_hasta ?? '', mensaje_ingreso: inicial.mensaje_ingreso ?? '', aviso_texto: inicial.aviso_texto ?? '' });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k, v) => setP((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const vacio = (v) => (v && v.trim() ? v.trim() : null);
    const r = await api.admin('PUT', '/personalizacion', {
      ...p,
      mensaje_ingreso: vacio(p.mensaje_ingreso),
      aviso_texto: vacio(p.aviso_texto),
      aviso_hasta: p.aviso_hasta || null,
    });
    setEnviando(false);
    if (r.ok) alGuardar();
    else setError(r.error);
  };

  const tresEstados = (v) => (v == null ? SIN_FIJAR : v);
  return (
    <>
      <Card accent="var(--primary)" icon="sh-gear" title="Identidad" subtitle="Lo que se lee en la pantalla de ingreso y en la barra superior">
        <div className="hrl-cuerpo">
          <Stack gap={4}>
            <Input label="Nombre del sistema" value={p.nombre_sistema} onChange={(e) => cambiar('nombre_sistema', e.target.value)} required info="Hasta 80 caracteres." />
            <Input label="Mensaje de la pantalla de ingreso" value={p.mensaje_ingreso} onChange={(e) => cambiar('mensaje_ingreso', e.target.value)} info="Por ejemplo, a quién pedir una cuenta. Vacío: sin mensaje." />
          </Stack>
        </div>
      </Card>

      <Card accent="var(--warning)" icon="sh-bell" title="Aviso general" subtitle="Lo ven todos, en el ingreso y arriba de cada pantalla, hasta su fecha de fin">
        <div className="hrl-cuerpo">
          <Stack gap={4}>
            <Input label="Aviso" value={p.aviso_texto} onChange={(e) => cambiar('aviso_texto', e.target.value)} info="Por ejemplo: «El sábado 10 el sistema estará en mantenimiento de 8 a 12». Vacío: sin aviso." />
            <SegmentedControl label="Tono" value={p.aviso_tono} onChange={(v) => cambiar('aviso_tono', v)} options={[{ value: 'info', label: 'Informativo' }, { value: 'warning', label: 'Importante' }]} />
            <Input label="Se muestra hasta" kind="date" value={p.aviso_hasta} onChange={(e) => cambiar('aviso_hasta', e.target.value)} info="Incluido. Vacío: hasta que lo quite." />
          </Stack>
        </div>
      </Card>

      <Card accent="var(--info)" icon="sh-eye" title="Preferencias de lectura por omisión" subtitle="Para quien no eligió las suyas en su perfil. A quien ya eligió, no se le cambian">
        <div className="hrl-cuerpo">
          <Stack gap={4}>
            <SegmentedControl
              label="Contraste"
              value={tresEstados(p.pref_contraste)}
              onChange={(v) => cambiar('pref_contraste', v === SIN_FIJAR ? null : v)}
              options={[{ value: SIN_FIJAR, label: 'Sin fijar' }, { value: 'sistema', label: 'Como el sistema' }, { value: 'estandar', label: 'Estándar' }, { value: 'alto', label: 'Alto' }]}
            />
            <SegmentedControl
              label="Tamaño del texto"
              value={tresEstados(p.pref_tamano_texto)}
              onChange={(v) => cambiar('pref_tamano_texto', v === SIN_FIJAR ? null : v)}
              options={[{ value: SIN_FIJAR, label: 'Sin fijar' }, { value: '100', label: '100 %' }, { value: '115', label: '115 %' }, { value: '130', label: '130 %' }, { value: '150', label: '150 %' }]}
            />
            <SegmentedControl
              label="Subrayar enlaces"
              value={p.pref_subrayar_enlaces == null ? SIN_FIJAR : p.pref_subrayar_enlaces ? 'si' : 'no'}
              onChange={(v) => cambiar('pref_subrayar_enlaces', v === SIN_FIJAR ? null : v === 'si')}
              options={[{ value: SIN_FIJAR, label: 'Sin fijar' }, { value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }]}
            />
          </Stack>
        </div>
      </Card>

      {error && <Alert tone="error" title="No se guardó">{error}</Alert>}
      <Stack direction="row" justify="end">
        <Button icon="sh-ok" loading={enviando} loadingText="Guardando…" onClick={guardar}>
          Guardar la personalización
        </Button>
      </Stack>
    </>
  );
}

export default function Personalizacion() {
  const { datos, cargando, error, recargar } = useAdmin('/personalizacion');
  const [toast, setToast] = useState(null);
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorDeCarga error={error} recargar={recargar} />;

  return (
    <Mosaic stacked className="hrl-panel">
      <Formulario
        key={JSON.stringify(datos)}
        inicial={datos}
        alGuardar={() => {
          setToast('Personalización guardada. Ya la ven todos.');
          recargar();
          api.cargarConfiguracion();
        }}
      />
      <Toast message={toast} onClose={() => setToast(null)} />
    </Mosaic>
  );
}
