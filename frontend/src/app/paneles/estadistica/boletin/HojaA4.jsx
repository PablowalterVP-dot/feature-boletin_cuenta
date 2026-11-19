import { etiquetaPeriodo } from '@/app/dominio/periodos.js';
import { ImagenEditable } from './ElementosEditables.jsx';

export function HojaA4({ numero, periodo, children }) {
  return (
    <div className="hoja-a4">
      <div className="boletin-cabecera">
        <img src="/boletin/cabecera-oficial.png" alt="MINSA, GERESA Loreto y Hospital Regional de Loreto" />
      </div>
      <div className="boletin-cuerpo">{children}</div>
      <div className="boletin-pie">
        <span>Elaborado por la Oficina de Estadística e Informática – Hospital Regional de Loreto, {etiquetaPeriodo(periodo).toUpperCase()}</span>
        <span className="boletin-pie-numero">{numero}</span>
      </div>
    </div>
  );
}

export function SeparadorCapitulo({ numero, periodo, titulo, imagen, modoEdicion = false, onCambiarImagen, onRestaurarImagen }) {
  return (
    <HojaA4 numero={numero} periodo={periodo}>
      <div className="boletin-separador">
        <div className="boletin-separador-titulo">{titulo}</div>
        <ImagenEditable
          src={imagen}
          alt={titulo}
          className="boletin-separador-ovalo"
          modoEdicion={modoEdicion}
          onCambiar={onCambiarImagen}
          onRestaurar={onRestaurarImagen}
          botonTexto="Cambiar foto del capítulo"
        />
      </div>
    </HojaA4>
  );
}
