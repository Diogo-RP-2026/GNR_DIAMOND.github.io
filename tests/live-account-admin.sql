-- Administrative SQL Editor only. Everything, including the audit test rows,
-- is ROLLED BACK. No existing account, Storage object or log is deleted.
-- SQL claims below are synthetic; the separate HTTP harness tests signed JWTs.
begin;
set local lock_timeout='5s';
do $test$
declare commander uuid=gen_random_uuid(); protected_command uuid=gen_random_uuid(); target uuid=gen_random_uuid(); agent uuid=gen_random_uuid();
 command_session uuid=gen_random_uuid(); target_session uuid=gen_random_uuid(); test_log uuid=gen_random_uuid();
 audit_id uuid; audit_before jsonb; plan jsonb; outcome jsonb;
 expiry numeric=extract(epoch from clock_timestamp()+interval '10 minutes');
begin
 insert into auth.users(id,email,raw_user_meta_data) values
  (commander,'sql-delete-test-'||commander::text||'@example.invalid','{"full_name":"Teste SQL Comando"}'),
  (protected_command,'sql-delete-test-'||protected_command::text||'@example.invalid','{"full_name":"Teste SQL Comando protegido"}'),
  (target,'sql-delete-test-'||target::text||'@example.invalid','{"full_name":"Teste SQL Membro"}');
 update public.profiles set approved=true,role=case when id=target then 'member'::public.ushe_role else 'command'::public.ushe_role end where id in (commander,protected_command,target);
 insert into auth.sessions(id,user_id) values(command_session,commander),(target_session,target);
 insert into private.user_verifications(user_id,verified_email,last_verified_at)
  select id,lower(email),clock_timestamp() from auth.users where id in (commander,target);
 insert into public.members(id,user_id,name,rank,uniform_number)
  values(agent,target,'Agente histórico de teste','Operacional',(select n from generate_series(1,999) n where not exists(select 1 from public.members where uniform_number=n) limit 1));
 insert into public.event_logs(id,event_type,starts_at,ends_at,location,summary,created_by)
  values(test_log,'Teste transacional',clock_timestamp(),clock_timestamp()+interval '1 hour','Teste','Teste de preservação do histórico',target);
 insert into public.event_log_participants(log_id,member_id) values(test_log,agent);
 insert into private.admin_audit_log(actor_name,action,entity,target_id,target_name,result)
  values('Sistema','account.profile.update','account',target,'Teste SQL Membro','succeeded') returning id into audit_id;
 select to_jsonb(l) into audit_before from private.admin_audit_log l where l.id=audit_id;
 perform set_config('request.jwt.claim.sub',target::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'session_id',target_session,'role','authenticated','exp',expiry)::text,true);
 execute 'set local role authenticated';
 if (public.account_admin('begin',commander)->>'reason') is distinct from 'forbidden' then raise exception 'Membro conseguiu eliminar';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',commander::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',commander,'session_id',command_session,'role','authenticated','exp',expiry)::text,true);
 execute 'set local role authenticated';
 if (public.account_admin('begin',protected_command)->>'reason') is distinct from 'protected' then raise exception 'Comando sem proteção';end if;
 begin
  perform public.set_user_access(protected_command,'member',true,'[]');
  raise exception 'Outro Comando conseguiu despromover a conta protegida';
 exception when insufficient_privilege then null;end;
 if public.admin_audit_hide(audit_id)->>'ok' is distinct from 'true' then raise exception 'Falhou a preparação do log oculto';end if;
 plan=public.account_admin('begin',target);
 execute 'reset role';
 if plan->>'status' is distinct from 'pending' or exists(select 1 from auth.sessions where user_id=target) then raise exception 'Sessão não revogada';end if;
 execute 'set local role authenticated';
 outcome=public.account_admin('finish',target,(plan->>'operation_id')::uuid);
 if outcome->>'status' is distinct from 'completed' then raise exception 'Eliminação não concluída';end if;
 if public.admin_audit_list(p_visibility=>'hidden',p_query=>audit_id::text)->'items'->0->>'id' is distinct from audit_id::text then
  raise exception 'Log oculto perdeu-se após eliminar a conta';end if;
 execute 'reset role';
 if exists(select 1 from auth.users where id=target) or exists(select 1 from public.profiles where id=target) or exists(select 1 from public.members where id=agent) then raise exception 'Conta ou perfil ainda existem';end if;
 if not exists(select 1 from public.event_logs where id=test_log and created_by is null and created_by_name='Teste SQL Membro') then raise exception 'Histórico de autor perdido';end if;
 if not exists(select 1 from public.event_log_participants where log_id=test_log and member_id is null and member_snapshot->>'name'='Agente histórico de teste') then raise exception 'Participante histórico perdido';end if;
 if not exists(select 1 from private.admin_audit_log where target_id=target and actor_id=commander and action='account.delete' and result='succeeded') then raise exception 'Auditoria ausente';end if;
 if (select to_jsonb(l) from private.admin_audit_log l where l.id=audit_id) is distinct from audit_before then raise exception 'Log original alterado';end if;
 if has_table_privilege('authenticated','private.admin_audit_log','DELETE') or has_table_privilege('service_role','private.admin_audit_log','DELETE') then raise exception 'Logs elimináveis pela aplicação';end if;
 perform set_config('request.jwt.claim.sub',target::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'session_id',target_session,'role','authenticated','exp',expiry)::text,true);
 execute 'set local role authenticated';
 if public.otp_session_verified() or exists(select 1 from public.profiles where id=target) then raise exception 'Sessão antiga continua autorizada';end if;
 execute 'reset role';
end $test$;
rollback;
select 'passed; all test data rolled back' as account_deletion_sql_test;
