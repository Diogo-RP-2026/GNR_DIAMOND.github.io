-- Executar como postgres, DEPOIS de criar e confirmar a tua conta em /entrar.
-- Substitui APENAS o endereço abaixo pelo email exato da tua conta.
-- Não executar este ficheiro pelo browser/API. Nunca publicar a service_role.
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower('SUBSTITUI_PELO_TEU_EMAIL');
  if v_id is null then raise exception 'Conta não encontrada: cria/confirma a conta e substitui o email neste SQL.'; end if;
  update public.perfis set cargo = 'Comando' where id = v_id;
  if not found then raise exception 'Perfil não encontrado. Verifica a instalação de 001_schema.sql.'; end if;
end;
$$;
