/* La mascota del bot validador: Dr. Mochi, la mascota del hospital, que vive
   en el kit (`Mascot`, desde v1.10.0-redesign.6). Se eligió en el laboratorio
   de mascotas (frontend/laboratorio-mascota.html).

   Aquí solo se traduce: los estados del bot siguen en español y el kit los
   recibe en inglés, en esta frontera y solo aquí.

     reposo     esperando un archivo       → idle: respira, mira y parpadea
     pensando   leyendo el Excel           → thinking: se mece y lee de lado a lado
     listo      sin errores                → done: celebra y queda contento
     problema   hay errores que corregir   → problem: preocupado, mira hacia abajo

   El movimiento, el movimiento reducido y los colores son del kit; esta pieza
   no anima nada. El estado nunca es la única señal: la mascota es decorativa
   (aria-hidden) y siempre va junto a un texto que lo dice. */

import { Mascot } from '@hrl/core-ui';

export const ESTADO_KIT = { reposo: 'idle', pensando: 'thinking', listo: 'done', problema: 'problem' };

export default function Mascota({ estado = 'reposo', tamano = 'md' }) {
  return <Mascot state={ESTADO_KIT[estado] ?? 'idle'} size={tamano} />;
}
