/**
 * Catálogo administrable de categorías de activos / conjuntos.
 * Fuente única: tabla activos_categorias (no enums hardcodeados).
 */

function optStr(v) {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function normalizeNombreKey(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseBool(v, fallback = null) {
  if (typeof v === 'boolean') return v
  if (v == null || v === '') return fallback
  return null
}

function isUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.trim(),
    )
  )
}

function mapCategoriaRow(row, usage = null) {
  if (!row) return null
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo !== false,
    aplicable_a_activos: row.aplicable_a_activos === true,
    aplicable_a_conjuntos: row.aplicable_a_conjuntos === true,
    codigo_legacy: row.codigo_legacy || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    en_uso: usage ? usage.total > 0 : undefined,
    usos_activos: usage ? usage.activos : undefined,
    usos_conjuntos: usage ? usage.conjuntos : undefined,
  }
}

/**
 * Resuelve categoría por id. No crea categorías.
 * @returns {{ ok:true, categoria } | { ok:false, error, code }}
 */
async function resolveCategoriaById(supabase, categoriaId, opts = {}) {
  const {
    requireActiva = true,
    aplicableA = null, // 'activos' | 'conjuntos' | null
  } = opts

  if (!isUuid(String(categoriaId || ''))) {
    return {
      ok: false,
      code: 'CATEGORIA_ID_INVALIDO',
      error: 'categoria_id inválido',
    }
  }

  const { data, error } = await supabase
    .from('activos_categorias')
    .select('*')
    .eq('id', String(categoriaId).trim())
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return {
      ok: false,
      code: 'CATEGORIA_INEXISTENTE',
      error: 'La categoría no existe',
    }
  }
  if (requireActiva && data.activo === false) {
    return {
      ok: false,
      code: 'CATEGORIA_INACTIVA',
      error: 'La categoría está inactiva',
    }
  }
  if (aplicableA === 'activos' && data.aplicable_a_activos !== true) {
    return {
      ok: false,
      code: 'CATEGORIA_NO_APLICABLE',
      error: 'La categoría no es aplicable a activos',
    }
  }
  if (aplicableA === 'conjuntos' && data.aplicable_a_conjuntos !== true) {
    return {
      ok: false,
      code: 'CATEGORIA_NO_APLICABLE',
      error: 'La categoría no es aplicable a conjuntos',
    }
  }
  return { ok: true, categoria: data }
}

/**
 * Compat: resuelve por codigo_legacy o nombre exacto (histórico).
 * Solo lectura; no crea.
 */
async function resolveCategoriaLegacy(supabase, raw, opts = {}) {
  const key = normalizeNombreKey(raw)
  if (!key) {
    return {
      ok: false,
      code: 'CATEGORIA_INVALIDA',
      error: 'Categoría inválida',
    }
  }

  const { data: byLegacy, error: e1 } = await supabase
    .from('activos_categorias')
    .select('*')
    .eq('codigo_legacy', key)
    .maybeSingle()
  if (e1) throw e1
  if (byLegacy) {
    return resolveCategoriaById(supabase, byLegacy.id, opts)
  }

  const { data: all, error: e2 } = await supabase
    .from('activos_categorias')
    .select('*')
  if (e2) throw e2
  const match = (all || []).find(
    (c) => normalizeNombreKey(c.nombre) === key,
  )
  if (!match) {
    return {
      ok: false,
      code: 'CATEGORIA_INEXISTENTE',
      error: 'La categoría no existe en el catálogo',
    }
  }
  return resolveCategoriaById(supabase, match.id, opts)
}

/** Texto a persistir en activos.categoria (compat Partes / listados). */
function categoriaTextSnapshot(categoriaRow) {
  if (!categoriaRow) return null
  if (categoriaRow.codigo_legacy) return categoriaRow.codigo_legacy
  return String(categoriaRow.nombre || '').trim()
}

async function usageByCategoriaIds(supabase, ids) {
  const map = new Map()
  for (const id of ids) {
    map.set(id, { total: 0, activos: 0, conjuntos: 0 })
  }
  if (!ids.length) return map

  const { data, error } = await supabase
    .from('activos')
    .select('categoria_id, es_conjunto')
    .in('categoria_id', ids)
  if (error) throw error

  for (const row of data || []) {
    const id = row.categoria_id
    if (!map.has(id)) continue
    const u = map.get(id)
    u.total += 1
    if (row.es_conjunto) u.conjuntos += 1
    else u.activos += 1
  }
  return map
}

function registerActivosCategoriasRoutes({ app, supabase }) {
  // Lectura: operadores y coordinadores (selectores / sync Flutter)
  app.get('/activos-categorias', async (req, res) => {
    try {
      const soloActivas = String(req.query.activas || '') === '1'
      const aplicable = String(req.query.aplicable || '').trim().toLowerCase()
      const includeUso = String(req.query.include_uso || '') === '1'

      let query = supabase
        .from('activos_categorias')
        .select('*')
        .order('nombre', { ascending: true })

      if (soloActivas) query = query.eq('activo', true)
      if (aplicable === 'activos') query = query.eq('aplicable_a_activos', true)
      if (aplicable === 'conjuntos') {
        query = query.eq('aplicable_a_conjuntos', true)
      }

      const { data, error } = await query
      if (error) throw error

      let usage = null
      if (includeUso) {
        usage = await usageByCategoriaIds(
          supabase,
          (data || []).map((c) => c.id),
        )
      }

      res.json({
        ok: true,
        categorias: (data || []).map((c) =>
          mapCategoriaRow(c, usage ? usage.get(c.id) : null),
        ),
      })
    } catch (err) {
      console.error('GET /activos-categorias:', err)
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/activos-categorias/:id', async (req, res) => {
    try {
      const resolved = await resolveCategoriaById(supabase, req.params.id, {
        requireActiva: false,
      })
      if (!resolved.ok) {
        return res.status(404).json({
          ok: false,
          error: resolved.error,
          code: resolved.code,
        })
      }
      const usage = await usageByCategoriaIds(supabase, [resolved.categoria.id])
      res.json({
        ok: true,
        categoria: mapCategoriaRow(
          resolved.categoria,
          usage.get(resolved.categoria.id),
        ),
      })
    } catch (err) {
      console.error('GET /activos-categorias/:id:', err)
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // Escritura: UI de gestión (misma política abierta que otros endpoints admin)
  app.post('/activos-categorias', async (req, res) => {
    try {
      const body = req.body || {}
      const nombre = optStr(body.nombre)
      if (!nombre) {
        return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' })
      }

      const aplicableActivos = parseBool(body.aplicable_a_activos, true)
      const aplicableConjuntos = parseBool(body.aplicable_a_conjuntos, false)
      if (aplicableActivos == null || aplicableConjuntos == null) {
        return res.status(400).json({
          ok: false,
          error: 'aplicable_a_activos / aplicable_a_conjuntos deben ser boolean',
        })
      }
      if (!aplicableActivos && !aplicableConjuntos) {
        return res.status(400).json({
          ok: false,
          error: 'La categoría debe aplicar al menos a activos o a conjuntos',
        })
      }

      const { data: existentes, error: eList } = await supabase
        .from('activos_categorias')
        .select('id, nombre')
      if (eList) throw eList
      const dup = (existentes || []).find(
        (c) => normalizeNombreKey(c.nombre) === normalizeNombreKey(nombre),
      )
      if (dup) {
        return res.status(409).json({
          ok: false,
          code: 'CATEGORIA_DUPLICADA',
          error: 'Ya existe una categoría con ese nombre',
        })
      }

      const { data, error } = await supabase
        .from('activos_categorias')
        .insert([
          {
            nombre,
            activo: body.activo === false ? false : true,
            aplicable_a_activos: aplicableActivos,
            aplicable_a_conjuntos: aplicableConjuntos,
          },
        ])
        .select('*')
        .single()
      if (error) {
        if (String(error.code) === '23505') {
          return res.status(409).json({
            ok: false,
            code: 'CATEGORIA_DUPLICADA',
            error: 'Ya existe una categoría con ese nombre',
          })
        }
        throw error
      }

      res.json({ ok: true, categoria: mapCategoriaRow(data, { total: 0, activos: 0, conjuntos: 0 }) })
    } catch (err) {
      console.error('POST /activos-categorias:', err)
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.put('/activos-categorias/:id', async (req, res) => {
    try {
      const id = req.params.id
      const resolved = await resolveCategoriaById(supabase, id, {
        requireActiva: false,
      })
      if (!resolved.ok) {
        return res.status(404).json({
          ok: false,
          error: resolved.error,
          code: resolved.code,
        })
      }

      const body = req.body || {}
      const patch = { updated_at: new Date().toISOString() }

      if (Object.prototype.hasOwnProperty.call(body, 'nombre')) {
        const nombre = optStr(body.nombre)
        if (!nombre) {
          return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' })
        }
        const { data: existentes, error: eList } = await supabase
          .from('activos_categorias')
          .select('id, nombre')
        if (eList) throw eList
        const dup = (existentes || []).find(
          (c) =>
            c.id !== id &&
            normalizeNombreKey(c.nombre) === normalizeNombreKey(nombre),
        )
        if (dup) {
          return res.status(409).json({
            ok: false,
            code: 'CATEGORIA_DUPLICADA',
            error: 'Ya existe una categoría con ese nombre',
          })
        }
        patch.nombre = nombre
      }

      if (Object.prototype.hasOwnProperty.call(body, 'activo')) {
        const activo = parseBool(body.activo, null)
        if (activo == null) {
          return res.status(400).json({ ok: false, error: 'activo debe ser boolean' })
        }
        patch.activo = activo
      }

      if (Object.prototype.hasOwnProperty.call(body, 'aplicable_a_activos')) {
        const v = parseBool(body.aplicable_a_activos, null)
        if (v == null) {
          return res.status(400).json({
            ok: false,
            error: 'aplicable_a_activos debe ser boolean',
          })
        }
        patch.aplicable_a_activos = v
      }
      if (Object.prototype.hasOwnProperty.call(body, 'aplicable_a_conjuntos')) {
        const v = parseBool(body.aplicable_a_conjuntos, null)
        if (v == null) {
          return res.status(400).json({
            ok: false,
            error: 'aplicable_a_conjuntos debe ser boolean',
          })
        }
        patch.aplicable_a_conjuntos = v
      }

      const nextActivos =
        patch.aplicable_a_activos ?? resolved.categoria.aplicable_a_activos
      const nextConjuntos =
        patch.aplicable_a_conjuntos ?? resolved.categoria.aplicable_a_conjuntos
      if (!nextActivos && !nextConjuntos) {
        return res.status(400).json({
          ok: false,
          error: 'La categoría debe aplicar al menos a activos o a conjuntos',
        })
      }

      const { data, error } = await supabase
        .from('activos_categorias')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) {
        if (String(error.code) === '23505') {
          return res.status(409).json({
            ok: false,
            code: 'CATEGORIA_DUPLICADA',
            error: 'Ya existe una categoría con ese nombre',
          })
        }
        throw error
      }

      const usage = await usageByCategoriaIds(supabase, [id])
      res.json({
        ok: true,
        categoria: mapCategoriaRow(data, usage.get(id)),
      })
    } catch (err) {
      console.error('PUT /activos-categorias/:id:', err)
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // Soft-delete = desactivar. No borrado físico si hay uso.
  app.delete('/activos-categorias/:id', async (req, res) => {
    try {
      const id = req.params.id
      const resolved = await resolveCategoriaById(supabase, id, {
        requireActiva: false,
      })
      if (!resolved.ok) {
        return res.status(404).json({
          ok: false,
          error: resolved.error,
          code: resolved.code,
        })
      }

      const usage = await usageByCategoriaIds(supabase, [id])
      const u = usage.get(id)
      if (u && u.total > 0) {
        return res.status(409).json({
          ok: false,
          code: 'CATEGORIA_EN_USO',
          error:
            'No se puede eliminar: la categoría está en uso. Desactivala en su lugar.',
          usos: u,
        })
      }

      const { data, error } = await supabase
        .from('activos_categorias')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error

      res.json({
        ok: true,
        categoria: mapCategoriaRow(data, u),
        mensaje: 'Categoría desactivada (no se elimina físicamente).',
      })
    } catch (err) {
      console.error('DELETE /activos-categorias/:id:', err)
      res.status(500).json({ ok: false, error: err.message })
    }
  })
}

module.exports = {
  registerActivosCategoriasRoutes,
  resolveCategoriaById,
  resolveCategoriaLegacy,
  categoriaTextSnapshot,
  mapCategoriaRow,
  normalizeNombreKey,
  isUuid,
}
