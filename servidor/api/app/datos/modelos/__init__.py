"""Modelos SQLAlchemy sobre el esquema de Alejandro (`servidor/api/bd/`).

`seguridad` y `organizacion` completos; de `formato` y `reporte`, lo que el
backend usa (las transiciones) y lo que esas tablas referencian por clave foránea.
Importar este paquete registra las tablas en `Base.metadata`.

Además, completos, los dos esquemas del módulo de indicadores de desempeño
(`fuente` y `desempeno`), que no son de Alejandro: los instala
`servidor/api/bd/desempeno/`. Y el de Planeamiento (`planeamiento`, migración
0008): lo que escribe de las actividades operativas.
"""

from app.datos.modelos.desempeno import (
    CompromisoAvance,
    Corrida,
    DatoMes,
    DimensionDesempeno,
    Ficha,
    FichaFuente,
    ReferenciaMinsa,
    ResultadoMensual,
    ResultadoPaciente,
    ResultadoRegistrado,
    ScriptAplicado,
    SeguimientoCaso,
)
from app.datos.modelos.formato import (
    CriterioReconocimiento,
    Cuadro,
    Dimension,
    DimensionValor,
    Formato,
    FormatoVersion,
    Indicador,
    IndicadorDimension,
    ReglaValidacion,
    VersionIndicador,
)
from app.datos.modelos.fuente import COLUMNAS_HIS, DefuncionVerificada, Fuente, HisAtencion, LoteCarga, LoteMes, SinadefDefuncion
from app.datos.modelos.organizacion import Destino, Parametro, Periodo, UnidadOrganica
from app.datos.modelos.planeamiento import EjecucionActividad
from app.datos.modelos.reporte import Archivo, Carga, EstadoReporte, Hallazgo, Remision, Reporte, ReporteHistorialEstado, TotalDeclarado, TransicionEstado, Valor
from app.datos.modelos.vistas_de_reporte import ConfiguracionLectura, Cumplimiento, DimensionesDeIndicador, TotalIndicador, ValorDetalle
from app.datos.modelos.seguridad import Permiso, PermisoUsuario, Rol, RolPermiso, Usuario, UsuarioRol

__all__ = [
    "COLUMNAS_HIS",
    "Archivo",
    "Carga",
    "ConfiguracionLectura",
    "Corrida",
    "CriterioReconocimiento",
    "Cuadro",
    "Cumplimiento",
    "DefuncionVerificada",
    "DimensionDesempeno",
    "Destino",
    "Dimension",
    "DimensionValor",
    "DimensionesDeIndicador",
    "EjecucionActividad",
    "EstadoReporte",
    "Ficha",
    "FichaFuente",
    "Formato",
    "FormatoVersion",
    "Fuente",
    "Hallazgo",
    "HisAtencion",
    "Indicador",
    "IndicadorDimension",
    "LoteCarga",
    "LoteMes",
    "Parametro",
    "Periodo",
    "Permiso",
    "PermisoUsuario",
    "ReferenciaMinsa",
    "ReglaValidacion",
    "Remision",
    "Reporte",
    "ReporteHistorialEstado",
    "ResultadoMensual",
    "ResultadoPaciente",
    "Rol",
    "RolPermiso",
    "ScriptAplicado",
    "SeguimientoCaso",
    "SinadefDefuncion",
    "TotalDeclarado",
    "TotalIndicador",
    "TransicionEstado",
    "UnidadOrganica",
    "Usuario",
    "UsuarioRol",
    "Valor",
    "ValorDetalle",
    "VersionIndicador",
]
