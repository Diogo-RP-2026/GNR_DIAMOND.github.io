-- No email, account or session is created. All counter writes are rolled back.
begin;
select set_config('ushe.qa.request_key',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),true);
set local role service_role;
do $$
declare decision jsonb; i integer;
begin
 for i in 1..5 loop
  decision=public.otp_service('request_limit',jsonb_build_object('key',current_setting('ushe.qa.request_key')));
  if decision<>jsonb_build_object('ok',true,'retry_after',case when i=5 then 120 else 0 end) then
   raise exception 'Unexpected quota result for request %',i;end if;
 end loop;
 decision=public.otp_service('request_limit',jsonb_build_object('key',current_setting('ushe.qa.request_key')));
 if (decision->>'ok')::boolean or (decision->>'retry_after')::integer not between 1 and 120 then
  raise exception 'Sixth request was not blocked for two minutes';end if;
end $$;
reset role;
do $$
declare deadline timestamptz;
begin
 select started_at into deadline from private.otp_limits where key='otp-request-v2:'||current_setting('ushe.qa.request_key');
 perform public.otp_service('request_limit',jsonb_build_object('key',current_setting('ushe.qa.request_key')));
 if (select started_at<>deadline from private.otp_limits where key='otp-request-v2:'||current_setting('ushe.qa.request_key')) then
  raise exception 'Rejected request extended the block';end if;
 if has_function_privilege('anon','public.otp_service(text,jsonb)','execute')
 or has_function_privilege('authenticated','public.otp_service(text,jsonb)','execute') then
  raise exception 'OTP service exposed to browser roles';end if;
end $$;
update private.otp_limits set started_at=clock_timestamp()-interval '121 seconds'
where key='otp-request-v2:'||current_setting('ushe.qa.request_key');
set local role service_role;
do $$
begin
 if public.otp_service('request_limit',jsonb_build_object('key',current_setting('ushe.qa.request_key')))<>jsonb_build_object('ok',true,'retry_after',0) then
  raise exception 'Quota did not reset after two minutes';end if;
end $$;
reset role;
rollback;
select 'OTP request limit: passed; synthetic counters rolled back' as result;
