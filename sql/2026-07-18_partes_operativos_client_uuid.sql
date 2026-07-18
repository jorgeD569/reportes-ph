-- Idempotencia de sync Flutter / clientes offline.
-- Ejecutar en Supabase (prod) ANTES de desplegar el POST idempotente.
-- Seguro si se re-ejecuta (IF NOT EXISTS).

ALTER TABLE public.partes_operativos
  ADD COLUMN IF NOT EXISTS client_uuid uuid;

COMMENT ON COLUMN public.partes_operativos.client_uuid IS
  'UUID estable del cliente (Flutter localId). UNIQUE: un solo parte remoto por sync.';

CREATE UNIQUE INDEX IF NOT EXISTS partes_operativos_client_uuid_key
  ON public.partes_operativos (client_uuid)
  WHERE client_uuid IS NOT NULL;
