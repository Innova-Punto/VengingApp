-- ============================================================================
-- 19 · Trigger: al insertar un usuario en auth.users, crear profile.
-- Lee full_name y phone desde raw_user_meta_data del invite/signup.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon, authenticated;

create trigger trg_auth_user_to_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
