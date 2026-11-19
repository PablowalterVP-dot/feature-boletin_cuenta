import { DataTable, SeriesBars } from '@hrl/core-ui';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import { etiquetaMes, etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { EDITORIAL_DEFECTO } from '@/app/datos/boletin/editorial.js';
import { GraficoTorta } from '../GraficosBoletin.jsx';
import { HojaA4, SeparadorCapitulo } from './HojaA4.jsx';
import { TextoEditable } from './ElementosEditables.jsx';

/* Pinta un capítulo tal como lo devuelve `construirBoletin`, con la
   maquetación del boletín impreso de julio de 2026: no calcula nada. Una hoja
   de separador y una hoja por sección, que es lo que el índice ya numeró. */

function Celda({ valor }) {
  if (valor == null) return <span className="boletin-sin-dato">{SIN_DATOS}</span>;
  if (typeof valor !== 'number') return valor;
  return numero(valor, Number.isInteger(valor) ? 0 : 2);
}

function Fuente({ texto }) {
  return texto ? <p className="boletin-fuente">{texto}</p> : null;
}

/* La tabla del impreso: franja gris con «Tabla N°…», el nombre del área en la
   primera columna y «TOTAL» sobre las columnas de servicio. */
function Tabla({ bloque, fuente }) {
  const columnas = [
    { key: 'label', label: bloque.encabezado ?? 'Indicador', render: (f) => f.label },
    ...bloque.columnas.map((c) => ({
      key: c.clave,
      label: c.label,
      align: 'center',
      group: c.grupo,
      render: (f) => <Celda valor={f.valores[c.clave]} />,
    })),
  ];
  return (
    <div className="boletin-tabla">
      <div className="boletin-tabla-caja">
        {bloque.titulo && (
          <div className="boletin-tabla-rotulo">
            {bloque.rotulo}: {bloque.titulo}
          </div>
        )}
        <DataTable
          columns={columnas}
          rows={bloque.filas}
          rowKey={(f) => f.clave}
          rowClass={(f) => (f.total ? 'boletin-fila-total' : f.grupo ? 'boletin-fila-grupo' : undefined)}
        />
        <Fuente texto={fuente} />
      </div>
      {bloque.nota && <p className="boletin-nota">{bloque.nota}</p>}
    </div>
  );
}

function Figura({ bloque, fuente, children }) {
  return (
    <figure className="boletin-figura">
      <figcaption>
        {bloque.rotulo}: {bloque.titulo}
      </figcaption>
      {children}
      <Fuente texto={fuente} />
    </figure>
  );
}

function Bloque({ bloque, fuente }) {
  if (bloque.tipo === 'tabla') return <Tabla bloque={bloque} fuente={fuente} />;
  if (bloque.tipo === 'torta') {
    return (
      <Figura bloque={bloque} fuente={fuente}>
        <GraficoTorta partes={bloque.partes} etiqueta={bloque.titulo} />
      </Figura>
    );
  }
  if (bloque.tipo === 'serie') {
    return (
      <Figura bloque={bloque} fuente={fuente}>
        <div className="boletin-grafico-marco">
          <SeriesBars
            height={150}
            unit={bloque.unidad}
            label={bloque.titulo}
            points={bloque.puntos.map((p) => ({ key: p.periodo, label: etiquetaMes(p.periodo), title: etiquetaPeriodo(p.periodo), value: p.valor }))}
          />
        </div>
      </Figura>
    );
  }
  return null;
}

export function Capitulo({ capitulo, periodo, editorial, modoEdicion, editar }) {
  const { clave } = capitulo;
  return (
    <>
      <SeparadorCapitulo
        numero={capitulo.pagina}
        periodo={periodo}
        titulo={`Capítulo ${capitulo.romano} – ${capitulo.titulo}`}
        imagen={editorial.separadores[clave] ?? null}
        modoEdicion={modoEdicion}
        onCambiarImagen={(img) => editar(`separadores.${clave}`, img)}
        onRestaurarImagen={EDITORIAL_DEFECTO.separadores[clave] ? () => editar(`separadores.${clave}`, EDITORIAL_DEFECTO.separadores[clave]) : undefined}
      />
      {capitulo.secciones.map((s, i) => (
        <HojaA4 key={s.clave} numero={s.pagina} periodo={periodo}>
          <h3 className="boletin-seccion-titulo">
            {s.numero}. {s.titulo}
          </h3>
          {i === 0 && editorial.introducciones[clave] && (
            <TextoEditable
              valor={editorial.introducciones[clave]}
              onCambiar={(v) => editar(`introducciones.${clave}`, v)}
              modoEdicion={modoEdicion}
              tag="p"
              className="boletin-parrafo"
              etiqueta={`Introducción del capítulo ${capitulo.titulo}`}
            />
          )}
          {s.texto && <p className="boletin-parrafo">{s.texto}</p>}
          {s.bloques.map((b, k) => (
            <Bloque key={k} bloque={b} fuente={s.fuente} />
          ))}
        </HojaA4>
      ))}
    </>
  );
}
