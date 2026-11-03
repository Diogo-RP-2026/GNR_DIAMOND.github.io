begin;
-- Desligado até configurar e testar o envio real. Nunca ativar apenas no frontend.
create table if not exists private.otp_settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into private.otp_settings(id,enabled) values(true,false) on conflict do nothing;
create table if not exists private.otp_challenges(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 operation text not null check(operation in ('login','signup','recovery')),
 code_hash text not null,proof_hash text not null,payload text not null,
 created_at timestamptz not null default clock_timestamp(),sent_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 attempts integer not null default 0,resends integer not null default 0,consumed boolean not null default false
);
create index if not exists otp_user_operation on private.otp_challenges(user_id,operation,created_at);
create index if not exists otp_challenges_cleanup on private.otp_challenges(created_at);
create table if not exists private.otp_limits(key text primary key,started_at timestamptz not null default clock_timestamp(),count integer not null default 1);
create table if not exists private.verified_sessions(session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,expires_at timestamptz not null default clock_timestamp()+interval '24 hours');
create index if not exists otp_limits_cleanup on private.otp_limits(started_at);
create index if not exists verified_sessions_cleanup on private.verified_sessions(expires_at);
alter table private.otp_challenges enable row level security;
alter table private.otp_limits enable row level security;
alter table private.verified_sessions enable row level security;
alter table private.otp_settings enable row level security;
revoke all on private.otp_challenges,private.otp_limits,private.verified_sessions,private.otp_settings from public,anon,authenticated,service_role;

create or replace function private.otp_enabled() returns boolean language sql stable security definer set search_path='' as $$ select enabled from private.otp_settings where id; $$;
-- Evita ambiguidades de cast: session_id vem exclusivamente do JWT validado pelo gateway.
create or replace function private.otp_session_verified() returns boolean language sql stable security definer set search_path='' as $$
 select not private.otp_enabled() or exists(select 1 from private.verified_sessions v
 where v.user_id=(select auth.uid()) and v.session_id=((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'session_id')::uuid
 and v.expires_at>now() and exists(select 1 from auth.sessions s where s.id=v.session_id and s.user_id=v.user_id));
$$;
create or replace function public.otp_policy() returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object('enabled',private.otp_enabled()); $$;
create or replace function public.otp_session_verified() returns boolean language sql stable security invoker set search_path='' as $$ select private.otp_session_verified(); $$;
revoke all on function private.otp_enabled(),private.otp_session_verified(),public.otp_policy(),public.otp_session_verified() from public,anon,authenticated;
grant execute on function private.otp_enabled(),public.otp_policy() to anon,authenticated,service_role;
grant execute on function private.otp_session_verified(),public.otp_session_verified() to authenticated,service_role;

-- Estas RPCs só são executáveis pelo serviço da Edge Function, nunca por um JWT de utilizador.
create or replace function private.otp_service(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  perform 1 from public.profiles where id=uid for update;
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
  if not exists(select 1 from auth.sessions where id=sid and user_id=uid) then return jsonb_build_object('ok',false,'error','session');end if;
  insert into private.verified_sessions(session_id,user_id) values(sid,uid) on conflict(session_id) do update set expires_at=clock_timestamp()+interval '24 hours';
  return jsonb_build_object('ok',true);
 elsif action='cleanup' then
  delete from private.otp_challenges where created_at<clock_timestamp()-interval '1 day';
  delete from private.otp_limits where started_at<clock_timestamp()-interval '1 day';
  delete from private.verified_sessions where expires_at<clock_timestamp();
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','action');
end $$;
create or replace function public.otp_service(action text,args jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.otp_service(action,args); $$;
revoke all on function private.otp_service(text,jsonb),public.otp_service(text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.otp_service(text,jsonb),public.otp_service(text,jsonb) to service_role;

-- Defesa no backend contra login direto ao Auth sem concluir os quatro dígitos.
create or replace function private.is_command() returns boolean language sql stable security definer set search_path='' as $$
 select private.otp_session_verified() and exists(select 1 from public.profiles where id=(select auth.uid()) and approved and role='command'); $$;
create or replace function private.has_tab(p_tab public.ushe_tab) returns boolean language sql stable security definer set search_path='' as $$
 select private.otp_session_verified() and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved
 and (p.role='command' or exists(select 1 from public.tab_permissions t where t.user_id=p.id and t.tab=p_tab))); $$;
do $$ declare t text;begin
 foreach t in array array['profiles','tab_permissions','members','announcements','announcement_responses','events','event_responses','warnings','warning_members','uniforms','equipment','regulations','event_logs','event_log_participants','institutional_content'] loop
  execute format('drop policy if exists otp_verified_session on public.%I',t);
  execute format('create policy otp_verified_session on public.%I as restrictive for all to authenticated using ((select private.otp_session_verified())) with check ((select private.otp_session_verified()))',t);
 end loop;
end $$;
drop policy if exists otp_verified_media on storage.objects;
create policy otp_verified_media on storage.objects as restrictive for all to authenticated
using(bucket_id<>'ushe-media' or (select private.otp_session_verified())) with check(bucket_id<>'ushe-media' or (select private.otp_session_verified()));
notify pgrst,'reload schema';
commit;
