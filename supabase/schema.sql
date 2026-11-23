-- =====================================================================
-- Ferma DT – schema Supabase (rulează o singură dată în SQL Editor)
-- Toate datele aplicației stau într-un singur tabel `docs`:
--   col  = „colecția” (tasks, lapte, trUnit, teste, ...)
--   id   = id-ul documentului
--   data = conținutul (JSON), exact ca în aplicația de până acum
-- Așa nimic nu se pierde la mutare și orice modul nou nu cere tabele noi.
-- =====================================================================

create table if not exists public.docs (
  col        text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid        default auth.uid(),
  primary key (col, id)
);
create index if not exists docs_col_updated on public.docs (col, updated_at desc);
create index if not exists docs_data_gin on public.docs using gin (data jsonb_path_ops);

-- Istoric: fiecare modificare/ștergere se păstrează (nu se pierde nimic nici la o greșeală)
create table if not exists public.docs_history (
  hid        bigserial   primary key,
  col        text        not null,
  id         text        not null,
  op         text        not null,          -- INSERT / UPDATE / DELETE
  data       jsonb,                         -- conținutul ÎNAINTE de modificare (la INSERT: cel nou)
  at         timestamptz not null default now(),
  by_user    uuid        default auth.uid()
);
create index if not exists docs_history_doc on public.docs_history (col, id, at desc);

-- Setări (emailul administratorului principal)
create table if not exists public.app_config (key text primary key, value text not null);
insert into public.app_config (key, value) values ('admin_email', 'COMPLETEAZA@email.ro')
  on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Funcții
-- ---------------------------------------------------------------------
create or replace function public.touch_docs() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public.log_docs() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into docs_history (col, id, op, data) values (new.col, new.id, tg_op, new.data);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.data is distinct from new.data then
      insert into docs_history (col, id, op, data) values (old.col, old.id, tg_op, old.data);
    end if;
    return new;
  else
    insert into docs_history (col, id, op, data) values (old.col, old.id, tg_op, old.data);
    return old;
  end if;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch_docs();
drop trigger if exists docs_log on public.docs;
create trigger docs_log after insert or update or delete on public.docs for each row execute function public.log_docs();

-- Rolul utilizatorului curent (din documentul users/<uid>)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select d.data->>'role' from docs d
     where d.col = 'users' and d.id = auth.uid()::text
       and coalesce((d.data->>'active')::boolean, true)
  ), '')
$$;

-- Cine poate SCRIE în fiecare colecție (aceleași reguli ca înainte)
create or replace function public.can_write(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = any (case c
    when 'tasks'      then array['admin','prod','lab','mnt','dep']
    when 'equipment'  then array['admin','mnt']
    when 'repairs'    then array['admin','mnt']
    when 'checks'     then array['admin','mnt']
    when 'rooms'      then array['admin','lab','mnt']
    when 'tdays'      then array['admin','lab','mnt']
    when 'protel'     then array['admin','prod','lab']
    when 'plots'      then array['admin','prod','lab','statie']
    when 'pzer'       then array['admin','prod','lab','statie']
    when 'lapte'      then array['admin','prod','lab','dep','statie']
    when 'trUnit'     then array['admin','prod','dep','statie']
    when 'trCont'     then array['admin','prod','dep']
    when 'trFoto'     then array['admin','prod','dep','statie']
    when 'trLoc'      then array['admin','prod']
    when 'trProd'     then array['admin','prod']
    when 'trCfg'      then array['admin','prod']
    when 'teste'      then array['admin','prod','lab','statie']
    when 'testeCfg'   then array['admin','prod','lab']
    when 'pCereri'    then array['admin','mnt','dep']
    when 'pFurn'      then array['admin','mnt','dep']
    when 'pCfg'       then array['admin','mnt','dep']
    else array['admin']                       -- users, operators, pontaj, colecții noi
  end)
$$;

create or replace function public.can_read(c text, doc_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c = 'users'                     then doc_id = auth.uid()::text or public.my_role() in ('admin','mgmt')
    when c in ('pontaj','pontajFoto')    then public.my_role() in ('admin','mgmt')
    else public.my_role() in ('admin','mgmt','prod','lab','mnt','dep','statie')
  end
$$;

-- La prima logare: dacă emailul este cel din app_config, contul devine Administrator
create or replace function public.ensure_profile() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  em text := lower(coalesce(auth.jwt()->>'email', ''));
  adm text := lower((select value from app_config where key = 'admin_email'));
  prof jsonb;
begin
  if auth.uid() is null then return null; end if;
  select data into prof from docs where col = 'users' and id = auth.uid()::text;
  if prof is null and em <> '' and em = adm then
    prof := jsonb_build_object('name','Director tehnic','email',em,'role','admin','active',true,
                               'created', (extract(epoch from now())*1000)::bigint);
    insert into docs (col, id, data) values ('users', auth.uid()::text, prof);
  end if;
  return prof;
end $$;

-- ---------------------------------------------------------------------
-- Securitate (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.docs enable row level security;
alter table public.docs_history enable row level security;
alter table public.app_config enable row level security;

drop policy if exists docs_select on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
create policy docs_select on public.docs for select to authenticated using (public.can_read(col, id));
create policy docs_insert on public.docs for insert to authenticated with check (public.can_write(col));
create policy docs_update on public.docs for update to authenticated using (public.can_write(col)) with check (public.can_write(col));
create policy docs_delete on public.docs for delete to authenticated using (public.can_write(col));

drop policy if exists hist_select on public.docs_history;
create policy hist_select on public.docs_history for select to authenticated using (public.my_role() = 'admin');

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.docs_history to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.my_role() to authenticated;

-- ---------------------------------------------------------------------
-- Timp real (toate tabletele/telefoanele văd imediat ce scrie altcineva)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.docs;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
