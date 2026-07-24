-- Catálogo administrable de categorías de activos/conjuntos.
-- Idempotente. Preserva valores históricos; no inventa categorías ausentes en datos.
--
-- Antes: tipo_activo enum en activos.categoria
-- Después: activos_categorias + activos.categoria_id (FK)
--          activos.categoria queda como texto (snapshot / código legacy para Partes)

-- =============================================================================
-- 1) Tabla catálogo
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.activos_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  aplicable_a_activos boolean NOT NULL DEFAULT true,
  aplicable_a_conjuntos boolean NOT NULL DEFAULT false,
  -- Solo para migración / compat Partes (unidad|wika|...). No es clave de relación.
  codigo_legacy text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS activos_categorias_nombre_norm_key
  ON public.activos_categorias (lower(trim(nombre)));

CREATE INDEX IF NOT EXISTS activos_categorias_activo_idx
  ON public.activos_categorias (activo);

COMMENT ON TABLE public.activos_categorias IS
  'Catálogo administrable de categorías. Relación por id; no por nombre.';
COMMENT ON COLUMN public.activos_categorias.codigo_legacy IS
  'Valor histórico del enum tipo_activo (si aplica). Solo migración/compat.';

-- =============================================================================
-- 2) Convertir activos.categoria de enum → text (conserva valores)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activos'
      AND column_name = 'categoria'
      AND udt_name = 'tipo_activo'
  ) THEN
    ALTER TABLE public.activos
      ALTER COLUMN categoria TYPE text USING categoria::text;
  END IF;
END $$;

-- =============================================================================
-- 3) FK categoria_id
-- =============================================================================
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS categoria_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activos_categoria_id_fkey'
  ) THEN
    ALTER TABLE public.activos
      ADD CONSTRAINT activos_categoria_id_fkey
      FOREIGN KEY (categoria_id)
      REFERENCES public.activos_categorias(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activos_categoria_id_idx
  ON public.activos (categoria_id);

-- =============================================================================
-- 4) Sembrar SOLO categorías presentes en datos históricos
-- =============================================================================
INSERT INTO public.activos_categorias (
  nombre,
  activo,
  aplicable_a_activos,
  aplicable_a_conjuntos,
  codigo_legacy
)
SELECT DISTINCT
  CASE trim(lower(a.categoria))
    WHEN 'unidad' THEN 'Unidad'
    WHEN 'wika' THEN 'WIKA / manómetro'
    WHEN 'linea' THEN 'Línea / manguera / accesorio'
    WHEN 'herramienta' THEN 'Herramienta'
    WHEN 'seguridad' THEN 'Seguridad'
    WHEN 'otro' THEN 'Otro'
    ELSE nullif(trim(a.categoria), '')
  END AS nombre,
  true,
  true,
  true,
  nullif(trim(lower(a.categoria)), '')
FROM public.activos a
WHERE nullif(trim(a.categoria), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.activos_categorias c
    WHERE c.codigo_legacy = trim(lower(a.categoria))
       OR lower(trim(c.nombre)) = lower(trim(
            CASE trim(lower(a.categoria))
              WHEN 'unidad' THEN 'Unidad'
              WHEN 'wika' THEN 'WIKA / manómetro'
              WHEN 'linea' THEN 'Línea / manguera / accesorio'
              WHEN 'herramienta' THEN 'Herramienta'
              WHEN 'seguridad' THEN 'Seguridad'
              WHEN 'otro' THEN 'Otro'
              ELSE a.categoria
            END
          ))
  );

-- Ajuste flags según uso real (conjuntos vs activos)
UPDATE public.activos_categorias c
SET
  aplicable_a_activos = COALESCE((
    SELECT bool_or(NOT a.es_conjunto)
    FROM public.activos a
    WHERE trim(lower(a.categoria)) = c.codigo_legacy
       OR a.categoria_id = c.id
  ), c.aplicable_a_activos),
  aplicable_a_conjuntos = COALESCE((
    SELECT bool_or(a.es_conjunto)
    FROM public.activos a
    WHERE trim(lower(a.categoria)) = c.codigo_legacy
       OR a.categoria_id = c.id
  ), c.aplicable_a_conjuntos),
  updated_at = now()
WHERE c.codigo_legacy IS NOT NULL;

-- Si una categoría histórica no aparece en ningún lado, dejar ambos true
UPDATE public.activos_categorias
SET
  aplicable_a_activos = true,
  aplicable_a_conjuntos = true,
  updated_at = now()
WHERE codigo_legacy IS NOT NULL
  AND aplicable_a_activos = false
  AND aplicable_a_conjuntos = false;

-- =============================================================================
-- 5) Backfill categoria_id
-- =============================================================================
UPDATE public.activos a
SET categoria_id = c.id
FROM public.activos_categorias c
WHERE a.categoria_id IS NULL
  AND c.codigo_legacy IS NOT NULL
  AND trim(lower(a.categoria)) = c.codigo_legacy;

-- =============================================================================
-- 6) Drop enum huérfano si ya no se usa
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_activo')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_attribute att
       JOIN pg_class cls ON cls.oid = att.attrelid
       JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
       WHERE nsp.nspname = 'public'
         AND att.atttypid = 'public.tipo_activo'::regtype
         AND NOT att.attisdropped
     )
  THEN
    DROP TYPE public.tipo_activo;
  END IF;
END $$;
