-- USHE / Diamond — executar primeiro num projeto Supabase novo.
-- Migração transacional, de execução única. Não elimina tabelas existentes.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.ushe_role as enum ('member', 'command');
create type public.ushe_tab as enum ('quem-somos','equipa','anuncios','eventos','avisos','fardamento','equipamento','regulamento','registos');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  email text not null,
  role public.ushe_role not null default 'member',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.tab_permissions (
  user_id uuid references public.profiles(id) on delete cascade,
  tab public.ushe_tab not null,
  can_create boolean not null default false,
  primary key (user_id,tab),
  check (not can_create or tab = 'registos')
);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  uniform_number integer not null unique check (uniform_number between 1 and 999),
  name text not null check (length(trim(name)) between 2 and 100),
  callsign text not null default '' check (length(callsign) <= 30),
  rank text not null check (rank in ('Comando','Primeiro Oficial','Oficial','Sargento','Operacional','Estagiário','Quadros Permanentes')),
  active boolean not null default true,
  image_path text,
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 180),
  body text not null check (length(trim(body)) between 1 and 12000),
  kind text not null check (kind in ('Evento','Reunião','Comunicado Oficial')),
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  author_name text not null default 'Comando USHE',
  allow_responses boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.announcement_responses (
  announcement_id uuid references public.announcements(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade default auth.uid(),
  attending boolean not null,
  updated_at timestamptz not null default now(),
  primary key (announcement_id,user_id)
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 180),
  description text not null default '' check (length(description) <= 12000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (length(trim(location)) between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.event_responses (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade default auth.uid(),
  attending boolean not null,
  updated_at timestamptz not null default now(),
  primary key (event_id,user_id)
);
create table public.warnings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 180),
  conduct text not null check (length(trim(conduct)) between 1 and 12000),
  sanction text not null check (length(trim(sanction)) between 1 and 180),
  issued_on date not null,
  signature text not null default 'Cumprimentos, Duarte Petinga, Comandante USHE.',
  created_at timestamptz not null default now()
);
create table public.warning_members (
  warning_id uuid references public.warnings(id) on delete cascade,
  member_id uuid references public.members(id) on delete restrict,
  primary key (warning_id,member_id)
);
create table public.uniforms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  notes text not null default 'Pode ser completamente modificado',
  pieces jsonb not null default '{}' check (jsonb_typeof(pieces) = 'object'),
  image_path text,
  sort_order integer not null default 0
);
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 150),
  category text not null default 'Obrigatório' check (length(trim(category)) between 2 and 100),
  mandatory boolean not null default false,
  notes text not null default '',
  image_path text,
  sort_order integer not null default 0
);
create table public.regulations (
  id uuid primary key default gen_random_uuid(),
  chapter text not null check (length(trim(chapter)) between 2 and 180),
  article_number integer not null unique check (article_number > 0),
  title text not null check (length(trim(title)) between 2 and 180),
  body text not null check (length(trim(body)) between 1 and 12000)
);
create table public.event_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(trim(event_type)) between 2 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (length(trim(location)) between 1 and 200),
  summary text not null check (length(trim(summary)) between 1 and 12000),
  observations text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.event_log_participants (
  log_id uuid references public.event_logs(id) on delete cascade,
  member_id uuid references public.members(id) on delete restrict,
  primary key (log_id,member_id)
);
-- Apenas informação deliberadamente pública; textos institucionais ficam separados.
create table public.contact_info (
  id integer primary key default 1 check (id = 1),
  hero_title text not null,
  hero_intro text not null,
  recruitment text not null,
  contact_text text not null,
  discord_url text not null default '' check (discord_url = '' or discord_url ~ '^https://(discord[.]gg/|discord[.]com/invite/)'),
  motto text not null default 'Honra, Disciplina e Excelência'
);
create table public.institutional_content (
  id integer primary key default 1 check (id = 1),
  title text not null,
  body text not null,
  mission text not null,
  values_text text not null
);
create index events_date_idx on public.events(starts_at);
create index logs_date_type_idx on public.event_logs(starts_at,event_type);
create index logs_author_idx on public.event_logs(created_by);
create index events_author_idx on public.events(created_by);
create index members_rank_idx on public.members(rank,active);
create index announcements_date_idx on public.announcements(created_at desc) where published;
create index warnings_date_idx on public.warnings(issued_on desc);
create index warning_member_idx on public.warning_members(member_id);
create index log_participant_idx on public.event_log_participants(member_id);
create index permissions_tab_idx on public.tab_permissions(tab,user_id);
create index event_responses_user_idx on public.event_responses(user_id);
create index announcement_responses_user_idx on public.announcement_responses(user_id);
create index announcements_author_idx on public.announcements(author_id);

-- Funções privadas: não confiam em metadados JWT modificáveis pelo cliente.
create function private.is_command() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and approved and role = 'command');
$$;
create function private.has_tab(p_tab public.ushe_tab) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved
    and (p.role = 'command' or exists(select 1 from public.tab_permissions t where t.user_id = p.id and t.tab = p_tab)));
$$;
create function private.can_log() returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_command() or (private.has_tab('registos') and exists(
    select 1 from public.tab_permissions where user_id = (select auth.uid()) and tab = 'registos' and can_create));
$$;
revoke all on function private.is_command(),private.has_tab(public.ushe_tab),private.can_log() from public, anon;
grant execute on function private.is_command(),private.has_tab(public.ushe_tab),private.can_log() to authenticated;

-- Registo de conta nunca atribui aprovação, cargo ou permissões automaticamente.
create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,email) values(new.id,
    coalesce(nullif(left(trim(new.raw_user_meta_data->>'full_name'),100),''),'Novo utilizador'),coalesce(new.email,''));
  return new;
end; $$;
create trigger ushe_new_user after insert on auth.users for each row execute function private.handle_new_user();
create function private.sync_email() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email,'') where id = new.id;
  return new;
end; $$;
create trigger ushe_email_changed after update of email on auth.users for each row execute function private.sync_email();
insert into public.profiles(id,full_name,email)
  select id,coalesce(nullif(left(trim(raw_user_meta_data->>'full_name'),100),''),'Novo utilizador'),coalesce(email,'') from auth.users;
revoke all on function private.handle_new_user(),private.sync_email() from public,anon,authenticated;

-- Todas as tabelas são protegidas antes de conceder acesso à API.
do $$ declare t text; begin
  foreach t in array array['profiles','tab_permissions','members','announcements','announcement_responses','events','event_responses','warnings','warning_members','uniforms','equipment','regulations','event_logs','event_log_participants','contact_info','institutional_content'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;
grant select on public.contact_info to anon,authenticated;
grant select on public.profiles,public.tab_permissions to authenticated;
grant select,insert,update,delete on public.members,public.announcements,public.announcement_responses,public.events,public.event_responses,public.warnings,public.warning_members,public.uniforms,public.equipment,public.regulations,public.event_logs,public.event_log_participants,public.institutional_content to authenticated;
grant update on public.contact_info to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_command()));
create policy permissions_read on public.tab_permissions for select to authenticated using (user_id = (select auth.uid()) or (select private.is_command()));
create policy contacts_read on public.contact_info for select to anon,authenticated using (true);
create policy contacts_update on public.contact_info for update to authenticated using ((select private.is_command())) with check ((select private.is_command()));
create policy members_read on public.members for select to authenticated using ((select private.has_tab('equipa')));
create policy announcements_read on public.announcements for select to authenticated using ((select private.has_tab('anuncios')) and (published or (select private.is_command())));
create policy warnings_read on public.warnings for select to authenticated using ((select private.has_tab('avisos')));
create policy warning_members_read on public.warning_members for select to authenticated using ((select private.has_tab('avisos')));
create policy uniforms_read on public.uniforms for select to authenticated using ((select private.has_tab('fardamento')));
create policy equipment_read on public.equipment for select to authenticated using ((select private.has_tab('equipamento')));
create policy regulations_read on public.regulations for select to authenticated using ((select private.has_tab('regulamento')));
create policy about_read on public.institutional_content for select to authenticated using ((select private.has_tab('quem-somos')));
do $$ declare t text; begin
  foreach t in array array['members','announcements','warnings','warning_members','uniforms','equipment','regulations','institutional_content'] loop
    execute format('create policy command_insert on public.%I for insert to authenticated with check ((select private.is_command()))',t);
    execute format('create policy command_update on public.%I for update to authenticated using ((select private.is_command())) with check ((select private.is_command()))',t);
    execute format('create policy command_delete on public.%I for delete to authenticated using ((select private.is_command()))',t);
  end loop;
end $$;
create policy events_read on public.events for select to authenticated using ((select private.has_tab('eventos')));
create policy events_insert on public.events for insert to authenticated with check ((select private.has_tab('eventos')) and created_by = (select auth.uid()));
create policy events_update on public.events for update to authenticated using ((select private.has_tab('eventos')) and (created_by = (select auth.uid()) or (select private.is_command()))) with check ((select private.has_tab('eventos')) and (created_by = (select auth.uid()) or (select private.is_command())));
create policy events_delete on public.events for delete to authenticated using ((select private.has_tab('eventos')) and (created_by = (select auth.uid()) or (select private.is_command())));
create policy votes_read on public.event_responses for select to authenticated using ((select private.has_tab('eventos')));
create policy votes_insert on public.event_responses for insert to authenticated with check ((select private.has_tab('eventos')) and user_id = (select auth.uid()));
create policy votes_update on public.event_responses for update to authenticated using ((select private.has_tab('eventos')) and user_id = (select auth.uid())) with check ((select private.has_tab('eventos')) and user_id = (select auth.uid()));
create policy votes_delete on public.event_responses for delete to authenticated using ((select private.has_tab('eventos')) and user_id = (select auth.uid()));
create policy announcement_votes_read on public.announcement_responses for select to authenticated using ((select private.has_tab('anuncios')) and exists(select 1 from public.announcements a where a.id=announcement_id and a.allow_responses));
create policy announcement_votes_insert on public.announcement_responses for insert to authenticated with check ((select private.has_tab('anuncios')) and user_id=(select auth.uid()) and exists(select 1 from public.announcements a where a.id=announcement_id and a.allow_responses));
create policy announcement_votes_update on public.announcement_responses for update to authenticated using (user_id=(select auth.uid()) and (select private.has_tab('anuncios'))) with check (user_id=(select auth.uid()) and (select private.has_tab('anuncios')) and exists(select 1 from public.announcements a where a.id=announcement_id and a.allow_responses));
create policy announcement_votes_delete on public.announcement_responses for delete to authenticated using (user_id=(select auth.uid()) and (select private.has_tab('anuncios')));
create policy logs_read on public.event_logs for select to authenticated using ((select private.has_tab('registos')));
create policy logs_insert on public.event_logs for insert to authenticated with check ((select private.can_log()) and created_by=(select auth.uid()));
-- Os registos submetidos só são corrigidos/apagados pelo Comando.
create policy logs_update on public.event_logs for update to authenticated using ((select private.is_command())) with check ((select private.is_command()));
create policy logs_delete on public.event_logs for delete to authenticated using ((select private.is_command()));
create policy log_participants_read on public.event_log_participants for select to authenticated using ((select private.has_tab('registos')));
create policy log_participants_insert on public.event_log_participants for insert to authenticated with check ((select private.is_command()) or ((select private.can_log()) and exists(select 1 from public.event_logs l where l.id=log_id and l.created_by=(select auth.uid()))));
create policy log_participants_delete on public.event_log_participants for delete to authenticated using ((select private.is_command()));

-- Projeções limitadas: visitantes não recebem os corpos dos anúncios nem os perfis.
create function public.home_announcements() returns table(id uuid,title text,created_at timestamptz) language sql stable security definer set search_path = '' as $$
  select a.id,a.title,a.created_at from public.announcements a where a.published order by a.created_at desc limit 3;
$$;
create function public.active_member_count() returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.members where active;
$$;
-- Diretório mínimo para participantes/visados; não revela emails, cargos de conta ou outros dados.
create function public.member_options() returns table(id uuid,name text,rank text,uniform_number integer) language sql stable security definer set search_path = '' as $$
  select m.id,m.name,m.rank,m.uniform_number from public.members m
  where private.has_tab('equipa') or private.has_tab('registos') or private.has_tab('avisos') order by m.uniform_number;
$$;
create function public.response_names(p_kind text,p_id uuid) returns table(user_id uuid,full_name text,attending boolean) language plpgsql stable security definer set search_path = '' as $$
begin
  if p_kind='event' and private.has_tab('eventos') then
    return query select r.user_id,p.full_name,r.attending from public.event_responses r join public.profiles p on p.id=r.user_id where r.event_id=p_id order by p.full_name,p.id;
  elsif p_kind='announcement' and private.has_tab('anuncios') and exists(select 1 from public.announcements where id=p_id and published and allow_responses) then
    return query select r.user_id,p.full_name,r.attending from public.announcement_responses r join public.profiles p on p.id=r.user_id where r.announcement_id=p_id order by p.full_name,p.id;
  else raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
end; $$;

-- Uma só transação para cargo, aprovação e permissões. Protege o último Comando.
create function public.set_user_access(p_user uuid,p_role public.ushe_role,p_approved boolean,p_tabs jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  perform pg_advisory_xact_lock(786533);
  if not private.is_command() then raise exception 'Só o Comando pode gerir acessos.' using errcode='42501'; end if;
  if p_user=(select auth.uid()) and (p_role<>'command' or not p_approved) then raise exception 'Não pode retirar o próprio acesso de Comando.'; end if;
  if jsonb_typeof(p_tabs)<>'array' then raise exception 'Permissões inválidas.'; end if;
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Utilizador inexistente.'; end if;
  if (p_role<>'command' or not p_approved) and exists(select 1 from public.profiles where id=p_user and role='command' and approved)
    and (select count(*) from public.profiles where role='command' and approved)<=1 then raise exception 'É obrigatório manter um Comando aprovado.'; end if;
  update public.profiles set role=p_role,approved=p_approved where id=p_user;
  delete from public.tab_permissions where user_id=p_user;
  for item in select * from jsonb_array_elements(p_tabs) loop
    insert into public.tab_permissions(user_id,tab,can_create) values(p_user,(item->>'tab')::public.ushe_tab,coalesce((item->>'can_create')::boolean,false));
  end loop;
end; $$;

-- Integridade dos documentos com vários membros: gravação atómica.
create function public.save_warning(p_id uuid,p_data jsonb,p_members uuid[]) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_command() then raise exception 'Só o Comando pode criar avisos.' using errcode='42501'; end if;
  if coalesce(cardinality(p_members),0)=0 then raise exception 'Selecione pelo menos um operacional.'; end if;
  if p_id is null then
    insert into public.warnings(title,conduct,sanction,issued_on,signature) values(p_data->>'title',p_data->>'conduct',p_data->>'sanction',(p_data->>'issued_on')::date,p_data->>'signature') returning id into v_id;
  else
    update public.warnings set title=p_data->>'title',conduct=p_data->>'conduct',sanction=p_data->>'sanction',issued_on=(p_data->>'issued_on')::date,signature=p_data->>'signature' where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Aviso inexistente.'; end if;
    delete from public.warning_members where warning_id=v_id;
  end if;
  insert into public.warning_members(warning_id,member_id) select v_id,unnest(p_members);
  return v_id;
end; $$;
create function public.save_log(p_id uuid,p_data jsonb,p_members uuid[]) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not private.can_log() then raise exception 'Sem permissão para criar registos.' using errcode='42501'; end if;
  if coalesce(cardinality(p_members),0)=0 then raise exception 'Selecione pelo menos um participante.'; end if;
  if p_id is null then
    insert into public.event_logs(event_type,starts_at,ends_at,location,summary,observations) values(p_data->>'event_type',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,p_data->>'location',p_data->>'summary',coalesce(p_data->>'observations','')) returning id into v_id;
  else
    update public.event_logs set event_type=p_data->>'event_type',starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,location=p_data->>'location',summary=p_data->>'summary',observations=coalesce(p_data->>'observations','') where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Registo inexistente ou sem autorização.'; end if;
    delete from public.event_log_participants where log_id=v_id;
  end if;
  insert into public.event_log_participants(log_id,member_id) select v_id,unnest(p_members);
  return v_id;
end; $$;

revoke all on function public.home_announcements(),public.active_member_count() from public,anon,authenticated;
grant execute on function public.home_announcements(),public.active_member_count() to anon,authenticated;
revoke all on function public.member_options(),public.response_names(text,uuid),public.set_user_access(uuid,public.ushe_role,boolean,jsonb),public.save_warning(uuid,jsonb,uuid[]),public.save_log(uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.member_options(),public.response_names(text,uuid),public.set_user_access(uuid,public.ushe_role,boolean,jsonb),public.save_warning(uuid,jsonb,uuid[]),public.save_log(uuid,jsonb,uuid[]) to authenticated;

-- Fotografias privadas: descarregadas com o JWT e as permissões atuais.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ushe-media','ushe-media',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy ushe_media_read on storage.objects for select to authenticated using (bucket_id='ushe-media' and (
  (split_part(name,'/',1)='fardamento' and (select private.has_tab('fardamento'))) or
  (split_part(name,'/',1)='equipamento' and (select private.has_tab('equipamento'))) or
  (split_part(name,'/',1)='equipa' and (select private.has_tab('equipa')))));
create policy ushe_media_insert on storage.objects for insert to authenticated with check (bucket_id='ushe-media' and (select private.is_command()) and split_part(name,'/',1) in ('fardamento','equipamento','equipa'));
create policy ushe_media_update on storage.objects for update to authenticated using (bucket_id='ushe-media' and (select private.is_command())) with check (bucket_id='ushe-media' and (select private.is_command()) and split_part(name,'/',1) in ('fardamento','equipamento','equipa'));
create policy ushe_media_delete on storage.objects for delete to authenticated using (bucket_id='ushe-media' and (select private.is_command()));
notify pgrst, 'reload schema';
commit;
