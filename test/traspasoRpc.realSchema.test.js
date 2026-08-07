/**
 * Pruebas de migración de traspaso contra slice del esquema REAL (backup).
 * NO toca producción.
 *
 * Ejecutar: node test/traspasoRpc.realSchema.test.js
 */
const assert = require('assert')
const { execSync, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const CONTAINER = 'reportes-traspaso-real-pg'
const PG_PORT = '55433'

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' })
}

function psql(sql) {
  const r = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`psql failed:\n${r.stderr || r.stdout}\nSQL: ${sql.slice(0, 240)}`)
  }
  return (r.stdout || '').trim()
}

function psqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8')
  const r = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`psql file failed ${filePath}:\n${r.stderr || r.stdout}`)
  }
}

function jsonRpc(params) {
  const {
    componenteId,
    origenId,
    destinoId,
    origenFds = false,
    obs = null,
    clientUuid = null,
    usuario = 'tester',
    canal = 'test',
  } = params
  const sql = `
SELECT public.traspasar_activo_entre_conjuntos(
  ${componenteId}::bigint,
  ${origenId}::bigint,
  ${destinoId}::bigint,
  ${origenFds}::boolean,
  ${obs == null ? 'NULL' : `'${String(obs).replace(/'/g, "''")}'`}::text,
  ${clientUuid == null ? 'NULL' : `'${clientUuid}'::uuid`},
  NULL::uuid,
  '${usuario}'::text,
  '${canal}'::text
)::text;
`
  return JSON.parse(psql(sql))
}

function seedBase() {
  psql(`
TRUNCATE movimientos_inventario, activo_componentes, activos RESTART IDENTITY CASCADE;
INSERT INTO activos (numero_serie, descripcion, categoria, estado, es_conjunto, ubicacion)
VALUES
  ('MF-ORIG', 'Conjunto origen', 'otro', 'operativo', true, 'Yacimiento A'),
  ('MF-DEST', 'Conjunto destino', 'otro', 'operativo', true, 'Yacimiento B'),
  ('ACT-1', 'Activo libre', 'otro', 'operativo', false, 'Base'),
  ('MF-FDS', 'Destino FDS', 'otro', 'fuera de servicio', true, 'Taller'),
  ('ACT-OTHER', 'Otro activo', 'otro', 'operativo', false, 'Base'),
  ('MF-ALT', 'Otro origen', 'otro', 'operativo', true, 'Alt');
INSERT INTO activo_componentes (conjunto_id, componente_id, fecha_desde, fecha_hasta)
VALUES (1, 3, now(), NULL);
`)
}

function test(name, fn) {
  try {
    fn()
    console.log('OK', name)
  } catch (e) {
    console.error('FAIL', name)
    console.error(e.message || e)
    process.exitCode = 1
  }
}

function main() {
  console.log('Docker Postgres + slice esquema real...')
  try {
    sh(`docker rm -f ${CONTAINER}`)
  } catch (_) {}
  sh(
    `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=postgres -p ${PG_PORT}:5432 postgres:15-alpine`,
  )

  for (let i = 0; i < 40; i++) {
    try {
      psql('SELECT 1')
      break
    } catch (_) {
      if (i === 39) throw new Error('Postgres no arrancó')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
    }
  }

  psqlFile(path.join(ROOT, 'sql', '_test_traspaso_schema_real_slice.sql'))
  psqlFile(path.join(ROOT, 'sql', '2026-08-01_activo_traspaso_atomico.sql'))

  test('migración aplica sobre slice real (función + vista + trigger FDS)', () => {
    assert.strictEqual(
      psql(`SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='traspasar_activo_entre_conjuntos'`),
      '1',
    )
    assert.strictEqual(
      psql(`SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public' AND table_name='v_diag_membresias_abiertas_fuera_de_servicio'`),
      '1',
    )
    assert.strictEqual(
      psql(`SELECT COUNT(*) FROM pg_trigger WHERE tgname='trg_validar_componente_no_fuera_de_servicio'`),
      '1',
    )
    assert.strictEqual(
      psql(`SELECT COUNT(*) FROM pg_indexes WHERE indexname='activo_componentes_componente_activo_key'`),
      '1',
    )
  })

  test('traspaso normal + 3 escrituras de historial', () => {
    seedBase()
    const r = jsonRpc({
      componenteId: 3,
      origenId: 1,
      destinoId: 2,
      clientUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.idempotent, false)
    assert.strictEqual(r.historial_registrado, true)
    assert.strictEqual(psql(`SELECT conjunto_id FROM activo_componentes WHERE componente_id=3 AND fecha_hasta IS NULL`), '2')
    assert.strictEqual(psql(`SELECT COUNT(*) FROM activo_componentes WHERE componente_id=3 AND conjunto_id=1 AND fecha_hasta IS NOT NULL`), '1')

    const movs = psql(`
SELECT COUNT(*) FROM movimientos_inventario
WHERE tipo_movimiento='composicion_traspaso'
`)
    assert.strictEqual(movs, '3')

    const byActivo = psql(`
SELECT activo_id::text FROM movimientos_inventario
WHERE tipo_movimiento='composicion_traspaso'
ORDER BY activo_id
`).split('\n')
    assert.deepStrictEqual(byActivo, ['1', '2', '3'])
  })

  test('reintento mismo client_uuid idempotente sin duplicar historial', () => {
    seedBase()
    const uuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const first = jsonRpc({ componenteId: 3, origenId: 1, destinoId: 2, clientUuid: uuid })
    assert.strictEqual(first.ok, true)
    const n1 = psql(`SELECT COUNT(*) FROM movimientos_inventario WHERE tipo_movimiento='composicion_traspaso'`)
    const second = jsonRpc({ componenteId: 3, origenId: 1, destinoId: 2, clientUuid: uuid })
    assert.strictEqual(second.ok, true)
    assert.strictEqual(second.idempotent, true)
    const n2 = psql(`SELECT COUNT(*) FROM movimientos_inventario WHERE tipo_movimiento='composicion_traspaso'`)
    assert.strictEqual(n2, n1)
  })

  test('client_uuid reutilizado para otro movimiento → CLIENT_UUID_INCOMPATIBLE', () => {
    seedBase()
    const uuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    assert.strictEqual(jsonRpc({ componenteId: 3, origenId: 1, destinoId: 2, clientUuid: uuid }).ok, true)
    psql(`INSERT INTO activo_componentes (conjunto_id, componente_id, fecha_desde, fecha_hasta) VALUES (1, 5, now(), NULL);`)
    const bad = jsonRpc({ componenteId: 5, origenId: 1, destinoId: 2, clientUuid: uuid })
    assert.strictEqual(bad.ok, false)
    assert.strictEqual(bad.code, 'CLIENT_UUID_INCOMPATIBLE')
    assert.strictEqual(psql(`SELECT conjunto_id FROM activo_componentes WHERE componente_id=5 AND fecha_hasta IS NULL`), '1')
  })

  test('destino fuera de servicio → DESTINO_FUERA_DE_SERVICIO', () => {
    seedBase()
    const r = jsonRpc({ componenteId: 3, origenId: 1, destinoId: 4 })
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.code, 'DESTINO_FUERA_DE_SERVICIO')
    assert.strictEqual(psql(`SELECT conjunto_id FROM activo_componentes WHERE componente_id=3 AND fecha_hasta IS NULL`), '1')
  })

  test('origen desactualizado → ORIGEN_DESACTUALIZADO', () => {
    seedBase()
    // El activo está en 1; se informa origen 6.
    const r = jsonRpc({ componenteId: 3, origenId: 6, destinoId: 2 })
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.code, 'ORIGEN_DESACTUALIZADO')
    assert.strictEqual(psql(`SELECT conjunto_id FROM activo_componentes WHERE componente_id=3 AND fecha_hasta IS NULL`), '1')
    assert.strictEqual(psql(`SELECT COUNT(*) FROM movimientos_inventario`), '0')
  })

  test('fallo al registrar movimientos_inventario → rollback total', () => {
    seedBase()
    psql(`
CREATE OR REPLACE FUNCTION public._force_fail_historial()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.observaciones IS NOT NULL AND NEW.observaciones LIKE '%FORCE_HISTORIAL_FAIL%' THEN
    RAISE EXCEPTION 'forced historial failure';
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS trg_force_fail_historial ON movimientos_inventario;
CREATE TRIGGER trg_force_fail_historial
  BEFORE INSERT ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION public._force_fail_historial();
`)
    let threw = false
    try {
      jsonRpc({
        componenteId: 3,
        origenId: 1,
        destinoId: 2,
        clientUuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        obs: 'FORCE_HISTORIAL_FAIL',
      })
    } catch (e) {
      threw = true
      assert.ok(String(e.message).includes('forced historial failure') || String(e.message).includes('psql failed'))
    }
    assert.ok(threw)
    assert.strictEqual(psql(`SELECT conjunto_id FROM activo_componentes WHERE componente_id=3 AND fecha_hasta IS NULL`), '1')
    assert.strictEqual(psql(`SELECT COUNT(*) FROM activo_componentes WHERE componente_id=3 AND fecha_hasta IS NOT NULL`), '0')
    assert.strictEqual(psql(`SELECT COUNT(*) FROM movimientos_inventario`), '0')
    psql(`
DROP TRIGGER IF EXISTS trg_force_fail_historial ON movimientos_inventario;
DROP FUNCTION IF EXISTS public._force_fail_historial();
`)
  })

  test('cambio opcional del conjunto de origen a fuera de servicio', () => {
    seedBase()
    const r = jsonRpc({
      componenteId: 3,
      origenId: 1,
      destinoId: 2,
      origenFds: true,
      clientUuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    })
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.origen_estado_anterior, 'operativo')
    assert.strictEqual(r.origen_estado_nuevo, 'fuera de servicio')
    assert.strictEqual(psql(`SELECT estado FROM activos WHERE id=1`), 'fuera de servicio')
    assert.strictEqual(psql(`SELECT estado FROM activos WHERE id=2`), 'operativo')
    assert.strictEqual(psql(`SELECT conjunto_id FROM activo_componentes WHERE componente_id=3 AND fecha_hasta IS NULL`), '2')
    assert.strictEqual(psql(`SELECT COUNT(*) FROM movimientos_inventario WHERE tipo_movimiento='composicion_traspaso'`), '3')
    const origenMov = psql(`
SELECT estado_anterior || '->' || estado_nuevo
FROM movimientos_inventario
WHERE tipo_movimiento='composicion_traspaso' AND activo_id=1
`)
    assert.strictEqual(origenMov, 'operativo->fuera de servicio')
  })

  if (!process.exitCode) {
    console.log('All real-schema-slice traspaso tests passed')
  }

  try {
    sh(`docker rm -f ${CONTAINER}`)
  } catch (_) {}
}

main()
