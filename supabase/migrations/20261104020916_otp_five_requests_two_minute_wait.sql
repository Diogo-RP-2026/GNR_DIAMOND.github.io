begin;
-- Supersedes the per-send 60-second wait. Service-only RPC privileges are preserved.
CREATE OR REPLACE FUNCTION private.otp_service(action text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.otp_challenges; lim private.otp_limits; n integer; uid uuid; sid uuid; requested_at timestamptz;
begin
 if action='request_limit' then
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
  uid=(args->>'user_id')::uuid;
  if uid is not null then
  perform 1 from auth.users where id=uid for update;
  if not found then return jsonb_build_object('ok',false,'error','session');end if;end if;
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
   if c.created_at<clock_timestamp()-interval '15 minutes' then
    return jsonb_build_object('ok',false,'error','expired');end if;
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
notify pgrst,'reload schema';
commit;
