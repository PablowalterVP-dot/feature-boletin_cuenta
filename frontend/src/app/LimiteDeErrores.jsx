/* Lo que evita la pantalla en blanco: si algo falla al pintar, se dice y se ofrece
   una salida, sin perder el menú.

   Un caso es habitual y no es una falla: tras un redespliegue, quien tenía la página
   abierta pide archivos que ya no existen, y el panel que abre no llega. Se reconoce
   y se pide recargar, que es lo que lo arregla.

   `clave`: al cambiar (otra pantalla), se vuelve a intentar. Tiene que ser una clase:
   React no ofrece esto con hooks. */

import { Component } from 'react';
import { Button, EmptyState, Mosaic } from '@hrl/core-ui';

const ARCHIVO_QUE_YA_NO_EXISTE = /dynamically imported module|Importing a module script|Failed to fetch|error loading dynamically|Loading chunk/i;

export default class LimiteDeErrores extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, informacion) {
    console.error('Error al pintar la pantalla:', error, informacion?.componentStack);
  }

  componentDidUpdate(anteriores) {
    if (this.state.error && anteriores.clave !== this.props.clave) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const version = ARCHIVO_QUE_YA_NO_EXISTE.test(String(error?.message ?? error));
    return (
      <Mosaic stacked className="hrl-panel">
        <EmptyState
          icon={version ? 'sh-swap' : 'sh-warn'}
          tone="var(--warning)"
          title={version ? 'Hay una versión nueva del sistema' : 'Esta pantalla tuvo un problema'}
          body={
            version
              ? 'Recargue la página para continuar. Puede que deba ingresar de nuevo; lo ya enviado o guardado no se pierde.'
              : 'Lo ya enviado o guardado no se pierde. Recargue la página; si vuelve a pasar, avise a Estadística y cuénteles qué estaba haciendo.'
          }
        >
          <div style={{ marginTop: 16 }}>
            <Button icon="sh-swap" onClick={() => window.location.reload()}>
              Recargar la página
            </Button>
          </div>
        </EmptyState>
      </Mosaic>
    );
  }
}
