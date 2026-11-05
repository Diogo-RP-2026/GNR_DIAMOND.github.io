-- Administrative SQL Editor only. Everything, including the audit test rows,
-- is ROLLED BACK. No existing account, Storage object or log is deleted.
-- SQL claims below are synthetic; the separate HTTP harness tests signed JWTs.
begin;
set local lock_timeout='5s';
do $test$
declare commander uuid=gen_random_uuid(); target uuid=gen_random_uuid(); agent uuid=gen_random_uuid();
 command_session uuid=gen_random_uuid(); target_session uuid=gen_random_uuid(); test_log uuid=gen_random_uuid();
 plan jsonb; outcome jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
  (commander,'sql-delete-test-'||commander::text||'@example.invalid','{"full_name":"Teste SQL Comando"}'),
  (target,'sql-delete-test-'||target::text||'@example.invalid','{"full_name":"Teste SQL Membro"}');
 update public.profiles set approved=true,role=case when id=commander then 'command'::public.ushe_role else 'member'::public.ushe_role end where id in (commander,target);
 insert into auth.sessions(id,user_id) values(command_session,commander),(target_session,target);
 insert into private.verified_sessions(session_id,user_id,expires_at) values(command_session,commander,clock_timestamp()+interval '10 minutes'),(target_session,target,clock_timestamp()+interval '10 minutes');
 insert into public.members(id,user_id,name,rank,uniform_number)
  values(agent,target,'Agente histórico de teste','Operacional',(select n from generate_series(1,999) n where not exists(select 1 from public.members where uniform_number=n) limit 1));
 insert into public.event_logs(id,event_type,starts_at,ends_at,location,summary,created_by)
  values(test_log,'Teste transacional',clock_timestamp(),clock_timestamp()+interval '1 hour','Teste','Teste de preservação do histórico',target);
 insert into public.event_log_participants(log_id,member_id) values(test_log,agent);
 perform set_config('request.jwt.claim.sub',target::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'session_id',target_session,'role','authenticated','exp',extract(epoch from clock_timestamp()+interval '10 minutes'))::text,true);
 if (public.account_admin('begin',commander)->>'reason') is distinct from 'forbidden' then raise exception 'Membro conseguiu eliminar';end if;
 perform set_config('request.jwt.claim.sub',commander::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',commander,'session_id',command_session,'role','authenticated','exp',extract(epoch from clock_timestamp()+interval '10 minutes'))::text,true);
 if (public.account_admin('begin',commander)->>'reason') is distinct from 'protected' then raise exception 'Comando sem proteção';end if;
 plan=public.account_admin('begin',target);
 if plan->>'status' is distinct from 'pending' or exists(select 1 from auth.sessions where user_id=target) then raise exception 'Sessão não revogada';end if;
 outcome=public.account_admin('finish',target,(plan->>'operation_id')::uuid);
 if outcome->>'status' is distinct from 'completed' then raise exception 'Eliminação não concluída';end if;
 if exists(select 1 from auth.users where id=target) or exists(select 1 from public.profiles where id=target) or exists(select 1 from public.members where id=agent) then raise exception 'Conta ou perfil ainda existem';end if;
 if not exists(select 1 from public.event_logs where id=test_log and created_by is null and created_by_name='Teste SQL Membro') then raise exception 'Histórico de autor perdido';end if;
 if not exists(select 1 from public.event_log_participants where log_id=test_log and member_id is null and member_snapshot->>'name'='Agente histórico de teste') then raise exception 'Participante histórico perdido';end if;
 if not exists(select 1 from private.admin_audit_log where target_id=target and actor_id=commander and result='succeeded') then raise exception 'Auditoria ausente';end if;
 if has_table_privilege('authenticated','private.admin_audit_log','DELETE') or has_table_privilege('service_role','private.admin_audit_log','DELETE') then raise exception 'Logs elimináveis pela aplicação';end if;
end $test$;
rollback;
select 'passed; all test data rolled back' as account_deletion_sql_test;
