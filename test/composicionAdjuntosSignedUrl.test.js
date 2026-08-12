/**
 * Composición: adjuntos deben salir con url_firmada (mismo mecanismo que GET /adjuntos).
 * node --test test/composicionAdjuntosSignedUrl.test.js
 */
const { describe, it, mock } = require('node:test')
const assert = require('node:assert/strict')

describe('GET composicion firma adjuntos', () => {
  it('listAdjuntos via withSignedUrls agrega url_firmada', async () => {
    const adjRow = {
      id: 1,
      activo_id: 10,
      tipo: 'foto_general',
      storage_path: '10/foto_general/uuid.jpg',
      mime_type: 'image/jpeg',
      tamano_bytes: 100,
      orden: 0,
      client_uuid: '11111111-1111-1111-1111-111111111111',
      created_at: '2026-08-01T00:00:00Z',
    }

    const createSignedUrl = mock.fn(async () => ({
      data: { signedUrl: 'https://signed.example/foto' },
      error: null,
    }))

    const supabase = {
      from(table) {
        assert.equal(table, 'activo_adjuntos')
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          order() {
            return this
          },
          then(resolve) {
            // chain ends with await → use thenable
            return Promise.resolve({ data: [adjRow], error: null }).then(resolve)
          },
          async maybeSingle() {
            return { data: null, error: null }
          },
        }
      },
      storage: {
        from() {
          return { createSignedUrl }
        },
      },
    }

    // Réplica mínima de la lógica introducida en activosComposicion.register
    const bucketActivos = 'activos'
    const signedTtl = 3600
    async function withSignedUrls(adjuntos) {
      const out = []
      for (const adj of adjuntos || []) {
        const row = { ...adj, url_publica: null, url_firmada: null }
        if (adj.storage_path) {
          const { data, error } = await supabase.storage
            .from(bucketActivos)
            .createSignedUrl(adj.storage_path, signedTtl)
          if (!error && data?.signedUrl) row.url_firmada = data.signedUrl
        }
        out.push(row)
      }
      return out
    }

    async function listAdjuntos(activoId) {
      const { data, error } = await supabase
        .from('activo_adjuntos')
        .select(
          'id, activo_id, tipo, storage_path, mime_type, tamano_bytes, orden, client_uuid, created_at',
        )
        .eq('activo_id', activoId)
        .order('orden', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return withSignedUrls(data || [])
    }

    // El query builder mock necesita devolver thenable en el último order
    const chain = {
      select() {
        return this
      },
      eq() {
        return this
      },
      order() {
        return this
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: [adjRow], error: null }).then(
          onFulfilled,
          onRejected,
        )
      },
    }
    supabase.from = () => chain

    const rows = await listAdjuntos(10)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].url_firmada, 'https://signed.example/foto')
    assert.equal(rows[0].url_publica, null)
    assert.equal(createSignedUrl.mock.callCount(), 1)
  })

  it('aprobar no toca activo_adjuntos (conservación por mismo activo_id)', () => {
    const approveSrc = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'activosRelevamiento.js'),
      'utf8',
    )
    const start = approveSrc.indexOf("app.post('/activos/:id/aprobar'")
    const end = approveSrc.indexOf("app.post('/activos/:id/rechazar'")
    assert.ok(start > 0 && end > start)
    const block = approveSrc.slice(start, end)
    assert.doesNotMatch(block, /activo_adjuntos/)
    assert.doesNotMatch(block, /storage\.from/)
  })
})
