-- ============================================================================
-- El letrero de la máquina es parte del cambio de sabor.
--
-- El operador cambia el polvo y la app renombra la bebida, pero lo que el
-- cliente lee en la pantalla vive en la configuración de Nayax, máquina por
-- máquina, fuera de este sistema. Si el polvo cambia y el letrero no, el
-- cliente compra chai y recibe pumpkin — y ese es el único error de toda la
-- cadena que el cliente sí ve.
--
-- Nada obligaba a cambiarlo. Ahora, para las sustituciones que pertenecen a una
-- campaña de temporada, el operador tiene que confirmar que ya lo cambió antes
-- de poder cerrar la sustitución.
--
-- Solo se exige en campañas: una sustitución suelta —una tolva que se cambia
-- por desabasto, por ejemplo— no renombra ninguna bebida y no tiene letrero
-- que tocar.
-- ============================================================================

alter table public.sustituciones_tolva
  add column if not exists letrero_confirmado boolean;

comment on column public.sustituciones_tolva.letrero_confirmado is
  'El operador confirmo que cambio el letrero de la pantalla Nayax. Obligatorio para cerrar una sustitucion de campana: es lo unico de la cadena que el cliente ve.';

alter table public.sustituciones_tolva
  drop constraint if exists sustitucion_campana_exige_letrero;

alter table public.sustituciones_tolva
  add constraint sustitucion_campana_exige_letrero
  check (
    campana_id is null
    or estado <> 'ejecutada'
    or letrero_confirmado is true
  );
