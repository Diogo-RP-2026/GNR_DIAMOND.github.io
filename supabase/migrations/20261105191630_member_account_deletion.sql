begin;
set local lock_timeout='5s';

-- Point 1 only: durable account-deletion journal and append-only audit foundation.
-- UUIDs/names are snapshots, deliberately without FKs to deletable accounts.
create table private.admin_audit_log(
 id uuid primary key default gen_random_uuid(),
 actor_id uuid, actor_name text not null,
 action text not null, entity text not null default 'account',
 target_id uuid, target_name text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 result text not null check(result in ('started','succeeded','denied','failed','resumed')),
 details jsonb not null default '{}' check(jsonb_typeof(details)='object')
);
create index admin_audit_log_time_idx on private.admin_audit_log(occurred_at desc,id desc);
create table private.account_deletions(
 id uuid primary key default gen_random_uuid(), target_id uuid not null unique,
 target_name text not null, member_id uuid,
 actor_id uuid not null, actor_name text not null,
 status text not null default 'pending' check(status in ('pending','failed','finalizing','completed')),
 started_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 last_reason text check(last_reason in ('storage','database'))
);
create table private.account_deletion_files(
 operation_id uuid not null references private.account_deletions(id) on delete restrict,
 bucket_id text not null check(bucket_id in ('ushe-avatars','ushe-media')),
 name text not null, primary key(operation_id,bucket_id,name)
);
alter table private.admin_audit_log enable row level security;
alter table private.account_deletions enable row level security;
alter table private.account_deletion_files enable row level security;
revoke all on private.admin_audit_log,private.account_deletions,private.account_deletion_files from public,anon,authenticated,service_role;

create function private.immutable_admin_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Os logs administrativos são permanentes.' using errcode='42501';end $$;
revoke all on function private.immutable_admin_audit() from public,anon,authenticated,service_role;
create trigger immutable_admin_audit before update or delete on private.admin_audit_log
 for each row execute function private.immutable_admin_audit();
create trigger no_truncate_admin_audit before truncate on private.admin_audit_log
 for each statement execute function private.immutable_admin_audit();

create function private.audit_account(p_target uuid,p_name text,p_result text,p_reason text default null)
returns void language sql security definer set search_path='' as $$
 insert into private.admin_audit_log(actor_id,actor_name,action,target_id,target_name,result,details)
 values(auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Sessão sem perfil'),
 'account.delete',p_target,coalesce(p_name,'Conta indisponível'),p_result,
 case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason',p_reason) end);
$$;
revoke all on function private.audit_account(uuid,text,text,text) from public,anon,authenticated,service_role;

-- Serialize role changes, deletion plans and photo references. A Comando account
-- cannot first be demoted by set_user_access, direct REST or administrative Auth API.
create function private.protect_command_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(786533);
 if tg_table_schema='auth' then
  if exists(select 1 from public.profiles where id=old.id and role='command') then
   raise exception 'Conta de Comando protegida.' using errcode='42501';
  end if;
  return old;
 end if;
 if old.role='command' and (tg_op='DELETE' or new.role is distinct from old.role) then
  raise exception 'Não é permitido reduzir o cargo ou apagar uma conta de Comando.' using errcode='42501';
 end if;
 if tg_op='UPDATE' and exists(select 1 from private.account_deletions where target_id=old.id and status in ('pending','failed')) then
  raise exception 'Eliminação de conta pendente.' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.protect_command_account() from public,anon,authenticated,service_role;
create trigger protect_command_profile before update or delete on public.profiles
 for each row execute function private.protect_command_account();
create trigger protect_command_auth before delete on auth.users
 for each row execute function private.protect_command_account();

-- Keep historical participants even when the live agent/profile is removed.
alter table public.warning_members add column id uuid not null default gen_random_uuid(), add column member_snapshot jsonb;
alter table public.event_log_participants add column id uuid not null default gen_random_uuid(), add column member_snapshot jsonb;
update public.warning_members w set member_snapshot=jsonb_build_object('id',m.id,'name',m.name,'rank',m.rank,'uniform_number',m.uniform_number) from public.members m where m.id=w.member_id;
update public.event_log_participants w set member_snapshot=jsonb_build_object('id',m.id,'name',m.name,'rank',m.rank,'uniform_number',m.uniform_number) from public.members m where m.id=w.member_id;
alter table public.warning_members alter column member_snapshot set not null,
 drop constraint warning_members_pkey, add primary key(id), add unique(warning_id,member_id),
 drop constraint warning_members_member_id_fkey, alter column member_id drop not null,
 add constraint warning_members_member_id_fkey foreign key(member_id) references public.members(id) on delete set null;
alter table public.event_log_participants alter column member_snapshot set not null,
 drop constraint event_log_participants_pkey, add primary key(id), add unique(log_id,member_id),
 drop constraint event_log_participants_member_id_fkey, alter column member_id drop not null,
 add constraint event_log_participants_member_id_fkey foreign key(member_id) references public.members(id) on delete set null;

create function private.stamp_historical_participant() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.member_id is null then
  if tg_op='INSERT' then raise exception 'Participante inexistente.';end if;
  new.member_snapshot=old.member_snapshot;
 elsif tg_op='INSERT' or new.member_id is distinct from old.member_id then
  select jsonb_build_object('id',m.id,'name',m.name,'rank',m.rank,'uniform_number',m.uniform_number)
   into new.member_snapshot from public.members m where m.id=new.member_id;
 else new.member_snapshot=old.member_snapshot;end if;
 return new;
end $$;
revoke all on function private.stamp_historical_participant() from public,anon,authenticated,service_role;
create trigger stamp_historical_participant before insert or update on public.warning_members for each row execute function private.stamp_historical_participant();
create trigger stamp_historical_participant before insert or update on public.event_log_participants for each row execute function private.stamp_historical_participant();
alter table public.event_logs add column created_by_name text;
update public.event_logs l set created_by_name=coalesce((select full_name from public.profiles where id=l.created_by),'Conta removida');
alter table public.event_logs alter column created_by_name set not null;
create function private.stamp_log_author() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by_name=coalesce((select full_name from public.profiles where id=new.created_by),'Conta removida');
 else new.created_by_name=old.created_by_name;end if;return new;
end $$;
revoke all on function private.stamp_log_author() from public,anon,authenticated,service_role;
create trigger stamp_log_author before insert or update on public.event_logs for each row execute function private.stamp_log_author();

-- Refuse relinks/photo assignments during a pending deletion. Other agents and
-- equipment cannot start sharing an image after its deletion plan is committed.
create function private.guard_deletion_references() returns trigger
language plpgsql security definer set search_path='' as $$
declare image_name text; image_bucket text; account_id uuid;
begin
 perform pg_advisory_xact_lock(786533);
 if tg_table_name='members' then
  if tg_op<>'INSERT' and exists(select 1 from private.account_deletions where target_id=old.user_id and status in ('pending','failed')) then
   raise exception 'Eliminação de conta pendente.' using errcode='42501';end if;
  if tg_op<>'DELETE' and exists(select 1 from private.account_deletions where target_id=new.user_id and status<>'completed') then
   raise exception 'Eliminação de conta pendente.' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_table_schema='storage' then
  image_name=new.name;image_bucket=new.bucket_id;
  if image_bucket='ushe-avatars' then
   begin account_id=split_part(image_name,'/',1)::uuid;exception when invalid_text_representation then raise exception 'Fotografia inválida.';end;
   if not exists(select 1 from public.profiles where id=account_id) or exists(select 1 from private.account_deletions where target_id=account_id) then
    raise exception 'Conta indisponível para fotografias.' using errcode='42501';end if;
  end if;
 elsif tg_table_name='agent_personal' then image_name=new.avatar_path;image_bucket='ushe-avatars';
 else image_name=new.image_path;image_bucket='ushe-media';end if;
 if exists(select 1 from private.account_deletion_files f join private.account_deletions j on j.id=f.operation_id
  where f.name=image_name and f.bucket_id=image_bucket and j.status<>'completed') then
  raise exception 'Fotografia em processo de eliminação.' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guard_deletion_references() from public,anon,authenticated,service_role;
create trigger guard_deletion_references before insert or update or delete on public.members for each row execute function private.guard_deletion_references();
create trigger guard_deletion_references before insert or update of image_path on public.uniforms for each row execute function private.guard_deletion_references();
create trigger guard_deletion_references before insert or update of image_path on public.equipment for each row execute function private.guard_deletion_references();
create trigger guard_deletion_references before insert or update of avatar_path on public.agent_personal for each row execute function private.guard_deletion_references();
create trigger guard_deletion_upload before insert or update of name,bucket_id on storage.objects for each row execute function private.guard_deletion_references();

create function private.account_admin(p_action text,p_target uuid default null,p_operation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles; agent public.members; job private.account_deletions; who public.profiles; manifest jsonb;
begin
 perform pg_advisory_xact_lock(786533);
 select * into who from public.profiles where id=auth.uid();
 if not private.is_command() then
  perform private.audit_account(p_target,null,'denied','forbidden');
  return jsonb_build_object('ok',false,'reason','forbidden');end if;
 if p_action='list' then
  return jsonb_build_object('ok',true,'jobs',coalesce((select jsonb_agg(jsonb_build_object('target_id',target_id,'operation_id',id,'status',status)) from private.account_deletions where status<>'completed'),'[]'),
   'agents',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'name',name)) from public.members where user_id is not null),'[]'));end if;
 if p_action not in ('begin','finish','storage_failure') or p_target is null then
  return jsonb_build_object('ok',false,'reason','request');end if;
 select * into target from public.profiles where id=p_target for update;
 if target.role='command' or p_target=auth.uid() then
  perform private.audit_account(p_target,target.full_name,'denied','protected');
  return jsonb_build_object('ok',false,'reason','protected');end if;
 select * into job from private.account_deletions where target_id=p_target for update;
 if job.id is not null and (p_operation is null or p_operation=job.id) and job.status='completed' then
  return jsonb_build_object('ok',true,'status','completed','operation_id',job.id);end if;
 if target.id is null then
  perform private.audit_account(p_target,null,'denied','missing');
  return jsonb_build_object('ok',false,'reason','missing');end if;
 if p_action='begin' then
  if job.id is null then
   select * into agent from public.members where user_id=p_target for update;
   insert into private.account_deletions(target_id,target_name,member_id,actor_id,actor_name)
    values(p_target,coalesce(agent.name,target.full_name),agent.id,who.id,who.full_name) returning * into job;
   -- Remove personal avatars (including abandoned uploads), but never a shared file.
   insert into private.account_deletion_files(operation_id,bucket_id,name)
    select job.id,'ushe-avatars',o.name from storage.objects o where o.bucket_id='ushe-avatars'
     and (split_part(o.name,'/',1)=p_target::text or o.name=(select avatar_path from public.agent_personal where member_id=agent.id))
     and not exists(select 1 from public.agent_personal ap where ap.avatar_path=o.name and ap.member_id is distinct from agent.id);
   if agent.image_path is not null and not exists(select 1 from public.members where image_path=agent.image_path and id<>agent.id)
    and not exists(select 1 from public.uniforms where image_path=agent.image_path)
    and not exists(select 1 from public.equipment where image_path=agent.image_path) then
    insert into private.account_deletion_files values(job.id,'ushe-media',agent.image_path) on conflict do nothing;end if;
   -- Auth + all existing JWT sessions are denied before any Storage operation.
   update auth.users set banned_until=clock_timestamp()+interval '100 years' where id=p_target;
   delete from auth.refresh_tokens where user_id=p_target::text;
   delete from auth.sessions where user_id=p_target;
   delete from private.verified_sessions where user_id=p_target;
   perform private.audit_account(p_target,job.target_name,'started');
  else
   perform private.audit_account(p_target,job.target_name,'resumed');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name)),'[]') into manifest from private.account_deletion_files where operation_id=job.id;
  return jsonb_build_object('ok',true,'status','pending','operation_id',job.id,'files',manifest);
 end if;
 if job.id is null or p_operation is distinct from job.id then return jsonb_build_object('ok',false,'reason','operation');end if;
 if p_action='storage_failure' then
  update private.account_deletions set status='failed',last_reason='storage' where id=job.id;
  perform private.audit_account(p_target,job.target_name,'failed','storage');
  return jsonb_build_object('ok',true,'status','pending','operation_id',job.id);end if;
 if exists(select 1 from storage.objects o join private.account_deletion_files f on f.bucket_id=o.bucket_id and f.name=o.name where f.operation_id=job.id) then
  perform private.audit_account(p_target,job.target_name,'failed','photos_remaining');
  return jsonb_build_object('ok',false,'reason','photos_remaining');end if;
 -- Finalization is one PostgreSQL transaction, including Auth, profile, related
 -- agent data and the success audit event. A failure rolls all of these back.
 begin
  update private.account_deletions set status='finalizing' where id=job.id;
  -- Shared/historical objects are retained; removing ownership does not grant access.
  update storage.objects set owner=null,owner_id=null where owner=p_target or owner_id=p_target::text;
  delete from public.members where id=job.member_id and user_id=p_target;
  delete from auth.refresh_tokens where user_id=p_target::text;
  delete from auth.sessions where user_id=p_target;
  delete from auth.users where id=p_target;
  update private.account_deletions set status='completed',completed_at=clock_timestamp(),last_reason=null where id=job.id;
  perform private.audit_account(p_target,job.target_name,'succeeded');
 exception when others then
  update private.account_deletions set status='failed',last_reason='database' where id=job.id;
  perform private.audit_account(p_target,job.target_name,'failed','database');
  return jsonb_build_object('ok',false,'reason','database');
 end;
 return jsonb_build_object('ok',true,'status','completed','operation_id',job.id);
end $$;
create function public.account_admin(p_action text,p_target uuid default null,p_operation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.account_admin(p_action,p_target,p_operation);$$;
revoke all on function private.account_admin(text,uuid,uuid),public.account_admin(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.account_admin(text,uuid,uuid),public.account_admin(text,uuid,uuid) to authenticated;

-- Preserve detached participants when a historical document is edited.
create or replace function public.save_warning(p_id uuid,p_data jsonb,p_members uuid[]) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_command() then raise exception 'Só o Comando pode criar avisos.' using errcode='42501'; end if;
  if coalesce(cardinality(p_members),0)=0 and not exists(select 1 from public.warning_members where warning_id=p_id and member_id is null) then raise exception 'Selecione pelo menos um operacional.'; end if;
  if p_id is null then
    insert into public.warnings(title,conduct,sanction,issued_on,signature) values(p_data->>'title',p_data->>'conduct',p_data->>'sanction',(p_data->>'issued_on')::date,p_data->>'signature') returning id into v_id;
  else
    update public.warnings set title=p_data->>'title',conduct=p_data->>'conduct',sanction=p_data->>'sanction',issued_on=(p_data->>'issued_on')::date,signature=p_data->>'signature' where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Aviso inexistente.'; end if;
    delete from public.warning_members where warning_id=v_id and member_id is not null;
  end if;
  insert into public.warning_members(warning_id,member_id) select v_id,unnest(p_members);
  return v_id;
end; $$;

create or replace function public.save_log(p_id uuid,p_data jsonb,p_members uuid[]) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not private.can_log() then raise exception 'Sem permissão para criar registos.' using errcode='42501'; end if;
  if coalesce(cardinality(p_members),0)=0 and not exists(select 1 from public.event_log_participants where log_id=p_id and member_id is null) then raise exception 'Selecione pelo menos um participante.'; end if;
  if p_id is null then
    insert into public.event_logs(event_type,starts_at,ends_at,location,summary,observations) values(p_data->>'event_type',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,p_data->>'location',p_data->>'summary',coalesce(p_data->>'observations','')) returning id into v_id;
  else
    update public.event_logs set event_type=p_data->>'event_type',starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,location=p_data->>'location',summary=p_data->>'summary',observations=coalesce(p_data->>'observations','') where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Registo inexistente ou sem autorização.'; end if;
    delete from public.event_log_participants where log_id=v_id and member_id is not null;
  end if;
  insert into public.event_log_participants(log_id,member_id) select v_id,unnest(p_members);
  return v_id;
end; $$;

create or replace function public.portal_feed(p_kind text,p_query text default '',p_filter text default '',p_sort text default '',p_cursor jsonb default null,p_snapshot timestamptz default null,p_from date default null,p_to date default null,p_target uuid default null,p_known jsonb default '{}',p_limit integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare batch jsonb; ids uuid[]; votes jsonb; docs jsonb; total bigint; filters jsonb; snap timestamptz=coalesce(p_snapshot,statement_timestamp()); asc_order boolean; cursor_at timestamptz; cursor_id uuid; page_size integer=least(greatest(coalesce(p_limit,20),1),50);more boolean;next_cursor jsonb;
begin
 if p_kind not in ('event','announcement','log') or length(coalesce(p_query,''))>200 or length(coalesce(p_filter,''))>100 or jsonb_typeof(p_known)<>'object' then raise exception 'Consulta inválida.';end if;
 if p_sort not in ('','asc','desc') then raise exception 'Ordenação inválida.';end if;
 if p_from is not null and not isfinite(p_from) or p_to is not null and not isfinite(p_to) then raise exception 'Data inválida.';end if;
 if p_kind='event' and p_filter not in ('','next','past') then raise exception 'Período inválido.';end if;
 asc_order=case when p_sort<>'' then p_sort='asc' else p_kind='event' and p_filter<>'past' end;
 cursor_at=(p_cursor->>'at')::timestamptz;cursor_id=(p_cursor->>'id')::uuid;
 if (cursor_at is null)<>(cursor_id is null) then raise exception 'Cursor inválido.';end if;
 with authorized as (
 select e.id,e.starts_at sort_at,e.created_at,to_jsonb(e)-'feed_search' doc,e.feed_search,''::text kind,e.ends_at
 from public.events e where p_kind='event'
 union all
 select a.id,a.created_at,a.created_at,to_jsonb(a)-'feed_search',a.feed_search,a.kind,null::timestamptz from public.announcements a where p_kind='announcement'
 union all
 select l.id,l.starts_at,l.created_at,to_jsonb(l)-'feed_search',l.feed_search,l.event_type,null::timestamptz from public.event_logs l where p_kind='log'
 ), filtered as (
 select * from authorized a where (p_target is null or a.id=p_target) and a.created_at<=snap
 and (coalesce(btrim(p_query),'')='' or a.feed_search@@websearch_to_tsquery('portuguese'::regconfig,p_query))
 and (p_target is not null or p_kind='event' and (case when p_filter='past' then a.ends_at<statement_timestamp() else a.ends_at>=statement_timestamp() end) or p_kind<>'event' and (coalesce(p_filter,'')='' or a.kind=p_filter))
 and (p_from is null or a.sort_at>=(p_from::timestamp at time zone 'Europe/Lisbon'))
 and (p_to is null or a.sort_at<((p_to+1)::timestamp at time zone 'Europe/Lisbon'))
 ), windowed as (
 select * from filtered a where cursor_at is null or (asc_order and (a.sort_at,a.id)>(cursor_at,cursor_id)) or (not asc_order and (a.sort_at,a.id)<(cursor_at,cursor_id))
 order by case when asc_order then sort_at end asc,case when not asc_order then sort_at end desc,case when asc_order then id end asc,case when not asc_order then id end desc limit page_size+1
 ) select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'at',w.sort_at,'doc',w.doc) order by case when asc_order then w.sort_at end asc,case when not asc_order then w.sort_at end desc,case when asc_order then w.id end asc,case when not asc_order then w.id end desc),'[]'),(select count(*) from filtered),(select coalesce(jsonb_agg(distinct kind order by kind),'[]') from authorized where kind<>'') into batch,total,filters from windowed w;
 more=jsonb_array_length(batch)>page_size;
 batch=(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(batch) with ordinality x where x.ordinality<=page_size);
 select array_agg((value->>'id')::uuid order by ordinality) into ids from jsonb_array_elements(batch) with ordinality;
 votes=case when p_kind='log' then '{}'::jsonb else public.feed_responses(p_kind,ids) end;
 -- Only the current page's participants and votes are materialized.
 select coalesce(jsonb_agg(jsonb_build_object('record',x.doc,'responses',x.responses,'version',md5((x.doc||jsonb_build_object('responses',x.responses))::text)) order by x.n),'[]') into docs from (
 select b.ordinality n,
 case when p_kind='log' then b.value->'doc'||jsonb_build_object('event_log_participants',coalesce((select jsonb_agg(jsonb_build_object('member_id',ep.member_id,'member_snapshot',ep.member_snapshot,'name',coalesce(m.name,ep.member_snapshot->>'name'),'uniform_number',coalesce(m.uniform_number,(ep.member_snapshot->>'uniform_number')::integer)) order by coalesce(m.uniform_number,(ep.member_snapshot->>'uniform_number')::integer),ep.id) from public.event_log_participants ep left join public.member_options() m on m.id=ep.member_id where ep.log_id=(b.value->>'id')::uuid),'[]')) else b.value->'doc' end doc,
 coalesce(votes->(b.value->>'id'),'[]') responses
 from jsonb_array_elements(batch) with ordinality b
 )x;
 next_cursor=case when jsonb_array_length(batch)>0 then (batch->(jsonb_array_length(batch)-1))-'doc' else null end;
 return jsonb_build_object('items',coalesce((select jsonb_agg(value) from jsonb_array_elements(docs) where p_known->>(value->'record'->>'id') is distinct from value->>'version'),'[]'),'ids',coalesce(to_jsonb(ids),'[]'),'next_cursor',next_cursor,'has_more',more,'total',total,'filters',filters,'snapshot',snap);
end $$;

notify pgrst,'reload schema';
commit;
