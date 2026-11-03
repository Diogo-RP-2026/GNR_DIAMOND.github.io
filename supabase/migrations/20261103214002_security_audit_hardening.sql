begin;
-- Decoy challenges use the same lifecycle, so resends cannot enumerate accounts.
alter table private.otp_challenges alter column user_id drop not null;
alter table private.otp_challenges add constraint otp_decoy_operation check(user_id is not null or operation in ('signup','recovery'));
-- Liveness is required even if the administrator temporarily disables OTP.
create or replace function private.otp_session_verified() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb; sid uuid; uid uuid; token_exp numeric;
begin
 uid=auth.uid();
 claims=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 sid=(claims->>'session_id')::uuid; token_exp=(claims->>'exp')::numeric;
 if uid is null or sid is null or token_exp is null or token_exp<=extract(epoch from now()) then return false;end if;
 if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now())
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
  and not coalesce(u.is_anonymous,false)) then return false;end if;
 return coalesce(not private.otp_enabled(),false) or exists(select 1 from private.verified_sessions v
  where v.user_id=uid and v.session_id=sid and v.expires_at>now());
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
CREATE OR REPLACE FUNCTION private.otp_service(action text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.otp_challenges; lim private.otp_limits; n integer; uid uuid; sid uuid;
begin
 if action='limit' then
  insert into private.otp_limits(key) values(args->>'key') on conflict(key) do update
   set count=case when private.otp_limits.started_at<clock_timestamp()-interval '15 minutes' then 1 else private.otp_limits.count+1 end,
       started_at=case when private.otp_limits.started_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else private.otp_limits.started_at end
   returning * into lim;
  return jsonb_build_object('ok',lim.count<=(args->>'max')::integer);
 elsif action='issue' then
  uid=(args->>'user_id')::uuid;
  if uid is not null then
  perform 1 from auth.users where id=uid for update;
  if not found then return jsonb_build_object('ok',false,'error','session');end if;end if;
  if exists(select 1 from private.otp_challenges where user_id=uid and created_at>clock_timestamp()-interval '60 seconds') then
   return jsonb_build_object('ok',false,'error','rate_limit'); end if;
  update private.otp_challenges set consumed=true,payload='',code_hash='' where user_id=uid and operation=args->>'operation';
  insert into private.otp_challenges(id,user_id,operation,code_hash,proof_hash,payload)
   values((args->>'id')::uuid,uid,args->>'operation',args->>'code_hash',args->>'proof_hash',args->>'payload');
  return jsonb_build_object('ok',true);
 elsif action in ('lookup','verify','resend','cancel') then
  select * into c from private.otp_challenges where id=(args->>'id')::uuid for update;
  if not found or c.proof_hash<>args->>'proof_hash' then return jsonb_build_object('ok',false,'error','invalid'); end if;
  if c.consumed then return jsonb_build_object('ok',false,'error','used'); end if;
  if action='cancel' then update private.otp_challenges set consumed=true,payload='',code_hash='' where id=c.id;return jsonb_build_object('ok',true);end if;
  if c.attempts>=5 then return jsonb_build_object('ok',false,'error','attempts'); end if;
  if action='verify' then
   if c.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','expired');end if;
   -- Contadores persistem mesmo no erro (não usar RAISE, que reverteria a tentativa).
   update private.otp_challenges set attempts=attempts+1 where id=c.id;
   if c.code_hash<>args->>'code_hash' then return jsonb_build_object('ok',false,'error',case when c.attempts>=4 then 'attempts' else 'invalid' end);end if;
   update private.otp_challenges set consumed=true,code_hash='',payload='' where id=c.id;
  elsif action='resend' then
   if c.sent_at>clock_timestamp()-interval '60 seconds' or c.resends>=3 or c.created_at<clock_timestamp()-interval '15 minutes' then
    return jsonb_build_object('ok',false,'error','rate_limit');end if;
   if c.code_hash=args->>'code_hash' then return jsonb_build_object('ok',false,'error','collision');end if;
   update private.otp_challenges set code_hash=args->>'code_hash',sent_at=clock_timestamp(),expires_at=clock_timestamp()+interval '5 minutes',resends=resends+1 where id=c.id;
  end if;
  return jsonb_build_object('ok',true,'payload',c.payload,'user_id',c.user_id,'operation',c.operation,'code_hash',case when action='lookup' then c.code_hash else null end);
 elsif action='grant' then
  uid=(args->>'user_id')::uuid;sid=(args->>'session_id')::uuid;
  if not exists(select 1 from auth.sessions where id=sid and user_id=uid and (not_after is null or not_after>clock_timestamp())) or not exists(select 1 from auth.users where id=uid and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp())) then return jsonb_build_object('ok',false,'error','session');end if;
  insert into private.verified_sessions(session_id,user_id) values(sid,uid) on conflict(session_id) do update set expires_at=clock_timestamp()+interval '24 hours';
  return jsonb_build_object('ok',true);
 elsif action='cleanup' then
  delete from private.otp_challenges where created_at<clock_timestamp()-interval '1 day';
  delete from private.otp_limits where started_at<clock_timestamp()-interval '1 day';
  delete from private.verified_sessions where expires_at<clock_timestamp();
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','action');
end $function$;
CREATE OR REPLACE FUNCTION private.set_user_access(p_user uuid, p_role ushe_role, p_approved boolean, p_tabs jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb;
begin
  perform pg_advisory_xact_lock(786533);
  if not private.is_command() then raise exception 'Só o Comando pode gerir acessos.' using errcode='42501'; end if;
  if p_user=(select auth.uid()) and (p_role<>'command' or not p_approved) then raise exception 'Não pode retirar o próprio acesso de Comando.'; end if;
  if p_role is null or p_approved is null or p_tabs is null or jsonb_typeof(p_tabs)<>'array' then raise exception 'Permissões inválidas.'; end if;
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Utilizador inexistente.'; end if;
  if (p_role<>'command' or not p_approved) and exists(select 1 from public.profiles where id=p_user and role='command' and approved)
    and (select count(*) from public.profiles where role='command' and approved)<=1 then raise exception 'É obrigatório manter um Comando aprovado.'; end if;
  if jsonb_array_length(p_tabs)>9 then raise exception 'Permissões inválidas.';end if;
  update public.profiles set role=p_role,approved=p_approved where id=p_user;
  delete from public.tab_permissions where user_id=p_user;
  for item in select * from jsonb_array_elements(p_tabs) loop
    insert into public.tab_permissions(user_id,tab,can_create) values(p_user,(item->>'tab')::public.ushe_tab,coalesce((item->>'can_create')::boolean,false));
  end loop;
end; $function$;
-- A fixed server-side quota; callers cannot choose the identity, key or maximum.
create function private.reserve_portal_upload(p_tab text) returns boolean
language plpgsql security definer set search_path='' as $$
declare decision jsonb;
begin
 if not private.profile_session_allowed() then return false;end if;
 if p_tab is null then
  if not exists(select 1 from public.members where user_id=auth.uid()) then return false;end if;
 elsif p_tab not in ('equipa','fardamento','equipamento') or not private.is_command() then return false;
 end if;
 decision=private.otp_service('limit',jsonb_build_object('key','upload:'||auth.uid()::text,'max',20));
 return coalesce((decision->>'ok')::boolean,false);
end $$;
create function public.reserve_portal_upload(p_tab text default null) returns boolean
language sql security invoker set search_path='' as $$select private.reserve_portal_upload(p_tab);$$;
revoke all on function private.reserve_portal_upload(text),public.reserve_portal_upload(text) from public,anon,authenticated;
grant execute on function private.reserve_portal_upload(text),public.reserve_portal_upload(text) to authenticated;
-- Only the validated Edge Function writes media; existing reads/deletes are preserved.
drop policy if exists ushe_media_insert on storage.objects;
drop policy if exists ushe_media_update on storage.objects;
alter table public.events add constraint audit_events_bounds check (isfinite(starts_at) and isfinite(ends_at)) not valid;
alter table public.event_logs add constraint audit_event_logs_bounds check (isfinite(starts_at) and isfinite(ends_at) and length(observations)<=12000) not valid;
alter table public.warnings add constraint audit_warnings_bounds check (isfinite(issued_on) and length(signature)<=300) not valid;
alter table public.uniforms add constraint audit_uniforms_bounds check (length(notes)<=12000 and pg_column_size(pieces)<=16000 and sort_order between -100000 and 100000 and (image_path is null or (length(image_path)<=200 and image_path ~ '^fardamento/[a-zA-Z0-9._-]+$'))) not valid;
alter table public.equipment add constraint audit_equipment_bounds check (length(notes)<=12000 and sort_order between -100000 and 100000 and (image_path is null or (length(image_path)<=200 and image_path ~ '^equipamento/[a-zA-Z0-9._-]+$'))) not valid;
alter table public.members add constraint audit_members_bounds check ((joined_on is null or isfinite(joined_on)) and (image_path is null or (length(image_path)<=200 and image_path ~ '^equipa/[a-zA-Z0-9._-]+$'))) not valid;
alter table public.announcements add constraint audit_announcements_bounds check (length(author_name) between 1 and 100) not valid;
alter table public.contact_info add constraint audit_contact_info_bounds check (length(hero_title) between 1 and 180 and length(hero_intro)<=12000 and length(recruitment)<=12000 and length(contact_text)<=12000 and length(motto)<=200 and (discord_url='' or discord_url ~ '^https://(discord[.]gg/|discord[.]com/invite/)[a-zA-Z0-9-]+/?$')) not valid;
alter table public.institutional_content add constraint audit_institutional_content_bounds check (length(title) between 1 and 180 and length(body)<=12000 and length(mission)<=12000 and length(values_text)<=12000) not valid;
alter table public.agent_qualifications add constraint audit_agent_qualifications_bounds check (isfinite(completed_on)) not valid;
alter table public.agent_distinctions add constraint audit_agent_distinctions_bounds check (isfinite(awarded_on)) not valid;
-- NOT VALID preserves older rows; checks apply immediately to all new/changed rows.
alter table public.events validate constraint audit_events_bounds;
alter table public.event_logs validate constraint audit_event_logs_bounds;
alter table public.warnings validate constraint audit_warnings_bounds;
alter table public.uniforms validate constraint audit_uniforms_bounds;
alter table public.equipment validate constraint audit_equipment_bounds;
alter table public.members validate constraint audit_members_bounds;
alter table public.announcements validate constraint audit_announcements_bounds;
alter table public.contact_info validate constraint audit_contact_info_bounds;
alter table public.institutional_content validate constraint audit_institutional_content_bounds;
alter table public.agent_qualifications validate constraint audit_agent_qualifications_bounds;
alter table public.agent_distinctions validate constraint audit_agent_distinctions_bounds;
notify pgrst,'reload schema';
commit;
