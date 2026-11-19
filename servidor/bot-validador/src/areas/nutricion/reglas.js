/* Reglas del reporte de Nutrición y Dietética.

   Una función pura: recibe los datos del reporte y devuelve lo que no cumple.
   Corre igual en el servicio, en el navegador (modo embebido) y en la prueba.

   Tres niveles:
     error  impide enviar. Lo que no cuadra no sale del área.
     aviso  no impide enviar, pero exige una justificación escrita: un valor
            atípico puede ser real (un brote) o un error de tipeo.
     info   lo que conviene saber y no exige nada.

   Un descuadre de totales lleva su `evidencia` (el total escrito y sus
   sumandos, con la casilla de cada uno), como en Laboratorio: con eso la
   corrección guiada señala las celdas y Dr. Mochi explica la cuenta. */

import { FORMATOS, formato, filaDe, claveCasilla } from './definicion.js';
import { valoresDe, totalFormato, sumar } from './calculos.js';
import { diasDelMes } from '../../periodos.js';

function donde(idFormato, claveFila, dia) {
  const f = formato(idFormato);
  const fila = filaDe(idFormato, claveFila);
  return `${f.corto} · ${fila.grupoLabel} · ${fila.comidaLabel}${dia ? ` · día ${dia}` : ''}`;
}

function mediana(valores) {
  const orden = valores.filter((v) => v != null).sort((a, b) => a - b);
  if (!orden.length) return null;
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
}

/* Un día es atípico si triplica la mediana de su fila y la supera en al menos
   15 raciones. Solo hacia arriba: los ceros de domingos y feriados son
   habituales en los internos y en Dirección, y no son errores. */
function esAtipico(v, med) {
  return med != null && med > 0 && v > Math.max(med * 3, med + 15);
}

export const REGLAS = Object.freeze([
  { id: 'fila-no-catalogada', nivel: 'error', texto: 'Cada fila del Excel es un grupo y una comida del reporte' },
  { id: 'incompleto', nivel: 'error', texto: 'Todas las casillas de todos los días tienen un dato (un día sin servicio se anota 0)' },
  { id: 'no-numerico', nivel: 'error', texto: 'Toda casilla del archivo es un número' },
  { id: 'entero', nivel: 'error', texto: 'Las raciones son números enteros, sin signo' },
  { id: 'totales', nivel: 'error', texto: 'Los totales escritos en el Excel coinciden con la suma de sus días' },
  { id: 'atipico', nivel: 'aviso', texto: 'Ningún día se dispara frente al resto de su fila' },
  { id: 'fila-sin-rotulo', nivel: 'aviso', texto: 'Toda fila con cifras tiene su rótulo de grupo y de comida' },
  { id: 'filas-iguales', nivel: 'info', texto: 'Dos comidas del mismo grupo no repiten las mismas cifras día por día' },
  { id: 'rotulo-corregido', nivel: 'info', texto: 'Los rótulos coinciden con los de la plantilla' },
  { id: 'filas-ausentes', nivel: 'info', texto: 'El Excel trae todos los grupos del reporte' },
]);

/* Qué hace cada hallazgo del lector del Excel (oficial.js), según su regla. */
const NIVEL_DE_LECTURA = Object.freeze({ 'fila-no-catalogada': 'error', 'fila-sin-rotulo': 'aviso', 'rotulo-corregido': 'info' });

/* Las filas que el Excel de ese mes no trae: un grupo que no existía ese mes
   (Patrimonio fuera de abril, Internos de Nutrición antes de mayo). No son
   casillas vacías: no aplican, y no se exige llenarlas. */
function ausente(datos, idFormato, claveFila) {
  return Boolean(datos?.ausentes?.[idFormato]?.includes(claveFila));
}

export function validar(datos, periodo) {
  const errores = [];
  const avisos = [];
  const info = [];
  const n = diasDelMes(periodo);

  for (const h of datos?.lectura ?? []) {
    const nivel = NIVEL_DE_LECTURA[h.regla];
    if (nivel === 'error') errores.push({ ...h, id: h.regla });
    else if (nivel === 'aviso') avisos.push(h);
    else if (nivel === 'info') info.push(h);
  }

  for (const f of FORMATOS) {
    const faltan = [];
    const filaComoSumando = (fila) => ({
      etiqueta: `${fila.grupoLabel} · ${fila.comidaLabel}`,
      valor: sumar(valoresDe(datos, f.id, fila.clave, periodo)),
      calculado: true,
      total: `escrito|fila|${f.id}|${fila.clave}`,
      casillas: valoresDe(datos, f.id, fila.clave, periodo).map((_, i) => claveCasilla(f.id, fila.clave, i + 1)),
    });
    const filasDelMes = f.filas.filter((fila) => !ausente(datos, f.id, fila.clave));
    const noFiguran = f.filas.filter((fila) => ausente(datos, f.id, fila.clave));
    if (noFiguran.length) {
      const porGrupo = new Map();
      for (const fila of noFiguran) porGrupo.set(fila.grupoLabel, [...(porGrupo.get(fila.grupoLabel) ?? []), fila.comidaLabel.toLowerCase()]);
      info.push({
        id: `filas-ausentes|${f.id}`, regla: 'filas-ausentes', formato: f.id,
        titulo: `${f.titulo}: el Excel no trae ${noFiguran.length === 1 ? 'una fila' : `${noFiguran.length} filas`} del reporte`,
        detalle: `${[...porGrupo].map(([g, c]) => `${g} (${c.join(', ')})`).join('; ')}. Se toman como no registradas este mes, no como cero.`,
      });
    }

    for (const fila of filasDelMes) {
      const valores = valoresDe(datos, f.id, fila.clave, periodo);
      const med = mediana(valores);

      valores.forEach((v, i) => {
        const dia = i + 1;
        const clave = claveCasilla(f.id, fila.clave, dia);
        const ilegible = datos?.ilegibles?.[clave];

        if (v == null && ilegible != null) {
          errores.push({
            id: 'no-numerico', formato: f.id, fila: fila.clave, dia,
            titulo: `«${ilegible}» no es un número`,
            detalle: `${donde(f.id, fila.clave, dia)}. Escriba la cifra en la hoja o corrija el Excel y súbalo otra vez.`,
          });
        } else if (v == null) {
          faltan.push({ fila: fila.clave, dia });
        } else if (!Number.isInteger(v) || v < 0) {
          errores.push({
            id: 'entero', formato: f.id, fila: fila.clave, dia,
            titulo: `${v} no es un número de raciones válido`,
            detalle: `${donde(f.id, fila.clave, dia)}. Las raciones se cuentan en enteros y no pueden ser negativas.`,
          });
        } else if (esAtipico(v, med)) {
          avisos.push({
            id: `atipico|${clave}`, regla: 'atipico', formato: f.id, fila: fila.clave, dia,
            titulo: `${v} raciones: el resto del mes ronda las ${Math.round(med)}`,
            detalle: `${donde(f.id, fila.clave, dia)}. Puede ser real o un cero de más. Revíselo con Dr. Mochi: corríjalo o confirme que es correcto.`,
            /* Para que Dr. Mochi explique la alerta con cifras (correccion.js). */
            valor: v,
            referencia: Math.round(med),
          });
        }
      });

      const declarado = datos?.declarados?.[f.id]?.[fila.clave];
      const suma = sumar(valores);
      if (declarado != null && suma != null && declarado !== suma) {
        errores.push({
          id: 'totales', formato: f.id, fila: fila.clave,
          titulo: `El total del Excel dice ${declarado} y los días suman ${suma}`,
          detalle: `${donde(f.id, fila.clave)}. Revise los días de la fila: el total es la suma, no se digita aparte.`,
          evidencia: {
            total: { casilla: `escrito|fila|${f.id}|${fila.clave}`, etiqueta: `${donde(f.id, fila.clave)} · TOTAL`, valor: declarado },
            sumandos: valores.map((v, i) => ({ casilla: claveCasilla(f.id, fila.clave, i + 1), etiqueta: `día ${i + 1}`, valor: v })),
            suma,
            diferencia: declarado - suma,
          },
        });
      }
    }

    const declaradoCuadro = datos?.declarados?.[f.id]?._total;
    const sumaCuadro = totalFormato(datos, f.id, periodo);
    /* Si ya descuadra una fila, el total del cuadro descuadra por lo mismo:
       se informa una sola vez, en la fila. */
    const filaDescuadrada = errores.some((e) => e.id === 'totales' && e.formato === f.id);
    if (!filaDescuadrada && declaradoCuadro != null && sumaCuadro != null && declaradoCuadro !== sumaCuadro) {
      errores.push({
        id: 'totales', formato: f.id,
        titulo: `El total del cuadro en el Excel dice ${declaradoCuadro} y las filas suman ${sumaCuadro}`,
        detalle: `${f.titulo}.`,
        evidencia: {
          total: { casilla: `escrito|cuadro|${f.id}`, etiqueta: `${f.titulo} · TOTAL`, valor: declaradoCuadro },
          sumandos: filasDelMes.map(filaComoSumando),
          suma: sumaCuadro,
          diferencia: declaradoCuadro - sumaCuadro,
        },
      });
    }

    /* Casillas vacías: un solo error por cuadro, con la lista, en lugar de
       uno por casilla. Un cuadro sin ningún dato también es un error. */
    if (faltan.length) {
      const muestra = faltan.slice(0, 4).map((c) => `${filaDe(f.id, c.fila).grupoLabel} · ${filaDe(f.id, c.fila).comidaLabel}, día ${c.dia}`);
      errores.push({
        id: 'incompleto', formato: f.id, fila: faltan[0].fila, dia: faltan[0].dia, casillas: faltan,
        titulo: faltan.length === filasDelMes.length * n ? `${f.titulo}: el cuadro está vacío` : `${f.titulo}: ${faltan.length === 1 ? 'falta 1 casilla' : `faltan ${faltan.length} casillas`}`,
        detalle: `${muestra.join('; ')}${faltan.length > 4 ? '…' : ''}. Si ese día no hubo servicio, escriba 0.`,
      });
    }

    /* Dos comidas del mismo grupo idénticas día por día. En el oficio de junio
       pasa con el desayuno y la cena del personal asistencial: puede ser una
       regla real (quien hace turno de noche recibe las dos) o una fila copiada. */
    const porGrupo = new Map();
    for (const fila of filasDelMes) porGrupo.set(fila.grupo, [...(porGrupo.get(fila.grupo) ?? []), fila]);
    for (const filas of porGrupo.values()) {
      for (let a = 0; a < filas.length; a += 1) {
        for (let b = a + 1; b < filas.length; b += 1) {
          const va = valoresDe(datos, f.id, filas[a].clave, periodo);
          const vb = valoresDe(datos, f.id, filas[b].clave, periodo);
          const completas = va.every((v) => v != null) && vb.every((v) => v != null);
          /* Con menos de tres cifras distintas es un patrón de turnos (3 o 0,
             20 todos los días) y coincidir es lo normal. */
          const varian = new Set(va).size > 2;
          if (completas && varian && va.every((v, i) => v === vb[i])) {
            info.push({
              id: `filas-iguales|${f.id}|${filas[a].clave}|${filas[b].clave}`, regla: 'filas-iguales', formato: f.id, fila: filas[b].clave,
              titulo: `${filas[a].grupoLabel}: ${filas[a].comidaLabel.toLowerCase()} y ${filas[b].comidaLabel.toLowerCase()} son iguales todos los días`,
              detalle: 'Si es una regla del servicio, no hace falta hacer nada. Si una fila se copió de la otra, corríjala.',
            });
          }
        }
      }
    }
  }

  return { errores, avisos, info };
}

/* Avisos sin justificar: cada aviso exige una explicación antes de enviar. */
export function avisosPendientes(validacion, datos) {
  return validacion.avisos.filter((a) => !(datos?.justificaciones?.[a.id] ?? '').trim());
}
