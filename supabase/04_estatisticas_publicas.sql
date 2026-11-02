-- Atualização opcional para instalações que já executaram a versão anterior de 01_schema.sql.
-- Numa instalação nova, esta função já é criada por 01_schema.sql.
begin;
create or replace function private.unit_statistics() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'member_count',(select count(*) from public.members where active),
    'rank_count',(select count(distinct rank) from public.members),
    'training_count',(select count(*) from public.event_logs where event_type ilike 'trein%' or lower(event_type) in ('formação','formacao'))
  );
$$;
create or replace function public.unit_statistics() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.unit_statistics(); $$;
grant usage on schema private to anon,authenticated;
revoke all on function private.unit_statistics() from public,anon,authenticated;
grant execute on function private.unit_statistics() to anon,authenticated;
revoke all on function public.unit_statistics() from public,anon,authenticated;
grant execute on function public.unit_statistics() to anon,authenticated;
notify pgrst, 'reload schema';
commit;
