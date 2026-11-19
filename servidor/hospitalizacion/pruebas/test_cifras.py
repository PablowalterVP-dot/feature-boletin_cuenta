"""Las cifras del mes que Monitoreo y la remisión a DIRESA ponen al lado de las de
Estadística (fase 4 de la decisión 0011): solo agregados, con su cobertura."""

from sqlalchemy import text

from app import cifras


def uno(c, sql, **p):
    return c.execute(text(sql), p).scalar()


def suma(c, columna, tabla="mv_indicadores_mes"):
    return uno(c, f"SELECT sum({columna}) FROM {tabla} WHERE base = 'mapeo' AND mes = '2026-11-01'")


def test_el_mes_en_curso_sale_de_la_vista_y_suma_todas_las_areas(conn):
    r = cifras.del_anio(conn, 2026)
    (noviembre,) = [m for m in r["meses"] if m["mes"] == "2026-11"]
    assert not noviembre["cerrado"]
    assert noviembre["egresos"] == suma(conn, "e") == 3
    assert noviembre["pacientesDia"] == suma(conn, "b")
    assert noviembre["diasEstancia"] == suma(conn, "c")
    assert noviembre["diasCamaDisponibles"] == suma(conn, "d")
    assert noviembre["camas"] == suma(conn, "a")


def test_un_mes_cerrado_sale_de_su_foto_y_avisa_sus_ajustes(conn):
    conn.execute(text("INSERT INTO periodo (mes, estado, cerrado_en, cerrado_por) VALUES ('2026-11-01', 'cerrado', now(), 'sistema')"))
    conn.execute(
        text(
            """INSERT INTO indicador_mes_cerrado (mes, base, departamento_id, servicio_id, a, b, c, d, e, c_f, e_f, f, g, h, i, dias_con_censo)
               SELECT mes, base, departamento_id, servicio_id, a, b, c, d, e + 10, c_f, e_f, f, g, h, i, dias_con_censo
               FROM mv_indicadores_mes WHERE mes = '2026-11-01'"""
        )
    )
    conn.execute(
        text("""INSERT INTO ajuste_periodo (mes, servicio_id, variable, valor_corregido, motivo, registrado_en, cuenta_id)
                VALUES ('2026-11-01', 'medicina-b', 'E', 4, 'Un alta tardía', now(), 'sistema')""")
    )
    (noviembre,) = [m for m in cifras.del_anio(conn, 2026)["meses"] if m["mes"] == "2026-11"]
    servicios = uno(conn, "SELECT count(*) FROM mv_indicadores_mes WHERE base = 'mapeo' AND mes = '2026-11-01'")
    assert noviembre["cerrado"]
    assert noviembre["egresos"] == 3 + 10 * servicios
    assert noviembre["ajustes"] == 1


def test_otro_anio_no_trae_meses(conn):
    assert cifras.del_anio(conn, 2025)["meses"] == []


def test_la_cobertura_dice_que_parte_del_hospital_se_mide(conn):
    c = cifras.cobertura(conn)
    assert c["camas"] == uno(conn, "SELECT count(*) FROM cama WHERE activa") == 67
    assert {s["id"] for s in c["servicios"]} == {"medicina-a", "medicina-b", "medicina-intermedios", "cuidados-criticos", "quemados"}
    assert c["departamentos"] == 3
    # Medicina 42, UCI Medicina 6 y Quemados 7 en la relación de 249.
    assert (c["camasOficialesDeLosDepartamentos"], c["camasOficialesDelHospital"], c["camasContadasDelHospital"]) == (55, 249, 260)


def test_no_lleva_datos_de_pacientes(conn):
    texto = str(cifras.del_anio(conn, 2026))
    for nombre in conn.execute(text("SELECT nombres FROM paciente")).scalars():
        assert nombre not in texto
