-- Executar UMA vez, primeiro, no SQL Editor como postgres.
-- Se estes nomes já existirem no teu Supabase, parar e comparar os esquemas.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.cargo_ushe as enum (
  'Comando', 'Primeiro Oficial', 'Oficial', 'Sargento',
  'Operacional', 'Estagiário', 'Quadro Permanentes'
);
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 100),
  cargo public.cargo_ushe not null default 'Estagiário'
);
create table public.paginas (
  chave text primary key check (chave in ('inicio','eventos','gestao','entrar','site')),
  publica boolean not null default false,
  conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object'),
  revisao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  check (chave not in ('eventos','gestao') or not publica)
);
create table public.permissoes_paginas (
  utilizador_id uuid not null references public.perfis(id) on delete cascade,
  pagina text not null references public.paginas(chave) on delete cascade,
  pode_ver boolean not null default true,
  pode_editar boolean not null default false,
  primary key (utilizador_id, pagina),
  check (not pode_editar or pode_ver),
  check (pagina in ('inicio','eventos','entrar')),
  check (pagina = 'inicio' or pode_ver) -- Eventos/Entrar mantêm a leitura fixa; só se delega edição.
);
create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) between 1 and 160),
  descricao text not null check (length(trim(descricao)) between 1 and 10000),
  inicio timestamptz not null,
  termino timestamptz not null,
  local text not null check (length(trim(local)) between 1 and 300),
  criado_por uuid not null default auth.uid() references public.perfis(id),
  criado_em timestamptz not null default now(),
  check (termino > inicio),
  check ((inicio at time zone 'Europe/Lisbon')::date = (termino at time zone 'Europe/Lisbon')::date)
);
create index eventos_inicio_idx on public.eventos(inicio, id);
create table public.votos_eventos (
  evento_id uuid not null references public.eventos(id) on delete cascade,
  utilizador_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  resposta text not null check (resposta in ('vou','nao_vou')),
  primary key (evento_id, utilizador_id) -- unicidade por utilizador + evento
);
create index votos_utilizador_idx on public.votos_eventos(utilizador_id);

-- Estas funções consultam tabelas com RLS sem recursão e nunca aceitam um UID do cliente.
create function private.e_comando() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfis where id = auth.uid() and cargo = 'Comando');
$$;
create function private.pode_ver(p_chave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_chave in ('entrar','site') then true
    when p_chave = 'eventos' then auth.uid() is not null
    when p_chave = 'gestao' then private.e_comando()
    when private.e_comando() then true
    else coalesce(
      (select pode_ver from public.permissoes_paginas where pagina = p_chave and utilizador_id = auth.uid()),
      (select publica from public.paginas where chave = p_chave), false)
    end;
$$;
create function private.pode_editar(p_chave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.e_comando() or (
    p_chave in ('inicio','eventos','entrar') and exists(
      select 1 from public.permissoes_paginas
      where pagina = p_chave and utilizador_id = auth.uid() and pode_ver and pode_editar
    )
  );
$$;
create function private.novo_utilizador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis(id, nome) values (
    new.id, coalesce(nullif(left(trim(new.raw_user_meta_data->>'nome'),100),''),'Utilizador')
  ); -- Nunca ler cargo/tag das user_metadata.
  return new;
end;
$$;
create trigger criar_perfil after insert on auth.users
for each row execute function private.novo_utilizador();
-- Contas que já existiam antes da instalação.
insert into public.perfis(id,nome)
select id, coalesce(nullif(left(trim(raw_user_meta_data->>'nome'),100),''),'Utilizador') from auth.users;

create function private.incrementar_revisao() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revisao := old.revisao + 1;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger revisao_pagina before update on public.paginas
for each row execute function private.incrementar_revisao();

-- Alterar cargos só com validação no servidor, incluindo proteção do último Comando.
create function private.definir_cargo(p_id uuid, p_cargo public.cargo_ushe) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(827403912);
  if not private.e_comando() then raise exception 'Só o Comando pode alterar cargos' using errcode = '42501'; end if;
  if p_cargo <> 'Comando'
    and exists(select 1 from public.perfis where id = p_id and cargo = 'Comando')
    and (select count(*) from public.perfis where cargo = 'Comando') <= 1
  then raise exception 'Não podes remover o último Comando'; end if;
  update public.perfis set cargo = p_cargo where id = p_id;
  if not found then raise exception 'Utilizador inexistente'; end if;
end;
$$;
create function private.visibilidade(p_chave text, p_publica boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.e_comando() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_chave <> 'inicio' then raise exception 'Esta página tem acesso fixo'; end if;
  update public.paginas set publica = p_publica where chave = p_chave;
  if not found then raise exception 'Página inexistente'; end if;
end;
$$;
-- Wrappers invoker na API; os corpos privilegiados ficam no schema private.
create function public.definir_cargo(p_id uuid, p_cargo public.cargo_ushe) returns void
language sql security invoker set search_path = '' as $$ select private.definir_cargo(p_id,p_cargo); $$;
create function public.definir_visibilidade(p_chave text, p_publica boolean) returns void
language sql security invoker set search_path = '' as $$ select private.visibilidade(p_chave,p_publica); $$;
create function public.acesso_pagina(p_chave text) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('ver',private.pode_ver(p_chave),'editar',private.pode_editar(p_chave));
$$;

alter table public.perfis enable row level security;
alter table public.paginas enable row level security;
alter table public.permissoes_paginas enable row level security;
alter table public.eventos enable row level security;
alter table public.votos_eventos enable row level security;

-- Privilégios explícitos: evita os grants automáticos demasiado amplos do public.
revoke all on public.perfis, public.paginas, public.permissoes_paginas, public.eventos, public.votos_eventos from public, anon, authenticated;
grant select on public.perfis to authenticated;
grant select on public.paginas to anon, authenticated;
grant update(conteudo) on public.paginas to authenticated;
grant select, insert, update, delete on public.permissoes_paginas to authenticated;
grant select, insert on public.eventos to authenticated;
grant select, insert, update on public.votos_eventos to authenticated;

create policy perfis_leitura on public.perfis for select to authenticated using (true);
create policy paginas_leitura on public.paginas for select to anon, authenticated using (private.pode_ver(chave));
create policy paginas_edicao on public.paginas for update to authenticated
using (private.pode_editar(chave)) with check (private.pode_editar(chave));
create policy permissoes_leitura on public.permissoes_paginas for select to authenticated
using (utilizador_id = (select auth.uid()) or private.e_comando());
create policy permissoes_inserir on public.permissoes_paginas for insert to authenticated with check (private.e_comando());
create policy permissoes_atualizar on public.permissoes_paginas for update to authenticated using (private.e_comando()) with check (private.e_comando());
create policy permissoes_apagar on public.permissoes_paginas for delete to authenticated using (private.e_comando());
create policy eventos_leitura on public.eventos for select to authenticated using ((select auth.uid()) is not null);
create policy eventos_criar on public.eventos for insert to authenticated with check (criado_por = (select auth.uid()));
create policy votos_leitura on public.votos_eventos for select to authenticated using ((select auth.uid()) is not null);
create policy votos_criar on public.votos_eventos for insert to authenticated with check (utilizador_id = (select auth.uid()));
create policy votos_mudar on public.votos_eventos for update to authenticated
using (utilizador_id = (select auth.uid())) with check (utilizador_id = (select auth.uid()));

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.pode_ver(text), private.e_comando() to anon, authenticated;
grant usage on schema private to anon; -- só as funções acima; schema private não é exposto na Data API.
grant execute on function private.pode_editar(text), private.definir_cargo(uuid,public.cargo_ushe), private.visibilidade(text,boolean) to authenticated;
revoke all on function public.definir_cargo(uuid,public.cargo_ushe), public.definir_visibilidade(text,boolean), public.acesso_pagina(text) from public, anon, authenticated;
grant execute on function public.definir_cargo(uuid,public.cargo_ushe), public.definir_visibilidade(text,boolean), public.acesso_pagina(text) to authenticated;
commit;
