/* Los tipos de rol.

   Los del flujo eran tres y no dos. El levantamiento del flujo empezó con dos —área y
   Estadística— hasta que apareció Epidemiología: reporta como una de las diez
   áreas y además recibe los reportes de Nefrología y de Centro Quirúrgico. Con
   dos tipos de rol ese caso no se puede representar, y es un caso real.

   Un usuario lleva un rol y, según el rol, el ámbito al que está atado:
     { id, nombre, cargo, correo, rol, area?, oficina? }

   Nadie ve nada fuera de su ámbito: un área ve sus propios reportes, una
   oficina receptora ve solo los que la matriz le remite, y Estadística ve
   todo porque es el punto por el que todo pasa.

   Planeamiento es el cuarto rol del flujo (27/10/2026). Recibe al mismo nivel
   que Estadística: lo entregado por las nueve áreas, no un subconjunto de la
   matriz. No vigila plazos ni reabre meses, y nunca ve un borrador. Lo que
   hace con lo que recibe es suyo: llevar la ejecución física de las
   actividades operativas del POI (`dominio/actividades.js`). Antes era una
   oficina receptora más.

   Hay un cuarto rol, `admin`, que no es del flujo: es la cuenta del equipo de
   desarrollo. No llena, no valida ni recibe reportes; entra como cualquier
   otra cuenta para probarla, reinicia los datos y revisa el bot validador.
   No es un rol del flujo.

   El quinto tipo, `hospitalizacion` (14/11/2026, decisión 0011 de Egresos
   Hospitalarios), es el de las cuentas de los pisos: enfermería, la jefatura del
   departamento, Admisión, el control de camas y Mantenimiento. No reporta ni recibe:
   solo ve los módulos de hospitalización, que existen solo con el servidor
   (navegacion.js). Estadística no pasa a este tipo: con el permiso de validar altas,
   esos módulos aparecen debajo de su menú.

   El sexto, `boletin` (18/11/2026), es la persona encargada del boletín
   estadístico. Entra con su propia cuenta y ve solo dos módulos: el boletín y
   el panel de monitoreo de sus datos. No llena, valida, remite ni administra. */

export const ROL = Object.freeze({
  AREA: 'area',
  ESTADISTICA: 'estadistica',
  PLANEAMIENTO: 'planeamiento',
  OFICINA: 'oficina',
  ADMIN: 'admin',
  HOSPITALIZACION: 'hospitalizacion',
  BOLETIN: 'boletin',
});

export const ROLES = Object.freeze({
  [ROL.AREA]: Object.freeze({
    clave: ROL.AREA,
    label: 'Área que reporta',
    icono: 'sh-pencil',
    descripcion: 'Llena y envía el reporte mensual de su servicio o departamento.',
    casos: Object.freeze([
      'Llenar el reporte del periodo vigente',
      'Seguir el avance del mes y sus cifras desde el tablero de inicio',
      'Consultar su historial y sus constancias de entrega',
      'Exportar su reporte para el archivo del área',
    ]),
  }),
  [ROL.ESTADISTICA]: Object.freeze({
    clave: ROL.ESTADISTICA,
    label: 'Oficina de Estadística',
    icono: 'sh-traffic-light',
    descripcion: 'Recibe lo que entregan las áreas, ya validado por el bot, y lo consolida.',
    casos: Object.freeze([
      'Vigilar qué áreas cumplieron el plazo del periodo',
      'Consultar cada reporte recibido',
      'Remitir el consolidado mensual a DIRESA',
      'Generar el boletín estadístico que se publica',
    ]),
  }),
  [ROL.PLANEAMIENTO]: Object.freeze({
    clave: ROL.PLANEAMIENTO,
    label: 'Oficina de Planeamiento',
    icono: 'sh-chart',
    descripcion: 'Recibe lo que entregan las nueve áreas y lleva con ello la ejecución de las actividades operativas del POI.',
    casos: Object.freeze([
      'Llenar la ejecución física mensual de las actividades operativas',
      'Consultar cada reporte recibido de las nueve áreas',
      'Revisar los consolidados anuales de cada área',
    ]),
  }),
  [ROL.OFICINA]: Object.freeze({
    clave: ROL.OFICINA,
    label: 'Oficina receptora',
    icono: 'sh-inbox',
    descripcion: 'Recibe los reportes ya validados de las áreas que la matriz le asigna.',
    casos: Object.freeze([
      'Consultar los reportes recibidos del periodo',
      'Revisar el histórico de las áreas que le competen',
    ]),
  }),
  [ROL.ADMIN]: Object.freeze({
    clave: ROL.ADMIN,
    label: 'Administración',
    icono: 'sh-gear',
    descripcion: 'Equipo de desarrollo. Entra como cualquier cuenta, reinicia los datos y revisa el bot. No participa del flujo de reportes.',
    casos: Object.freeze([
      'Entrar como cualquier cuenta para probarla, y volver',
      'Reiniciar los datos del prototipo',
      'Revisar el modo, la versión y las reglas del bot validador',
    ]),
  }),
  [ROL.HOSPITALIZACION]: Object.freeze({
    clave: ROL.HOSPITALIZACION,
    label: 'Hospitalización',
    icono: 'sh-home',
    descripcion: 'Las cuentas de los pisos: registran ingresos, camas, altas, traslados y el censo diario. No reportan ni reciben reportes.',
    casos: Object.freeze([
      'Designar la cama de cada paciente y controlarlo hasta el alta',
      'Cerrar el censo diario de su área',
      'Reportar una cama con falla y recibirla reparada',
    ]),
  }),
  [ROL.BOLETIN]: Object.freeze({
    clave: ROL.BOLETIN,
    label: 'Boletín',
    icono: 'sh-bulletin',
    descripcion: 'Encargada del boletín estadístico: genera el boletín y consulta el panel de monitoreo de sus datos. Ámbito: todo el hospital.',
    casos: Object.freeze([
      'Generar el boletín estadístico del mes, listo para imprimir o guardar en PDF',
      'Consultar el panel de monitoreo de los datos que alimentan el boletín',
    ]),
  }),
});

export function rol(clave) {
  return ROLES[clave] ?? null;
}

/* Ámbito de un usuario, en una línea, para la barra de sesión. */
export function ambitoDe(usuario, nombreArea, nombreOficina) {
  if (!usuario) return '';
  if (usuario.rol === ROL.AREA) return nombreArea(usuario.area);
  if (usuario.rol === ROL.OFICINA) return nombreOficina(usuario.oficina);
  if (usuario.rol === ROL.PLANEAMIENTO) return ROLES[ROL.PLANEAMIENTO].label;
  if (usuario.rol === ROL.BOLETIN) return ROLES[ROL.BOLETIN].label;
  if (usuario.rol === ROL.ADMIN) return ROLES[ROL.ADMIN].label;
  return ROLES[ROL.ESTADISTICA].label;
}
