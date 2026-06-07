-- Auditoría de cambios administrativos en partes operativos.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists public.historial_partes_operativos (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references public.partes_operativos (id) on delete cascade,
  created_at timestamptz not null default now(),
  usuario text null,
  accion text not null,
  motivo text not null,
  estado_anterior text null,
  estado_nuevo text null,
  datos_modificados jsonb null
);

create index if not exists historial_partes_operativos_parte_id_idx
  on public.historial_partes_operativos (parte_id);

create index if not exists historial_partes_operativos_created_at_idx
  on public.historial_partes_operativos (created_at desc);

comment on table public.historial_partes_operativos is
  'Historial de modificaciones administrativas, reaperturas y regeneración de PDF de partes operativos.';
