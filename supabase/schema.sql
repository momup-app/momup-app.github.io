-- Kids Nearby accounts. Paste this whole file into Supabase → SQL Editor → Run, once.
-- Then run 002_sales_alerts.sql the same way.
-- Every table has row-level security: people can only read and change their own rows.

-- ---------- profiles: one row per account ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 80),
  language      text not null default 'de' check (language in ('de', 'en', 'ru')),
  postcode      text check (postcode ~ '^[0-9]{5}$'),
  -- Only ages, never names or photos of children.
  kids_ages     smallint[] not null default '{}' check (kids_ages <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]::smallint[]),
  email_alerts  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Create the profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- saved_items: the ♡ list, synced across devices ----------
create table if not exists public.saved_items (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     text not null check (char_length(item_id) <= 120),
  created_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.saved_items enable row level security;

drop policy if exists "read own saved" on public.saved_items;
create policy "read own saved" on public.saved_items
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "add own saved" on public.saved_items;
create policy "add own saved" on public.saved_items
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "remove own saved" on public.saved_items;
create policy "remove own saved" on public.saved_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- delete my account (GDPR) ----------
-- Removes the login and, through "on delete cascade", the profile and saved items.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
