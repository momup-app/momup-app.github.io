-- Push notifications: the phones (and browsers) that asked for notifications on the lock screen.
-- Run once in Supabase → SQL Editor, after 002_sales_alerts.sql and 004_family.sql. Safe to run again.

-- One row per phone or browser. "endpoint" is the address of that phone's push service;
-- p256dh and auth are the keys that encrypt messages for it. Nothing here identifies a person outside MomUp.
create table if not exists public.push_subscriptions (
  endpoint    text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  device      text check (char_length(device) <= 80),
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

drop policy if exists "read own phones" on public.push_subscriptions;
create policy "read own phones" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "add own phone" on public.push_subscriptions;
create policy "add own phone" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "update own phone" on public.push_subscriptions;
create policy "update own phone" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "remove own phone" on public.push_subscriptions;
create policy "remove own phone" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Turn on push for this phone. If someone else used this phone before, it now belongs to whoever is logged in.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_logged_in';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, device)
  values (p_endpoint, me, p_p256dh, p_auth, left(p_device, 80))
  on conflict on constraint push_subscriptions_pkey do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device = excluded.device, created_at = now();
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Which sales each person already got a push about (separate from the email log,
-- so turning on push later doesn't repeat what came by email, and the other way round).
create table if not exists public.push_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  item_id  text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.push_log enable row level security; -- no policies: only the daily job (service role) uses it

-- Phones that want a topic, with what the message needs. Only the daily job may call this.
create or replace function public.push_recipients(topic text)
returns table (user_id uuid, endpoint text, p256dh text, auth text, language text, kids_ages smallint[])
language sql security definer set search_path = '' as $$
  select p.id, s.endpoint, s.p256dh, s.auth, p.language,
    coalesce(
      (select array_agg(distinct least(extract(year from age(current_date, k.birth_date)), 16)::smallint)
         from public.kids k where k.parent_id = p.id and k.birth_date <= current_date),
      p.kids_ages)
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where topic = any (p.alert_topics);
$$;

revoke execute on function public.push_recipients(text) from public, anon, authenticated;
grant execute on function public.push_recipients(text) to service_role;
