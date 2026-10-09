-- Sales alerts: daily email about new kids' clothes sales & flea markets.
-- Run once in Supabase → SQL Editor (after schema.sql). Safe to run again.

-- Which notifications someone turned on. For now only 'sales'.
alter table public.profiles
  add column if not exists alert_topics text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_alert_topics_check;
alter table public.profiles
  add constraint profiles_alert_topics_check check (alert_topics <@ array['sales']::text[]);

-- Which events each person was already emailed about, so nobody gets the same sale twice.
-- Only the daily job (service role) reads and writes this table; there are no policies for users.
create table if not exists public.alert_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  item_id  text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.alert_log enable row level security;

-- People who want a topic, with what the email needs. Only the daily job may call this.
create or replace function public.alert_recipients(topic text)
returns table (user_id uuid, email text, language text, kids_ages smallint[])
language sql security definer set search_path = '' as $$
  select p.id, u.email::text, p.language, p.kids_ages
  from public.profiles p
  join auth.users u on u.id = p.id
  where topic = any (p.alert_topics)
    and u.email_confirmed_at is not null;
$$;

revoke execute on function public.alert_recipients(text) from public, anon, authenticated;
grant execute on function public.alert_recipients(text) to service_role;
