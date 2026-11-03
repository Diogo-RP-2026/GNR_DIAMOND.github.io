# Movimento e verificação de quatro dígitos — 03/11/2026

**Atualização de envio:** a configuração Gmail já é reconhecida e a política OTP foi ativada. A entrega real ainda aguarda teste com uma conta própria; ver [estado atual e configuração Gmail](ATIVAR_OTP_GMAIL.md). Os estados de instalação abaixo registam a entrega inicial, antes desta ativação.

O portal continua em HTML, CSS e JavaScript, com rotas `#/`, ficheiros estáticos no GitHub Pages e autenticação/dados no Supabase. Não foi introduzido React nem compilação para publicar o frontend.

## Estado da instalação

- Efeitos integrados nos elementos existentes; login/verificação encaminham para Início, com o menu ativo.
- Migração `portal_otp_four_digits` aplicada ao Supabase e Edge Function `portal-otp` publicada, versão 2.
- **OTP ainda desativado:** o endpoint real respondeu `ready: false`. Falta configurar o envio de emails e os segredos abaixo. Até à ativação mantém-se o login anterior por email/palavra-passe e a confirmação/recuperação por ligação.
- Não há sucesso de demonstração no portal. Os testes no Supabase real terminaram com `ROLLBACK`, sem criar/apagar contas ou alterar conteúdos.

## Referências consultadas

Foram examinados os cinco vídeos anexados em diferentes instantes. Os nomes recebidos contêm o sufixo `(1)`.

| Vídeo | Único efeito usado | Adaptação |
| --- | --- | --- |
| `ui_motion_prompts-post-DfN-I_Mghgz` | 5 — Staggered Dropdown | Seta, painel descendente, opções em sequência de 35 ms; nomes, destinos e permissões existentes. |
| `ui_motion_prompts-post-DfMXIvrG9Fq` | 5 — Shine Sweep | Brilho diagonal e pequenos brilhos nos botões principais; ações destrutivas mantêm a distinção vermelha. |
| `ui_motion_prompts-post-DfOSs0XCZXT` | 3 — Fly to Inbox | Leitura, contração, ponto numa curva até à caixa; marcar como lida exige ação explícita. |
| `ui_motion_prompts-post-DfNU5TXkdDw` | 4 — Ripple Fill | Preenchimento a partir do centro e desaparecimento do destaque anterior na barra existente. |
| `code.xr-post-DewfIUSThe_` | OTP Animation V15 | Quatro campos, foco, carregamento, erro/agitação, cadeado/visto e sucesso verde. |

Cores, fontes e dimensões adaptadas à USHE. O comportamento foi recriado; não foi copiado código do autor nem o dashboard do fundo. Não foi possível confirmar uma licença ou repositório original a partir dos vídeos.

## Autenticação e proteção no servidor

O OTP nativo de email do Supabase exige 6 a 10 dígitos. Os quatro dígitos usam a Edge Function; nenhum código nativo é reduzido/cortado. Documentação: [configuração OTP](https://supabase.com/docs/guides/local-development/cli/config#auth.email.otp_length), [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) e [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

Quando ativado:

1. No **login**, o backend valida email/palavra-passe no Auth e conserva a sessão cifrada enquanto o utilizador confirma o código enviado por email.
2. No **registo/recuperação**, gera o token nativo com `generateLink`, guarda-o cifrado e envia o código próprio de quatro dígitos. Depois da confirmação, troca o token nativo com `verifyOtp`.
3. Confirma a identidade com `getUser`, associa a autorização ao `session_id` real e só então devolve os tokens da sessão.
4. **Continuar** instala a sessão com `setSession` e confirma a autorização no servidor. Login/registo seguem para **Início**; recuperação segue para definir a palavra-passe e depois para Início.
5. RLS e RPCs de autorização exigem a sessão verificada quando a política está ativa. Login direto na API Auth, ligações antigas ou JavaScript alterado não autorizam dados internos.

A verificação mantém cargos, aprovações e permissões. Vale durante 24 horas, enquanto existir a sessão em `auth.sessions`. O refresh normal mantém a associação. Sessões anteriores à ativação precisam de novo login e código.

Proteções implementadas:

- `crypto.getRandomValues`, amostragem sem viés, exatamente quatro algarismos e zeros iniciais preservados.
- Validade de cinco minutos, utilização única e cinco tentativas acumuladas por desafio; reenviar não reinicia as tentativas.
- Reenvio depois de 60 segundos; máximo de três reenvios e 15 minutos de duração total do desafio.
- Cinco pedidos de início/envio por email em 15 minutos, 40 pedidos por IP em 15 minutos e intervalo de início de 60 segundos por utilizador. Limites por email/utilizador aplicados no servidor, independentemente dos cabeçalhos enviados pelo cliente.
- Reenvio troca o hash atomicamente e evita sortear o mesmo número. Bloqueios de linha impedem consumo simultâneo do desafio.
- Código guardado como HMAC-SHA-256 com segredo, associado a desafio/utilizador/operação; prova aleatória de 256 bits para verificar/reenvio.
- Tokens/payload cifrados com AES-GCM e associados ao desafio. Nenhum código, palavra-passe ou token em logs da aplicação ou respostas de início/reenvio.
- Tabelas no esquema `private`, RLS e ausência de privilégios diretos dos clientes. RPC de serviço executável apenas pelo `service_role`, utilizado dentro da Edge Function.
- Limpeza de desafios/limites antigos e sessões verificadas expiradas ao iniciar desafios.

## Configuração pendente

**Neste projeto a migração já foi aplicada e a função já está publicada. Não executar novamente o esquema inicial nem os dados de exemplo.**

1. Preparar um remetente/domínio verificado no **Resend**. A função usa a sua API HTTP; o fornecedor tem de autorizar o envio pelo endereço escolhido.
2. Em **Supabase → Edge Functions → Secrets**, configurar:

   | Nome | Valor |
   | --- | --- |
   | `OTP_SECRET` | Pelo menos 32 bytes aleatórios. Gerar localmente com `python -c "import secrets; print(secrets.token_hex(32))"`. |
   | `RESEND_API_KEY` | Chave do fornecedor com permissão de envio. |
   | `OTP_FROM_EMAIL` | Remetente autorizado, por exemplo `USHE <acesso@teu-dominio.pt>`. |
   | `OTP_ALLOWED_ORIGINS` | `https://diogo-rp-2026.github.io`, sem caminho/barra final; separar origens por vírgulas se necessário. |

   O Supabase injeta `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` na função. Não copiar segredos para `config.js`, GitHub ou chat. `secrets.example` contém apenas nomes/campos vazios.

3. Na consola do navegador, aberta no portal publicado, verificar a preparação sem ativar a política:

   ```javascript
   fetch('https://ctplgtrfhinpuzrhtvch.supabase.co/functions/v1/portal-otp', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({action: 'status'})
   }).then(response => response.json()).then(console.log);
   ```

   Deve responder `{ready: true}`. Confirma apenas o preenchimento das variáveis obrigatórias, sem apresentar segredos/códigos; não comprova a entrega do email.

4. Ativar no **Supabase → SQL Editor** administrativo:

   ```sql
   update private.otp_settings set enabled = true where id;
   select public.otp_policy();
   ```

5. Com uma conta própria, testar envio/receção, código, reenvio, login e recuperação. Só este teste confirma a entrega real. Uma recusa do remetente/fornecedor produz erro e não autoriza a sessão.

Durante a configuração, um administrador pode reverter a ativação com `update private.otp_settings set enabled = false where id;`. Isso regressa explicitamente à autenticação anterior, mantendo as restantes RLS e proteções das contas.

### Outro ambiente

Depois de instalar o esquema/permissões deste portal, executar **apenas** `supabase/migrations/20261103021624_portal_otp_four_digits.sql` no SQL Editor do outro projeto. A migração começa desativada e não recria conteúdos.

Publicar `supabase/functions/portal-otp` como `portal-otp`, incluindo `deno.json`, `handler.js` e `crypto.js`. `config.toml` define `verify_jwt = false`: registo/recuperação começam sem JWT; o handler valida a palavra-passe no Auth ou a prova aleatória do desafio. Isto não concede acesso às RPCs de serviço nem dispensa RLS.

O histórico remoto foi criado pela integração Supabase. A migração está registada como `portal_otp_four_digits`, versão `20261103022433`; o ficheiro local foi criado pelo CLI às `02:16:24`. Não executar `db push` às cegas nem reparar o histórico sem conciliar também as migrações anteriores.

## Ficheiros

| Área | Ficheiros alterados/adicionados |
| --- | --- |
| Estrutura e navegação | `index.html`, `script.js` |
| Estilos reutilizáveis | `style.css` |
| Efeitos e caixa | `js/motion.js`, `js/core.js` |
| Autenticação/formulários | `js/otp.js`, `js/api.js`, `js/forms.js`, `js/views.js` |
| Backend | `supabase/functions/portal-otp/{index.ts,handler.js,crypto.js,deno.json,secrets.example}`, `supabase/config.toml` |
| Migração | `supabase/migrations/20261103021624_portal_otp_four_digits.sql` |
| Testes | `tests/navigation.test.mjs`, `tests/rls.test.mjs`, `tests/ui.test.mjs`, `tests/otp-backend.test.mjs`, `tests/live-otp-smoke.sql` |
| Dependências de testes | `package.json`, `package-lock.json`, `.gitignore` |
| Documentação | Este relatório, `README.md`, `ALTERACOES_LOGIN_REFERENCIAS.md` |

## Validação e limites

- **45 testes automáticos:** rotas e sessão; OTP correto/incorreto, zero inicial, rejeição de códigos maiores, utilização única, expiração, tentativas, limites/reenvio e colisão; falhas de rede/instalação de sessão; teclado/colagem e bloqueio de submissão repetida.
- PostgreSQL em WASM/PGlite executa as migrações/RLS, incluindo eventos/votos, cascade, preservação na edição, ordenação e bloqueio de contas. As interfaces Auth/Storage são esquemas isolados de teste.
- Handler da função: criptografia real; Auth e transporte de email substituídos por fixtures locais. **Estes testes não confirmam entrega de emails reais.**
- Supabase real: `tests/live-otp-smoke.sql` aprovado com `ROLLBACK`; sessão sem código bloqueada, RPC de serviço inacessível a utilizadores, código incorreto/reutilizado recusado e sessão Auth verificada aceite. A política ficou desativada depois do teste.
- HTTP na função publicada: `status` 200/`ready:false`, origem não autorizada 403 e GET 405. Na API pública, `otp_policy` devolveu 200/`enabled:false` e a chamada direta a `otp_service` foi recusada com 401/42501.
- Chrome: menu/Escape e atrasos; separador preenchido e destaque anterior removido; notificação contraída até ao ponto e mensagem ainda por ler na caixa. Layout revisto em desktop e frames de 390/820 px, sem overflow horizontal dos campos.
- OTP visual: introdução, validação, erro e sucesso revistos numa fixture isolada, identificada como simulação de serviços. A fixture não autentica contas e não é publicada.
- `prefers-reduced-motion`: ramo JavaScript sem voo exercitado nos testes e CSS com animações/transições suprimidas. Não foi testado num telemóvel físico nem alterada a preferência de um dispositivo real.
- `git diff --check` e verificação sintática dos módulos JavaScript.
- Conselheiro Supabase: nenhum novo WARN/ERROR; quatro INFO esperados por RLS sem políticas em tabelas privadas deliberadamente fechadas. Mantém-se o aviso anterior sobre proteção de palavras-passe comprometidas.
- O CLI não conseguiu listar a stack local, porque não existe PostgreSQL/Docker local; o histórico remoto foi confirmado pela API e as regras foram testadas em PGlite e no Supabase real.

**Pendente:** segredos/remetente do fornecedor, ativação e teste ponta a ponta de entrega de email/sessão com uma conta própria. Não foi usada uma conta real de outra pessoa para contornar esta dependência.
