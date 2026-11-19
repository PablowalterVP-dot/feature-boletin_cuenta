/* Bot validador visto por el equipo de desarrollo: dónde corre, qué versión
   es, qué áreas sabe leer y qué reglas aplica. La documentación completa está
   en servidor/bot-validador/README.md. */

import { Badge, Button, Card, DataTable, Field, Mosaic, Stack } from '@hrl/core-ui';
import { AREAS_BOT, BOT, MODO_BOT } from '@/app/servicios/bot-validador.js';
import { descargarPlantilla } from '@/app/servicios/ejemplos-nutricion.js';
import { useHoy } from '@/app/datos/store.js';
import { etiquetaPeriodo, periodoVigente } from '@/app/dominio/periodos.js';
import Mascota from '../Mascota.jsx';

const NIVEL = { error: ['Impide enviar', 'crit'], aviso: ['Se revisa con Dr. Mochi', 'warn'], info: ['Informa', 'info'] };

export default function Bot() {
  const vigente = periodoVigente(useHoy());
  const areas = Object.values(AREAS_BOT);
  const reglas = areas.flatMap((a) => a.reglas.map((r) => ({ ...r, area: a.nombre })));

  return (
    <Mosaic className="hrl-panel">
      <Card accent="var(--primary)" icon="sh-shield" title={`${BOT.nombre} ${BOT.version}`} subtitle="Componente aparte del sistema: servidor/bot-validador/">
        <Stack gap={4} className="hrl-cuerpo">
          <Stack direction="row" gap={4} align="center">
            <Mascota estado="reposo" tamano="lg" />
            <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>
              La mascota con la que el bot aparece ante las áreas: espera el archivo, «piensa» mientras lo lee y muestra si encontró
              errores. Es Dr. Mochi, la mascota del hospital: el componente <span className="hrl-mono">Mascot</span> del kit, que esta
              aplicación usa desde <span className="hrl-mono">paneles/Mascota.jsx</span>.
            </p>
          </Stack>
          <div className="hrl-campos">
            <Field k="Modo" v={MODO_BOT.texto} />
            <Field k="Áreas que sabe leer" v={areas.map((a) => a.nombre).join(', ')} />
            <Field k="Versión de plantilla" v={areas.map((a) => `${a.nombre}: ${a.version}`).join(' · ')} mono />
            <Field k="Documentación" v="servidor/bot-validador/README.md" mono />
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)', lineHeight: 'var(--leading-normal)' }}>
            {MODO_BOT.detalle} Para usar el servicio: <span className="hrl-mono">cd servidor/bot-validador && npm start</span> y arrancar el
            frontend con <span className="hrl-mono">VITE_BOT_URL=http://localhost:8787</span>.
          </p>
          <Button tone="ghost" icon="sh-export" onClick={() => descargarPlantilla(vigente)} style={{ alignSelf: 'flex-start' }}>
            Descargar la plantilla de Nutrición de {etiquetaPeriodo(vigente).toLowerCase()}
          </Button>
        </Stack>
      </Card>

      <Card accent="var(--info)" icon="sh-table" title="Reglas" subtitle="Más la comparación con el mes anterior, que aplica el motor a toda área" flush>
        <DataTable
          columns={[
            { key: 'area', label: 'Área', width: 180 },
            { key: 'id', label: 'Regla', width: 150, render: (r) => <span className="hrl-mono">{r.id}</span> },
            { key: 'texto', label: 'Qué comprueba' },
            {
              key: 'nivel',
              label: 'Efecto',
              width: 150,
              render: (r) => <Badge label={NIVEL[r.nivel][0]} tone={NIVEL[r.nivel][1]} />,
            },
          ]}
          rows={reglas}
          rowKey={(r) => `${r.area}-${r.id}`}
        />
      </Card>
    </Mosaic>
  );
}
