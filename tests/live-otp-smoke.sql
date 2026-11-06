-- Executar apenas no SQL Editor administrativo. Usa uma conta sintética e
-- desafios de teste sem envio de email. Tudo é revertido por ROLLBACK.
begin;
set local lock_timeout='5s';
select set_config('ushe.qa.uid',gen_random_uuid()::text,true);
select set_config('ushe.qa.sid',gen_random_uuid()::text,true);
select set_config('ushe.qa.cid',gen_random_uuid()::text,true);
select set_config('ushe.qa.email','sql-otp-'||current_setting('ushe.qa.uid')||'@example.invalid',true);
select set_config('ushe.qa.exp',extract(epoch from clock_timestamp()+interval '10 minutes')::text,true);
insert into auth.users(id,email,raw_user_meta_data)
 values(current_setting('ushe.qa.uid')::uuid,current_setting('ushe.qa.email'),'{"full_name":"Teste SQL OTP"}');
update public.profiles set approved=true,role='command' where id=current_setting('ushe.qa.uid')::uuid;
insert into auth.sessions(id,user_id,created_at,updated_at)
values(current_setting('ushe.qa.sid')::uuid,current_setting('ushe.qa.uid')::uuid,now(),now());
select set_config('request.jwt.claim.sub',current_setting('ushe.qa.uid'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ushe.qa.uid'),'session_id',current_setting('ushe.qa.sid'),'role','authenticated','exp',current_setting('ushe.qa.exp')::numeric)::text,true);
set local role authenticated;
do $$ begin
 if public.otp_session_verified() then raise exception 'Sessão não verificada foi aceite';end if;
 if exists(select 1 from public.profiles) or exists(select 1 from public.events) then raise exception 'RLS permitiu dados antes do código';end if;
 if has_function_privilege('authenticated','public.otp_service(text,jsonb)','execute') then raise exception 'RPC de serviço exposta';end if;
 if has_table_privilege('authenticated','private.otp_challenges','select') then raise exception 'Desafios expostos';end if;
end $$;
reset role;
set local role service_role;
do $$ declare response jsonb;args jsonb;grant_args jsonb;
begin
 args=jsonb_build_object('id',current_setting('ushe.qa.cid'),'user_id',current_setting('ushe.qa.uid'),'operation','login',
  'session_id',current_setting('ushe.qa.sid'),'jwt_exp',current_setting('ushe.qa.exp')::numeric,'verification_email',current_setting('ushe.qa.email'),
  'code_hash','qa-hash-one','proof_hash','qa-proof','payload','qa-encrypted-fixture');
 response=public.otp_service('issue',args);
 if not(response->>'ok')::boolean then raise exception 'Falhou issue: %',response->>'error';end if;
 grant_args=jsonb_build_object('challenge_id',current_setting('ushe.qa.cid'),'session_id',current_setting('ushe.qa.sid'),
  'user_id',current_setting('ushe.qa.uid'),'jwt_exp',current_setting('ushe.qa.exp')::numeric,
  'verified_email',current_setting('ushe.qa.email'),'proof_hash','qa-proof');
 if (public.otp_service('grant',grant_args)->>'ok')::boolean then raise exception 'Desafio não confirmado concedeu acesso';end if;
 args=jsonb_build_object('id',current_setting('ushe.qa.cid'),'proof_hash','qa-proof','code_hash','qa-wrong');
 response=public.otp_service('verify',args);
 if response->>'error'<>'invalid' then raise exception 'Código incorreto foi aceite';end if;
 args=args||jsonb_build_object('code_hash','qa-hash-one');
 response=public.otp_service('verify',args);
 if not(response->>'ok')::boolean then raise exception 'Código correto foi recusado';end if;
 response=public.otp_service('verify',args);
 if response->>'error'<>'used' then raise exception 'Código reutilizado foi aceite';end if;
 response=public.otp_service('grant',grant_args);
 if not(response->>'ok')::boolean then raise exception 'Sessão Auth real não foi aceite';end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 if not public.otp_session_verified() then raise exception 'Sessão confirmada foi recusada';end if;
 if not exists(select 1 from public.profiles) then raise exception 'Permissões originais não foram preservadas';end if;
 if has_table_privilege('authenticated','public.profiles','delete') or has_table_privilege('authenticated','auth.users','delete') then raise exception 'Eliminação de contas exposta';end if;
end $$;
reset role;
rollback;
select 'OTP/RLS: verificações aprovadas; dados de teste revertidos' as result;
