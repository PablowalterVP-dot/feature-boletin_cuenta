import { useRef } from 'react';
import { Button, IconButton } from '@hrl/core-ui';

/* Texto que se edita escribiendo sobre la hoja. Se guarda al salir del campo,
   no en cada tecla: guardar mientras se escribe movería el cursor al inicio
   en cada render. */
export function TextoEditable({ valor, onCambiar, modoEdicion, tag: Tag = 'span', className = '', etiqueta }) {
  if (!modoEdicion) return <Tag className={className}>{valor}</Tag>;

  return (
    <Tag
      className={`${className} boletin-texto-editable`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={etiqueta ?? 'Texto editable del boletín'}
      onBlur={(e) => {
        const nuevo = e.currentTarget.innerText?.trim();
        if (nuevo !== valor) onCambiar?.(nuevo);
      }}
    >
      {valor}
    </Tag>
  );
}

/* Imagen que se cambia desde la hoja. El selector de archivos va oculto y lo
   abre un botón del kit, igual que la carga del Excel de Nutrición: el kit no
   tiene un campo de archivo. La imagen queda en el almacén como data URL, así
   que se pierde al recargar, igual que el resto del prototipo. */
export function ImagenEditable({ src, alt, className = '', modoEdicion, onCambiar, onRestaurar, botonTexto = 'Cambiar foto' }) {
  const entrada = useRef(null);

  const recibir = (archivo) => {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (ev) => ev.target?.result && onCambiar?.(ev.target.result);
    lector.readAsDataURL(archivo);
  };

  if (!modoEdicion) return src ? <img src={src} alt={alt} className={className} /> : null;

  return (
    <div className="boletin-imagen-contenedor">
      {src ? <img src={src} alt={alt} className={className} /> : <div className="boletin-imagen-vacia">Sin foto</div>}
      <div className="boletin-imagen-overlay hrl-no-imprimir">
        <Button size="sm" icon="sh-upload" onClick={() => entrada.current?.click()}>
          {botonTexto}
        </Button>
        {onRestaurar && <IconButton icon="sh-swap" aria-label="Volver a la imagen original" onClick={onRestaurar} />}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            recibir(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
