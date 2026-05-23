-- ============================================================================
-- 01 · Identidad y seguridad
-- profiles, user_roles, audit_log
-- ============================================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  email       text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table user_roles (
  user_id     uuid not null references profiles(id) on delete cascade,
  role        app_role not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id),
  primary key (user_id, role)
);

create index user_roles_role_idx on user_roles(role);

create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  tabla        text not null,
  registro_id  uuid not null,
  accion       text not null check (accion in ('insert','update','delete')),
  user_id      uuid references profiles(id),
  diff_jsonb   jsonb,
  fecha        timestamptz not null default now(),
  ip_address   inet,
  user_agent   text
);

create index audit_log_tabla_registro_idx on audit_log(tabla, registro_id);
create index audit_log_user_fecha_idx    on audit_log(user_id, fecha desc);
create index audit_log_fecha_idx         on audit_log(fecha desc);
