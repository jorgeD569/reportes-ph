-- =============================================================================
-- Traspaso atómico de activos entre conjuntos + integridad fuera de servicio
-- Fecha: 2026-08-01 (revisión 2026-08-02)
--
-- APLICAR MANUALMENTE en Supabase SQL Editor.
-- NO ejecutar desde la app ni desde scripts automáticos.
-- NO aplicar en producción hasta revisión explícita.
--
-- Esquema real verificado (backup 2026-07-31):
--   activos.id                         bigint
--   activos.estado                     text NOT NULL, default 'operativo'
--   activos.updated_at                 timestamptz NOT NULL
--   chk_activos_estado                 ('operativo','fuera de servicio',
--                                       'en reparacion','vencido','baja')
--   activo_componentes.id              bigint identity
--   activo_componentes.conjunto_id     bigint NOT NULL
--   activo_componentes.componente_id   bigint NOT NULL
--   activo_componentes.client_uuid     uuid (UNIQUE parcial WHERE NOT NULL)
--   activo_componentes.creado_por_user_id uuid
--   activo_componentes_componente_activo_key
--     UNIQUE (componente_id) WHERE fecha_hasta IS NULL
--   movimientos_inventario:
--     id, activo_id, fecha, tipo_movimiento, descripcion, usuario,
--     estado_anterior, estado_nuevo, ubicacion_anterior, ubicacion_nueva,
--     asignado_anterior, asignado_nuevo, observaciones
--
-- Express usa SUPABASE_SERVICE_ROLE_KEY → rol service_role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Diagnóstico NO destructivo (ejecutar aparte / revisar resultado).
--    Detecta membresías abiertas cuyo componente ya está fuera de servicio.
--    NO modifica registros.
-- ---------------------------------------------------------------------------
-- SELECT
--   ac.id AS relacion_id,
--   ac.componente_id,
--   a.numero_serie,
--   a.descripcion,
--   a.estado AS estado_componente,
--   ac.conjunto_id,
--   c.numero_serie AS conjunto_serie,
--   c.estado AS estado_conjunto,
--   ac.fecha_desde
-- FROM public.activo_componentes ac
-- JOIN public.activos a ON a.id = ac.componente_id
-- JOIN public.activos c ON c.id = ac.conjunto_id
-- WHERE ac.fecha_hasta IS NULL
--   AND lower(btrim(a.estado)) = 'fuera de servicio'
-- ORDER BY ac.fecha_desde DESC;

CREATE OR REPLACE VIEW public.v_diag_membresias_abiertas_fuera_de_servicio AS
SELECT
  ac.id AS relacion_id,
  ac.componente_id,
  a.numero_serie AS componente_serie,
  a.descripcion AS componente_descripcion,
  a.estado AS estado_componente,
  ac.conjunto_id,
  c.numero_serie AS conjunto_serie,
  c.estado AS estado_conjunto,
  ac.fecha_desde
FROM public.activo_componentes ac
JOIN public.activos a ON a.id = ac.componente_id
JOIN public.activos c ON c.id = ac.conjunto_id
WHERE ac.fecha_hasta IS NULL
  AND lower(btrim(a.estado)) = 'fuera de servicio';

COMMENT ON VIEW public.v_diag_membresias_abiertas_fuera_de_servicio IS
  'Diagnóstico solo lectura: membresías abiertas con componente fuera de servicio. No corrige datos.';

-- ---------------------------------------------------------------------------
-- 1) Trigger: no abrir membresía si el componente está fuera de servicio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_componente_no_fuera_de_servicio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado text;
BEGIN
  -- Solo valida membresías abiertas (fecha_hasta NULL).
  IF NEW.fecha_hasta IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.estado
  INTO v_estado
  FROM public.activos a
  WHERE a.id = NEW.componente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPONENTE_NO_ENCONTRADO'
      USING ERRCODE = 'P0001';
  END IF;

  -- estado es NOT NULL en chk/default; si llegara NULL no se trata como "no existe".
  IF v_estado IS NOT NULL
     AND lower(btrim(v_estado)) = 'fuera de servicio' THEN
    RAISE EXCEPTION
      'COMPONENTE_FUERA_DE_SERVICIO: Este activo está fuera de servicio y no puede vincularse. Primero debe cambiarse su estado.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_componente_no_fuera_de_servicio
  ON public.activo_componentes;

CREATE TRIGGER trg_validar_componente_no_fuera_de_servicio
  BEFORE INSERT OR UPDATE OF componente_id, fecha_hasta
  ON public.activo_componentes
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_componente_no_fuera_de_servicio();

-- ---------------------------------------------------------------------------
-- 2) RPC atómica de traspaso (+ historial en la misma transacción).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.traspasar_activo_entre_conjuntos(
  p_componente_id bigint,
  p_conjunto_origen_id bigint,
  p_conjunto_destino_id bigint,
  p_origen_fuera_de_servicio boolean DEFAULT false,
  p_observaciones text DEFAULT NULL,
  p_client_uuid uuid DEFAULT NULL,
  p_creado_por_user_id uuid DEFAULT NULL,
  p_usuario text DEFAULT NULL,
  p_origen_operacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp public.activos%ROWTYPE;
  v_origen public.activos%ROWTYPE;
  v_destino public.activos%ROWTYPE;
  v_mem public.activo_componentes%ROWTYPE;
  v_by_uuid public.activo_componentes%ROWTYPE;
  v_cerrada public.activo_componentes%ROWTYPE;
  v_nueva public.activo_componentes%ROWTYPE;
  v_now timestamptz := now();
  v_estado_origen_ant text;
  v_usuario text := coalesce(nullif(btrim(p_usuario), ''), 'Sistema');
  v_canal text := coalesce(nullif(btrim(p_origen_operacion), ''), 'web');
  v_serie text;
  v_label_origen text;
  v_label_destino text;
  v_obs text;
BEGIN
  IF p_componente_id IS NULL
     OR p_conjunto_origen_id IS NULL
     OR p_conjunto_destino_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'PARAMETROS_INVALIDOS',
      'error', 'Parámetros de traspaso incompletos'
    );
  END IF;

  IF p_conjunto_origen_id = p_conjunto_destino_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'MISMO_CONJUNTO',
      'error', 'El conjunto de origen y destino deben ser distintos'
    );
  END IF;

  -- Idempotencia ANTES de validar pertenencia al origen:
  -- un reintento tras éxito ya tiene al activo en el destino.
  IF p_client_uuid IS NOT NULL THEN
    SELECT *
    INTO v_by_uuid
    FROM public.activo_componentes
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

    IF FOUND THEN
      IF v_by_uuid.componente_id = p_componente_id
         AND v_by_uuid.conjunto_id = p_conjunto_destino_id
         AND v_by_uuid.fecha_hasta IS NULL THEN
        SELECT * INTO v_comp FROM public.activos WHERE id = p_componente_id;
        SELECT * INTO v_destino FROM public.activos WHERE id = p_conjunto_destino_id;
        SELECT * INTO v_origen FROM public.activos WHERE id = p_conjunto_origen_id;
        RETURN jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'relacion_nueva', to_jsonb(v_by_uuid),
          'relacion_cerrada', NULL,
          'conjunto_origen', to_jsonb(v_origen),
          'conjunto_destino', to_jsonb(v_destino),
          'componente', to_jsonb(v_comp),
          'historial_registrado', true
        );
      END IF;

      RETURN jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'CLIENT_UUID_INCOMPATIBLE',
        'error',
          'El client_uuid ya existe asociado a otra relación incompatible '
          || '(otro componente, otro destino o relación cerrada).',
        'relacion_existente', jsonb_build_object(
          'id', v_by_uuid.id,
          'componente_id', v_by_uuid.componente_id,
          'conjunto_id', v_by_uuid.conjunto_id,
          'fecha_hasta', v_by_uuid.fecha_hasta
        )
      );
    END IF;
  END IF;

  SELECT * INTO v_comp
  FROM public.activos
  WHERE id = p_componente_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'COMPONENTE_NO_ENCONTRADO',
      'error', 'Activo no encontrado'
    );
  END IF;

  IF coalesce(v_comp.es_conjunto, false) = true THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 400,
      'code', 'CONJUNTO_EN_CONJUNTO',
      'error', 'No se puede traspasar un conjunto'
    );
  END IF;

  IF v_comp.estado IS NOT NULL
     AND lower(btrim(v_comp.estado)) = 'fuera de servicio' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'COMPONENTE_FUERA_DE_SERVICIO',
      'error',
        'Este activo está fuera de servicio y no puede vincularse. '
        || 'Primero debe cambiarse su estado.'
    );
  END IF;

  SELECT * INTO v_origen
  FROM public.activos
  WHERE id = p_conjunto_origen_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'ORIGEN_NO_ENCONTRADO',
      'error', 'Conjunto de origen no encontrado'
    );
  END IF;

  SELECT * INTO v_destino
  FROM public.activos
  WHERE id = p_conjunto_destino_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'DESTINO_NO_ENCONTRADO',
      'error', 'Conjunto de destino no encontrado'
    );
  END IF;

  IF coalesce(v_origen.es_conjunto, false) IS DISTINCT FROM true
     OR coalesce(v_destino.es_conjunto, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 400,
      'code', 'NO_ES_CONJUNTO',
      'error', 'Origen y destino deben ser conjuntos'
    );
  END IF;

  -- Sin regla de negocio que permita recibir en FDS → rechazar.
  IF v_destino.estado IS NOT NULL
     AND lower(btrim(v_destino.estado)) = 'fuera de servicio' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'DESTINO_FUERA_DE_SERVICIO',
      'error',
        'El conjunto de destino está fuera de servicio y no puede recibir activos.'
    );
  END IF;

  SELECT *
  INTO v_mem
  FROM public.activo_componentes
  WHERE componente_id = p_componente_id
    AND fecha_hasta IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'SIN_PERTENENCIA',
      'error', 'El activo no pertenece actualmente a ningún conjunto'
    );
  END IF;

  IF v_mem.conjunto_id <> p_conjunto_origen_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'ORIGEN_DESACTUALIZADO',
      'error', 'El activo ya no pertenece al conjunto de origen indicado.',
      'conjunto_id_actual', v_mem.conjunto_id
    );
  END IF;

  v_serie := coalesce(nullif(btrim(v_comp.numero_serie), ''), v_comp.id::text);
  v_label_origen := coalesce(nullif(btrim(v_origen.numero_serie), ''), v_origen.id::text);
  v_label_destino := coalesce(nullif(btrim(v_destino.numero_serie), ''), v_destino.id::text);
  v_obs := nullif(btrim(p_observaciones), '');

  UPDATE public.activo_componentes
  SET
    fecha_hasta = v_now,
    observaciones = CASE
      WHEN v_obs IS NULL THEN observaciones
      WHEN observaciones IS NULL OR btrim(observaciones) = '' THEN v_obs
      ELSE observaciones || ' | ' || v_obs
    END
  WHERE id = v_mem.id
  RETURNING * INTO v_cerrada;

  BEGIN
    INSERT INTO public.activo_componentes (
      conjunto_id,
      componente_id,
      posicion,
      observaciones,
      fecha_desde,
      fecha_hasta,
      client_uuid,
      creado_por_user_id
    ) VALUES (
      p_conjunto_destino_id,
      p_componente_id,
      v_mem.posicion,
      coalesce(
        v_obs,
        'Traspaso desde conjunto ' || v_label_origen
      ),
      v_now,
      NULL,
      p_client_uuid,
      p_creado_por_user_id
    )
    RETURNING * INTO v_nueva;
  EXCEPTION
    WHEN unique_violation THEN
      -- Abortar TODA la función (incluye el cierre de origen ya hecho).
      RAISE EXCEPTION
        'TRASPASO_CONFLICTO_UNICIDAD: Conflicto de unicidad al abrir la membresía destino (client_uuid o membresía abierta).'
        USING ERRCODE = 'P0001';
  END;

  v_estado_origen_ant := v_origen.estado;
  IF p_origen_fuera_de_servicio
     AND (
       v_origen.estado IS NULL
       OR lower(btrim(v_origen.estado)) IS DISTINCT FROM 'fuera de servicio'
     ) THEN
    UPDATE public.activos
    SET estado = 'fuera de servicio',
        updated_at = v_now
    WHERE id = v_origen.id
    RETURNING * INTO v_origen;
  END IF;

  -- Historial atómico (mismas columnas reales de movimientos_inventario).
  INSERT INTO public.movimientos_inventario (
    activo_id, tipo_movimiento, descripcion, usuario,
    estado_anterior, estado_nuevo,
    ubicacion_anterior, ubicacion_nueva,
    observaciones
  ) VALUES (
    v_comp.id,
    'composicion_traspaso',
    'Traspaso de ' || v_label_origen || ' a ' || v_label_destino,
    v_usuario,
    v_comp.estado,
    v_comp.estado,
    v_comp.ubicacion,
    v_comp.ubicacion,
    'origen=' || v_origen.id::text
      || '; destino=' || v_destino.id::text
      || '; serie=' || v_serie
      || '; canal=' || v_canal
      || coalesce('; ' || v_obs, '')
  );

  INSERT INTO public.movimientos_inventario (
    activo_id, tipo_movimiento, descripcion, usuario,
    estado_anterior, estado_nuevo,
    ubicacion_anterior, ubicacion_nueva,
    observaciones
  ) VALUES (
    v_origen.id,
    'composicion_traspaso',
    'Activo ' || v_serie || ' salió por traspaso hacia ' || v_label_destino,
    v_usuario,
    v_estado_origen_ant,
    v_origen.estado,
    v_origen.ubicacion,
    v_origen.ubicacion,
    coalesce(v_obs, 'componente_id=' || v_comp.id::text)
  );

  INSERT INTO public.movimientos_inventario (
    activo_id, tipo_movimiento, descripcion, usuario,
    ubicacion_anterior, ubicacion_nueva,
    observaciones
  ) VALUES (
    v_destino.id,
    'composicion_traspaso',
    'Activo ' || v_serie || ' ingresó por traspaso desde ' || v_label_origen,
    v_usuario,
    v_destino.ubicacion,
    v_destino.ubicacion,
    coalesce(v_obs, 'componente_id=' || v_comp.id::text)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'relacion_cerrada', to_jsonb(v_cerrada),
    'relacion_nueva', to_jsonb(v_nueva),
    'conjunto_origen', to_jsonb(v_origen),
    'conjunto_destino', to_jsonb(v_destino),
    'componente', to_jsonb(v_comp),
    'origen_estado_anterior', v_estado_origen_ant,
    'origen_estado_nuevo', v_origen.estado,
    'historial_registrado', true
  );
END;
$$;

COMMENT ON FUNCTION public.traspasar_activo_entre_conjuntos(
  bigint, bigint, bigint, boolean, text, uuid, uuid, text, text
) IS
  'Traspaso atómico: cierra origen, abre destino, opcional FDS origen e historial composicion_traspaso. Solo backend (service_role).';

-- ---------------------------------------------------------------------------
-- 3) Permisos: Express usa service_role. No dejar EXECUTE a PUBLIC/anon.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.validar_componente_no_fuera_de_servicio() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.traspasar_activo_entre_conjuntos(
  bigint, bigint, bigint, boolean, text, uuid, uuid, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.traspasar_activo_entre_conjuntos(
  bigint, bigint, bigint, boolean, text, uuid, uuid, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.traspasar_activo_entre_conjuntos(
  bigint, bigint, bigint, boolean, text, uuid, uuid, text, text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.traspasar_activo_entre_conjuntos(
  bigint, bigint, bigint, boolean, text, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.traspasar_activo_entre_conjuntos(
  bigint, bigint, bigint, boolean, text, uuid, uuid, text, text
) TO postgres;

-- Vista de diagnóstico: lectura para roles de backend/ops.
REVOKE ALL ON TABLE public.v_diag_membresias_abiertas_fuera_de_servicio FROM PUBLIC;
GRANT SELECT ON TABLE public.v_diag_membresias_abiertas_fuera_de_servicio TO service_role;
GRANT SELECT ON TABLE public.v_diag_membresias_abiertas_fuera_de_servicio TO postgres;

-- Nota: no recrear activo_componentes_componente_activo_key ni
-- activo_componentes_client_uuid_key (ya existen en producción).