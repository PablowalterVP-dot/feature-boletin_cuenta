/* «Iniciar tutorial», en la cabecera de «Reporte del mes»: a la derecha, encima de
   la fecha (estilos.css). Va en la cabecera (PageActions) porque afecta a toda la
   pantalla, y es el único camino: el tutorial solo se abre si se pide. */

import { Button, PageActions, Tooltip } from '@hrl/core-ui';
import { enPractica } from '@/app/servicios/practica.js';
import { iniciarGuia } from './senales.js';

export default function BotonGuia({ usuario }) {
  /* «Ver como…» es de solo lectura, y durante la práctica ya se está en él. */
  if (usuario.soloLectura || enPractica()) return null;
  return (
    <PageActions>
      <Tooltip title="Iniciar tutorial" body="Dr. Mochi le muestra paso a paso cómo se sube, se corrige y se envía el reporte. Es una práctica: nada se guarda y al terminar todo queda como antes." focusable={false}>
        <Button tone="ghost" icon="sh-info" className="hrl-guia-boton" onClick={() => iniciarGuia(usuario)}>
          Iniciar tutorial
        </Button>
      </Tooltip>
    </PageActions>
  );
}
