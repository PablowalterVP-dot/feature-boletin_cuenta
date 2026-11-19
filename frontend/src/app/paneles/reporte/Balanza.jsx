/* Lo que no coincide, en cifras y no en frases (22/10/2026). Es lo primero
   que ve el área al abrir un error: dos lados frente a frente —el RESUMEN y
   la hoja, o las cifras de una suma y el total escrito— y en medio ≠ con la
   diferencia, o = cuando ya coinciden. Antes, Dr. Mochi lo explicaba en un
   párrafo y el área leía las celdas y los arreglos sin entender qué estaba
   mal; un ≠ entre dos cifras se entiende sin leer.

   Las cifras salen de los datos corregidos: al aplicar un arreglo, el lado
   cambia y el ≠ pasa a = a la vista. Cada lado: { titulo, celdas: [{ ref,
   etiqueta, valor, cambiada }], mas, resultado }; la cifra ya corregida va
   en verde. Con varias celdas se dibuja la suma
   (una debajo de otra, con su total); con una, la cifra sola. */

import { Icon, Tooltip } from '@hrl/core-ui';
import { cifra } from '@/app/paneles/reporte/HojaEnVista.jsx';

/* Las horas vienen de sumar duraciones: una diferencia de centésimas es
   ruido, y la comparación trae su `tolerancia`. */
const iguales = (a, b, tolerancia) => a != null && b != null && Math.abs(a - b) < (tolerancia || 1e-6);

function Lado({ titulo, celdas = [], mas = 0, resultado }) {
  const esSuma = celdas.length > 1 || mas > 0;
  return (
    <div className="hrl-balanza__lado">
      <span className="hrl-balanza__hoja">
        <Icon name="sh-table" size={14} /> {titulo}
      </span>
      {esSuma && (
        <ul className="hrl-balanza__celdas">
          {celdas.map((c, i) => (
            <li key={c.casilla ?? i}>
              <span className="hrl-balanza__ref">{c.ref ?? ''}</span>
              <span className="hrl-balanza__etiqueta">{c.etiqueta}</span>
              <span className={`hrl-balanza__valor${c.cambiada ? ' hrl-balanza__valor--cambiada' : ''}`}>
                {i > 0 ? '+ ' : ''}
                {cifra(c.valor)}
              </span>
            </li>
          ))}
          {mas > 0 && (
            <li className="hrl-balanza__mas">
              + {mas} {mas === 1 ? 'cifra' : 'cifras'} más (en la hoja)
            </li>
          )}
        </ul>
      )}
      <div className={`hrl-balanza__total${esSuma ? '' : ' hrl-balanza__total--solo'}`}>
        <span>
          {esSuma ? (
            'Total'
          ) : (
            <>
              <span className="hrl-balanza__ref">{celdas[0]?.ref ?? ''}</span> {celdas[0]?.etiqueta}
            </>
          )}
        </span>
        <strong>{cifra(resultado)}</strong>
      </div>
    </div>
  );
}

export function Balanza({ titulo, izquierda, derecha, tolerancia }) {
  const igual = iguales(izquierda.resultado, derecha.resultado, tolerancia);
  const d = (izquierda.resultado ?? 0) - (derecha.resultado ?? 0);
  const dif = cifra(Math.abs(d));
  return (
    <div
      className={`hrl-balanza hrl-balanza--${igual ? 'igual' : 'distinta'}`}
      role="group"
      aria-label={`${titulo ? `${titulo}: ` : ''}${izquierda.titulo} ${cifra(izquierda.resultado)}, ${igual ? 'igual a' : 'distinto de'} ${derecha.titulo} ${cifra(derecha.resultado)}`}
    >
      {titulo && <span className="hrl-balanza__titulo">{titulo}</span>}
      <div className="hrl-balanza__fila">
        <Lado {...izquierda} />
        <Tooltip
          title={igual ? 'Coinciden' : 'No coinciden'}
          body={igual ? 'Los dos lados dicen lo mismo.' : `Difieren en ${dif}: «${izquierda.titulo}» tiene ${dif} ${d > 0 ? 'más' : 'menos'} que «${derecha.titulo}».`}
          focusable={false}
        >
          <span className="hrl-balanza__signo">
            <span className="hrl-balanza__simbolo">{igual ? '=' : '≠'}</span>
            {!igual && (
              <span className="hrl-balanza__dif">
                {d > 0 ? '+' : '−'}
                {dif}
              </span>
            )}
          </span>
        </Tooltip>
        <Lado {...derecha} />
      </div>
    </div>
  );
}
