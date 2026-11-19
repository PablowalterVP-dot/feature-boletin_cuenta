/* Cómo está funcionando el sistema: servidor, base de datos, bot validador,
   cargas de Excel de los últimos 30 días y el estado de las cuentas.

   Lo que el sistema no registra no se muestra con un número inventado. Los errores
   inesperados y los ingresos fallidos sí se registran desde la migración 0010. */

import { Alert, Badge, Button, Card, Mosaic, Stack, StatCard, Tooltip } from '@hrl/core-ui';
import { useAdmin, Cargando, ErrorDeCarga, cuando } from './comunes.jsx';
import { LISTA, FILA, SECUNDARIO } from '@/app/paneles/estadistica/comunes.jsx';

function Dato({ etiqueta, children }) {
  return (
    <li style={FILA}>
      <span style={SECUNDARIO}>{etiqueta}</span>
      <span>{children}</span>
    </li>
  );
}

export default function Funcionamiento() {
  const { datos, cargando, error, recargar } = useAdmin('/funcionamiento');
  if (cargando && !datos) return <Cargando />;
  if (error) return <ErrorDeCarga error={error} recargar={recargar} />;

  const { bot, cargas_30_dias: cargas, cuentas, vigilancia } = datos;
  const pendientes = datos.base_de_datos.migraciones_pendientes ?? [];
  const totalCargas = cargas.aceptadas + cargas.bloqueadas;
  const estadoBot = !bot.configurado ? ['Sin configurar', 'warn'] : bot.responde ? ['Responde', 'ok'] : ['No responde', 'crit'];

  return (
    <Mosaic className="hrl-panel">
      <Card
        accent="var(--primary)"
        icon="sh-pulse"
        title="Servicios"
        subtitle={`Comprobado ${cuando(datos.api.hora_del_servidor)}`}
        actions={
          <Tooltip title="Comprobar otra vez" body="Vuelve a preguntar a la base de datos y al bot si responden." focusable={false}>
            <Button tone="ghost" size="sm" icon="sh-swap" onClick={recargar} loading={cargando}>
              Comprobar
            </Button>
          </Tooltip>
        }
      >
        <ul style={LISTA}>
          <Dato etiqueta="Servidor (API)">
            <Badge label="Responde" tone="ok" /> versión {datos.api.version}
          </Dato>
          <Dato etiqueta="Base de datos">
            <Badge label="Responde" tone="ok" /> PostgreSQL {datos.base_de_datos.version}
          </Dato>
          <Dato etiqueta="Bot validador">
            <Badge label={estadoBot[0]} tone={estadoBot[1]} /> {bot.version ? `versión ${bot.version}` : ''}
          </Dato>
          <Dato etiqueta="El bot sabe leer">{bot.areas.length ? bot.areas.join(', ') : '—'}</Dato>
        </ul>
        {bot.configurado && !bot.responde && (
          <div className="hrl-cuerpo">
            <Alert tone="error" title="Sin el bot, ningún área puede subir su Excel">
              {bot.detalle} Revise que el servicio del bot esté levantado.
            </Alert>
          </div>
        )}
      </Card>

      <Card accent="var(--info)" icon="sh-upload" title="Cargas de Excel" subtitle="Últimos 30 días">
        <div className="hrl-cuerpo">
          <Stack gap={4}>
            <div className="hrl-kpis">
              <StatCard label="Aceptadas" value={String(cargas.aceptadas)} severity="normal" info="Excel que el bot leyó y que quedaron como datos del reporte." />
              <StatCard
                label="Bloqueadas"
                value={String(cargas.bloqueadas)}
                severity={cargas.bloqueadas ? 'suspect' : 'normal'}
                note={totalCargas ? `${Math.round((cargas.bloqueadas / totalCargas) * 100)} % de ${totalCargas}` : 'Sin cargas en el periodo'}
                info="Excel que el bot no pudo leer: estructura distinta, hoja faltante, archivo dañado…"
              />
            </div>
            {cargas.motivos.length > 0 && (
              <ul style={LISTA}>
                {cargas.motivos.map((m) => (
                  <Dato key={m.codigo} etiqueta={m.detalle ?? m.codigo}>
                    {m.veces} {m.veces === 1 ? 'vez' : 'veces'}
                  </Dato>
                ))}
              </ul>
            )}
          </Stack>
        </div>
      </Card>

      <Card accent="var(--warning)" icon="sh-people" title="Cuentas" subtitle="Quién entra y quién falta configurar">
        <ul style={LISTA}>
          <Dato etiqueta="Activas">
            {cuentas.activas} de {cuentas.total}
          </Dato>
          <Dato etiqueta="Entraron en los últimos 7 días">{cuentas.entraron_7_dias}</Dato>
          <Dato etiqueta="Activas que nunca entraron">{cuentas.nunca_entraron}</Dato>
          <Dato etiqueta="Con contraseña provisional">{cuentas.con_clave_provisional}</Dato>
          <Dato etiqueta="Sin contraseña asignada">{cuentas.sin_clave}</Dato>
        </ul>
        <div className="hrl-cuerpo">
          <Alert tone="info" title="Las sesiones no se guardan">
            Cada una es un token de 8 horas: «entraron en los últimos 7 días» es lo más cercano a saber quién la usa.
          </Alert>
        </div>
      </Card>

      <Card
        accent="var(--primary)"
        icon="sh-shield"
        title="Vigilancia"
        subtitle="Errores del servidor e intentos de ingreso"
      >
        {vigilancia?.disponible ? (
          <>
            <ul style={LISTA}>
              <Dato etiqueta="Errores inesperados en 7 días">
                <Badge label={String(vigilancia.errores_7_dias)} tone={vigilancia.errores_7_dias ? 'warn' : 'ok'} />
              </Dato>
              <Dato etiqueta="Ingresos fallidos en 24 horas">{vigilancia.ingresos_fallidos_24h}</Dato>
              <Dato etiqueta="Cuentas frenadas ahora">
                <Tooltip title="Cuenta frenada" body="Tras 5 contraseñas equivocadas seguidas, esa cuenta espera 15 minutos antes de poder volver a intentarlo." focusable={false}>
                  <span>{vigilancia.cuentas_frenadas}</span>
                </Tooltip>
              </Dato>
            </ul>
            {vigilancia.ultimos_errores.length > 0 && (
              <ul style={LISTA}>
                {vigilancia.ultimos_errores.map((e) => (
                  <Dato key={e.referencia} etiqueta={`${e.referencia} · ${cuando(e.fecha)}`}>
                    {e.metodo} {e.ruta} · {e.tipo}
                  </Dato>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="hrl-cuerpo">
            <Alert tone="warning" title="Esta base todavía no registra">
              Falta aplicar la migración 0010: se aplica sola al reiniciar la API.
            </Alert>
          </div>
        )}
        {pendientes.length > 0 && (
          <div className="hrl-cuerpo">
            <Alert tone="error" title="Hay migraciones sin aplicar">
              {pendientes.join(', ')}. La API arrancó igual, pero puede fallar: revise sus logs al iniciar.
            </Alert>
          </div>
        )}
      </Card>
    </Mosaic>
  );
}
