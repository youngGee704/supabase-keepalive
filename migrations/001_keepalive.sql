create table if not exists public.keepalive (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now()
);
insert into public.keepalive (id) values (1) on conflict do nothing;
alter table public.keepalive enable row level security;
create policy "anon can read keepalive"
  on public.keepalive for select to anon using (true);
