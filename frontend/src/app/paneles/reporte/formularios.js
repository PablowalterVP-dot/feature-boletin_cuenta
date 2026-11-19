/* Paneles de cada formato, por área levantada.

   Complementa a `datos/formatos/levantados.js`: aquel dice qué formatos tiene
   el área y cómo se validan; este, con qué pantalla se llena cada uno. Van
   separados porque la capa de datos no importa componentes. */

import FormatoEcografia from './imagenes/FormatoEcografia.jsx';
import FormatoTomografia from './imagenes/FormatoTomografia.jsx';
import FormatoMamografia from './imagenes/FormatoMamografia.jsx';
import FormatoRayosX from './imagenes/FormatoRayosX.jsx';
import { CUADROS_NUTRICION } from './nutricion/Cuadros.jsx';
import { SECCIONES_LABORATORIO } from './laboratorio/Secciones.jsx';
import FormatoAtenciones from './farmacia/FormatoAtenciones.jsx';
import FormatoSalaOperaciones from './farmacia/FormatoSalaOperaciones.jsx';
import FormatoConsultorios from './farmacia/FormatoConsultorios.jsx';
import FormatoMetas from './farmacia/FormatoMetas.jsx';
import { CUADROS_LAVANDERIA } from './lavanderia/Cuadros.jsx';
import { CUADROS_CENTRO_QUIRURGICO } from './centro-quirurgico/Cuadros.jsx';
import FormatoAtencionesNef from './nefrologia/FormatoAtenciones.jsx';
import { CuadroControlesPrenatales, CuadroPartosYNacidos } from './ginecologia/Cuadros.jsx';
import FormatoInfecciones from './epidemiologia/FormatoInfecciones.jsx';

export const PANELES = Object.freeze({
  lavanderia: CUADROS_LAVANDERIA,
  imagenes: Object.freeze({ f1: FormatoEcografia, f2: FormatoTomografia, f3: FormatoMamografia, f4: FormatoRayosX }),
  nutricion: CUADROS_NUTRICION,
  laboratorio: SECCIONES_LABORATORIO,
  'centro-quirurgico': CUADROS_CENTRO_QUIRURGICO,
  farmacia: Object.freeze({ f1: FormatoAtenciones, f2: FormatoSalaOperaciones, f3: FormatoConsultorios, f4: FormatoMetas }),
  nefrologia: Object.freeze({ f1: FormatoAtencionesNef }),
  ginecologia: Object.freeze({ f1: CuadroControlesPrenatales, f2: CuadroPartosYNacidos }),
  epidemiologia: Object.freeze({ f1: FormatoInfecciones }),
});
