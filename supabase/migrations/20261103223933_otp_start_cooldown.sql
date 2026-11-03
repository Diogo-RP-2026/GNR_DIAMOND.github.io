begin;
-- Apply before contacting Auth so real and decoy accounts have the same cooldown.
create function private.otp_start_allowed(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare lim private.otp_limits;
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' then return false;end if;
 insert into private.otp_limits(key) values('otp-start:'||p_key)
 on conflict(key) do update set
 count=case when private.otp_limits.started_at<=clock_timestamp()-interval '60 seconds' then 1 else private.otp_limits.count+1 end,
 started_at=case when private.otp_limits.started_at<=clock_timestamp()-interval '60 seconds' then clock_timestamp() else private.otp_limits.started_at end
 returning * into lim;
 return lim.count<=1;
end $$;
create function public.otp_start_allowed(p_key text) returns boolean
language sql security invoker set search_path='' as $$select private.otp_start_allowed(p_key);$$;
revoke all on function private.otp_start_allowed(text),public.otp_start_allowed(text) from public,anon,authenticated;
grant execute on function private.otp_start_allowed(text),public.otp_start_allowed(text) to service_role;
notify pgrst,'reload schema';
commit;
