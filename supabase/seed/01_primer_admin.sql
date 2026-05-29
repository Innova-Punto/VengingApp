-- ============================================================================
-- SEED · Primer usuario admin
-- ----------------------------------------------------------------------------
-- Corre este snippet UNA SOLA VEZ en el SQL Editor del dashboard de Supabase
-- para crear el primer usuario administrador. A partir de ahí, todas las
-- invitaciones se hacen desde /admin/usuarios en la app.
--
-- Reemplaza el email y el nombre antes de ejecutar.
-- ============================================================================

-- Paso 1: invita al usuario desde Supabase Dashboard → Authentication → Users
-- → "Invite user", o usa la siguiente llamada via Edge Function / script con
-- service_role:
--
--   supabase.auth.admin.inviteUserByEmail('direccion@fittaste.com.mx', {
--     data: { full_name: 'Tu Nombre Completo' },
--     redirectTo: 'https://tudominio/auth/callback?next=/set-password'
--   })
--
-- El trigger trg_auth_user_to_profile creará automáticamente la fila en
-- public.profiles.

-- Paso 2: asigna el rol admin (el rol direccion también desbloquea /admin).
-- Reemplaza 'direccion@fittaste.com.mx' por el email del invitado.

insert into public.user_roles (user_id, role)
select id, 'admin'::app_role
from auth.users
where email = 'direccion@fittaste.com.mx'
on conflict (user_id, role) do nothing;

insert into public.user_roles (user_id, role)
select id, 'direccion'::app_role
from auth.users
where email = 'direccion@fittaste.com.mx'
on conflict (user_id, role) do nothing;

-- Paso 3: verifica
select p.id, p.email, p.full_name, array_agg(ur.role) as roles
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
where p.email = 'direccion@fittaste.com.mx'
group by p.id, p.email, p.full_name;
