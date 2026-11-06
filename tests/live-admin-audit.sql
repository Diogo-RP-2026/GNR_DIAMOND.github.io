-- Administrative SQL Editor only. All fixtures and audit entries are rolled back.
begin;
set local lock_timeout='5s';
do $test$
declare
 command_id uuid=gen_random_uuid(); member_id uuid=gen_random_uuid();
 command_session uuid=gen_random_uuid(); member_session uuid=gen_random_uuid();
 equipment_id uuid=gen_random_uuid(); fixture_log_id uuid;
 equipment_name text='[TESTE LOG] '||equipment_id::text;
 command_email text='sql-audit-'||command_id::text||'@example.invalid';
 member_email text='sql-audit-'||member_id::text||'@example.invalid';
 expiry numeric=extract(epoch from clock_timestamp()+interval '10 minutes');
 first_hide jsonb; second_hide jsonb; original jsonb; visible_page jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
  (command_id,command_email,'{"full_name":"Comando SQL de teste"}'),
  (member_id,member_email,'{"full_name":"Membro SQL de teste","role":"command"}');
 update public.profiles set role='command',approved=true where id=command_id;
 update public.profiles set approved=true where id=member_id;
 insert into auth.sessions(id,user_id) values(command_session,command_id),(member_session,member_id);
 insert into private.user_verifications(user_id,verified_email,last_verified_at) values
  (command_id,command_email,clock_timestamp()),(member_id,member_email,clock_timestamp());

 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated','session_id',member_session,'exp',expiry,'user_metadata','{"role":"command"}'::jsonb)::text,true);
 execute 'set local role authenticated';
 begin
  perform public.admin_audit_list();
  raise exception 'Member could read logs';
 exception when insufficient_privilege then null;end;
 begin
  perform public.admin_audit_hide(gen_random_uuid());
  raise exception 'Member could hide logs';
 exception when insufficient_privilege then null;end;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',command_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',command_id,'role','authenticated','session_id',command_session,'exp',expiry)::text,true);
 execute 'set local role authenticated';
 insert into public.equipment(id,name,category,notes) values(equipment_id,equipment_name,'Teste','SENSITIVE_SQL_FIXTURE');
 visible_page=public.admin_audit_list(p_query=>equipment_id::text,p_entity=>'equipment');
 if jsonb_array_length(visible_page->'items')<>1 or visible_page->'items'->0->>'action'<>'equipment.create'
  or visible_page->'items'->0->>'actor_name'<>'Comando SQL de teste' or visible_page::text like '%SENSITIVE_SQL_FIXTURE%' then
  raise exception 'Equipment write was not safely audited';
 end if;
 fixture_log_id=(visible_page->'items'->0->>'id')::uuid;
 begin
  delete from private.admin_audit_log where id=fixture_log_id;
  raise exception 'Comando could physically delete a log';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 select to_jsonb(l) into original from private.admin_audit_log l where l.id=fixture_log_id;

 execute 'set local role authenticated';
 first_hide=public.admin_audit_hide(fixture_log_id);
 second_hide=public.admin_audit_hide(fixture_log_id);
 if first_hide->>'ok' is distinct from 'true' or first_hide->>'already_hidden' is distinct from 'false'
  or second_hide->>'already_hidden' is distinct from 'true'
  or first_hide->>'hidden_at' is distinct from second_hide->>'hidden_at' then raise exception 'Hide was not idempotent';end if;
 if jsonb_array_length(public.admin_audit_list(p_query=>fixture_log_id::text,p_entity=>'equipment')->'items')<>0 then raise exception 'Hidden record in main view';end if;
 if public.admin_audit_list(p_visibility=>'hidden',p_query=>fixture_log_id::text)->'items'->0->>'hidden_by_name' is distinct from 'Comando SQL de teste' then
  raise exception 'Hidden record or actor missing';
 end if;
 delete from public.equipment where id=equipment_id and name=equipment_name;
 execute 'reset role';
 if (select to_jsonb(l) from private.admin_audit_log l where l.id=fixture_log_id) is distinct from original then raise exception 'Original event changed';end if;
 if (select count(*) from private.admin_audit_log where action='audit.hide' and target_id=fixture_log_id and actor_id=command_id)<>1 then raise exception 'Missing or duplicate hide event';end if;
 if not exists(select 1 from private.admin_audit_hidden h where h.log_id=fixture_log_id and h.hidden_by=command_id) then raise exception 'Hidden metadata lost';end if;
 if has_table_privilege('service_role','private.admin_audit_log','DELETE') or has_table_privilege('service_role','private.admin_audit_hidden','TRUNCATE') then
  raise exception 'Application service credentials can erase audit data';
 end if;

 update private.user_verifications set last_verified_at=clock_timestamp()-interval '721 hours' where user_id=command_id;
 execute 'set local role authenticated';
 begin
  perform public.admin_audit_list();
  raise exception 'Expired Comando could read logs';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
end $test$;
rollback;
select 'passed; all synthetic data rolled back' as admin_audit_test;
