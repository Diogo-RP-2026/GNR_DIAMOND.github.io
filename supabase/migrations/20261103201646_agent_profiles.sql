begin;
-- Dados oficiais reutilizam members. Nunca se associa uma conta por semelhança de nomes.
alter table public.members add column user_id uuid unique references public.profiles(id) on delete set null;
alter table public.members add column agent_number text unique check (agent_number is null or length(btrim(agent_number)) between 1 and 30);
alter table public.members add column joined_on date check(joined_on is null or joined_on <= current_date);

create function private.profile_session_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and private.otp_session_verified()
 and exists(select 1 from public.profiles where id=(select auth.uid()) and approved);
$$;
create function private.can_view_agent(p_member uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.profile_session_allowed() and exists(select 1 from public.members
 where id=p_member and (user_id=(select auth.uid()) or private.has_tab('equipa')));
$$;
create function private.owns_agent(p_member uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.profile_session_allowed() and exists(select 1 from public.members
 where id=p_member and user_id=(select auth.uid()));
$$;
revoke all on function private.profile_session_allowed(),private.can_view_agent(uuid),private.owns_agent(uuid) from public,anon,authenticated;
grant execute on function private.profile_session_allowed(),private.can_view_agent(uuid),private.owns_agent(uuid) to authenticated;
create policy members_own_profile on public.members for select to authenticated
 using(user_id=(select auth.uid()) and (select private.profile_session_allowed()));

-- A fotografia oficial do próprio agente também pode ser usada como fallback.
create function private.can_read_agent_official_image(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.profile_session_allowed() and exists(select 1 from public.members m
 where m.image_path=p_path and private.can_view_agent(m.id));
$$;
revoke all on function private.can_read_agent_official_image(text) from public,anon,authenticated;
grant execute on function private.can_read_agent_official_image(text) to authenticated;
create policy agent_official_image_read on storage.objects for select to authenticated
 using(bucket_id='ushe-media' and split_part(name,'/',1)='equipa' and private.can_read_agent_official_image(name));

create table public.agent_personal(
 member_id uuid primary key references public.members(id) on delete cascade,
 biography text not null default '' check(char_length(biography)<=500),
 avatar_path text check(avatar_path is null or length(avatar_path)<=160)
);
-- As subunidades são associações oficiais; a lista não é editável pelo agente.
create table public.member_subunits(
 member_id uuid not null references public.members(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 primary key(member_id,name)
);
create table public.agent_qualifications(
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id) on delete cascade,
 kind text not null check(kind in ('especializacao','formacao')),
 name text not null check(length(btrim(name)) between 1 and 180),
 completed_on date not null check(completed_on<=current_date),
 issuer text not null default '' check(length(issuer)<=180)
);
create table public.agent_distinctions(
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 180),
 description text not null default '' check(length(description)<=2000),
 awarded_on date not null check(awarded_on<=current_date),
 symbol text not null default '' check(length(symbol)<=30)
);
create index agent_qualifications_member_idx on public.agent_qualifications(member_id,completed_on desc,id);
create index agent_distinctions_member_idx on public.agent_distinctions(member_id,awarded_on desc,id);
do $$ declare tbl text; begin
 foreach tbl in array array['agent_personal','member_subunits','agent_qualifications','agent_distinctions'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('create policy agent_read on public.%I for select to authenticated using(private.can_view_agent(member_id))',tbl);
  execute format('create policy otp_verified_session on public.%I as restrictive for all to authenticated using((select private.otp_session_verified())) with check((select private.otp_session_verified()))',tbl);
 end loop;
 foreach tbl in array array['member_subunits','agent_qualifications','agent_distinctions'] loop
  execute format('grant insert,update,delete on public.%I to authenticated',tbl);
  execute format('create policy official_insert on public.%I for insert to authenticated with check((select private.is_command()))',tbl);
  execute format('create policy official_update on public.%I for update to authenticated using((select private.is_command())) with check((select private.is_command()))',tbl);
  execute format('create policy official_delete on public.%I for delete to authenticated using((select private.is_command()))',tbl);
 end loop;
end $$;
grant insert(member_id,biography,avatar_path),update(biography,avatar_path) on public.agent_personal to authenticated;
create policy personal_insert on public.agent_personal for insert to authenticated with check(private.owns_agent(member_id));
create policy personal_update on public.agent_personal for update to authenticated using(private.owns_agent(member_id)) with check(private.owns_agent(member_id));

create function public.save_agent_personal(p_member uuid,p_biography text,p_avatar_path text) returns void
language sql security invoker set search_path='' as $$
 insert into public.agent_personal(member_id,biography,avatar_path) values(p_member,p_biography,p_avatar_path)
 on conflict(member_id) do update set biography=excluded.biography,avatar_path=excluded.avatar_path;
$$;
revoke all on function public.save_agent_personal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_agent_personal(uuid,text,text) to authenticated;

-- Operação atómica, sujeita às mesmas permissões RLS das operações diretas.
create function public.save_agent_official(p_member uuid,p_data jsonb,p_subunits text[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_command() then raise exception 'Só o Comando pode gerir dados oficiais.' using errcode='42501';end if;
 if cardinality(p_subunits)>20 then raise exception 'Máximo de 20 subunidades por agente.';end if;
 update public.members set user_id=nullif(p_data->>'user_id','')::uuid,
  agent_number=nullif(btrim(p_data->>'agent_number'),''),joined_on=nullif(p_data->>'joined_on','')::date,
  rank=p_data->>'rank',callsign=coalesce(p_data->>'callsign','') where id=p_member;
 if not found then raise exception 'Agente indisponível.';end if;
 delete from public.member_subunits where member_id=p_member;
 insert into public.member_subunits(member_id,name)
 select p_member,btrim(v) from unnest(p_subunits) v where btrim(v)<>'' group by btrim(v);
end $$;
revoke all on function public.save_agent_official(uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.save_agent_official(uuid,jsonb,text[]) to authenticated;

-- Apenas metadados da atividade autorizada. Invoker: cada JOIN conserva a RLS
-- de events, event_responses, event_logs e participantes, incluindo futuras políticas.
create function public.agent_activity(p_member uuid)
returns table(id uuid,kind text,title text,occurred_at timestamptz,event_at timestamptz,attending boolean)
language sql stable security invoker set search_path='' as $$
 select a.* from (
  select ev.id,'response'::text,ev.title,r.updated_at,ev.starts_at,r.attending
   from public.members m join public.event_responses r on r.user_id=m.user_id
   join public.events ev on ev.id=r.event_id
   where m.id=p_member and private.can_view_agent(p_member)
  union all
  select l.id,'participation'::text,l.event_type,l.ends_at,l.starts_at,null::boolean
   from public.event_log_participants ep join public.event_logs l on l.id=ep.log_id
   where ep.member_id=p_member and l.ends_at<=now() and private.can_view_agent(p_member)
 ) a(id,kind,title,occurred_at,event_at,attending)
 order by a.occurred_at desc,a.kind,a.id limit 30;
$$;
revoke all on function public.agent_activity(uuid) from public,anon,authenticated;
grant execute on function public.agent_activity(uuid) to authenticated;

-- Bucket separado: uploads diretos do navegador são recusados. Apenas a Edge
-- Function autenticada carrega, depois de validar bytes, MIME e tamanho.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('ushe-avatars','ushe-avatars',false,5242880,array['image/jpeg','image/png','image/webp']);
create function private.can_read_agent_avatar(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.profile_session_allowed() and (
  (split_part(p_path,'/',1)=(select auth.uid())::text and exists(select 1 from public.members where user_id=(select auth.uid())))
  or exists(select 1 from public.agent_personal ap where ap.avatar_path=p_path and private.can_view_agent(ap.member_id)));
$$;
create function private.can_delete_agent_avatar(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.profile_session_allowed() and split_part(p_path,'/',1)=(select auth.uid())::text
 and not exists(select 1 from public.agent_personal where avatar_path=p_path);
$$;
revoke all on function private.can_read_agent_avatar(text),private.can_delete_agent_avatar(text) from public,anon,authenticated;
grant execute on function private.can_read_agent_avatar(text),private.can_delete_agent_avatar(text) to authenticated;
create policy agent_avatar_read on storage.objects for select to authenticated
 using(bucket_id='ushe-avatars' and private.can_read_agent_avatar(name));
create policy agent_avatar_delete on storage.objects for delete to authenticated
 using(bucket_id='ushe-avatars' and private.can_delete_agent_avatar(name));
create policy otp_verified_avatars on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'ushe-avatars' or (select private.otp_session_verified()))
 with check(bucket_id<>'ushe-avatars' or (select private.otp_session_verified()));

create function private.validate_agent_personal() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.avatar_path is not null and (
  new.avatar_path !~ ('^'||(select auth.uid())::text||'/[a-f0-9-]+\.(jpg|png|webp)$')
  or not exists(select 1 from storage.objects where bucket_id='ushe-avatars' and name=new.avatar_path)) then
   raise exception 'Fotografia inválida ou sem autorização.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.validate_agent_personal() from public,anon,authenticated;
create trigger agent_personal_validate before insert or update on public.agent_personal for each row execute function private.validate_agent_personal();

-- Trocar a associação não transfere a biografia/fotografia da conta anterior.
create function private.clear_personal_on_relink() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is distinct from old.user_id then delete from public.agent_personal where member_id=new.id;end if;
 return new;
end $$;
revoke all on function private.clear_personal_on_relink() from public,anon,authenticated;
create trigger agent_relinked after update of user_id on public.members for each row execute function private.clear_personal_on_relink();
commit;
