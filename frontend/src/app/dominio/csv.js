/* Exportación a CSV, sin dependencias.

   Punto y coma como separador y marca BOM al inicio: así Excel abre el archivo
   con las tildes bien y cada dato en su columna. Un dato vacío va como celda
   vacía, nunca como 0: en el formato DIRESA una celda en blanco y un cero
   significan cosas distintas. */

function celda(valor) {
  if (valor == null) return '';
  const texto = String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function aCsv(filas) {
  return `\uFEFF${filas.map((fila) => fila.map(celda).join(';')).join('\r\n')}`;
}

export function descargarCsv(nombreArchivo, filas) {
  const blob = new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
