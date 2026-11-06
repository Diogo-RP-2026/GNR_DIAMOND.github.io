begin;
set local lock_timeout='5s';

-- A stale editor is a business conflict, so the Data API must not retry it
-- as a transaction serialization failure. The Edge Function maps it to 409.
create or replace function private.equipment_image_save(p_action text,p_id uuid,p_data jsonb,p_path text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_row public.equipment;saved public.equipment; image_name text;
begin
 if not coalesce(private.is_command(),false) then raise exception 'Apenas o Comando pode gerir equipamento.' using errcode='42501';end if;
 if p_action='authorize' then return jsonb_build_object('ok',true);end if;
 perform pg_advisory_xact_lock(786533);
 if p_action='queue' then
  if p_path not like 'equipamento/%' then raise exception 'Imagem inválida.';end if;
  if not private.equipment_media_referenced(p_path) then
   update private.equipment_media_files set state='queued',changed_at=clock_timestamp(),run_id=null where name=p_path and state not in ('deleting','deleted');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action not in ('keep','replace','remove') or jsonb_typeof(p_data)<>'object' or p_id is null then raise exception 'Dados de equipamento inválidos.';end if;
 select * into current_row from public.equipment where id=p_id for update;
 if found then
  if p_expected_revision is null or current_row.revision<>p_expected_revision then return jsonb_build_object('ok',false,'reason','conflict');end if;
 elsif p_expected_revision is not null then return jsonb_build_object('ok',false,'reason','conflict');end if;
 image_name=case p_action when 'replace' then p_path when 'remove' then null else current_row.image_path end;
 if p_action='replace' and (p_path is null or p_path !~ '^equipamento/[a-zA-Z0-9._-]+$') then raise exception 'Imagem inválida.';end if;
 insert into public.equipment(id,name,category,mandatory,notes,sort_order,image_path)
 values(p_id,btrim(p_data->>'name'),btrim(p_data->>'category'),coalesce((p_data->>'mandatory')::boolean,false),coalesce(p_data->>'notes',''),coalesce((p_data->>'sort_order')::integer,0),image_name)
 on conflict(id) do update set name=excluded.name,category=excluded.category,mandatory=excluded.mandatory,notes=excluded.notes,sort_order=excluded.sort_order,image_path=excluded.image_path
 returning * into saved;
 return jsonb_build_object('ok',true,'equipment',to_jsonb(saved));
end $$;

notify pgrst,'reload schema';
commit;
