-- 1. Cria a conta em Authentication > Users > Add user no Supabase,
--    ou regista-te no portal e confirma o email.
-- 2. Substitui APENAS o email abaixo pelo email dessa conta.
-- 3. Executa este bloco como postgres no SQL Editor do Supabase.
-- Não é criada uma palavra-passe pública nem se escrevem linhas auth.users à mão.
do $$
declare
  comando_email text := 'SUBSTITUIR_PELO_EMAIL_DO_COMANDO';
  comando_id uuid;
begin
  perform pg_advisory_xact_lock(786533);
  select id into comando_id from auth.users where lower(email)=lower(trim(comando_email));
  if comando_id is null then
    raise exception 'Cria primeiro a conta em Authentication > Users e substitui o email neste script.';
  end if;
  update public.profiles set role='command',approved=true where id=comando_id;
  if not found then raise exception 'Perfil não encontrado: executa primeiro 01_schema.sql.'; end if;
  raise notice 'Conta promovida a Comando. Termina sessão no portal e volta a entrar.';
end $$;
