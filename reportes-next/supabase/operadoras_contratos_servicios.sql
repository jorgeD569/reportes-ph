-- =============================================================================
-- Maestros: operadoras, contratos y catálogo de servicios por contrato.
-- Ejecutar manualmente en el SQL Editor de Supabase.
--
-- Alcance: solo creación de tablas e índices.
-- No modifica partes_operativos ni partes_operativos_servicios.
-- No incluye tarifas/costos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. operadoras
-- ---------------------------------------------------------------------------
create table if not exists public.operadoras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operadoras_nombre_normalizado_unique unique (nombre_normalizado)
);

comment on table public.operadoras is
  'Operadoras cliente (YPF, Vista Energy, etc.). nombre_normalizado debe ser trim().toLowerCase() del nombre.';

comment on column public.operadoras.nombre_normalizado is
  'Clave de búsqueda insensible a mayúsculas; única en toda la tabla.';

create index if not exists operadoras_activa_idx
  on public.operadoras (activa)
  where activa = true;

-- ---------------------------------------------------------------------------
-- 2. contratos
-- ---------------------------------------------------------------------------
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  operadora_id uuid not null references public.operadoras (id) on delete restrict,
  codigo text null,
  nombre text not null,
  fecha_inicio date null,
  fecha_fin date null,
  activo boolean not null default true,
  es_default boolean not null default false,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contratos_fechas_check check (
    fecha_fin is null
    or fecha_inicio is null
    or fecha_fin >= fecha_inicio
  )
);

comment on table public.contratos is
  'Contratos comerciales por operadora. Cada contrato define su propio catálogo de servicios.';

comment on column public.contratos.es_default is
  'Solo un contrato activo por operadora puede ser default (índice único parcial).';

comment on column public.contratos.metadata is
  'Datos adicionales sin alterar el esquema (referencias internas, notas, etc.).';

create index if not exists contratos_operadora_id_idx
  on public.contratos (operadora_id);

create index if not exists contratos_operadora_activo_idx
  on public.contratos (operadora_id, activo)
  where activo = true;

-- Un solo contrato default activo por operadora
create unique index if not exists contratos_un_default_activo_por_operadora_idx
  on public.contratos (operadora_id)
  where es_default = true and activo = true;

-- ---------------------------------------------------------------------------
-- 3. contrato_servicios
-- ---------------------------------------------------------------------------
create table if not exists public.contrato_servicios (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  codigo_servicio text not null,
  pos text not null,
  descripcion text not null,
  unidad_medida text null,
  orden int null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_servicios_contrato_codigo_pos_unique
    unique (contrato_id, codigo_servicio, pos)
);

comment on table public.contrato_servicios is
  'Catálogo operativo de servicios por contrato (línea, posición, descripción). Sin precios.';

comment on column public.contrato_servicios.codigo_servicio is
  'Código de línea del contrato (ej. 10 en YPF).';

comment on column public.contrato_servicios.pos is
  'Posición dentro de la línea (ej. 1, 3, 27).';

comment on column public.contrato_servicios.unidad_medida is
  'Unidad opcional para carga operativa (ej. km, unidad, hora).';

comment on column public.contrato_servicios.orden is
  'Orden de visualización en pantallas; independiente de pos si se desea.';

create index if not exists contrato_servicios_contrato_id_idx
  on public.contrato_servicios (contrato_id);

create index if not exists contrato_servicios_contrato_activo_idx
  on public.contrato_servicios (contrato_id, activo)
  where activo = true;

create index if not exists contrato_servicios_contrato_orden_idx
  on public.contrato_servicios (contrato_id, orden nulls last);
