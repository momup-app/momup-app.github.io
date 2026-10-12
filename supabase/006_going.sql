-- "I'm going": moms mark the events they'll go to, and see who else is going.
-- Run once in Supabase → SQL Editor, after 005_push.sql. Safe to run again.
-- Only logged-in members see who is going, and only by their chat name. Nothing about the kids is shown.

create table if not exists public.event_going (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id    text not null check (char_length(event_id) between 1 and 120),
  -- The event's day, so past events drop out of the list on their own.
  event_date  date not null check (event_date between current_date - 1 and current_date + 400),
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists event_going_by_date on public.event_going (event_date);

alter table public.event_going enable row level security;
grant select, insert, delete on public.event_going to authenticated;
revoke all on public.event_going from anon;

-- People read and change only their own rows. Everyone else's come through going_list() below.
drop policy if exists "read own going" on public.event_going;
create policy "read own going" on public.event_going
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "add own going" on public.event_going;
create policy "add own going" on public.event_going
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "remove own going" on public.event_going;
create policy "remove own going" on public.event_going
  for delete to authenticated using (user_id = (select auth.uid()));

-- At most 50 upcoming events per person, so the list can't be flooded.
create or replace function public.event_going_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.event_going
      where user_id = new.user_id and event_date >= current_date) >= 50 then
    raise exception 'too_many_events';
  end if;
  return new;
end;
$$;

drop trigger if exists event_going_limit on public.event_going;
create trigger event_going_limit before insert on public.event_going
  for each row execute function public.event_going_limit();

-- Who is going to which upcoming event: the chat name (or nothing) and whether it's you.
create or replace function public.going_list()
returns table (event_id text, member uuid, name text, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select g.event_id, g.user_id, nullif(btrim(p.display_name), ''), g.user_id = (select auth.uid())
  from public.event_going g
  left join public.profiles p on p.id = g.user_id
  where g.event_date >= current_date - 1
  order by g.event_date, g.created_at;
$$;

revoke execute on function public.going_list() from public, anon;
grant execute on function public.going_list() to authenticated;
