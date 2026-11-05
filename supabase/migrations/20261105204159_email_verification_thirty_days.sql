begin;
set local lock_timeout='5s';

-- Authoritative per-account verification. Password login/refresh never writes it.
create table private.user_verifications(
 user_id uuid primary key references auth.users(id) on delete cascade,
 verified_email text not null,
 last_verified_at timestamptz not null check(isfinite(last_verified_at) and last_verified_at<=clock_timestamp()),
 source text not null default 'otp' check(source in ('otp','legacy_session'))
);
alter table private.user_verifications enable row level security;
revoke all on private.user_verifications from public,anon,authenticated,service_role;

-- The previous server grant always stored verification time + 24 hours.
-- Recover that server time, never account creation time or a browser date.
-- Implausible/future legacy values cannot silently grant a new period.
insert into private.user_verifications(user_id,verified_email,last_verified_at,source)
 select v.user_id,lower(btrim(u.email)),max(v.expires_at)-interval '24 hours','legacy_session'
 from private.verified_sessions v join auth.users u on u.id=v.user_id
 where isfinite(v.expires_at) and v.expires_at<=clock_timestamp()+interval '24 hours'
 and v.expires_at-interval '24 hours'>=u.created_at
 and coalesce(u.email,'')<>'' and not coalesce(u.is_anonymous,false)
 group by v.user_id,u.email;

alter table private.otp_challenges add column verified_at timestamptz,
 add column granted_at timestamptz,add column granted_session_id uuid,
 add column session_id uuid,add column verification_email text;
alter table private.otp_challenges drop constraint otp_challenges_operation_check,
 add constraint otp_challenges_operation_check check(operation in ('login','signup','recovery','renewal')),
 add constraint otp_renewal_session check(operation<>'renewal' or session_id is not null);

create function private.auth_session_active(p_user uuid,p_session uuid,p_exp numeric) returns boolean
language sql stable security invoker set search_path='' as $$
 select p_user is not null and p_session is not null and p_exp is not null
 and p_exp>extract(epoch from clock_timestamp()) and exists(
 select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_user
 and (s.not_after is null or s.not_after>clock_timestamp())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and not coalesce(u.is_anonymous,false));
$$;
revoke all on function private.auth_session_active(uuid,uuid,numeric) from public,anon,authenticated,service_role;

create function private.verification_state(p_user uuid,p_session uuid,p_exp numeric) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare record private.user_verifications; enabled boolean=coalesce(private.otp_enabled(),true);
 active boolean; fresh boolean; current_email text; expires timestamptz; server_time timestamptz=clock_timestamp(); why text;
begin
 active=coalesce(private.auth_session_active(p_user,p_session,p_exp),false);
 if not active then return jsonb_build_object('authenticated',false,'verified',false,'needs_verification',false,'reason','session','enabled',enabled,'verification_days',30,'server_now',server_time);end if;
 select * into record from private.user_verifications where user_id=p_user;
 select lower(btrim(email)) into current_email from auth.users where id=p_user;
 expires=record.last_verified_at+interval '720 hours';
 fresh=coalesce(record.verified_email=current_email and record.last_verified_at<=server_time and expires>server_time,false);
 why=case when record.user_id is null then 'initial' when record.verified_email is distinct from current_email then 'email_changed' when not fresh then 'expired' else null end;
 return jsonb_build_object('authenticated',true,'enabled',enabled,'verified',not enabled or fresh,
  'needs_verification',enabled and not fresh,'reason',case when enabled then why else null end,
  'last_verified_at',record.last_verified_at,'verification_expires_at',expires,'server_now',server_time,'verification_days',30);
end $$;
revoke all on function private.verification_state(uuid,uuid,numeric) from public,anon,authenticated,service_role;

create function private.verification_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb;
begin
 claims=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 return private.verification_state(auth.uid(),(claims->>'session_id')::uuid,(claims->>'exp')::numeric);
exception when invalid_text_representation or numeric_value_out_of_range then
 return jsonb_build_object('authenticated',false,'verified',false,'needs_verification',false,'reason','session');
end $$;
create function public.verification_status() returns jsonb
language sql stable security invoker set search_path='' as $$select private.verification_status();$$;
revoke all on function private.verification_status(),public.verification_status() from public,anon,authenticated,service_role;
grant execute on function private.verification_status(),public.verification_status() to authenticated;

create or replace function private.otp_session_verified() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((private.verification_status()->>'verified')::boolean,false);
$$;

create or replace function public.otp_policy() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('enabled',private.otp_enabled(),'verification_days',30,'verification_version',2);
$$;

CREATE OR REPLACE FUNCTION private.otp_service(action text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.otp_challenges; lim private.otp_limits; n integer; uid uuid; sid uuid; requested_at timestamptz; verified_email text; granted_time timestamptz;
begin
 if action='session_status' then
  return private.verification_state((args->>'user_id')::uuid,(args->>'session_id')::uuid,(args->>'jwt_exp')::numeric)||jsonb_build_object('ok',true);
 elsif action='request_limit' then
  -- Fixed policy: start and resend share one HMAC email key. Rejected requests
  -- do not move the deadline; existing 15-minute/upload counters stay unchanged.
  if coalesce(args->>'key','') !~ '^[a-f0-9]{64}$' then
   return jsonb_build_object('ok',false,'error','invalid');end if;
  insert into private.otp_limits(key,count) values('otp-request-v2:'||(args->>'key'),0) on conflict(key) do nothing;
  select * into lim from private.otp_limits where key='otp-request-v2:'||(args->>'key') for update;
  requested_at=clock_timestamp();
  if lim.count>=5 and lim.started_at+interval '2 minutes'>requested_at then
   return jsonb_build_object('ok',false,'error','rate_limit','retry_after',ceil(extract(epoch from lim.started_at+interval '2 minutes'-requested_at))::integer);
  end if;
  n=case when lim.count>=5 then 1 else lim.count+1 end;
  update private.otp_limits set count=n,started_at=case when n in (1,5) then requested_at else lim.started_at end where key=lim.key;
  return jsonb_build_object('ok',true,'retry_after',case when n=5 then 120 else 0 end);
 elsif action='limit' then
  insert into private.otp_limits(key) values(args->>'key') on conflict(key) do update
   set count=case when private.otp_limits.started_at<clock_timestamp()-interval '15 minutes' then 1 else private.otp_limits.count+1 end,
       started_at=case when private.otp_limits.started_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else private.otp_limits.started_at end
   returning * into lim;
  return jsonb_build_object('ok',lim.count<=(args->>'max')::integer);
 elsif action='issue' then
  uid=(args->>'user_id')::uuid;sid=(args->>'session_id')::uuid;
  if args->>'operation'='renewal' and not coalesce(private.auth_session_active(uid,sid,(args->>'jwt_exp')::numeric),false) then return jsonb_build_object('ok',false,'error','session');end if;
  if uid is not null then
  perform 1 from auth.users where id=uid for update;
  if not found then return jsonb_build_object('ok',false,'error','session');end if;end if;
  update private.otp_challenges set consumed=true,payload='',code_hash='' where user_id=uid and operation=args->>'operation';
  insert into private.otp_challenges(id,user_id,operation,code_hash,proof_hash,payload,session_id,verification_email)
   values((args->>'id')::uuid,uid,args->>'operation',args->>'code_hash',args->>'proof_hash',args->>'payload',sid,lower(btrim(args->>'verification_email')));
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
   update private.otp_challenges set consumed=true,code_hash='',payload='',verified_at=clock_timestamp() where id=c.id;
  elsif action='resend' then
   if c.created_at<clock_timestamp()-interval '15 minutes' then
    return jsonb_build_object('ok',false,'error','expired');end if;
   if c.code_hash=args->>'code_hash' then return jsonb_build_object('ok',false,'error','collision');end if;
   update private.otp_challenges set code_hash=args->>'code_hash',sent_at=clock_timestamp(),expires_at=clock_timestamp()+interval '5 minutes',resends=resends+1 where id=c.id;
  end if;
  return jsonb_build_object('ok',true,'payload',c.payload,'user_id',c.user_id,'operation',c.operation,'code_hash',case when action='lookup' then c.code_hash else null end);
 elsif action='grant' then
  uid=(args->>'user_id')::uuid;sid=(args->>'session_id')::uuid;
  if not coalesce(private.auth_session_active(uid,sid,(args->>'jwt_exp')::numeric),false) then return jsonb_build_object('ok',false,'error','session');end if;
  select * into c from private.otp_challenges where id=(args->>'challenge_id')::uuid for update;
  if not found or c.user_id is distinct from uid or c.proof_hash is distinct from args->>'proof_hash'
   or not c.consumed or c.verified_at is null or c.verified_at<clock_timestamp()-interval '5 minutes'
   or (c.session_id is not null and c.session_id<>sid) then return jsonb_build_object('ok',false,'error','session');end if;
  select lower(btrim(email)) into verified_email from auth.users where id=uid;
  if coalesce(verified_email,'')='' or lower(btrim(args->>'verified_email')) is distinct from verified_email
   or (c.verification_email is not null and c.verification_email<>verified_email) then return jsonb_build_object('ok',false,'error','session');end if;
  if c.granted_at is not null then
   if c.granted_session_id is distinct from sid then return jsonb_build_object('ok',false,'error','used');end if;
   return private.verification_state(uid,sid,(args->>'jwt_exp')::numeric)||jsonb_build_object('ok',true,'already_granted',true);
  end if;
  granted_time=clock_timestamp();
  insert into private.user_verifications(user_id,verified_email,last_verified_at,source) values(uid,verified_email,granted_time,'otp')
   on conflict(user_id) do update set verified_email=excluded.verified_email,last_verified_at=excluded.last_verified_at,source='otp';
  update private.otp_challenges set granted_at=granted_time,granted_session_id=sid where id=c.id;
  -- Compatibility record only; the per-account timestamp above controls access.
  insert into private.verified_sessions(session_id,user_id,expires_at) values(sid,uid,granted_time+interval '24 hours')
   on conflict(session_id) do update set expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true,'last_verified_at',granted_time,'verification_expires_at',granted_time+interval '720 hours');
 elsif action='cleanup' then
  delete from private.otp_challenges where created_at<clock_timestamp()-interval '1 day';
  delete from private.otp_limits where started_at<clock_timestamp()-interval '1 day';
  delete from private.verified_sessions where expires_at<clock_timestamp();
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','action');
end $function$;


notify pgrst,'reload schema';
commit;
