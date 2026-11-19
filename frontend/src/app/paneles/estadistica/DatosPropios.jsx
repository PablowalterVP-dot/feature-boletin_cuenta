/* Datos que Estadística digita por su cuenta: consulta externa, egresos,
   camas, emergencia y ambulancia. Ninguna de las nueve áreas los envía.

   Los formatos se recalculan al escribir. Una vez remitido el periodo a
   DIRESA, quedan bloqueados: cambiarlos dejaría a DIRESA con otras cifras.

   En Hospitalización, al lado de cada dato va lo que registró el sistema de
   hospitalización ese mes (fase 4 de la decisión 0011), solo para leerlo: cubre
   únicamente las áreas que tienen plano, así que no se copia ni reemplaza lo
   digitado. */

import { useState } from 'react';
import { Alert, Card, Mosaic, NumberCell, Tooltip } from '@hrl/core-ui';
import { CAMPOS_PROPIOS, GRUPOS_PROPIOS } from '@/app/datos/estadistica-propios.js';
import { numero } from '@/app/dominio/formato.js';
import { esCoberturaCompleta, textoDeCobertura } from '@/app/hospitalizacion/datos/cobertura.js';
import { guardarDatoDelMes } from '@/app/servicios/api.js';
import { cifraDelMes, useCifrasHospitalizacion, veCifrasDeHospitalizacion } from '@/app/servicios/hospitalizacion.js';
import { LISTA, FILA, SECUNDARIO } from './comunes.jsx';

const GRUPO_HOSPITALIZACION = 'Hospitalización';

function DelSistema({ campo, mes, completa }) {
  const valor = mes?.[campo.clave];
  if (valor == null) return null;
  const estado = mes.cerrado ? 'mes cerrado' : 'hasta el último censo cerrado';
  return (
    <span style={SECUNDARIO}>
      Sistema de hospitalización{completa ? '' : ' (parcial)'}: {numero(valor, Number.isInteger(valor) ? 0 : 1)} {campo.unidad}, {estado}
    </span>
  );
}

export default function DatosPropios({ periodo, propios, editable, permisos = [] }) {
  const delPeriodo = propios?.[periodo] ?? {};
  const [error, setError] = useState(null);
  const cifras = useCifrasHospitalizacion(Number(String(periodo).slice(0, 4)), veCifrasDeHospitalizacion(permisos));
  const delMes = cifraDelMes(cifras, periodo);
  const completa = esCoberturaCompleta(cifras?.cobertura);
  const guardar = async (clave, valor) => {
    const r = await guardarDatoDelMes(periodo, clave, valor);
    setError(r.ok ? null : r.error);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!editable && <Alert tone="info" title="Periodo ya remitido a DIRESA: los datos no se pueden cambiar" />}
      {error && (
        <Alert tone="error" title="No se guardó el último dato">
          {error}
        </Alert>
      )}
      {delMes && !completa && (
        <Alert tone="info" title="Hospitalización todavía no cubre todo el hospital">
          {textoDeCobertura(cifras.cobertura)} Sus cifras van al lado de las tuyas para compararlas: lo que se remite a DIRESA sigue siendo lo que digitas.
        </Alert>
      )}

      <Mosaic>
        {GRUPOS_PROPIOS.map((grupo) => (
          <Card accent="var(--info)" icon="sh-pencil" key={grupo} title={grupo} subtitle="Registros propios de Estadística">
            <ul style={LISTA}>
              {CAMPOS_PROPIOS.filter((c) => c.grupo === grupo).map((c) => (
                <li key={c.clave} style={FILA}>
                  <span>
                    <Tooltip title={c.label} body={`Fuente: ${c.fuente}.`} focusable={false}>
                      <span style={{ fontSize: 'var(--text-base)', cursor: 'help' }}>{c.label}</span>
                    </Tooltip>
                    {grupo === GRUPO_HOSPITALIZACION && <DelSistema campo={c} mes={delMes} completa={completa} />}
                  </span>
                  <NumberCell
                    value={delPeriodo[c.clave] ?? null}
                    onChange={(v) => guardar(c.clave, v)}
                    disabled={!editable}
                    width={104}
                    suffix={c.unidad}
                    aria-label={c.label}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </Mosaic>
    </div>
  );
}
