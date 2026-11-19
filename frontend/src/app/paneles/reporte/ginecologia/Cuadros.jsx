/* Las cifras del reporte de Gineco-Obstetricia, cuadro por cuadro.

   Dos tablas: controles prenatales por grupo de edad (cuadro 1) y partos,
   cesáreas y nacidos por tipo de parto (cuadro 2). Solo lectura: las cifras
   se corrigen en el Excel y se vuelve a subir, como Laboratorio — con el
   backend no hay otra forma, y el prototipo sigue el mismo criterio.

   El cuadro 2 no siempre llega (el Excel real solo lo trae desde setiembre
   de 2026): si el reporte no lo tiene, se dice por qué en vez de mostrar
   una tabla vacía. Una casilla sin registrar muestra «—»; una ilegible,
   lo que decía el Excel. */

import { Alert, Card, DataTable, EmptyState } from '@hrl/core-ui';
import { EDADES, COLUMNAS_F1, TIPOS_PARTO, COLUMNAS_F2 } from '@/app/datos/formatos/ginecologia.js';
import { valor, validar, hallazgosDe } from '@/app/datos/formatos/ginecologia-calculos.js';
import { numero } from '@/app/dominio/formato.js';

const cifra = (v) => (v == null ? '—' : numero(v));

/* Los hallazgos de un formato, computados de los propios datos: igual que
   Farmacia y Nefrología, no hace falta que la pantalla ya haya terminado de
   revisar el archivo para saber qué no cuadra en lo que ya está guardado. */
function HallazgosFormato({ datos, periodo, idFormato }) {
  const hallazgos = hallazgosDe(validar(datos, periodo), idFormato);
  if (!hallazgos.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hallazgos.map((h) => (
        <Alert key={h.id} tone={h.nivel === 'error' ? 'error' : h.nivel === 'aviso' ? 'warning' : 'info'} title={h.titulo}>
          {h.detalle}
        </Alert>
      ))}
    </div>
  );
}

function TablaF1({ datos }) {
  const columnas = [
    { key: 'edad', label: 'Edad de la gestante', width: 200 },
    ...COLUMNAS_F1.map((c) => ({
      key: c.clave,
      label: c.nombre,
      align: 'right',
      tooltip: c.rotulo,
      render: (e) => <span className="hrl-mono">{cifra(valor(datos, 'f1', e.clave, c.clave))}</span>,
    })),
  ];
  return <DataTable columns={columnas} rows={EDADES} rowKey={(e) => e.clave} />;
}

function TablaF2({ datos }) {
  const columnas = [
    { key: 'tipo', label: 'Tipo de parto', width: 220 },
    ...COLUMNAS_F2.map((c) => ({
      key: c.clave,
      label: c.nombre,
      align: 'right',
      tooltip: c.rotulo,
      render: (t) => <span className="hrl-mono">{cifra(valor(datos, 'f2', t.clave, c.clave))}</span>,
    })),
  ];
  return <DataTable columns={columnas} rows={TIPOS_PARTO} rowKey={(t) => t.clave} />;
}

export function CuadroControlesPrenatales({ datos, periodo }) {
  return (
    <Card accent="var(--primary)" icon="sh-baby" title="Controles prenatales" subtitle="Formato 1 · por grupo de edad de la gestante" flush>
      <div className="hrl-cuerpo">
        <HallazgosFormato datos={datos} periodo={periodo} idFormato="f1" />
        <TablaF1 datos={datos} />
      </div>
    </Card>
  );
}

export function CuadroPartosYNacidos({ datos, periodo }) {
  const conDatos = Object.keys(datos?.f2 ?? {}).length > 0;
  return (
    <Card accent="var(--primary)" icon="sh-baby" title="Partos, cesáreas y nacidos" subtitle="Formato 2 · por tipo de parto" flush={conDatos}>
      <div className="hrl-cuerpo">
        <HallazgosFormato datos={datos} periodo={periodo} idFormato="f2" />
        {conDatos ? (
          <TablaF2 datos={datos} />
        ) : (
          <EmptyState
            icon="sh-baby"
            title="Este mes no trae el cuadro 2"
            body="El área no incluyó este cuadro en el Excel de este mes. No es que no hubo partos: el cuadro, con sus cuatro tipos de parto, no llegó."
          />
        )}
      </div>
    </Card>
  );
}
