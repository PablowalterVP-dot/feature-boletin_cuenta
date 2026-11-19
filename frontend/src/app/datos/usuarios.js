/* Usuarios de demostración.

   TODOS LOS NOMBRES SON FICTICIOS. No corresponden a personal del hospital y
   no deben tomarse como tal; están para que el prototipo muestre sesiones con
   nombre y cargo en lugar de «usuario1». La interfaz lo advierte en la pantalla
   de ingreso y en el panel de perfil.

   `roles` es una lista porque Epidemiología entra una sola vez y tiene dos
   ámbitos: reporta como área y recibe como oficina. Ver `dominio/roles.js`. */

import { ROL } from '@/app/dominio/roles.js';

/* El prototipo no autentica: cualquier contraseña entra. Es deliberado, para
   que en la reunión nadie se quede fuera por un tecleo. */
export const AUTENTICACION_SIMULADA = true;

export const USUARIOS = Object.freeze([
  /* --------------------------------------------- Equipo de desarrollo */
  Object.freeze({
    id: 'admin',
    usuario: 'admin',
    nombre: 'Equipo de desarrollo',
    cargo: 'Administración del prototipo',
    correo: 'desarrollo@hrl.gob.pe',
    roles: Object.freeze([ROL.ADMIN]),
  }),

  /* ------------------------------------------------ Oficina de Estadística */
  Object.freeze({
    id: 'est-1',
    usuario: 'estadistica',
    nombre: 'Milagros Zumaeta Pinedo',
    cargo: 'Responsable de la Oficina de Estadística',
    correo: 'estadistica@hrl.gob.pe',
    roles: Object.freeze([ROL.ESTADISTICA]),
  }),

  /* --------------------------------------------- Encargada del boletín
     Cuenta aparte de Estadística: solo ve el boletín y el panel de monitoreo. */
  Object.freeze({
    id: 'boletin',
    usuario: 'boletin',
    nombre: 'Encargada del Boletín',
    cargo: 'Elaboración del boletín estadístico',
    correo: 'boletin@hrl.gob.pe',
    roles: Object.freeze([ROL.BOLETIN]),
  }),

  /* ------------------------------------------- Las nueve áreas que reportan */
  Object.freeze({
    id: 'area-farmacia',
    usuario: 'farmacia',
    nombre: 'Lucía Ramírez Dávila',
    cargo: 'Jefatura del Departamento de Farmacia',
    correo: 'farmacia@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'farmacia',
  }),
  Object.freeze({
    id: 'area-nefrologia',
    usuario: 'nefrologia',
    nombre: 'Marco Tuesta Yumbato',
    cargo: 'Coordinación de Nefrología y Hemodiálisis',
    correo: 'hemodialisis@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'nefrologia',
  }),
  Object.freeze({
    id: 'area-epidemiologia',
    usuario: 'epidemiologia',
    nombre: 'Elena Pacaya Ruiz',
    cargo: 'Responsable de la Oficina de Epidemiología',
    correo: 'epidemiologia@hrl.gob.pe',
    /* El doble rol del sistema: esta cuenta reporta y recibe. */
    roles: Object.freeze([ROL.AREA, ROL.OFICINA]),
    area: 'epidemiologia',
    oficina: 'epidemiologia',
  }),
  Object.freeze({
    id: 'area-laboratorio',
    usuario: 'laboratorio',
    nombre: 'Rosa Ahuanari Silva',
    cargo: 'Jefatura de Laboratorio Clínico y Anatomía Patológica',
    correo: 'laboratorio@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'laboratorio',
  }),
  Object.freeze({
    id: 'area-ginecologia',
    usuario: 'ginecologia',
    nombre: 'Karina Mozombite León',
    cargo: 'Jefatura del Departamento de Gineco-Obstetricia',
    correo: 'ginecoobstetricia@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'ginecologia',
  }),
  Object.freeze({
    id: 'area-centro-quirurgico',
    usuario: 'centroquirurgico',
    nombre: 'Julio Nashnate Vela',
    cargo: 'Coordinación de Centro Quirúrgico',
    correo: 'centroquirurgico@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'centro-quirurgico',
  }),
  Object.freeze({
    id: 'area-lavanderia',
    usuario: 'lavanderia',
    nombre: 'Teresa Cachique Flores',
    cargo: 'Responsable del Área de Costura y Lavandería',
    correo: 'lavanderia@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'lavanderia',
  }),
  Object.freeze({
    id: 'area-nutricion',
    usuario: 'nutricion',
    nombre: 'Diana Saavedra Cruz',
    cargo: 'Jefatura del Departamento de Nutrición y Dietética',
    correo: 'nutricion@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'nutricion',
  }),
  Object.freeze({
    id: 'area-imagenes',
    usuario: 'imagenes',
    nombre: 'Óscar Villacorta Rengifo',
    cargo: 'Jefatura del Departamento de Diagnóstico por Imágenes',
    correo: 'imagenes@hrl.gob.pe',
    roles: Object.freeze([ROL.AREA]),
    area: 'imagenes',
  }),

  /* ------------------------------------------- Oficina de Planeamiento
     Recibe de las nueve áreas, como Estadística. `oficina` es su unidad: la
     matriz la nombra como destino de cada área. */
  Object.freeze({
    id: 'of-planeamiento',
    usuario: 'planeamiento',
    nombre: 'Raúl Bardales Noriega',
    cargo: 'Jefatura de la Oficina de Planeamiento Estratégico',
    correo: 'planeamiento@hrl.gob.pe',
    roles: Object.freeze([ROL.PLANEAMIENTO]),
    oficina: 'planeamiento',
  }),

  /* ------------------------------------------------- Oficinas receptoras */
  Object.freeze({
    id: 'of-cuerpo-tecnico',
    usuario: 'cuerpotecnico',
    nombre: 'Nancy Sangama Huayta',
    cargo: 'Coordinación del Cuerpo Técnico',
    correo: 'cuerpotecnico@hrl.gob.pe',
    roles: Object.freeze([ROL.OFICINA]),
    oficina: 'cuerpo-tecnico',
  }),
  Object.freeze({
    id: 'of-direccion-general',
    usuario: 'direccion',
    nombre: 'Alberto Ferreyra Campos',
    cargo: 'Dirección General',
    correo: 'direccion@hrl.gob.pe',
    roles: Object.freeze([ROL.OFICINA]),
    oficina: 'direccion-general',
  }),
]);

export function usuario(id) {
  return USUARIOS.find((u) => u.id === id) ?? null;
}

export function porNombreDeUsuario(nombreUsuario) {
  const buscado = nombreUsuario.trim().toLowerCase();
  return USUARIOS.find((u) => u.usuario === buscado) ?? null;
}

export function usuarioDeArea(claveArea) {
  return USUARIOS.find((u) => u.area === claveArea) ?? null;
}
