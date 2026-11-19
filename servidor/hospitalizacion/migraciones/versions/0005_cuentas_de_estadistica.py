"""Las cuentas pueden venir de Estadística (fase 3 de la decisión 0011).

Con `INGRESO=estadistica`, quien entra es una cuenta de la base de Estadística y aquí
se guarda su espejo (`app/cuentas_estadistica.py`): sin clave, porque la clave vive
allá.

- `cuenta.origen`: `local` (las de este sistema, con su clave) o `estadistica`.
- La regla «toda cuenta tiene clave» pasa a valer solo para las locales.
- `egresos_app` puede borrar filas de `cuenta_servicio`: cuando Estadística cambia
  la unidad de una cuenta, sus servicios aquí se reemplazan."""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """ALTER TABLE cuenta ADD COLUMN origen text NOT NULL DEFAULT 'local'
           CHECK (origen IN ('local', 'estadistica'))"""
    )
    op.execute("ALTER TABLE cuenta DROP CONSTRAINT cuenta_check")
    op.execute(
        """ALTER TABLE cuenta ADD CONSTRAINT cuenta_con_clave
           CHECK (rol = 'sistema' OR origen = 'estadistica' OR clave_hash IS NOT NULL)"""
    )
    op.execute("GRANT DELETE ON cuenta_servicio TO egresos_app")


def downgrade() -> None:
    op.execute("REVOKE DELETE ON cuenta_servicio FROM egresos_app")
    op.execute("ALTER TABLE cuenta DROP CONSTRAINT cuenta_con_clave")
    op.execute("ALTER TABLE cuenta ADD CONSTRAINT cuenta_check CHECK (rol = 'sistema' OR clave_hash IS NOT NULL)")
    op.execute("ALTER TABLE cuenta DROP COLUMN origen")
