/* Lo que Estadística digita de una oficina: un mes, una parte, numerador y denominador.
   Sin denominador no hay indicador: el formulario no deja guardar un mes vacío, porque un
   registro sin dato afirmaría que alguien lo midió. */

import { useState } from 'react';
import { Alert, Button, Dialog, Input, Stack } from '@hrl/core-ui';
import { seriesDe } from '@/app/datos/monitoreo.js';
import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import * as api from '@/app/servicios/api.js';

export default function RegistrarDatos({ indicador, anio, meses, registrados, onClose, onGuardado }) {
  const series = seriesDe(indicador);
  const [form, setForm] = useState({ mes: meses.at(-1), serie: series[0].clave, numerador: '', denominador: '', documento: '', nota: '' });
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const parte = series.find((s) => s.clave === form.serie) ?? series[0];

  /* Al elegir un mes con cifra, se ve lo que ya hay para corregirlo. */
  const cambiar = (cambios) => {
    const nuevo = { ...form, ...cambios };
    const r = registrados.find((x) => x.familia === 'dl1153' && x.indicador === indicador.ficha && x.serie === nuevo.serie && x.ambito === 'hospital' && x.mes === Number(nuevo.mes.slice(5)));
    if (cambios.mes || cambios.serie) {
      nuevo.numerador = r?.numerador ?? '';
      nuevo.denominador = r?.denominador ?? '';
      nuevo.documento = r?.documento ?? '';
      nuevo.nota = r?.nota ?? '';
    }
    setForm(nuevo);
  };

  const guardar = async () => {
    const numerador = Number(form.numerador);
    const denominador = Number(form.denominador);
    if (form.numerador === '' || form.denominador === '' || !Number.isFinite(numerador) || !Number.isFinite(denominador)) {
      setError('Escriba el numerador y el denominador. Si la oficina todavía no envió el dato, no registre nada: el mes queda sin dato.');
      return;
    }
    if (denominador <= 0 || numerador < 0) {
      setError('El denominador debe ser mayor que cero y el numerador no puede ser negativo.');
      return;
    }
    setOcupado(true);
    const r = await api.monitoreo('PUT', `/${anio}/resultados`, { cuerpo: { ficha: indicador.ficha, serie: form.serie, mes: Number(form.mes.slice(5)), numerador, denominador, documento: form.documento || null, nota: form.nota || null } });
    setOcupado(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onGuardado?.();
    onClose();
  };

  return (
    <Dialog
      title={`Registrar datos: ficha ${indicador.ficha}`}
      subtitle={`${indicador.nombre}. Lo envía ${indicador.oficina}.`}
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          <Button tone="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="sh-ok" loading={ocupado} loadingText="Guardando…" onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        {error && (
          <Alert tone="error" title="No se guardó">
            {error}
          </Alert>
        )}
        <Input label="Mes" kind="select" options={meses.map((p) => ({ value: p, label: etiquetaPeriodo(p) }))} value={form.mes} onChange={(e) => cambiar({ mes: e.target.value })} />
        {series.length > 1 && <Input label="Parte del indicador" kind="select" options={series.map((s) => ({ value: s.clave, label: s.nombre }))} value={form.serie} onChange={(e) => cambiar({ serie: e.target.value })} />}
        <Input label={parte.numerador ?? indicador.numerador ?? 'Numerador'} kind="number" required value={form.numerador} onChange={(e) => cambiar({ numerador: e.target.value })} />
        <Input label={parte.denominador ?? indicador.denominador ?? 'Denominador'} kind="number" required value={form.denominador} onChange={(e) => cambiar({ denominador: e.target.value })} />
        <Input label="Documento de origen" value={form.documento} onChange={(e) => cambiar({ documento: e.target.value })} info="De dónde salió: número de oficio o informe." />
        <Input label="Nota" value={form.nota} onChange={(e) => cambiar({ nota: e.target.value })} />
      </Stack>
    </Dialog>
  );
}
