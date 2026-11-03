-- Administrative QA: isolated synthetic identities; every row rolls back. No email delivery.
begin;
select set_config('ushe.qa.a',gen_random_uuid()::text,true);
select set_config('ushe.qa.b',gen_random_uuid()::text,true);
select set_config('ushe.qa.c',gen_random_uuid()::text,true);
select set_config('ushe.qa.sid',gen_random_uuid()::text,true);
select set_config('ushe.qa.challenge',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
 select current_setting('ushe.qa.'||k)::uuid,'audit-'||current_setting('ushe.qa.'||k)||'@example.invalid',jsonb_build_object('full_name','Audit '||k,'role','command','approved',true) from unnest(array['a','b','c'])k;
-- This must still be false/member despite attacker-controlled metadata.
do $$begin
 if exists(select 1 from public.profiles where id in(current_setting('ushe.qa.a')::uuid,current_setting('ushe.qa.b')::uuid,current_setting('ushe.qa.c')::uuid) and (approved or role<>'member')) then raise exception 'Metadata escalation';end if;
end$$;
update public.profiles set approved=true,role=case when id=current_setting('ushe.qa.a')::uuid then 'command'::public.ushe_role else 'member'::public.ushe_role end where id in(current_setting('ushe.qa.a')::uuid,current_setting('ushe.qa.b')::uuid,current_setting('ushe.qa.c')::uuid);
insert into public.tab_permissions(user_id,tab) values(current_setting('ushe.qa.b')::uuid,'eventos'),(current_setting('ushe.qa.c')::uuid,'eventos');
insert into auth.sessions(id,user_id,created_at,updated_at) values(current_setting('ushe.qa.sid')::uuid,current_setting('ushe.qa.b')::uuid,now(),now());
select set_config('request.jwt.claim.sub',current_setting('ushe.qa.b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ushe.qa.b'),'session_id',current_setting('ushe.qa.sid'),'role','authenticated','exp',extract(epoch from now()+interval '1 hour'))::text,true);
set local role authenticated;
do $$begin
 if public.otp_session_verified() or exists(select 1 from public.events) or exists(select 1 from public.profiles) then raise exception 'OTP bypass';end if;
 if has_function_privilege('authenticated','public.otp_service(text,jsonb)','execute') or has_table_privilege('authenticated','private.otp_challenges','select') then raise exception 'Service privilege exposed';end if;
end$$;
reset role;
-- Only service-side code can grant verification, after Auth validates identity.
select public.otp_service('grant',jsonb_build_object('user_id',current_setting('ushe.qa.b'),'session_id',current_setting('ushe.qa.sid')));
set local role authenticated;
do $$declare ev uuid;n integer;begin
 if not public.otp_session_verified() then raise exception 'Valid verified session denied';end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Profile IDOR';end if;
 begin perform public.set_user_access(current_setting('ushe.qa.b')::uuid,'command',true,'[]');raise exception 'Role escalation succeeded';exception when insufficient_privilege then null;end;
 begin delete from public.profiles;raise exception 'Account delete allowed';exception when insufficient_privilege then null;end;
 insert into public.events(title,description,starts_at,ends_at,location) values('Audit temporary event','Temporary',now(),now()+interval '1 hour','QA') returning id into ev;
 insert into public.event_responses(event_id,user_id,attending) values(ev,current_setting('ushe.qa.b')::uuid,true);
 update public.event_responses set attending=false where event_id=ev;
 begin insert into public.event_responses(event_id,user_id,attending) values(ev,current_setting('ushe.qa.c')::uuid,true);raise exception 'Vote IDOR';exception when insufficient_privilege then null;end;
 begin insert into public.events(title,starts_at,ends_at,location) values('Audit invalid','-infinity','infinity','QA');raise exception 'Infinite dates allowed';exception when check_violation then null;end;
 begin insert into storage.objects(bucket_id,name) values('ushe-avatars',current_setting('ushe.qa.b')||'/direct.png');raise exception 'Direct avatar allowed';exception when insufficient_privilege then null;end;
 if public.reserve_portal_upload('equipa') then raise exception 'Agent official upload allowed';end if;
end$$;
reset role;
-- A separate synthetic Comando session can manage access without bypassing self-protection.
select set_config('ushe.qa.asid',gen_random_uuid()::text,true);
insert into auth.sessions(id,user_id,created_at,updated_at) values(current_setting('ushe.qa.asid')::uuid,current_setting('ushe.qa.a')::uuid,now(),now());
select public.otp_service('grant',jsonb_build_object('user_id',current_setting('ushe.qa.a'),'session_id',current_setting('ushe.qa.asid')));
select set_config('request.jwt.claim.sub',current_setting('ushe.qa.a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ushe.qa.a'),'session_id',current_setting('ushe.qa.asid'),'role','authenticated','exp',extract(epoch from now()+interval '1 hour'))::text,true);
set local role authenticated;
do $$begin
 perform public.set_user_access(current_setting('ushe.qa.b')::uuid,'member',true,'[{"tab":"eventos"}]');
 begin perform public.set_user_access(current_setting('ushe.qa.a')::uuid,'member',true,'[]');raise exception 'Self-demotion accepted';exception when raise_exception then if sqlerrm not like '%próprio acesso%' then raise;end if;end;
 update public.events set title='Audit event edited by Comando' where created_by=current_setting('ushe.qa.b')::uuid;
 if not found then raise exception 'Comando event update rejected';end if;
 if not public.reserve_portal_upload('equipa') then raise exception 'Comando upload quota rejected';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('ushe.qa.b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ushe.qa.b'),'session_id',current_setting('ushe.qa.sid'),'role','authenticated','exp',extract(epoch from now()+interval '1 hour'))::text,true);
-- not_after, bans and revocation must cut off the same verified session immediately.
update auth.sessions set not_after=now()-interval '1 second' where id=current_setting('ushe.qa.sid')::uuid;
set local role authenticated;
do $$begin if public.otp_session_verified() or exists(select 1 from public.events) then raise exception 'Expired session allowed';end if;end$$;
reset role;
update auth.sessions set not_after=null where id=current_setting('ushe.qa.sid')::uuid;
update auth.users set banned_until=now()+interval '1 hour' where id=current_setting('ushe.qa.b')::uuid;
set local role authenticated;
do $$begin if public.otp_session_verified() then raise exception 'Banned user allowed';end if;end$$;
reset role;
update auth.users set banned_until=null where id=current_setting('ushe.qa.b')::uuid;
delete from auth.sessions where id=current_setting('ushe.qa.sid')::uuid;
set local role authenticated;
do $$begin if public.otp_session_verified() then raise exception 'Revoked session allowed';end if;end$$;
reset role;
do $$declare args jsonb;r jsonb;begin
 args=jsonb_build_object('id',current_setting('ushe.qa.challenge'),'user_id',current_setting('ushe.qa.b'),'operation','login','code_hash','test-hash','proof_hash','test-proof','payload','test-encrypted-fixture');
 r=public.otp_service('issue',args);if not (r->>'ok')::boolean then raise exception 'Issue failed';end if;
 args=jsonb_build_object('id',current_setting('ushe.qa.challenge'),'proof_hash','test-proof','code_hash','wrong');
 r=public.otp_service('verify',args);if r->>'error'<>'invalid' then raise exception 'Invalid accepted';end if;
 args=args||'{"code_hash":"test-hash"}';
 r=public.otp_service('verify',args);if not (r->>'ok')::boolean then raise exception 'Valid rejected';end if;
 r=public.otp_service('verify',args);if r->>'error'<>'used' then raise exception 'Replay accepted';end if;
end$$;
select 'PASS: temporary identities, OTP gate, IDOR, votes, roles, uploads, not_after, bans, revocation and replay; all changes rolled back' as audit_result;
rollback;
