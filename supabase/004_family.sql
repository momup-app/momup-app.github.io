-- Family details: each parent's kids (first name + date of birth) and what other members may see.
-- Run once in Supabase → SQL Editor, after 002_sales_alerts.sql and 003_chat.sql. Safe to run again.
-- Private by default: other members only see what the parent ticks. Exact birthdays are never shown to anyone.

-- ---------- what others can see ----------
alter table public.profiles add column if not exists show_kid_names boolean not null default false;
alter table public.profiles add column if not exists show_kid_ages  boolean not null default false;
alter table public.profiles add column if not exists show_area      boolean not null default false;

-- ---------- kids ----------
create table if not exists public.kids (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  first_name  text check (char_length(btrim(first_name)) between 1 and 40),
  -- From 2005 (so up to about 20 years old) to about 10 months ahead, for a baby on the way.
  birth_date  date not null check (birth_date >= date '2005-01-01' and birth_date <= current_date + 300),
  created_at  timestamptz not null default now()
);
create index if not exists kids_parent on public.kids (parent_id);

alter table public.kids enable row level security;
grant select, insert, update, delete on public.kids to authenticated;
revoke all on public.kids from anon;

drop policy if exists "read own kids" on public.kids;
create policy "read own kids" on public.kids
  for select to authenticated using (parent_id = (select auth.uid()));

drop policy if exists "add own kids" on public.kids;
create policy "add own kids" on public.kids
  for insert to authenticated with check (parent_id = (select auth.uid()));

drop policy if exists "change own kids" on public.kids;
create policy "change own kids" on public.kids
  for update to authenticated using (parent_id = (select auth.uid())) with check (parent_id = (select auth.uid()));

drop policy if exists "remove own kids" on public.kids;
create policy "remove own kids" on public.kids
  for delete to authenticated using (parent_id = (select auth.uid()));

-- At most 10 kids per account.
create or replace function public.kids_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.kids where parent_id = new.parent_id) >= 10 then
    raise exception 'too_many_kids';
  end if;
  return new;
end;
$$;

drop trigger if exists kids_limit on public.kids;
create trigger kids_limit before insert on public.kids
  for each row execute function public.kids_limit();

-- ---------- what another member sees (the card behind a name in the chat) ----------
-- Only what the parent allowed; ages in months, never the birthday itself.
create or replace function public.member_card(member uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'name', nullif(btrim(p.display_name), ''),
    'area', case when p.show_area then p.postcode end,
    'kids', case when p.show_kid_names or p.show_kid_ages then coalesce((
      select json_agg(json_build_object(
          'name', case when p.show_kid_names then k.first_name end,
          'months', case when p.show_kid_ages then
            case when k.birth_date > current_date then -1
                 else (extract(year from age(current_date, k.birth_date)) * 12
                       + extract(month from age(current_date, k.birth_date)))::int end
          end
        ) order by k.birth_date)
      from public.kids k where k.parent_id = p.id
    ), '[]'::json) else '[]'::json end
  )
  from public.profiles p
  where p.id = member;
$$;

revoke execute on function public.member_card(uuid) from public, anon;
grant execute on function public.member_card(uuid) to authenticated;

-- ---------- sales emails use the real ages ----------
-- Ages now come from the kids' birthdays, so they stay right as kids grow. Older accounts keep their ticked ages.
create or replace function public.alert_recipients(topic text)
returns table (user_id uuid, email text, language text, kids_ages smallint[])
language sql security definer set search_path = '' as $$
  select p.id, u.email::text, p.language,
    coalesce(
      (select array_agg(distinct least(extract(year from age(current_date, k.birth_date)), 16)::smallint)
         from public.kids k where k.parent_id = p.id and k.birth_date <= current_date),
      p.kids_ages)
  from public.profiles p
  join auth.users u on u.id = p.id
  where topic = any (p.alert_topics)
    and u.email_confirmed_at is not null;
$$;

revoke execute on function public.alert_recipients(text) from public, anon, authenticated;
grant execute on function public.alert_recipients(text) to service_role;
