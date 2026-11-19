"""Contraseñas. Sin base de datos."""

from app import seguridad


def prueba_la_clave_se_guarda_con_argon2id_y_se_verifica():
    h = seguridad.hashear_clave("una-clave-larga")
    assert h.startswith("$argon2id$")
    assert "una-clave-larga" not in h
    assert seguridad.verificar_clave("una-clave-larga", h)
    assert not seguridad.verificar_clave("otra", h)


def prueba_dos_hashes_de_la_misma_clave_difieren():
    """Cada hash lleva su propia sal: si dos cuentas comparten clave, la base
    no lo delata."""
    assert seguridad.hashear_clave("igual") != seguridad.hashear_clave("igual")


def prueba_un_hash_ilegible_da_falso_y_no_una_excepcion():
    assert seguridad.verificar_clave("x", "esto-no-es-un-hash") is False
    assert seguridad.verificar_clave("x", "") is False


def prueba_el_hash_de_relleno_no_corresponde_a_ninguna_clave_razonable():
    h = seguridad.hash_de_relleno()
    assert h == seguridad.hash_de_relleno()  # se calcula una sola vez
    assert not seguridad.verificar_clave("", h) and not seguridad.verificar_clave("admin", h)
