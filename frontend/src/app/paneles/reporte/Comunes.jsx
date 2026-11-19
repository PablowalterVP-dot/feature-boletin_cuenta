/* Piezas compartidas por los formatos y por los reportes de cada área. */

import { Alert, Button, Calendar, Icon, IconButton, Input, Tooltip } from '@hrl/core-ui';
import { reporteDe } from '@/app/datos/store.js';
import { estado } from '@/app/dominio/estados.js';
import { numero, SIN_DATOS } from '@/app/dominio/formato.js';
import { diasDelMes, nombreDeDia, etiquetaPeriodo, ultimosPeriodos, mesesDelAnioHasta } from '@/app/dominio/periodos.js';

/* El mes del reporte, para cargar también los meses pasados que el área no
   envió: todos los del año hasta el vigente (y los últimos ocho, por si el año
   recién empieza). Cada opción dice el estado de ese mes. */
export function SelectorDeMes({ reportes, claveArea, periodo, vigente, onCambiar }) {
  const meses = [...new Set([...ultimosPeriodos(8, vigente), ...mesesDelAnioHasta(vigente), periodo])].sort().reverse();
  return (
    <span data-guia="selector-mes" style={{ display: 'block', minWidth: 240 }}>
      <Input
        label="Mes del reporte"
        labelHidden
        kind="select"
        value={periodo}
        onChange={(e) => onCambiar(e.target.value)}
        info="Abre el reporte de otro mes: para cargar, corregir o enviar uno que quedó pendiente."
        options={meses.map((p) => ({ value: p, label: `${etiquetaPeriodo(p)} · ${estado(reporteDe(reportes ?? [], claveArea, p)?.estado).label}` }))}
      />
    </span>
  );
}

/* Lo que conviene saber al cargar un mes anterior al vigente. */
export function AvisoMesAnterior({ periodo, vigente, archivo = 'el archivo' }) {
  if (periodo >= vigente) return null;
  return (
    <Alert tone="info" title={`Está cargando ${etiquetaPeriodo(periodo).toLowerCase()}, un mes anterior al vigente`}>
      Suba {archivo} de ese mes. Se recibe aunque su plazo haya vencido: la fecha real de entrega queda en la constancia.
    </Alert>
  );
}

/* Marca de los datos que el sistema calcula. Solo se pinta junto a los totales:
   es lo único que conviene distinguir a simple vista, porque es lo que no se
   puede escribir. */
const ORIGENES = {
  suma: {
    icono: 'sh-chart',
    label: 'Automático',
    ayuda: 'El sistema lo calcula sumando las casillas. No se puede escribir, y por eso no puede quedar mal sumado.',
  },
  tarifa: {
    icono: 'sh-bill',
    label: 'Kilos por tarifa',
    ayuda: 'Importe calculado multiplicando los kilos por la tarifa: S/ 3,00 la ropa común y S/ 4,50 la ropa sucia.',
  },
  f1: {
    icono: 'sh-share',
    label: 'Viene del Formato 1',
    ayuda: 'Sale del registro diario de kilogramos agrupando los servicios. En el oficio de papel esta suma se rehace a mano.',
  },
};

export function Origen({ tipo }) {
  const o = ORIGENES[tipo] ?? ORIGENES.suma;

  return (
    <Tooltip title={o.label} body={o.ayuda} focusable={false}>
      <span className="hrl-chip" style={{ background: 'var(--info-soft)', color: 'var(--info-fg)', whiteSpace: 'nowrap' }}>
        <Icon name={o.icono} size={13} />
        {o.label}
      </span>
    </Tooltip>
  );
}

/* Cifra con su unidad, que respeta la diferencia entre cero y sin dato. */
export function Cifra({ valor, unidad, decimales = 0, fuerte = false }) {
  const vacio = valor == null;

  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: fuerte ? 'var(--weight-bold)' : 'var(--weight-medium)',
        color: vacio ? 'var(--subtle-foreground)' : 'var(--foreground)',
        fontSize: 'var(--text-base)',
      }}
    >
      {vacio ? SIN_DATOS : `${numero(valor, decimales)}${unidad ? ` ${unidad}` : ''}`}
    </span>
  );
}

export function nombreMesDe(periodo) {
  return etiquetaPeriodo(periodo).split(' ')[0].toLowerCase();
}

/* El kit nombra los estados del día en inglés; los formatos los llaman vacio,
   parcial y lleno. Se traducen aquí, en la frontera. */
const ESTADO_DEL_DIA = { vacio: 'empty', parcial: 'partial', lleno: 'full' };

/* Calendario del periodo. El calendario en sí es un primitivo del kit; aquí
   solo se traduce el periodo 'AAAA-MM' a año y mes, y los estados del día. */
export function CalendarioPeriodo({ periodo, dia, onCambiar, estadoDe, detalleDe, descripcionDe }) {
  const [anio, mes] = periodo.split('-').map(Number);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong style={{ fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>{etiquetaPeriodo(periodo)}</strong>
      <Calendar
        year={anio}
        month={mes}
        selected={dia}
        onSelect={onCambiar}
        statusOf={(d) => ESTADO_DEL_DIA[estadoDe(d)]}
        detailOf={detalleDe}
        descriptionOf={descripcionDe}
        label={`Días de ${etiquetaPeriodo(periodo)}`}
      />
    </div>
  );
}

/* Cabecera del día elegido: la fecha escrita completa, el paso al día anterior
   o siguiente y un atajo al siguiente día que falta completar. */
export function CabeceraDia({ periodo, dia, onCambiar, resumen, siguientePendiente }) {
  const ultimo = diasDelMes(periodo);

  return (
    <div className="hrl-registro__cabeza">
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Tooltip title="Día anterior" body="Pasa al día anterior del mes." focusable={false}>
          <IconButton
            icon="sh-chevron"
            aria-label="Día anterior"
            disabled={dia <= 1}
            onClick={() => onCambiar(dia - 1)}
            style={{ transform: 'rotate(180deg)' }}
          />
        </Tooltip>
        <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--foreground)', padding: '0 6px' }}>
          {nombreDeDia(periodo, dia)} {dia} de {nombreMesDe(periodo)}
        </strong>
        <Tooltip title="Día siguiente" body="Pasa al día siguiente del mes." focusable={false}>
          <IconButton icon="sh-chevron" aria-label="Día siguiente" disabled={dia >= ultimo} onClick={() => onCambiar(dia + 1)} />
        </Tooltip>
      </span>

      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        {resumen && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{resumen}</span>}
        {siguientePendiente != null && siguientePendiente !== dia && (
          <Tooltip title="Siguiente día pendiente" body="Salta al próximo día del mes que todavía no está completo." focusable={false}>
            <Button tone="ghost" size="sm" icon="sh-calendar" onClick={() => onCambiar(siguientePendiente)}>
              Ir al día {siguientePendiente}
            </Button>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
