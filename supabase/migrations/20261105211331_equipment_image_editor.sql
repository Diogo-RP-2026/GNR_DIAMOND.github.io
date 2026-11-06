begin;
set local lock_timeout='5s';

alter table public.equipment add column revision bigint not null default 0;
create index if not exists equipment_image_reference on public.equipment(image_path) where image_path is not null;

-- A durable file lifecycle, separate from permanent audit records. Tombstones
-- prevent a reference from being added while Storage removal is in flight.
create table private.equipment_media_files(
 name text primary key check(name ~ '^equipamento/[a-zA-Z0-9._-]+$'),
 state text not null check(state in ('staged','active','queued','deleting','deleted')),
 created_at timestamptz not null default clock_timestamp(),
 changed_at timestamptz not null default clock_timestamp(), run_id uuid,
 failures integer not null default 0
);
create index equipment_media_work on private.equipment_media_files(state,changed_at);
create table private.equipment_media_runs(
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default clock_timestamp(),
 claimed_at timestamptz, expires_at timestamptz not null default clock_timestamp()+interval '5 minutes'
);
create table private.equipment_media_settings(
 id boolean primary key default true check(id),worker_url text not null
);
insert into private.equipment_media_settings(id,worker_url) values(true,'https://ctplgtrfhinpuzrhtvch.supabase.co/functions/v1/equipment-image');
alter table private.equipment_media_files enable row level security;
alter table private.equipment_media_runs enable row level security;
alter table private.equipment_media_settings enable row level security;
revoke all on private.equipment_media_files,private.equipment_media_runs,private.equipment_media_settings from public,anon,authenticated,service_role;

create function private.equipment_media_referenced(p_name text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.equipment where image_path=p_name)
 or exists(select 1 from public.members where image_path=p_name)
 or exists(select 1 from public.uniforms where image_path=p_name);
$$;
revoke all on function private.equipment_media_referenced(text) from public,anon,authenticated,service_role;
insert into private.equipment_media_files(name,state)
 select name,case when private.equipment_media_referenced(name) then 'active' else 'staged' end
 from storage.objects where bucket_id='ushe-media' and name like 'equipamento/%';

create function private.guard_equipment_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare status text;
begin
 perform pg_advisory_xact_lock(786533);
 if tg_table_name='equipment' then
  if tg_op='UPDATE' then new.revision=old.revision+1;else new.revision=0;end if;
 end if;
 if new.image_path is null or new.image_path not like 'equipamento/%' then return new;end if;
 if tg_op='UPDATE' and new.image_path is not distinct from old.image_path then return new;end if;
 select state into status from private.equipment_media_files where name=new.image_path;
 if status in ('queued','deleting','deleted') or not exists(select 1 from storage.objects where bucket_id='ushe-media' and name=new.image_path) then
  raise exception 'Imagem indisponível. Escolhe novamente a fotografia.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.guard_equipment_media() from public,anon,authenticated,service_role;
create trigger equipment_image_guard before insert or update on public.equipment for each row execute function private.guard_equipment_media();
create trigger equipment_image_guard before insert or update of image_path on public.members for each row execute function private.guard_equipment_media();
create trigger equipment_image_guard before insert or update of image_path on public.uniforms for each row execute function private.guard_equipment_media();

create function private.track_equipment_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous text;next_path text;
begin
 perform pg_advisory_xact_lock(786533);
 if tg_table_schema='storage' then
  if new.bucket_id='ushe-media' and new.name like 'equipamento/%' then
   insert into private.equipment_media_files(name,state) values(new.name,'staged') on conflict(name) do nothing;
  end if;
  return new;
 end if;
 if tg_op<>'INSERT' then previous=old.image_path;end if;
 if tg_op<>'DELETE' then next_path=new.image_path;end if;
 if previous is not distinct from next_path then return null;end if;
 if next_path like 'equipamento/%' then
  insert into private.equipment_media_files(name,state) values(next_path,'active')
   on conflict(name) do update set state='active',changed_at=clock_timestamp(),run_id=null;
 end if;
 if previous like 'equipamento/%' and not private.equipment_media_referenced(previous) then
  insert into private.equipment_media_files(name,state) values(previous,'queued')
   on conflict(name) do update set state='queued',changed_at=clock_timestamp(),run_id=null;
 end if;
 if tg_table_name='equipment' then
  insert into private.admin_audit_log(actor_id,actor_name,action,entity,target_id,target_name,result,details)
   values(auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Sistema'),
    case when next_path is null then 'equipment.image.remove' when previous is null then 'equipment.image.add' else 'equipment.image.replace' end,
    'equipment',coalesce(new.id,old.id),coalesce(new.name,old.name),'succeeded',jsonb_build_object('previous_path',previous,'image_path',next_path));
 end if;
 return null;
end $$;
revoke all on function private.track_equipment_media() from public,anon,authenticated,service_role;
create trigger track_equipment_media after insert on storage.objects for each row execute function private.track_equipment_media();
create trigger track_equipment_media after insert or update of image_path or delete on public.equipment for each row execute function private.track_equipment_media();
create trigger track_equipment_media after insert or update of image_path or delete on public.members for each row execute function private.track_equipment_media();
create trigger track_equipment_media after insert or update of image_path or delete on public.uniforms for each row execute function private.track_equipment_media();

-- Equipment files can only be deleted by the validated backend worker. Other
-- namespaces keep their existing permissions and behavior.
drop policy ushe_media_delete on storage.objects;
create policy ushe_media_delete on storage.objects for delete to authenticated
 using(bucket_id='ushe-media' and (select private.is_command()) and name not like 'equipamento/%');

create function private.equipment_image_save(p_action text,p_id uuid,p_data jsonb,p_path text,p_expected_revision bigint) returns jsonb
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
 if found then
  if p_expected_revision is null or current_row.revision<>p_expected_revision then raise exception 'O equipamento foi alterado. Atualiza a listagem antes de guardar.' using errcode='40001';end if;
 elsif p_expected_revision is not null then raise exception 'Equipamento indisponível. Atualiza a listagem.' using errcode='40001';end if;
 image_name=case p_action when 'replace' then p_path when 'remove' then null else current_row.image_path end;
 if p_action='replace' and (p_path is null or p_path !~ '^equipamento/[a-zA-Z0-9._-]+$') then raise exception 'Imagem inválida.';end if;
 insert into public.equipment(id,name,category,mandatory,notes,sort_order,image_path)
 values(p_id,btrim(p_data->>'name'),btrim(p_data->>'category'),coalesce((p_data->>'mandatory')::boolean,false),coalesce(p_data->>'notes',''),coalesce((p_data->>'sort_order')::integer,0),image_name)
 on conflict(id) do update set name=excluded.name,category=excluded.category,mandatory=excluded.mandatory,notes=excluded.notes,sort_order=excluded.sort_order,image_path=excluded.image_path
 returning * into saved;
 return jsonb_build_object('ok',true,'equipment',to_jsonb(saved));
end $$;
create function public.equipment_image_save(p_action text,p_id uuid default null,p_data jsonb default '{}',p_path text default null,p_expected_revision bigint default null) returns jsonb
language sql security invoker set search_path='' as $$select private.equipment_image_save(p_action,p_id,p_data,p_path,p_expected_revision);$$;
revoke all on function private.equipment_image_save(text,uuid,jsonb,text,bigint),public.equipment_image_save(text,uuid,jsonb,text,bigint) from public,anon,authenticated,service_role;
grant execute on function private.equipment_image_save(text,uuid,jsonb,text,bigint),public.equipment_image_save(text,uuid,jsonb,text,bigint) to authenticated;

-- The service can only claim DB-selected unreferenced files. The worker does
-- not accept file paths from an unauthenticated request.
create function private.equipment_media_worker(p_action text,p_run uuid,p_success boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run uuid; names jsonb; entry private.equipment_media_runs;
begin
 perform pg_advisory_xact_lock(786533);
 if p_action='claim' then
  if p_run is not null then
   select * into entry from private.equipment_media_runs where id=p_run for update;
   if not found or entry.claimed_at is not null or entry.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false);end if;
   run=p_run;update private.equipment_media_runs set claimed_at=clock_timestamp() where id=run;
  else
   insert into private.equipment_media_runs(claimed_at) values(clock_timestamp()) returning id into run;
  end if;
  update private.equipment_media_files set state='queued',changed_at=clock_timestamp(),run_id=null
   where (state='staged' and created_at<clock_timestamp()-interval '15 minutes'
    or state='deleting' and changed_at<clock_timestamp()-interval '15 minutes') and not private.equipment_media_referenced(name);
  with candidates as(select name from private.equipment_media_files where state='queued' and not private.equipment_media_referenced(name) order by changed_at limit 20 for update skip locked),
   claimed as(update private.equipment_media_files f set state='deleting',changed_at=clock_timestamp(),run_id=run from candidates c where f.name=c.name returning f.name)
   select coalesce(jsonb_agg(name),'[]') into names from claimed;
  return jsonb_build_object('ok',true,'run_id',run,'files',names);
 elsif p_action='finish' then
  update private.equipment_media_files set state=case when p_success then 'deleted' else 'queued' end,
   changed_at=clock_timestamp(),failures=failures+case when p_success then 0 else 1 end,run_id=null
   where run_id=p_run and state='deleting';
  return jsonb_build_object('ok',true,'pending',exists(select 1 from private.equipment_media_files where state in ('queued','deleting')));
 end if;
 return jsonb_build_object('ok',false);
end $$;
create function public.equipment_media_worker(p_action text,p_run uuid default null,p_success boolean default null) returns jsonb
language sql security invoker set search_path='' as $$select private.equipment_media_worker(p_action,p_run,p_success);$$;
revoke all on function private.equipment_media_worker(text,uuid,boolean),public.equipment_media_worker(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.equipment_media_worker(text,uuid,boolean),public.equipment_media_worker(text,uuid,boolean) to service_role;

create function private.equipment_media_tick() returns bigint
language plpgsql security definer set search_path='' as $$
declare ticket uuid;destination text;
begin
 delete from private.equipment_media_runs where created_at<clock_timestamp()-interval '1 day';
 if not exists(select 1 from private.equipment_media_files where state='queued' or state in ('staged','deleting') and changed_at<clock_timestamp()-interval '15 minutes') then return null;end if;
 insert into private.equipment_media_runs default values returning id into ticket;
 select worker_url into destination from private.equipment_media_settings where id;
 return net.http_post(url:=destination,body:=jsonb_build_object('action','cleanup','ticket',ticket),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000);
end $$;
revoke all on function private.equipment_media_tick() from public,anon,authenticated,service_role;

-- Hosted-only extensions. PGlite tests exercise all functions/policies above;
-- actual scheduling and HTTP/Storage deletion are verified on Supabase.
do $$begin
 if exists(select 1 from pg_available_extensions where name='pg_net') then
  create extension if not exists pg_net;
  revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
 end if;
 if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
  perform cron.schedule('ushe-equipment-image-cleanup','*/10 * * * *','select private.equipment_media_tick();');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
