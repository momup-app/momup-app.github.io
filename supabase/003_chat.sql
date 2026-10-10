-- Mom chat: topics and replies. Run once in Supabase → SQL Editor (after schema.sql). Safe to run again.
-- Only logged-in members can read and write. People can delete their own posts; chat admins (Yuliia) can delete any.
-- There is no editing, and the database itself limits how fast someone can post.

-- ---------- admins ----------
-- Only visible to the database. Add someone with:
--   insert into public.chat_admins (user_id) select id from auth.users where email = 'name@example.com';
create table if not exists public.chat_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade
);
alter table public.chat_admins enable row level security;

insert into public.chat_admins (user_id)
  select id from auth.users where email = 'yuliia.designer.ux@gmail.com'
  on conflict do nothing;

create or replace function public.is_chat_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_chat_admin() from public, anon;
grant execute on function public.is_chat_admin() to authenticated;

-- ---------- topics ----------
create table if not exists public.chat_topics (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) between 3 and 120),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  author_name      text not null default '',
  message_count    integer not null default 0,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create index if not exists chat_topics_recent on public.chat_topics (last_message_at desc);
create index if not exists chat_topics_by_user on public.chat_topics (created_by, created_at);

-- ---------- messages ----------
create table if not exists public.chat_messages (
  id           bigint generated always as identity primary key,
  topic_id     uuid not null references public.chat_topics (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name  text not null default '',
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_topic on public.chat_messages (topic_id, created_at);
create index if not exists chat_messages_by_user on public.chat_messages (user_id, created_at);

-- ---------- reports ----------
-- Yuliia sees these in Supabase → Table Editor → chat_reports (and admins can read them in the API).
create table if not exists public.chat_reports (
  message_id   bigint not null references public.chat_messages (id) on delete cascade,
  reported_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (message_id, reported_by)
);

-- ---------- who wrote it, and how fast ----------
-- The name comes from the profile, never from the browser, so nobody can post as someone else.
create or replace function public.chat_author_name()
returns text language plpgsql stable security definer set search_path = '' as $$
declare n text;
begin
  select nullif(btrim(display_name), '') into n from public.profiles where id = (select auth.uid());
  if n is null then
    raise exception 'chat_name_required' using hint = 'Set a name on the account page first.';
  end if;
  return n;
end;
$$;

create or replace function public.chat_before_topic()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.chat_topics
      where created_by = (select auth.uid()) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'chat_too_fast';
  end if;
  new.created_by := (select auth.uid());
  new.author_name := public.chat_author_name();
  new.title := btrim(new.title);
  new.message_count := 0;
  new.created_at := now();
  new.last_message_at := now();
  return new;
end;
$$;

drop trigger if exists chat_topics_before on public.chat_topics;
create trigger chat_topics_before before insert on public.chat_topics
  for each row execute function public.chat_before_topic();

create or replace function public.chat_before_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.chat_messages
      where user_id = (select auth.uid()) and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'chat_too_fast';
  end if;
  new.user_id := (select auth.uid());
  new.author_name := public.chat_author_name();
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists chat_messages_before on public.chat_messages;
create trigger chat_messages_before before insert on public.chat_messages
  for each row execute function public.chat_before_message();

-- Keep the topic list's counters up to date.
create or replace function public.chat_count_messages()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.chat_topics
      set message_count = message_count + 1, last_message_at = new.created_at
      where id = new.topic_id;
  else
    update public.chat_topics
      set message_count = greatest(message_count - 1, 0)
      where id = old.topic_id;
  end if;
  return null;
end;
$$;

drop trigger if exists chat_messages_count on public.chat_messages;
create trigger chat_messages_count after insert or delete on public.chat_messages
  for each row execute function public.chat_count_messages();

-- Renaming yourself on the account page renames your old posts too.
create or replace function public.chat_rename_author()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n text := nullif(btrim(new.display_name), '');
begin
  if n is not null and n is distinct from nullif(btrim(old.display_name), '') then
    update public.chat_messages set author_name = n where user_id = new.id;
    update public.chat_topics set author_name = n where created_by = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_chat_rename on public.profiles;
create trigger profiles_chat_rename after update of display_name on public.profiles
  for each row execute function public.chat_rename_author();

-- ---------- row-level security ----------
alter table public.chat_topics enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;

grant select, insert, delete on public.chat_topics, public.chat_messages to authenticated;
grant select, insert on public.chat_reports to authenticated;
revoke all on public.chat_topics, public.chat_messages, public.chat_reports from anon;

drop policy if exists "members read topics" on public.chat_topics;
create policy "members read topics" on public.chat_topics
  for select to authenticated using (true);

drop policy if exists "members start topics" on public.chat_topics;
create policy "members start topics" on public.chat_topics
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "delete own topic or admin" on public.chat_topics;
create policy "delete own topic or admin" on public.chat_topics
  for delete to authenticated using (created_by = (select auth.uid()) or (select public.is_chat_admin()));

drop policy if exists "members read messages" on public.chat_messages;
create policy "members read messages" on public.chat_messages
  for select to authenticated using (true);

drop policy if exists "members write messages" on public.chat_messages;
create policy "members write messages" on public.chat_messages
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "delete own message or admin" on public.chat_messages;
create policy "delete own message or admin" on public.chat_messages
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_chat_admin()));

drop policy if exists "members report" on public.chat_reports;
create policy "members report" on public.chat_reports
  for insert to authenticated with check (reported_by = (select auth.uid()));

drop policy if exists "admins read reports" on public.chat_reports;
create policy "admins read reports" on public.chat_reports
  for select to authenticated using ((select public.is_chat_admin()));

-- ---------- live updates ----------
-- New messages appear without reloading the page.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_topics') then
    alter publication supabase_realtime add table public.chat_topics;
  end if;
end;
$$;
