begin;
set local lock_timeout='5s';

-- Notifications are temporary inbox messages. Administrative/operational logs
-- are separate tables and are never touched by this routine.
create index if not exists notifications_read_cleanup_idx
 on public.notifications(read_at) where read_at is not null;

create function private.purge_read_notifications() returns bigint
language plpgsql security invoker set search_path='' as $$
declare removed bigint;
begin
 -- A second invocation must not overlap a sweep already in progress.
 if not pg_try_advisory_xact_lock(786534) then return 0;end if;
 delete from public.notifications where read_at is not null;
 get diagnostics removed=row_count;
 return removed;
end $$;
-- Only the database job owner runs this cross-user maintenance operation.
-- The browser and Edge Function service credential cannot invoke it.
revoke all on function private.purge_read_notifications() from public,anon,authenticated,service_role;
grant execute on function private.purge_read_notifications() to postgres;

commit;
