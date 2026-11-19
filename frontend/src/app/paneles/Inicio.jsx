/* Inicio del área que tiene la sesión abierta.

   Las nueve áreas tienen tablero: seis propio, porque sus cifras son propias,
   y tres (las de un solo cuadro) el común de `InicioPorCifras`. Un área sin
   ninguno ve solo el aviso de Dr. Mochi bajo la cabecera: en qué estado está el
   reporte del mes y cuánto plazo queda.

   Centro Quirúrgico y Gineco-Obstetricia ven además sus indicadores directos, calculados solo con
   sus reportes y con las mismas tarjetas que Monitoreo Indicadores (`inicio/IndicadoresDelArea.jsx`);
   su detalle se abre aquí mismo. */

import InicioLavanderia from './inicio/InicioLavanderia.jsx';
import InicioImagenes from './inicio/InicioImagenes.jsx';
import InicioNutricion from './inicio/InicioNutricion.jsx';
import InicioLaboratorio from './inicio/InicioLaboratorio.jsx';
import InicioFarmacia from './inicio/InicioFarmacia.jsx';
import InicioCentroQuirurgico from './inicio/InicioCentroQuirurgico.jsx';
import InicioPorCifras, { AREAS_CON_TABLERO_POR_CIFRAS } from './inicio/InicioPorCifras.jsx';
import IndicadoresDelArea, { DetalleDelArea, pideDetalle, tieneIndicadores } from './inicio/IndicadoresDelArea.jsx';

const TABLEROS = {
  lavanderia: InicioLavanderia,
  imagenes: InicioImagenes,
  nutricion: InicioNutricion,
  laboratorio: InicioLaboratorio,
  farmacia: InicioFarmacia,
  'centro-quirurgico': InicioCentroQuirurgico,
};

/* Un área sin tablero propio: su Inicio es el aviso de Dr. Mochi (el estado
   del reporte del mes, con su acción), que va bajo la cabecera. Aquí no se
   repite: antes había una tarjeta con lo mismo. */
function InicioGeneral() {
  return null;
}

export default function Inicio({ reportes, usuario, params = {}, irA }) {
  const area = usuario.area;
  if (pideDetalle(area, params)) return <DetalleDelArea area={area} reportes={reportes} params={params} irA={irA} />;
  const indicadores = tieneIndicadores(area) ? <IndicadoresDelArea area={area} reportes={reportes} irA={irA} /> : null;
  const Tablero = TABLEROS[area];
  if (Tablero) return <Tablero reportes={reportes} irA={irA} indicadores={indicadores} />;
  /* Nefrología, Epidemiología y Gineco-Obstetricia (07/11/2026: su Inicio quedaba vacío). */
  if (AREAS_CON_TABLERO_POR_CIFRAS.includes(area)) return <InicioPorCifras area={area} reportes={reportes} indicadores={indicadores} />;
  return <InicioGeneral />;
}
