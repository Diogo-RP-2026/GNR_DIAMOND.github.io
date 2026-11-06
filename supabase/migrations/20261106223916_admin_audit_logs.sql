begin;
set local lock_timeout='5s';

-- Visibility metadata is independent of the immutable original event and of
-- the account's lifecycle. No FK points at an account or a content record.
create table private.admin_audit_hidden (
 log_id uuid primary key references private.admin_audit_log(id) on delete restrict,
 hidden_by uuid not null,
 hidden_by_name text not null,
 hidden_at timestamptz not null default clock_timestamp()
);
alter table private.admin_audit_hidden enable row level security;
revoke all on private.admin_audit_log,private.admin_audit_hidden from public,anon,authenticated,service_role;
create trigger immutable_admin_audit_hidden before update or delete on private.admin_audit_hidden
 for each row execute function private.immutable_admin_audit();
create trigger no_truncate_admin_audit_hidden before truncate on private.admin_audit_hidden
 for each statement execute function private.immutable_admin_audit();

-- Called only by trusted database code. Derive the actor from the validated
-- request context and a database profile. Callers never supply author or time.
create function private.append_admin_audit(p_action text,p_entity text,p_target uuid,p_name text,p_result text,p_details jsonb)
returns void language sql security invoker set search_path='' as $$
 insert into private.admin_audit_log(actor_id,actor_name,action,entity,target_id,target_name,result,details)
 values(auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),
  case when auth.uid() is null then 'Sistema' else 'Sessão sem perfil' end),
  p_action,p_entity,p_target,p_name,p_result,p_details);
$$;
revoke all on function private.append_admin_audit(text,text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function private.audit_account_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare account_id uuid; account_name text; tab_name public.ushe_tab; details jsonb;
begin
 if tg_table_name='profiles' then
  if (old.role,old.approved) is distinct from (new.role,new.approved) then
   perform private.append_admin_audit('account.access.update','account',new.id,new.full_name,'succeeded',
    jsonb_build_object('role_before',old.role,'role_after',new.role,'approved_before',old.approved,'approved_after',new.approved));
  end if;
  if old.full_name is distinct from new.full_name then
   perform private.append_admin_audit('account.profile.update','account',new.id,new.full_name,'succeeded',
    jsonb_build_object('fields',jsonb_build_array('full_name')));
  end if;
  return null;
 end if;
 if tg_op='UPDATE' and (old.user_id,old.tab,old.can_create) is not distinct from (new.user_id,new.tab,new.can_create) then return null;end if;
 account_id=coalesce(new.user_id,old.user_id);
 tab_name=coalesce(new.tab,old.tab);
 select full_name into account_name from public.profiles where id=account_id;
 -- Account deletion has its own durable audit. Avoid an extra entry per FK
 -- cascade after the deleted profile is already absent.
 if account_name is null then return null;end if;
 details=jsonb_build_object('tab',tab_name,'can_create_before',old.can_create,'can_create_after',new.can_create);
 if tg_op='UPDATE' and (old.user_id,old.tab) is distinct from (new.user_id,new.tab) then
  details=details||jsonb_build_object('previous_account_id',old.user_id,'previous_tab',old.tab);
 end if;
 perform private.append_admin_audit('account.tab.'||lower(tg_op),'account',account_id,account_name,'succeeded',details);
 return null;
end $$;
revoke all on function private.audit_account_change() from public,anon,authenticated,service_role;
create trigger audit_account_change after update of role,approved,full_name on public.profiles
 for each row execute function private.audit_account_change();
create trigger audit_account_change after insert or update or delete on public.tab_permissions
 for each row execute function private.audit_account_change();

-- Approved fields only. In particular, never copy biographies, descriptions,
-- notes, email addresses, auth metadata or request payloads into details.
create function private.audit_catalog_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 before_row jsonb=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row jsonb=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 item jsonb=case when tg_op='DELETE' then before_row else after_row end;
 changed text[]; action text; record_id uuid; record_name text; agent_id uuid; details jsonb;
begin
 select array_agg(field order by position) into changed
 from unnest(string_to_array(tg_argv[2],',')) with ordinality as f(field,position)
 where before_row->field is distinct from after_row->field;
 if tg_op='UPDATE' and changed is null then return null;end if;
 details=jsonb_build_object('fields',coalesce(changed,'{}'::text[]));
 action=tg_argv[0]||'.'||case tg_op when 'INSERT' then 'create' else lower(tg_op) end;
 record_id=(item->>'id')::uuid;
 record_name=item->>'name';
 if tg_table_name='members' and 'rank'=any(changed) then
  details=details||jsonb_build_object('rank_before',before_row->'rank','rank_after',after_row->'rank');
 end if;
 if item ? 'member_id' then
  agent_id=(item->>'member_id')::uuid;
  details=details||jsonb_build_object('member_id',agent_id);
  if before_row ? 'member_id' and before_row->'member_id' is distinct from after_row->'member_id' and tg_op='UPDATE' then
   details=details||jsonb_build_object('previous_member_id',before_row->'member_id');
  end if;
  if tg_table_name='member_subunits' then
   record_id=agent_id;
   details=details||jsonb_build_object('subunit',record_name);
   select name into record_name from public.members where id=agent_id;
  end if;
 end if;
 perform private.append_admin_audit(action,tg_argv[1],record_id,coalesce(record_name,'Perfil de agente'),'succeeded',details);
 return null;
end $$;
revoke all on function private.audit_catalog_change() from public,anon,authenticated,service_role;
create trigger audit_equipment_change after insert or update or delete on public.equipment
 for each row execute function private.audit_catalog_change('equipment','equipment','name,category,mandatory,notes,sort_order');
create trigger audit_official_profile_change after insert or update or delete on public.members
 for each row execute function private.audit_catalog_change('profile.official','profile','name,rank,callsign,uniform_number,agent_number,joined_on,active,user_id,image_path');
create trigger audit_subunit_change after insert or update or delete on public.member_subunits
 for each row execute function private.audit_catalog_change('profile.subunit','profile','member_id,name');
create trigger audit_qualification_change after insert or update or delete on public.agent_qualifications
 for each row execute function private.audit_catalog_change('profile.qualification','profile','member_id,kind,name,completed_on,issuer');
create trigger audit_distinction_change after insert or update or delete on public.agent_distinctions
 for each row execute function private.audit_catalog_change('profile.distinction','profile','member_id,name,description,awarded_on,symbol');

-- Apply only effective permission/subunit changes so repeat saves don't
-- generate spurious removal and re-addition events.
create or replace function private.set_user_access(p_user uuid,p_role public.ushe_role,p_approved boolean,p_tabs jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(786533);
 if not private.is_command() then raise exception 'Só o Comando pode gerir acessos.' using errcode='42501';end if;
 if p_user=auth.uid() and (p_role<>'command' or not p_approved) then raise exception 'Não pode retirar o próprio acesso de Comando.';end if;
 if p_role is null or p_approved is null or p_tabs is null or jsonb_typeof(p_tabs)<>'array' then raise exception 'Permissões inválidas.';end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Utilizador inexistente.';end if;
 if (p_role<>'command' or not p_approved) and exists(select 1 from public.profiles where id=p_user and role='command' and approved)
  and (select count(*) from public.profiles where role='command' and approved)<=1 then raise exception 'É obrigatório manter um Comando aprovado.';end if;
 if jsonb_array_length(p_tabs)>9 or exists(select 1 from jsonb_array_elements(p_tabs) item group by item->>'tab' having count(*)>1) then
  raise exception 'Permissões inválidas.';
 end if;
 update public.profiles set role=p_role,approved=p_approved where id=p_user;
 delete from public.tab_permissions t where t.user_id=p_user
  and not exists(select 1 from jsonb_array_elements(p_tabs) item where (item->>'tab')::public.ushe_tab=t.tab);
 insert into public.tab_permissions(user_id,tab,can_create)
 select p_user,(item->>'tab')::public.ushe_tab,coalesce((item->>'can_create')::boolean,false) from jsonb_array_elements(p_tabs) item
 on conflict(user_id,tab) do update set can_create=excluded.can_create
 where public.tab_permissions.can_create is distinct from excluded.can_create;
end $$;

create or replace function public.save_agent_official(p_member uuid,p_data jsonb,p_subunits text[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_command() then raise exception 'Só o Comando pode gerir dados oficiais.' using errcode='42501';end if;
 if cardinality(p_subunits)>20 then raise exception 'Máximo de 20 subunidades por agente.';end if;
 update public.members set user_id=nullif(p_data->>'user_id','')::uuid,
  agent_number=nullif(btrim(p_data->>'agent_number'),''),joined_on=nullif(p_data->>'joined_on','')::date,
  rank=p_data->>'rank',callsign=coalesce(p_data->>'callsign','') where id=p_member;
 if not found then raise exception 'Agente indisponível.';end if;
 delete from public.member_subunits s where s.member_id=p_member
  and not exists(select 1 from unnest(p_subunits) v where btrim(v)=s.name);
 insert into public.member_subunits(member_id,name)
 select p_member,btrim(v) from unnest(p_subunits) v where btrim(v)<>'' group by btrim(v)
 on conflict(member_id,name) do nothing;
end $$;

-- An authorized save conflict is a meaningful failed operation.
create or replace function private.equipment_image_save(p_action text,p_id uuid,p_data jsonb,p_path text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_row public.equipment;saved public.equipment; image_name text;
begin
 if not coalesce(private.is_command(),false) then raise exception 'Apenas o Comando pode gerir equipamento.' using errcode='42501';end if;
 if p_action='authorize' then return jsonb_build_object('ok',true);end if;
 perform pg_advisory_xact_lock(786533);
 if p_action='queue' then
  if p_path not like 'equipamento/%' then raise exception 'Imagem inválida.';end if;
  if not private.equipment_media_referenced(p_path) then
   update private.equipment_media_files set state='queued',changed_at=clock_timestamp(),run_id=null where name=p_path and state not in ('deleting','deleted');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('keep','replace','remove') or jsonb_typeof(p_data)<>'object' or p_id is null then raise exception 'Dados de equipamento inválidos.';end if;
 select * into current_row from public.equipment where id=p_id for update;
 if (found and (p_expected_revision is null or current_row.revision<>p_expected_revision))
  or (not found and p_expected_revision is not null) then
  perform private.append_admin_audit('equipment.save','equipment',p_id,coalesce(current_row.name,'Equipamento indisponível'),
   'failed',jsonb_build_object('reason','conflict'));
  return jsonb_build_object('ok',false,'reason','conflict');
 end if;
 image_name=case p_action when 'replace' then p_path when 'remove' then null else current_row.image_path end;
 if p_action='replace' and (p_path is null or p_path !~ '^equipamento/[a-zA-Z0-9._-]+$') then raise exception 'Imagem inválida.';end if;
 insert into public.equipment(id,name,category,mandatory,notes,sort_order,image_path)
 values(p_id,btrim(p_data->>'name'),btrim(p_data->>'category'),coalesce((p_data->>'mandatory')::boolean,false),coalesce(p_data->>'notes',''),coalesce((p_data->>'sort_order')::integer,0),image_name)
 on conflict(id) do update set name=excluded.name,category=excluded.category,mandatory=excluded.mandatory,notes=excluded.notes,sort_order=excluded.sort_order,image_path=excluded.image_path
 returning * into saved;
 return jsonb_build_object('ok',true,'equipment',to_jsonb(saved));
end $$;

create function private.admin_audit_list(p_visibility text,p_query text,p_entity text,p_result text,p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare search text; before_at timestamptz; before_id uuid; page jsonb;
begin
 if not coalesce(private.is_command(),false) then raise exception 'Só o Comando pode consultar os logs.' using errcode='42501';end if;
 if coalesce(p_visibility,'') not in ('visible','hidden','all')
  or coalesce(p_entity,'') not in ('','account','profile','equipment','audit')
  or coalesce(p_result,'') not in ('','started','succeeded','denied','failed','resumed') then
  raise exception 'Filtros de logs inválidos.' using errcode='22023';
 end if;
 if p_cursor is not null then
  before_at=(p_cursor->>'at')::timestamptz;before_id=(p_cursor->>'id')::uuid;
  if before_at is null or before_id is null or not isfinite(before_at) then raise exception 'Página inválida.' using errcode='22023';end if;
 end if;
 search=translate(lower(left(btrim(coalesce(p_query,'')),160)),'áàâãéêíóôõúüç','aaaaeeiooouuc');
 with candidates as materialized (
  select l.id,l.actor_name,l.action,l.entity,l.target_id,l.target_name,l.occurred_at,l.result,l.details,h.hidden_by_name,h.hidden_at
  from private.admin_audit_log l left join private.admin_audit_hidden h on h.log_id=l.id
  where (p_visibility='all' or (p_visibility='hidden')=(h.log_id is not null))
   and (coalesce(p_entity,'')='' or l.entity=p_entity)
   and (coalesce(p_result,'')='' or l.result=p_result)
   and (before_at is null or (l.occurred_at,l.id)<(before_at,before_id))
   and (search='' or strpos(translate(lower(concat_ws(' ',l.actor_name,l.target_name,l.action,l.id,l.target_id)),'áàâãéêíóôõúüç','aaaaeeiooouuc'),search)>0)
  order by l.occurred_at desc,l.id desc limit 21
 ), shown as (select * from candidates order by occurred_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(s) order by s.occurred_at desc,s.id desc) from shown s),'[]'::jsonb),
  'next_cursor',case when (select count(*) from candidates)>20 then
   (select jsonb_build_object('at',occurred_at,'id',id) from shown order by occurred_at,id limit 1) end)
 into page;
 return page;
end $$;

create function private.admin_audit_hide(p_log uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original private.admin_audit_log; entry private.admin_audit_hidden; actor uuid=auth.uid();
begin
 if not coalesce(private.is_command(),false) then raise exception 'Só o Comando pode ocultar logs.' using errcode='42501';end if;
 select * into original from private.admin_audit_log where id=p_log;
 if not found then return jsonb_build_object('ok',false,'reason','missing');end if;
 insert into private.admin_audit_hidden(log_id,hidden_by,hidden_by_name)
 values(p_log,actor,(select full_name from public.profiles where id=actor))
 on conflict(log_id) do nothing returning * into entry;
 if found then
  perform private.append_admin_audit('audit.hide','audit',p_log,original.target_name,'succeeded',
   jsonb_build_object('log_action',original.action,'log_entity',original.entity));
  return jsonb_build_object('ok',true,'already_hidden',false,'hidden_at',entry.hidden_at);
 end if;
 select * into entry from private.admin_audit_hidden where log_id=p_log;
 return jsonb_build_object('ok',true,'already_hidden',true,'hidden_at',entry.hidden_at);
end $$;

create function public.admin_audit_list(p_visibility text default 'visible',p_query text default '',p_entity text default '',p_result text default '',p_cursor jsonb default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.admin_audit_list(p_visibility,p_query,p_entity,p_result,p_cursor);
$$;
create function public.admin_audit_hide(p_log uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.admin_audit_hide(p_log);$$;
revoke all on function private.admin_audit_list(text,text,text,text,jsonb),public.admin_audit_list(text,text,text,text,jsonb),
 private.admin_audit_hide(uuid),public.admin_audit_hide(uuid) from public,anon,authenticated,service_role;
grant execute on function private.admin_audit_list(text,text,text,text,jsonb),public.admin_audit_list(text,text,text,text,jsonb),
 private.admin_audit_hide(uuid),public.admin_audit_hide(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
