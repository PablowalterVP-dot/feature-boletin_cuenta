/* Qué parte del hospital miden las cifras de hospitalización (fase 4 de la decisión
   0011). Mientras no todas las áreas tengan plano, sus egresos y pacientes-día son de
   unas pocas: cualquier pantalla que las muestre lo dice con esta frase. */

const lista = (nombres) => (nombres.length < 2 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`);

export function textoDeCobertura(cobertura) {
  if (!cobertura) return '';
  const { servicios = [], camas, camasContadasDelHospital: contadas, camasOficialesDelHospital: oficiales } = cobertura;
  const total = contadas ? `de las ${contadas} contadas en el hospital (${oficiales} en la relación oficial)` : `de las ${oficiales} de la relación oficial`;
  return `Solo ${lista(servicios.map((s) => s.nombre))}: ${camas} camas ${total}.`;
}

/* Si las cifras cubren todo el hospital. Hasta entonces se rotulan como parciales. */
export const esCoberturaCompleta = (cobertura) => Boolean(cobertura) && cobertura.camas >= (cobertura.camasContadasDelHospital ?? cobertura.camasOficialesDelHospital);
