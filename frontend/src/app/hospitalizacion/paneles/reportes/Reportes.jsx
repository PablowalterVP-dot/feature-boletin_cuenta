import { useState } from 'react'
import { Badge, Button, Card, DataTable, Grid, Input, Mosaic, PageActions, StatCard } from '@hrl/core-ui'
import { cuadreCenso, diasDesdeArranque, estadoCenso, etiquetaEgreso, pacientePorId, renoxiDelDia, resumenCamas, serviciosConCamas } from '@/app/hospitalizacion/dominio/consultas.js'
import { diaDe, estancia, mesDe, sumarDias, verFecha, verFechaHora } from '@/app/hospitalizacion/dominio/tiempo.js'
import { nombreMedico } from '@/app/hospitalizacion/datos/clinicos.js'
import { nombreServicio, useApp } from '@/app/hospitalizacion/paneles/comun.jsx'

/* El consolidado mensual de censos: lo que Estadística mira de hospitalización (no lo
   modifica). Los censos los cierra cada área; los egresos cuentan desde que el área
   registra el alta. */
export function Consolidado() {
  const { estado } = useApp()
  const [elegido, setElegido] = useState(null)
  const mes = elegido ?? mesDe(estado.ahora)
  const servicios = serviciosConCamas(estado)
  const filas = servicios.flatMap((servicioId) => diasDesdeArranque(estado, mes, servicioId).map((dia) => ({ clave: `${dia}${servicioId}`, dia, servicioId, c: cuadreCenso(estado, servicioId, dia), est: estadoCenso(estado, servicioId, dia) }))).sort((a, b) => (a.dia < b.dia ? 1 : -1))
  const egresos = estado.hospitalizaciones.filter((h) => !h.anulada && h.egreso && mesDe(h.egreso.fechaHora) === mes).sort((a, b) => (a.egreso.fechaHora < b.egreso.fechaHora ? 1 : -1))
  const num = (k, label) => ({ key: k, label, width: 90, align: 'right', render: (f) => f.c[k] })
  return (
    <Mosaic stacked className="hrl-panel">
      <Card title={`Censos de ${mes} por día y servicio`} subtitle="Una sola fuente de pacientes-día para RENOXI y DIRESA." actions={<Input label="Mes" labelHidden kind="select" value={mes} onChange={(e) => setElegido(e.target.value)} options={mesesDisponibles(estado).map((m) => ({ value: m, label: m }))} />}>
        <DataTable rowKey={(f) => f.clave} rows={filas} columns={[
          { key: 'dia', label: 'Día', width: 110, render: (f) => verFecha(f.dia) },
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.servicioId) },
          num('saldoAnterior', 'Saldo ant.'), num('ingresos', 'Ingresos'), num('trasladosEntran', 'Tras. entran'), num('egresos', 'Egresos'), num('trasladosSalen', 'Tras. salen'), num('pacientesCorte', 'Al corte'), num('pacientesDia', 'Pac.-día'),
          { key: 'estado', label: 'Censo', width: 110, render: (f) => <Badge label={f.est.label} tone={f.est.tono} /> },
        ]} />
      </Card>
      <Card title={`Egresos de ${mes}`} subtitle="Cuentan desde que el área registra el alta.">
        <DataTable rowKey={(h) => h.id} rows={egresos} empty="Sin egresos este mes." columns={[
          { key: 'egreso', label: 'Egreso', width: 140, render: (h) => verFechaHora(h.egreso.fechaHora) },
          { key: 'paciente', label: 'Paciente', render: (h) => pacientePorId(estado, h.pacienteId).nombres },
          { key: 'servicio', label: 'Servicio', width: 160, render: (h) => nombreServicio(h.egreso.servicioId) },
          { key: 'tipo', label: 'Tipo', width: 200, render: (h) => etiquetaEgreso(h.egreso.tipo) },
          { key: 'estancia', label: 'Estancia', width: 80, align: 'right', render: (h) => estancia(h.fechaIngreso, h.egreso.fechaHora) },
          { key: 'cie', label: 'CIE-10', width: 80, render: (h) => h.egreso.cie10?.join(', ') || '—' },
          { key: 'medico', label: 'Médico', width: 150, render: (h) => (h.egreso.medicoId ? nombreMedico(h.egreso.medicoId) : '—') },
        ]} />
      </Card>
    </Mosaic>
  )
}

/* Los grupos del formulario, en su orden (estructura del Excel diario de camas).
   UCI Cirugía y Quemados van en «Otros», como en ese Excel. */
const GRUPOS_RENOXI = ['UCI (con o sin VM)', 'Intermedios (con o sin O2)', 'Hospitalización adultos (con o sin O2)', 'Hospitalización pediátrica', 'UPSS Emergencia', 'Otros']
const GRUPO_RENOXI = {
  'cuidados-criticos': 0,
  'uci-pediatria': 0,
  'medicina-intermedios': 1,
  'medicina-a': 2,
  'medicina-b': 2,
  'uci-cirugia': 5,
  quemados: 5,
}
const ordenRenoxi = (servicioId) => GRUPO_RENOXI[servicioId] ?? GRUPOS_RENOXI.length
const grupoRenoxi = (servicioId) => GRUPOS_RENOXI[ordenRenoxi(servicioId)] ?? 'Sin fila asignada'
const filasRenoxi = (estado, dia) => [...renoxiDelDia(estado, dia)].sort((a, b) => ordenRenoxi(a.servicioId) - ordenRenoxi(b.servicioId) || nombreServicio(a.servicioId).localeCompare(nombreServicio(b.servicioId), 'es'))

const COLUMNAS_CSV = [['camas', 'Camas'], ['operativas', 'Operativas'], ['sinO2', 'Sin O2'], ['conO2', 'Con O2'], ['conVM', 'Con VM'], ['ocupadas', 'Ocupadas'], ['disponibles', 'Disponibles']]

/* CSV con punto y coma y BOM: Excel en español lo abre directo, con tildes. */
function descargarCsv(nombre, dias, estado) {
  const linea = (celdas) => celdas.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')
  const filas = [linea(['Día', 'Grupo', 'Servicio', ...COLUMNAS_CSV.map(([, t]) => t)])]
  for (const dia of dias) {
    for (const f of filasRenoxi(estado, dia)) filas.push(linea([dia, grupoRenoxi(f.servicioId), nombreServicio(f.servicioId), ...COLUMNAS_CSV.map(([k]) => f[k])]))
  }
  const url = URL.createObjectURL(new Blob([`\ufeff${filas.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

/* Días del mes con censo ya cerrado o pasado: hasta ayer. */
function diasDelMesHastaAyer(estado, mes) {
  const ayer = sumarDias(diaDe(estado.ahora), -1)
  const dias = []
  for (let d = `${mes}-01`; mesDe(d) === mes && d <= ayer; d = sumarDias(d, 1)) dias.push(d)
  return dias
}

export function Renoxi() {
  const { estado, cuenta, hacer } = useApp()
  const [diaElegido, setDia] = useState(null)
  const dia = diaElegido ?? sumarDias(diaDe(estado.ahora), -1)
  const filas = filasRenoxi(estado, dia)
  const cargado = estado.renoxi[dia]
  const mes = mesDe(dia)
  const cargados = Object.keys(estado.renoxi).filter((d) => mesDe(d) === mes).length
  /* Marca el día como cargado quien carga RENOXI; Estadística solo lo mira. */
  const puede = cuenta.rol === 'camas'
  return (
    <Mosaic stacked className="hrl-panel">
      <PageActions>
        <Button tone="ghost" icon="sh-export" onClick={() => descargarCsv(`renoxi-${dia}.csv`, [dia], estado)}>Descargar el día</Button>
        <Button tone="ghost" icon="sh-export" onClick={() => descargarCsv(`renoxi-${mes}.csv`, diasDelMesHastaAyer(estado, mes), estado)}>Descargar el mes</Button>
        {puede && <Button icon="sh-check" disabled={Boolean(cargado)} onClick={() => hacer('renoxi/marcar', { dia }, 'Día marcado como cargado.')}>Marcar como cargado</Button>}
      </PageActions>
      <Grid min={180} gap={3}>
        <StatCard label="Días cargados este mes" value={`${cargados} / 20`} severity={cargados >= 20 ? 'normal' : 'neutral'} note="RENOXI pide al menos 20 días" />
        <StatCard label="Estado del día" value={cargado ? 'Cargado' : 'Sin cargar'} note={cargado ? verFechaHora(cargado.cargadoEn) : verFecha(dia)} />
      </Grid>
      <Card title={`RENOXI del ${verFecha(dia)}`} subtitle="En el mismo orden del formulario web." actions={<Input label="Día" labelHidden kind="date" value={dia} onChange={(e) => setDia(e.target.value)} />}>
        <DataTable rowKey={(f) => f.servicioId} rows={filas} columns={[
          { key: 'grupo', label: 'Grupo', width: 280, render: (f) => grupoRenoxi(f.servicioId) },
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.servicioId) },
          { key: 'camas', label: 'Camas', width: 80, align: 'right' },
          { key: 'operativas', label: 'Operativas', width: 100, align: 'right' },
          { key: 'sinO2', label: 'Sin O2', width: 80, align: 'right' },
          { key: 'conO2', label: 'Con O2', width: 80, align: 'right' },
          { key: 'conVM', label: 'Con VM', width: 80, align: 'right' },
          { key: 'ocupadas', label: 'Ocupadas', width: 90, align: 'right' },
          { key: 'disponibles', label: 'Disponibles', width: 100, align: 'right' },
        ]} />
      </Card>
    </Mosaic>
  )
}

/* Meses desde el arranque hasta el actual, el más reciente primero. */
function mesesDisponibles(estado) {
  const fin = mesDe(estado.ahora)
  const lista = []
  for (let m = mesDe(estado.arranque); m <= fin; m = sumarDias(`${m}-28`, 4).slice(0, 7)) lista.push(m)
  return lista.reverse()
}

export function Tablero() {
  const { estado, cuenta } = useApp()
  const total = resumenCamas(estado, cuenta.servicios)
  const filas = cuenta.servicios.map((id) => ({ id, ...resumenCamas(estado, [id]) }))
  const pct = (o, t) => (t ? `${Math.round((o * 100) / t)} %` : '—')
  return (
    <Mosaic stacked className="hrl-panel">
      <Grid min={290} gap={3}>
        <StatCard label="Ocupación" value={pct(total.ocupadas, total.operativas)} note={`${total.ocupadas} de ${total.operativas} operativas`} />
        <StatCard label="Disponibles" value={total.disponibles} />
        <StatCard label="Con O2" value={total.conO2} />
        <StatCard label="Con VM" value={total.conVM} />
        <StatCard label="En mantenimiento" value={total.fuera} severity={total.fuera ? 'suspect' : 'normal'} />
      </Grid>
      <Card title="Por servicio" subtitle="Solo lectura, sin datos personales.">
        <DataTable rowKey={(f) => f.id} rows={filas} columns={[
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.id) },
          { key: 'total', label: 'Camas', width: 90, align: 'right' },
          { key: 'operativas', label: 'Operativas', width: 100, align: 'right' },
          { key: 'ocupadas', label: 'Ocupadas', width: 100, align: 'right' },
          { key: 'disponibles', label: 'Disponibles', width: 100, align: 'right' },
          { key: 'conO2', label: 'Con O2', width: 90, align: 'right' },
          { key: 'fuera', label: 'En mantenimiento', width: 130, align: 'right' },
          { key: 'pct', label: 'Ocupación', width: 100, align: 'right', render: (f) => pct(f.ocupadas, f.operativas) },
        ]} />
      </Card>
    </Mosaic>
  )
}
