-- =============================================================================
-- Slice del esquema REAL (backup 2026-07-31) solo para objetos involucrados
-- en el traspaso. NO es el dump completo de Supabase (auth/storage/realtime).
-- Uso exclusivo: pruebas locales Docker. NO producción.
-- =============================================================================

CREATE TABLE public.usuarios_app (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.activos (
    id bigint NOT NULL,
    numero_serie text NOT NULL,
    descripcion text NOT NULL,
    categoria text NOT NULL,
    estado text DEFAULT 'operativo'::text NOT NULL,
    certificado_url text,
    vencimiento date,
    fecha_alta date DEFAULT CURRENT_DATE NOT NULL,
    marca text,
    ubicacion text,
    asignado_a text,
    activo boolean DEFAULT true NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    codigo_interno text,
    dias_aviso integer DEFAULT 30,
    client_uuid uuid,
    creado_por_user_id uuid,
    estado_revision text DEFAULT 'aprobado'::text NOT NULL,
    es_conjunto boolean DEFAULT false NOT NULL,
    categoria_id uuid,
    CONSTRAINT chk_activos_estado CHECK ((estado = ANY (ARRAY['operativo'::text, 'fuera de servicio'::text, 'en reparacion'::text, 'vencido'::text, 'baja'::text]))),
    CONSTRAINT chk_activos_estado_revision CHECK ((estado_revision = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text])))
);

ALTER TABLE public.activos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.activo_componentes (
    id bigint NOT NULL,
    conjunto_id bigint NOT NULL,
    componente_id bigint NOT NULL,
    posicion text,
    observaciones text,
    fecha_desde timestamp with time zone DEFAULT now() NOT NULL,
    fecha_hasta timestamp with time zone,
    client_uuid uuid,
    creado_por_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activo_componentes_distintos CHECK ((conjunto_id <> componente_id)),
    CONSTRAINT activo_componentes_fechas_validas CHECK (((fecha_hasta IS NULL) OR (fecha_hasta >= fecha_desde)))
);

ALTER TABLE public.activo_componentes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activo_componentes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.movimientos_inventario (
    id bigint NOT NULL,
    activo_id bigint,
    fecha timestamp with time zone DEFAULT now(),
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

CREATE SEQUENCE public.movimientos_inventario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.movimientos_inventario_id_seq OWNED BY public.movimientos_inventario.id;
ALTER TABLE ONLY public.movimientos_inventario ALTER COLUMN id SET DEFAULT nextval('public.movimientos_inventario_id_seq'::regclass);

ALTER TABLE ONLY public.activo_componentes
    ADD CONSTRAINT activo_componentes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_numero_serie_key UNIQUE (numero_serie);
ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX activo_componentes_client_uuid_key ON public.activo_componentes USING btree (client_uuid) WHERE (client_uuid IS NOT NULL);
CREATE UNIQUE INDEX activo_componentes_componente_activo_key ON public.activo_componentes USING btree (componente_id) WHERE (fecha_hasta IS NULL);
CREATE INDEX activo_componentes_componente_historial_idx ON public.activo_componentes USING btree (componente_id, fecha_desde DESC);

CREATE FUNCTION public.validar_activo_componente() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  padre_es_conjunto boolean;
  hijo_es_conjunto boolean;
BEGIN
  SELECT es_conjunto
  INTO padre_es_conjunto
  FROM public.activos
  WHERE id = NEW.conjunto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El conjunto indicado no existe';
  END IF;

  IF padre_es_conjunto IS NOT TRUE THEN
    RAISE EXCEPTION 'El activo padre no está marcado como conjunto';
  END IF;

  SELECT es_conjunto
  INTO hijo_es_conjunto
  FROM public.activos
  WHERE id = NEW.componente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El componente indicado no existe';
  END IF;

  IF hijo_es_conjunto IS TRUE THEN
    RAISE EXCEPTION 'Un conjunto no puede agregarse como componente de otro conjunto';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_activo_componente_trigger
  BEFORE INSERT OR UPDATE OF conjunto_id, componente_id
  ON public.activo_componentes
  FOR EACH ROW EXECUTE FUNCTION public.validar_activo_componente();

ALTER TABLE ONLY public.activo_componentes
    ADD CONSTRAINT activo_componentes_componente_id_fkey FOREIGN KEY (componente_id) REFERENCES public.activos(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.activo_componentes
    ADD CONSTRAINT activo_componentes_conjunto_id_fkey FOREIGN KEY (conjunto_id) REFERENCES public.activos(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.activo_componentes
    ADD CONSTRAINT activo_componentes_creado_por_user_id_fkey FOREIGN KEY (creado_por_user_id) REFERENCES public.usuarios_app(id);
ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES public.activos(id) ON DELETE CASCADE;

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
