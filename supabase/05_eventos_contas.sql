-- Aplicar depois de 01_schema.sql a 04_estatisticas_publicas.sql.
-- Compatível com os dados existentes: não apaga contas, eventos ou votos.
begin;

-- Os clientes só podem alterar o conteúdo do evento, nunca o autor ou o ID.
alter table public.events enable row level security;
revoke insert,update on public.events from public,anon,authenticated;
grant insert(title,description,starts_at,ends_at,location) on public.events to authenticated;
grant update(title,description,starts_at,ends_at,location) on public.events to authenticated;
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
using ((select private.has_tab('eventos')) and (created_by=(select auth.uid()) or (select private.is_command())))
with check ((select private.has_tab('eventos')) and (created_by=(select auth.uid()) or (select private.is_command())));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
using ((select private.has_tab('eventos')) and (created_by=(select auth.uid()) or (select private.is_command())));
-- O FK existente event_responses_event_id_fkey já usa ON DELETE CASCADE.
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.event_responses'::regclass
    and confrelid='public.events'::regclass and contype='f' and confdeltype='c') then
    raise exception 'É necessário um FK de event_responses para events com ON DELETE CASCADE.';
  end if;
end $$;

-- O relógio do cliente nunca determina a ordem. Repetir a mesma opção mantém a posição.
create or replace function private.stamp_event_vote() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    new.updated_at=clock_timestamp();
  else
    if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id then
      raise exception 'Não é permitido alterar a identidade de um voto.' using errcode='42501';
    end if;
    if new.attending is distinct from old.attending then
      new.updated_at=clock_timestamp();
    else
      new.updated_at=old.updated_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.stamp_event_vote() from public,anon,authenticated;
drop trigger if exists stamp_event_vote on public.event_responses;
create trigger stamp_event_vote before insert or update on public.event_responses
for each row execute function private.stamp_event_vote();
create index if not exists event_responses_order_idx on public.event_responses(event_id,updated_at,user_id);

-- Acrescentar o timestamp à resposta exige recriar as duas assinaturas de retorno.
drop function public.response_names(text,uuid);
drop function private.response_names(text,uuid);
create function private.response_names(p_kind text,p_id uuid)
returns table(user_id uuid,full_name text,attending boolean,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_kind='event' and private.has_tab('eventos') then
    return query select r.user_id,p.full_name,r.attending,r.updated_at
      from public.event_responses r join public.profiles p on p.id=r.user_id
      where r.event_id=p_id order by r.updated_at,r.user_id;
  elsif p_kind='announcement' and private.has_tab('anuncios') and exists(
    select 1 from public.announcements where id=p_id and published and allow_responses) then
    return query select r.user_id,p.full_name,r.attending,r.updated_at
      from public.announcement_responses r join public.profiles p on p.id=r.user_id
      where r.announcement_id=p_id order by r.updated_at,r.user_id;
  else raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
end $$;
create function public.response_names(p_kind text,p_id uuid)
returns table(user_id uuid,full_name text,attending boolean,updated_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select * from private.response_names(p_kind,p_id) order by updated_at,user_id;
$$;
revoke all on function public.response_names(text,uuid),private.response_names(text,uuid) from public,anon,authenticated;
grant execute on function public.response_names(text,uuid),private.response_names(text,uuid) to authenticated,service_role;

-- Contas do portal: nem o Comando pode eliminar perfis ou escrever IDs/cargos diretamente.
-- set_user_access continua a validar o Comando na BD e é a única via do portal para cargos/aprovação.
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
-- Revogar também eventuais privilégios por coluna de instalações anteriores.
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),',') into cols from pg_attribute
    where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
  execute 'revoke insert ('||cols||'),update ('||cols||'),references ('||cols||') on public.profiles from public,anon,authenticated';
end $$;
drop policy if exists profiles_no_portal_delete on public.profiles;
create policy profiles_no_portal_delete on public.profiles as restrictive for delete to anon,authenticated using(false);
drop policy if exists profiles_no_portal_update on public.profiles;
create policy profiles_no_portal_update on public.profiles as restrictive for update to anon,authenticated using(false) with check(false);
-- O serviço de Auth/painel mantém as suas permissões administrativas.
revoke all on auth.users from public,anon,authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),',') into cols from pg_attribute
    where attrelid='auth.users'::regclass and attnum>0 and not attisdropped;
  execute 'revoke insert ('||cols||'),update ('||cols||'),select ('||cols||'),references ('||cols||') on auth.users from public,anon,authenticated';
end $$;
notify pgrst,'reload schema';
commit;
