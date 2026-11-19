/* Formato 1 · Atenciones ejecutadas.

   El único cuadro de Nefrología y Hemodiálisis: 29 indicadores de este mes,
   tal como los trae el Word del servicio (una fila por indicador, la columna
   del mes que se reporta). Ninguno se calcula aquí: los trimestres, semestres
   y el total anual que el propio cuadro ya trae son del área, y el bot los
   compara con sus meses al leer el Word (reglas «totales»), no en esta
   pantalla. */

import { Card } from '@hrl/core-ui';
import { INDICADORES, formato } from '@/app/datos/formatos/nefrologia.js';
import { CamposNefrologia, HallazgosFormato } from './Comunes.jsx';

const META = formato('f1');

const GRUPOS = Object.freeze([
  {
    titulo: 'Pacientes y sesiones',
    icono: 'sh-people',
    claves: ['pacientes_atendidos', 'nuevos', 'sesiones_2', 'sesiones_3', 'sesiones_1', 'sin_reuso', 'cambio_filtro'],
  },
  {
    titulo: 'Accesos vasculares',
    icono: 'sh-drop',
    claves: ['cvc_temporal', 'cvc_tunelizado', 'fav', 'colocacion_cateter', 'cvc_disfuncionantes', 'cambio_cvc_permanente', 'cambio_cvc_temporal', 'fistulas_inmaduras', 'infecciones_cvc', 'infecciones_fav'],
  },
  {
    titulo: 'Procedencia y egresos',
    icono: 'sh-share',
    claves: ['sis', 'convenios', 'abandono', 'hospitalizados', 'fallecidos', 'alta_voluntaria', 'atencion_consultorio', 'alta_medica', 'traslado_extrahospitalario', 'transferencias_clinica', 'transferencias'],
  },
  {
    titulo: 'Total del mes',
    icono: 'sh-chart',
    claves: ['total_sesiones'],
  },
]);

export default function FormatoAtenciones({ datos, periodo, editable, onCambiar }) {
  const f1 = datos.f1 ?? {};
  const cambiar = (clave, valor) => onCambiar({ f1: { ...f1, [clave]: valor } });
  const indicador = (clave) => INDICADORES.find((i) => i.clave === clave);

  return (
    <>
      <HallazgosFormato datos={datos} periodo={periodo} idFormato="f1" />

      {GRUPOS.map((g) => (
        <Card key={g.titulo} accent="var(--primary)" icon={g.icono} title={g.titulo} subtitle={`Formato 1 · ${META.titulo}`}>
          <CamposNefrologia
            editable={editable}
            campos={g.claves.map((clave) => {
              const i = indicador(clave);
              return {
                clave,
                label: i.subrotulo ? `${i.rotulo} · ${i.subrotulo}` : i.rotulo,
                ayuda: i.nombre,
                valor: f1[clave] ?? null,
                onCambiar: (v) => cambiar(clave, v),
              };
            })}
          />
        </Card>
      ))}
    </>
  );
}
