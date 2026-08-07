-- Schema mínimo para probar traspaso (NO producción).
CREATE TABLE IF NOT EXISTS public.activos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_serie text NOT NULL,
  descripcion text NOT NULL,
  categoria text NOT NULL DEFAULT 'otro',
  estado text DEFAULT 'operativo'::text NOT NULL,
  ubicacion text,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  es_conjunto boolean DEFAULT false NOT NULL,
  CONSTRAINT chk_activos_estado CHECK (
    (estado = ANY (ARRAY[
      'operativo'::text,
      'fuera de servicio'::text,
      'en reparacion'::text,
      'vencido'::text,
      'baja'::text
    ]))
  )
);

CREATE TABLE IF NOT EXISTS public.activo_componentes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conjunto_id bigint NOT NULL REFERENCES public.activos(id),
  componente_id bigint NOT NULL REFERENCES public.activos(id),
  posicion text,
  observaciones text,
  fecha_desde timestamptz DEFAULT now() NOT NULL,
  fecha_hasta timestamptz,
  client_uuid uuid,
  creado_por_user_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT activo_componentes_distintos CHECK ((conjunto_id <> componente_id)),
  CONSTRAINT activo_componentes_fechas_validas CHECK (
    ((fecha_hasta IS NULL) OR (fecha_hasta >= fecha_desde))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS activo_componentes_client_uuid_key
  ON public.activo_componentes USING btree (client_uuid)
  WHERE (client_uuid IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS activo_componentes_componente_activo_key
  ON public.activo_componentes USING btree (componente_id)
  WHERE (fecha_hasta IS NULL);

CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activo_id bigint,
  fecha timestamptz DEFAULT now(),
  tipo_movimiento text,
  descripcion text,
  usuario text,
  estado_anterior text,
  estado_nuevo text,
  ubicacion_anterior text,
  ubicacion_nueva text,
  asignado_anterior text,
  asignado_nuevo text,
  observaciones text
);

-- Roles mínimos tipo Supabase (si no existen).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
