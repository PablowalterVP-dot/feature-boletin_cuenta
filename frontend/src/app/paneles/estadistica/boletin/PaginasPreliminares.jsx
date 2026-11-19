import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { EDITORIAL_DEFECTO } from '@/app/datos/boletin/editorial.js';
import { ITEMS_POR_HOJA_INDICE } from '@/app/datos/boletin/construir.js';
import { HojaA4 } from './HojaA4.jsx';
import { TextoEditable, ImagenEditable } from './ElementosEditables.jsx';

export function PaginaPortada({ periodo, editorial, modoEdicion, editar }) {
  const p = editorial.portada;
  return (
    <HojaA4 numero={1} periodo={periodo}>
      <div className="boletin-portada-titulo">
        <TextoEditable valor={p.titulo} onCambiar={(v) => editar('portada.titulo', v)} modoEdicion={modoEdicion} etiqueta="Título de la portada" />
      </div>
      <ImagenEditable
        src={p.imagen}
        alt="Fachada del Hospital Regional de Loreto"
        className="boletin-portada-foto"
        modoEdicion={modoEdicion}
        onCambiar={(img) => editar('portada.imagen', img)}
        onRestaurar={() => editar('portada.imagen', EDITORIAL_DEFECTO.portada.imagen)}
        botonTexto="Cambiar foto de portada"
      />
      <div className="boletin-portada-subtitulos">
        <div className="boletin-portada-unidad">
          <TextoEditable valor={p.unidad} onCambiar={(v) => editar('portada.unidad', v)} modoEdicion={modoEdicion} etiqueta="Oficina que publica" />
        </div>
        <div className="boletin-portada-boletin">Boletín Estadístico {etiquetaPeriodo(periodo).toUpperCase()}</div>
        <div className="boletin-portada-lugar">
          <TextoEditable valor={p.lugar} onCambiar={(v) => editar('portada.lugar', v)} modoEdicion={modoEdicion} etiqueta="Lugar de publicación" />
          {`, ${periodo.slice(0, 4)}`}
        </div>
      </div>
    </HojaA4>
  );
}

export function PaginaPresentacion({ periodo, editorial, modoEdicion, editar }) {
  const p = editorial.presentacion;
  return (
    <HojaA4 numero={2} periodo={periodo}>
      <div className="boletin-presentacion">
        <h2 className="boletin-titulo-hoja boletin-titulo-hoja--derecha">PRESENTACIÓN</h2>
        <TextoEditable
          valor={p.parrafo}
          onCambiar={(v) => editar('presentacion.parrafo', v)}
          modoEdicion={modoEdicion}
          tag="p"
          className="boletin-parrafo boletin-parrafo--amplio"
          etiqueta="Párrafo de presentación"
        />
        <div className="boletin-firmante">
          <TextoEditable valor={p.firmante} onCambiar={(v) => editar('presentacion.firmante', v)} modoEdicion={modoEdicion} etiqueta="Firmante" />
        </div>
      </div>
    </HojaA4>
  );
}

const AUTORIDADES = [
  ['director', 'directorCargo'],
  ['adjunto', 'adjuntoCargo'],
  ['administrador', 'administradorCargo'],
  ['jefeEstadistica', 'jefeEstadisticaCargo'],
];

export function PaginaDirectorio({ periodo, editorial, modoEdicion, editar }) {
  const d = editorial.directorio;
  return (
    <HojaA4 numero={3} periodo={periodo}>
      <div className="boletin-directorio">
        <div className="boletin-directorio-entidades">
          <div>Ministerio de Salud · Gobierno Regional de Loreto</div>
          <div>Gerencia Regional de Salud</div>
          <div>Hospital Regional de Loreto «Felipe Arriola Iglesias»</div>
          <TextoEditable valor={d.unidad} onCambiar={(v) => editar('directorio.unidad', v)} modoEdicion={modoEdicion} tag="div" etiqueta="Oficina" />
        </div>
        <div className="boletin-directorio-lista">
          {AUTORIDADES.map(([nombre, cargo]) => (
            <div key={nombre}>
              <TextoEditable valor={d[nombre]} onCambiar={(v) => editar(`directorio.${nombre}`, v)} modoEdicion={modoEdicion} tag="div" className="boletin-autoridad" etiqueta="Nombre" />
              <TextoEditable valor={d[cargo]} onCambiar={(v) => editar(`directorio.${cargo}`, v)} modoEdicion={modoEdicion} tag="div" className="boletin-cargo" etiqueta="Cargo" />
            </div>
          ))}
        </div>
        <div className="boletin-directorio-logo">
          <ImagenEditable
            src={d.logo}
            alt="Hospital Regional de Loreto Felipe Arriola Iglesias"
            className="boletin-logo"
            modoEdicion={modoEdicion}
            onCambiar={(img) => editar('directorio.logo', img)}
            onRestaurar={() => editar('directorio.logo', EDITORIAL_DEFECTO.directorio.logo)}
            botonTexto="Cambiar logo"
          />
        </div>
      </div>
    </HojaA4>
  );
}

export function PaginasIndice({ periodo, indice, hojas }) {
  return Array.from({ length: hojas }, (_, h) => (
    <HojaA4 key={h} numero={4 + h} periodo={periodo}>
      {h === 0 && <h2 className="boletin-titulo-hoja boletin-titulo-hoja--indice">Índice</h2>}
      <div className="boletin-indice">
        {indice.slice(h * ITEMS_POR_HOJA_INDICE, (h + 1) * ITEMS_POR_HOJA_INDICE).map((item) => (
          <div key={`${item.titulo}-${item.pagina}`} className={`boletin-indice-fila${item.capitulo ? ' boletin-indice-fila--capitulo' : ''}${item.sangria ? ' boletin-indice-fila--sangria' : ''}`}>
            <span>{item.titulo}</span>
            <span className="boletin-indice-puntos" />
            <span>{item.pagina}</span>
          </div>
        ))}
      </div>
    </HojaA4>
  ));
}
