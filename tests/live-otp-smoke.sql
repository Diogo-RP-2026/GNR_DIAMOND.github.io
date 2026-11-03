-- Executar apenas no SQL Editor administrativo. Tudo é revertido por ROLLBACK.
-- Não envia emails e não cria contas. Usa temporariamente uma conta de Comando existente.
begin;
select set_config('ushe.qa.uid',(select id::text from public.profiles where approved and role='command' limit 1),true);
select set_config('ushe.qa.sid',gen_random_uuid()::text,true);
select set_config('ushe.qa.cid',gen_random_uuid()::text,true);
insert into auth.sessions(id,user_id,created_at,updated_at)
values(current_setting('ushe.qa.sid')::uuid,current_setting('ushe.qa.uid')::uuid,now(),now());
update private.otp_settings set enabled=true where id;
select set_config('request.jwt.claim.sub',current_setting('ushe.qa.uid'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ushe.qa.uid'),'session_id',current_setting('ushe.qa.sid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.otp_session_verified() then raise exception 'Sessão não verificada foi aceite';end if;
 if exists(select 1 from public.profiles) or exists(select 1 from public.events) then raise exception 'RLS permitiu dados antes do código';end if;
 if has_function_privilege('authenticated','public.otp_service(text,jsonb)','execute') then raise exception 'RPC de serviço exposta';end if;
 if has_table_privilege('authenticated','private.otp_challenges','select') then raise exception 'Desafios expostos';end if;
end $$;
reset role;
do $$ declare response jsonb;args jsonb;
begin
 args=jsonb_build_object('id',current_setting('ushe.qa.cid'),'user_id',current_setting('ushe.qa.uid'),'operation','login','code_hash','qa-hash-one','proof_hash','qa-proof','payload','qa-encrypted-fixture');
 response=public.otp_service('issue',args);
 if not(response->>'ok')::boolean then raise exception 'Falhou issue: %',response->>'error';end if;
 args=jsonb_build_object('id',current_setting('ushe.qa.cid'),'proof_hash','qa-proof','code_hash','qa-wrong');
 response=public.otp_service('verify',args);
 if response->>'error'<>'invalid' then raise exception 'Código incorreto foi aceite';end if;
 args=args||jsonb_build_object('code_hash','qa-hash-one');
 response=public.otp_service('verify',args);
 if not(response->>'ok')::boolean then raise exception 'Código correto foi recusado';end if;
 response=public.otp_service('verify',args);
 if response->>'error'<>'used' then raise exception 'Código reutilizado foi aceite';end if;
 response=public.otp_service('grant',jsonb_build_object('session_id',current_setting('ushe.qa.sid'),'user_id',current_setting('ushe.qa.uid')));
 if not(response->>'ok')::boolean then raise exception 'Sessão Auth real não foi aceite';end if;
end $$;
set local role authenticated;
do $$ begin
 if not public.otp_session_verified() then raise exception 'Sessão confirmada foi recusada';end if;
 if not exists(select 1 from public.profiles) then raise exception 'Permissões originais não foram preservadas';end if;
 if has_table_privilege('authenticated','public.profiles','delete') or has_table_privilege('authenticated','auth.users','delete') then raise exception 'Eliminação de contas exposta';end if;
end $$;
reset role;
rollback;
select 'OTP/RLS: verificações aprovadas; dados de teste revertidos' as result;
