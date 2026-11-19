/* Apoyo de la prueba de contrato bot <-> catálogo (@pytest.mark.node), igual
   que contrato_bot_nutricion.mjs: imprime en JSON los códigos de indicador
   de f1 según la definición real del bot (definicion.js), para comparar con
   lo que cargar_catalogo_lavanderia.py escribe en LAV-1, sin reimplementar el
   catálogo en Python. */

import { FORMATOS } from '../../bot-validador/src/areas/lavanderia/definicion.js';

const f1 = FORMATOS.find((f) => f.id === 'f1');
const codigos = f1.filas.map((fila) => `f1.${fila.clave}`).sort();

process.stdout.write(JSON.stringify({ codigos }));
