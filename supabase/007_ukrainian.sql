-- Ukrainian ("uk") as a site and email language. Run once in Supabase → SQL Editor, after 006_going.sql. Safe to run again.
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check check (language in ('de', 'en', 'uk', 'ru'));
