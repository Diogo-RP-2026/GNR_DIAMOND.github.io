begin;
-- Explicit IDs identify exactly which rows the user read, including rows created
-- in the same transaction. The snapshot boundary applies only to 'mark all'.
create or replace function public.mark_notifications_read(p_ids uuid[] default null,p_before timestamptz default null) returns void
language sql security invoker set search_path='' as $$
 update public.notifications set read_at=clock_timestamp() where read_at is null
 and (p_ids is null or id=any(p_ids))
 and (p_ids is not null or created_at<=coalesce(p_before,statement_timestamp()));
$$;
notify pgrst,'reload schema';
commit;
