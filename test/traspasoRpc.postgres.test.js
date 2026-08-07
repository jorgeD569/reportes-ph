/**
 * Pruebas de la RPC traspasar_activo_entre_conjuntos en Postgres de prueba (Docker).
 * NO toca producción / Supabase remoto.
 *
 * Requiere: docker
 * Ejecutar: node test/traspasoRpc.postgres.test.js
 */
const assert = require('assert')
const { execSync, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const CONTAINER = 'reportes-traspaso-pg-test'
const PG_PORT = '55432'
const PGURL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : 'inherit',
    ...opts,
  })
}

function psql(sql, opts = {}) {
  const args = [
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
  ]
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(
      `psql failed:\n${r.stderr || r.stdout}\nSQL: ${sql.slice(0, 200)}`,
    )
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
  return r.stdout
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
  const raw = psql(sql)
  return JSON.parse(raw)
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
  ('ACT-OTHER', 'Otro activo', 'otro', 'operativo', false, 'Base');
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
  console.log('Levantando Postgres de prueba (Docker)...')
  try {
    sh(`docker rm -f ${CONTAINER}`, { silent: true })
  } catch (_) {}

  sh(
    `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=postgres -p ${PG_PORT}:5432 postgres:15-alpine`,
  )

  // Esperar ready
  for (let i = 0; i < 30; i++) {
    try {
      psql('SELECT 1')
      break
    } catch (_) {
      if (i === 29) throw new Error('Postgres no arrancó a tiempo')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
    }
  }

  console.log('Aplicando schema mínimo + migración...')
  psqlFile(path.join(ROOT, 'sql', '_test_traspaso_schema_minimo.sql'))
  psqlFile(path.join(ROOT, 'sql', '2026-08-01_activo_traspaso_atomico.sql'))

  test('creación SQL: función y vista existen', () => {
    const fn = psql(`
SELECT COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='traspasar_activo_entre_conjuntos';
`)
    assert.strictEqual(fn, '1')
    const view = psql(`
SELECT COUNT(*) FROM information_schema.views
WHERE table_schema='public'
  AND table_name='v_diag_membresias_abiertas_fuera_de_servicio';
`)
    assert.strictEqual(view, '1')
  })

  test('permisos: anon/authenticated sin EXECUTE; service_role con EXECUTE', () => {
    const anon = psql(`
SELECT has_function_privilege('anon', 'public.traspasar_activo_entre_conjuntos(bigint,bigint,bigint,boolean,text,uuid,uuid,text,text)', 'EXECUTE');
`)
    const auth = psql(`
SELECT has_function_privilege('authenticated', 'public.traspasar_activo_entre_conjuntos(bigint,bigint,bigint,boolean,text,uuid,uuid,text,text)', 'EXECUTE');
`)
    const srv = psql(`
SELECT has_function_privilege('service_role', 'public.traspasar_activo_entre_conjuntos(bigint,bigint,bigint,boolean,text,uuid,uuid,text,text)', 'EXECUTE');
`)
    assert.strictEqual(anon, 'f')
    assert.strictEqual(auth, 'f')
    assert.strictEqual(srv, 't')
  })

  test('reintento con mismo client_uuid es idempotente', () => {
    seedBase()
    const uuid = '11111111-1111-4111-8111-111111111111'
    const first = jsonRpc({
      componenteId: 3,
      origenId: 1,
      destinoId: 2,
      clientUuid: uuid,
    })
    assert.strictEqual(first.ok, true)
    assert.strictEqual(first.idempotent, false)
    assert.strictEqual(first.historial_registrado, true)

    const open = psql(`
SELECT conjunto_id FROM activo_componentes
WHERE componente_id=3 AND fecha_hasta IS NULL;
`)
    assert.strictEqual(open, '2')

    const movs1 = Number(
      psql(`SELECT COUNT(*) FROM movimientos_inventario WHERE tipo_movimiento='composicion_traspaso';`),
    )
    assert.ok(movs1 >= 3)

    const second = jsonRpc({
      componenteId: 3,
      origenId: 1,
      destinoId: 2,
      clientUuid: uuid,
    })
    assert.strictEqual(second.ok, true)
    assert.strictEqual(second.idempotent, true)

    const movs2 = Number(
      psql(`SELECT COUNT(*) FROM movimientos_inventario WHERE tipo_movimiento='composicion_traspaso';`),
    )
    assert.strictEqual(movs2, movs1, 'reintento no debe duplicar historial')
  })

  test('client_uuid reutilizado incorrectamente → CLIENT_UUID_INCOMPATIBLE', () => {
    seedBase()
    const uuid = '22222222-2222-4222-8222-222222222222'
    const first = jsonRpc({
      componenteId: 3,
      origenId: 1,
      destinoId: 2,
      clientUuid: uuid,
    })
    assert.strictEqual(first.ok, true)

    // Vincular ACT-OTHER a origen para intentar otro traspaso con mismo uuid.
    psql(`
INSERT INTO activo_componentes (conjunto_id, componente_id, fecha_desde, fecha_hasta)
VALUES (1, 5, now(), NULL);
`)
    const bad = jsonRpc({
      componenteId: 5,
      origenId: 1,
      destinoId: 2,
      clientUuid: uuid,
    })
    assert.strictEqual(bad.ok, false)
    assert.strictEqual(bad.code, 'CLIENT_UUID_INCOMPATIBLE')

    const stillOther = psql(`
SELECT conjunto_id FROM activo_componentes
WHERE componente_id=5 AND fecha_hasta IS NULL;
`)
    assert.strictEqual(stillOther, '1', 'no debe mover el otro componente')
  })

  test('destino fuera de servicio → DESTINO_FUERA_DE_SERVICIO', () => {
    seedBase()
    const r = jsonRpc({
      componenteId: 3,
      origenId: 1,
      destinoId: 4,
    })
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.code, 'DESTINO_FUERA_DE_SERVICIO')
    const open = psql(`
SELECT conjunto_id FROM activo_componentes
WHERE componente_id=3 AND fecha_hasta IS NULL;
`)
    assert.strictEqual(open, '1')
  })

  test('fallo del historial → rollback completo', () => {
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
        clientUuid: '33333333-3333-4333-8333-333333333333',
        obs: 'FORCE_HISTORIAL_FAIL',
      })
    } catch (e) {
      threw = true
      assert.ok(
        String(e.message).includes('forced historial failure') ||
          String(e.message).includes('psql failed'),
      )
    }
    assert.ok(threw, 'debe fallar la RPC')

    const open = psql(`
SELECT conjunto_id FROM activo_componentes
WHERE componente_id=3 AND fecha_hasta IS NULL;
`)
    assert.strictEqual(open, '1', 'debe seguir en origen')

    const closed = psql(`
SELECT COUNT(*) FROM activo_componentes
WHERE componente_id=3 AND conjunto_id=1 AND fecha_hasta IS NOT NULL;
`)
    assert.strictEqual(closed, '0', 'no debe quedar cierre parcial')

    const movs = psql(`
SELECT COUNT(*) FROM movimientos_inventario WHERE tipo_movimiento='composicion_traspaso';
`)
    assert.strictEqual(movs, '0')

    psql(`
DROP TRIGGER IF EXISTS trg_force_fail_historial ON movimientos_inventario;
DROP FUNCTION IF EXISTS public._force_fail_historial();
`)
  })

  test('diagnóstico: vista detecta membresía abierta con FDS', () => {
    seedBase()
    psql(`
UPDATE activos SET estado='fuera de servicio' WHERE id=3;
`)
    const n = psql(`
SELECT COUNT(*) FROM v_diag_membresias_abiertas_fuera_de_servicio
WHERE componente_id=3;
`)
    assert.strictEqual(n, '1')
    // No modifica.
    const open = psql(`
SELECT COUNT(*) FROM activo_componentes
WHERE componente_id=3 AND fecha_hasta IS NULL;
`)
    assert.strictEqual(open, '1')
  })

  if (!process.exitCode) {
    console.log('All traspaso RPC postgres tests passed')
  }

  console.log(`Deteniendo contenedor ${CONTAINER}...`)
  try {
    sh(`docker rm -f ${CONTAINER}`, { silent: true })
  } catch (_) {}

  // URL local solo para referencia; no se usa contra prod.
  void PGURL
}

main()
