-- Módulo Farmacia: la base acepta un Word (.docx) como archivo de un formato.
--
-- Farmacia no entrega un Excel: entrega su informe mensual en Word, el mismo
-- que imprime y firma (01_INFORME_MES_DE_ENERO_2026.docx). avance_04 solo
-- admite xlsx, xls y csv en formato.formato_version.tipo_archivo, y es
-- definitivo: no se parcha. Como el módulo de desempeño (bd/desempeno/), este
-- script va aparte y se corre después de 00_instalar.sql.
--
--   psql -U <usuario> -d estadistica_hrl -v ON_ERROR_STOP=1 -1 -f servidor/api/bd/farmacia/01_word.sql
--
-- Solo amplía la lista: no toca ningún dato ni a Nutrición ni a Laboratorio.
-- Se puede correr más de una vez.

ALTER TABLE formato.formato_version DROP CONSTRAINT IF EXISTS ck_formato_version_tipo;
ALTER TABLE formato.formato_version
    ADD CONSTRAINT ck_formato_version_tipo CHECK (tipo_archivo IS NULL OR tipo_archivo IN ('xlsx', 'xls', 'csv', 'docx'));

COMMENT ON CONSTRAINT ck_formato_version_tipo ON formato.formato_version IS
    'xlsx, xls y csv de avance_04, más docx: el informe mensual de Farmacia (bd/farmacia/01_word.sql).';
