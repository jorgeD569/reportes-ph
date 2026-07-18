-- Relevamiento offline de activos (NO aplicar automáticamente).
-- Ejecutar en Supabase solo tras aprobación de despliegue.
-- Seguro si se re-ejecuta (IF NOT EXISTS / DO blocks / idempotente donde es posible).
--
-- Garantías:
-- - Activos existentes → estado_revision = 'aprobado' (solo donde es NULL).
-- - NO modifica columnas activo ni estado.
-- - NO elimina ni renumera registros.
-- - Re-ejecutable: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--   constraints en DO $$ IF NOT EXISTS.
--
-- Nota: el índice UNIQUE UPPER(TRIM(numero_serie)) fallará si ya existen
-- dos series que solo difieren en mayúsculas/espacios. Resolver duplicados
-- antes de reintentar ese índice.

-- =============================================================================
-- 1) Columnas en activos
-- =============================================================================
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS client_uuid uuid;

ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS creado_por_user_id uuid;

ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS estado_revision text;

-- Default + backfill: activos existentes = aprobado (no toca activo/estado)
UPDATE public.activos
SET estado_revision = 'aprobado'
WHERE estado_revision IS NULL;

ALTER TABLE public.activos
  ALTER COLUMN estado_revision SET DEFAULT 'aprobado';

ALTER TABLE public.activos
  ALTER COLUMN estado_revision SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_activos_estado_revision'
  ) THEN
    ALTER TABLE public.activos
      ADD CONSTRAINT chk_activos_estado_revision
      CHECK (estado_revision = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activos_creado_por_user_id_fkey'
  ) THEN
    ALTER TABLE public.activos
      ADD CONSTRAINT activos_creado_por_user_id_fkey
      FOREIGN KEY (creado_por_user_id)
      REFERENCES public.usuarios_app(id);
  END IF;
END $$;

COMMENT ON COLUMN public.activos.client_uuid IS
  'UUID estable del cliente (Flutter). UNIQUE: un solo activo remoto por relevamiento.';
COMMENT ON COLUMN public.activos.estado_revision IS
  'pendiente = relevamiento campo; aprobado = habilitado en inventario; rechazado = no operativo.';
COMMENT ON COLUMN public.activos.creado_por_user_id IS
  'Usuario de usuarios_app que relevó/creó el activo.';

CREATE UNIQUE INDEX IF NOT EXISTS activos_client_uuid_key
  ON public.activos (client_uuid)
  WHERE client_uuid IS NOT NULL;

-- Unicidad case/space-insensitive del número de serie (obligatorio)
CREATE UNIQUE INDEX IF NOT EXISTS activos_numero_serie_normalizada_key
  ON public.activos (UPPER(TRIM(numero_serie)));

CREATE INDEX IF NOT EXISTS activos_estado_revision_idx
  ON public.activos (estado_revision)
  WHERE estado_revision = 'pendiente';

-- =============================================================================
-- 2) Tabla activo_adjuntos
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.activo_adjuntos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activo_id bigint NOT NULL
    REFERENCES public.activos(id) ON DELETE CASCADE,
  tipo text NOT NULL
    CONSTRAINT chk_activo_adjuntos_tipo
      CHECK (tipo = ANY (ARRAY[
        'foto_general'::text,
        'foto_placa'::text,
        'certificado'::text,
        'otro'::text
      ])),
  -- Referencia persistente en Storage (bucket privado). NO usar url pública permanente.
  storage_path text NOT NULL,
  -- Deprecated / siempre NULL con bucket privado. Las URLs se firman en Express.
  url_publica text,
  mime_type text,
  tamano_bytes integer,
  orden integer NOT NULL DEFAULT 0,
  client_uuid uuid,
  creado_por_user_id uuid
    REFERENCES public.usuarios_app(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.activo_adjuntos.storage_path IS
  'Ruta en bucket privado activos: {activo_id}/{tipo}/{client_uuid}.{ext}';
COMMENT ON COLUMN public.activo_adjuntos.url_publica IS
  'Deprecated. Bucket privado: siempre NULL. Usar URLs firmadas vía Express.';

CREATE UNIQUE INDEX IF NOT EXISTS activo_adjuntos_client_uuid_key
  ON public.activo_adjuntos (client_uuid)
  WHERE client_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS activo_adjuntos_activo_id_idx
  ON public.activo_adjuntos (activo_id);

-- =============================================================================
-- 3) Bucket Storage PRIVADO (crear en dashboard o API; no automático)
-- =============================================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('activos', 'activos', false)
-- ON CONFLICT (id) DO UPDATE SET public = false;
--
-- Rutas: {activo_id}/{tipo}/{client_uuid}.{ext}
-- Lectura/escritura: solo service_role vía Express (URLs firmadas temporales).
-- NO publicar el bucket. NO servir getPublicUrl.
