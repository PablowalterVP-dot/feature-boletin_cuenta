/* La hoja del área tal como se ve en Excel, recortada alrededor de un error
   (21/10/2026). Reemplaza a la tabla «Celda · Qué es · Su Excel · Corregido»:
   una lista de celdas obligaba a imaginar dónde estaba cada una, y el área
   reconoce su hoja, no una lista. Aquí ve sus filas y columnas con sus letras
   y números, sus rótulos a la izquierda y sus cabeceras arriba, y en las
   celdas del error, dentro de la misma celda, lo que dice y lo que dirá:
     · lo que propone Dr. Mochi, antes de aplicarlo: «177 → 170», punteado;
     · lo ya corregido: «~~177~~ 170», con quién lo cambió en el tooltip.
   El color nunca va solo: cada celda marcada lo dice también en su tooltip,
   y la barra de arriba (`BarraDeCelda`, como la de fórmulas de Excel) nombra
   la celda elegida con palabras.

   No es una tabla de registros sino un recorte de la hoja: por eso no pagina
   ni ordena. Se dibuja con el DataTable del kit (una fila de la hoja por fila,
   una letra por columna). Las filas y columnas que no tienen que ver con el
   error se esconden y su hueco se marca con «⋯», como un grupo plegado. */

import { Button, DataTable, Icon, IconButton, Tooltip } from '@hrl/core-ui';
import { numero } from '@/app/dominio/formato.js';

export function textoDeCelda(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return numero(v);
  if (typeof v === 'object' && v.error) return v.error;
  return String(v);
}

export const cifra = (v) => (v == null ? 'vacía' : textoDeCelda(v));
const aNumero = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
function aLetras(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
const partir = (ref) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { columna: aNumero(m[1]), fila: Number(m[2]) } : null;
};
const esTexto = (v) => typeof v === 'string' && v.trim() !== '';

export const PAPEL = {
  total: { clase: 'total', texto: 'El total que no cuadra' },
  sumando: { clase: 'sumando', texto: 'Una de las cifras que forman la suma' },
  error: { clase: 'total', texto: 'La casilla con el error' },
  propuesta: { clase: 'sumando', texto: 'La celda que Dr. Mochi propone cambiar' },
};

export const AUTOR = {
  mochi: { icono: 'sh-wrench', texto: 'Lo corrigió Dr. Mochi', ayuda: 'Es la corrección que propuso Dr. Mochi y usted aplicó.' },
  formula: { icono: 'sh-swap', texto: 'Se ajustó sola', ayuda: 'Es una fórmula: cambió porque cambió una de las celdas que suma.' },
};

/* Qué filas y columnas de la hoja se muestran. Las del error siempre; una
   fila de contexto arriba y abajo si el error es corto; la fila de cabecera
   de cada columna (el primer texto hacia arriba); y a la izquierda, las
   columnas de rótulos (hasta dos: las que más texto tienen en esas filas).
   Entre columnas del error lejanas no se muestra el tramo entero. */
function ventana(valores, refs) {
  const pos = refs.map(partir).filter(Boolean);
  if (!pos.length) return { filas: [], columnas: [], rotulos: new Set() };
  const filasError = [...new Set(pos.map((p) => p.fila))];
  const columnasError = [...new Set(pos.map((p) => p.columna))].sort((a, b) => a - b);
  const primeraCol = columnasError[0];
  const ultimaCol = columnasError[columnasError.length - 1];
  const datos = ultimaCol - primeraCol <= 10 ? Array.from({ length: ultimaCol - primeraCol + 1 }, (_, i) => primeraCol + i) : columnasError;

  const filas = new Set(filasError);
  if (filasError.length <= 12) for (const f of filasError) [f - 1, f + 1].forEach((x) => x >= 1 && filas.add(x));
  const arriba = Math.min(...filas);
  for (const c of datos) {
    for (let f = arriba - 1; f >= Math.max(1, arriba - 15); f -= 1) {
      if (esTexto(valores[`${aLetras(c)}${f}`])) {
        filas.add(f);
        break;
      }
    }
  }

  const cuenta = [];
  for (let c = 1; c < primeraCol; c += 1) {
    const n = [...filas].filter((f) => esTexto(valores[`${aLetras(c)}${f}`])).length;
    if (n) cuenta.push([c, n]);
  }
  const rotulos = new Set(cuenta.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c));
  return { filas: [...filas].sort((a, b) => a - b), columnas: [...new Set([...rotulos, ...datos])].sort((a, b) => a - b), rotulos };
}

/* Una lista de números con un «hueco» donde se saltan algunos. */
function conHuecos(lista) {
  const salida = [];
  lista.forEach((n, i) => {
    if (i > 0 && n - lista[i - 1] > 1) salida.push({ hueco: true, desde: lista[i - 1] + 1, hasta: n - 1 });
    salida.push({ n });
  });
  return salida;
}

function CeldaMarcada({ refCelda, hoja, m, elegida, onElegir }) {
  const papel = PAPEL[m.papel] ?? PAPEL.sumando;
  const clases = [
    'hrl-hoja__celda',
    `hrl-hoja__celda--${m.cambio ? 'cambiada' : m.propuesta !== undefined ? 'propuesta' : papel.clase}`,
    elegida && 'hrl-hoja__celda--elegida',
    m.senalada && 'hrl-hoja__celda--senalada',
  ].filter(Boolean).join(' ');
  const autor = AUTOR[m.autor] ?? AUTOR.formula;
  const estado = m.cambio
    ? `Decía ${cifra(m.antes)}; ahora dice ${cifra(m.ahora)}. ${autor.texto}.`
    : m.propuesta !== undefined
      ? `Dice ${cifra(m.ahora)}. Dr. Mochi propone ${cifra(m.propuesta)}.`
      : `Dice ${cifra(m.ahora)}.`;
  return (
    <Tooltip title={`${hoja ? `${hoja} · ` : ''}${refCelda}: ${m.etiqueta}`} body={`${papel.texto}. ${estado}${m.formula ? ' Es una fórmula.' : ''} Pulse para verla arriba.`} focusable={false} as="div" style={{ display: 'block' }}>
      <Button tone="plain" className={clases} aria-pressed={elegida} aria-label={`${refCelda}, ${m.etiqueta}. ${estado}`} onClick={() => onElegir(m.casilla)}>
        {m.cambio ? (
          <span className="hrl-hoja__par">
            <s>{cifra(m.antes)}</s>
            <strong>{cifra(m.ahora)}</strong>
          </span>
        ) : m.propuesta !== undefined ? (
          <span className="hrl-hoja__par">
            <span>{cifra(m.ahora)}</span>
            <strong className="hrl-hoja__nueva">→ {cifra(m.propuesta)}</strong>
          </span>
        ) : (
          <span>{cifra(m.ahora)}</span>
        )}
        {m.formula && <span className="hrl-celda__fx">fx</span>}
      </Button>
    </Tooltip>
  );
}

/* `marcas`: Map «REF» → { casilla, papel, etiqueta, ahora, antes, cambio,
   autor, propuesta, formula, editable, senalada }. `titulo`: el nombre de la
   hoja (o de la tabla del Word), si hay que decirlo. */
export function HojaEnVista({ titulo, valores = {}, marcas, elegida, onElegir }) {
  const { filas, columnas, rotulos } = ventana(valores, [...marcas.keys()]);
  if (!filas.length) return null;

  const filasTabla = conHuecos(filas).map((x) => (x.hueco ? { clave: `h${x.desde}`, ...x } : { clave: `f${x.n}`, fila: x.n }));
  const columnasTabla = [
    {
      key: 'numero',
      label: '',
      width: 48,
      align: 'right',
      render: (f) =>
        f.hueco ? (
          <Tooltip title="Filas ocultas" body={`Las filas ${f.desde}${f.hasta > f.desde ? ` a ${f.hasta}` : ''} no tienen que ver con este error.`} focusable={false}>
            <span className="hrl-hoja__hueco">⋯</span>
          </Tooltip>
        ) : (
          <span className="hrl-hoja__num">{f.fila}</span>
        ),
    },
    ...conHuecos(columnas).map((x) => {
      if (x.hueco) {
        return {
          key: `h${x.desde}`,
          label: '⋯',
          width: 36,
          align: 'center',
          tooltip: `Las columnas ${aLetras(x.desde)}${x.hasta > x.desde ? ` a ${aLetras(x.hasta)}` : ''} no tienen que ver con este error.`,
          render: () => null,
        };
      }
      const letra = aLetras(x.n);
      const rotulo = rotulos.has(x.n);
      return {
        key: letra,
        label: letra,
        width: rotulo ? undefined : 112,
        align: rotulo ? 'left' : 'right',
        tooltip: `La columna ${letra} de ${titulo ? `«${titulo}»` : 'la hoja'}.`,
        render: (f) => {
          if (f.hueco) return null;
          const ref = `${letra}${f.fila}`;
          const m = marcas.get(ref);
          if (m) return <CeldaMarcada refCelda={ref} hoja={titulo} m={m} elegida={m.casilla === elegida} onElegir={onElegir} />;
          const v = valores[ref];
          return <span className={`hrl-hoja__dato${esTexto(v) ? ' hrl-hoja__dato--texto' : ''}`}>{textoDeCelda(v)}</span>;
        },
      };
    }),
  ];

  return (
    <section className="hrl-hoja" aria-label={titulo ? `Hoja ${titulo}` : 'La hoja'}>
      {titulo && (
        <h3 className="hrl-hoja__pestana">
          <Icon name="sh-table" size={14} /> {titulo}
        </h3>
      )}
      <DataTable columns={columnasTabla} rows={filasTabla} rowKey={(f) => f.clave} rowClass={(f) => (f.hueco ? 'hrl-hoja__fila-hueco' : undefined)} />
    </section>
  );
}

/* Lo que cambió en una celda: «antes → ahora» y quién lo hizo. */
function Cambio({ antes, valor, autor }) {
  const a = AUTOR[autor] ?? AUTOR.formula;
  return (
    <span className="hrl-celda-cambio">
      <span className="hrl-celda-cambio__cifras">
        <s>{cifra(antes)}</s> → <strong>{cifra(valor)}</strong>
      </span>
      <span className="hrl-celda-cambio__autor">
        <Icon name={a.icono} size={12} /> {a.texto}
      </span>
    </span>
  );
}

/* La barra de la celda elegida, como la de fórmulas de Excel: su nombre, qué
   es, lo que dice su archivo y, si cambió, lo que dice ahora. SOLO SE MIRA
   (22/10/2026): la hoja y esta barra señalan el error y lo corregido; lo que
   cambia una cifra son los botones (Aplicar, Deshacer, Confirmar). Un campo
   para escribir a mano invitaba a corregir sin saber qué estaba mal. */
export function BarraDeCelda({ refCelda, hoja, m, doc, onDeshacer }) {
  if (!m) {
    return (
      <div className="hrl-barra-celda hrl-barra-celda--vacia">
        <Icon name="sh-info" size={16} /> Pulse una celda marcada de la hoja para verla aquí.
      </div>
    );
  }
  return (
    <div className="hrl-barra-celda">
      <Tooltip title="La celda elegida" body={`${hoja ? `Hoja «${hoja}», ` : ''}celda ${refCelda}: la columna en letra y la fila en número, como en su ${doc}.`} focusable={false}>
        <span className="hrl-barra-celda__ref">{refCelda}</span>
      </Tooltip>
      {m.formula && (
        <Tooltip title="Fórmula" body="Esta celda es una fórmula: se ajusta sola cuando cambian las celdas que suma." focusable={false}>
          <span className="hrl-celda__fx">fx</span>
        </Tooltip>
      )}
      <span className="hrl-barra-celda__que">{m.etiqueta}</span>
      <span className="hrl-barra-celda__excel">
        Su {doc}: <strong>{cifra(m.cambio ? m.antes : m.ahora)}</strong>
      </span>
      {m.cambio && <Cambio antes={m.antes} valor={m.ahora} autor={m.autor} />}
      {m.cambio && m.autor !== 'formula' && onDeshacer && (
        <Tooltip title="Deshacer" body={`Vuelve ${refCelda} a lo que decía su ${doc}.`} focusable={false}>
          <IconButton icon="sh-close" tone="action" aria-label={`Deshacer la corrección de ${refCelda}`} onClick={onDeshacer} />
        </Tooltip>
      )}
    </div>
  );
}
