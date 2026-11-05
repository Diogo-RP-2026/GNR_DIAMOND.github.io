# Verificação inicial e renovação a cada 30 dias

## Funcionamento

- Contas novas precisam de confirmar um código de quatro dígitos enviado para o seu email. A data de criação e os metadados fornecidos pelo utilizador não contam como verificação.
- Cada confirmação bem-sucedida grava a data do servidor em `private.user_verifications`. A validade termina exatamente 720 horas depois, incluindo mudanças de hora de verão.
- Durante esse período, entrar com email/palavra-passe dispensa outro código. O login e o refresh não prolongam o período.
- A renovação é exigida quando o prazo termina, incluindo em sessões abertas, e inicia outro período após confirmação real do código. Mudar o email também exige nova confirmação.
- Depois de entrar e concluir a verificação necessária, o portal abre o Início. Recuperação de palavra-passe mantém o respetivo formulário antes de regressar ao Início.

O prazo é comum às sessões válidas da conta. Continuam a aplicar-se aprovação, cargo e permissões por aba. Uma sessão revogada, conta eliminada ou suspensa não recupera acesso por ter uma verificação recente.

## Aplicação no backend

`public.verification_status()` deriva o utilizador e a sessão dos claims validados pelo Supabase. A função privada valida a sessão em `auth.sessions`, a conta Auth, o email atual e a hora do servidor. O cliente recebe o estado e as datas para apresentação, sem poder gravar a data de verificação.

`private.otp_session_verified()` passa a aplicar a regra por conta. As políticas RLS e as funções existentes de administração, upload e acesso a conteúdos continuam a depender dessa autorização. Alterar JavaScript, relógio, armazenamento ou metadados do navegador não permite ultrapassar o prazo. Uma chamada direta ao Auth também fica sujeita à RLS.

O backend `portal-otp` valida a identidade no Auth e consulta o estado protegido antes de dispensar o código. A renovação exige o token de uma sessão Auth válida e envia para o email dessa identidade. O desafio fica associado ao utilizador, email e sessão. Uma confirmação só concede acesso depois do consumo bem-sucedido do código; cancelar, reutilizar ou trocar a sessão/prova não concede uma nova validade. Repetir a mesma concessão não prolonga o prazo.

A geração criptográfica, HMAC dos códigos, prova aleatória, payload cifrado, validade de cinco minutos, utilização única e cinco tentativas por desafio são preservados. Início e reenvio continuam a partilhar cinco pedidos por email; o quinto inicia uma espera de 120 segundos no servidor. A renovação usa os mesmos limites. Não são guardados códigos em claro, palavras-passe ou tokens em logs.

As notificações e os logs mantêm as regras dos pontos anteriores. A limpeza de desafios OTP não apaga a última verificação por conta nem logs administrativos.

## Interface e sessões abertas

O portal consulta o estado do servidor ao carregar a identidade, ao navegar, a cada 45 segundos e ao regressar a um separador visível. O backend bloqueia cada operação protegida assim que o prazo termina, independentemente desse intervalo de apresentação.

Sem um formulário aberto, o utilizador segue para a verificação. Com um editor aberto, os campos por guardar são mantidos e a gravação é bloqueada, com uma mensagem e o botão **Verificar email**. Fechar o editor para verificar mantém a confirmação existente de descarte de alterações. Não é apresentada uma gravação bem-sucedida quando o servidor a recusa.

O cartão, os quatro campos OTP, as animações e a navegação existentes são reutilizados. Clientes antigos ainda em cache recebem o fluxo OTP compatível; a dispensa de código exige a versão 2 do protocolo, enviada pelo frontend atualizado.

## Migração e instalação

A migração incremental é `supabase/migrations/20261105204159_email_verification_thirty_days.sql`. Não recria tabelas nem apaga dados existentes. Cria a data de verificação por conta, acrescenta os campos de consumo/concessão e vínculo dos desafios, e atualiza as funções de autorização.

A regra anterior guardava a expiração da sessão verificada como confirmação + 24 horas. A migração recupera essa data real para as contas existentes, sem usar a criação da conta nem atribuir a data da instalação. Valores incoerentes ou futuros não concedem validade. A tabela antiga fica como compatibilidade histórica; deixa de decidir o acesso. No projeto atual foram preservadas as datas das quatro contas existentes.

No projeto atual, a migração está aplicada e a função `portal-otp` está publicada na versão 14, com `verify_jwt = false` e validação explícita no handler. Registo/recuperação começam sem token; a ação de renovação exige identidade válida. O frontend é estático e compatível com GitHub Pages.

Para outra instalação já atualizada com as migrações anteriores:

1. Fazer backup e aplicar a nova migração, sem executar novamente `01_schema.sql` ou os dados de exemplo.
2. Publicar `supabase/functions/portal-otp`, incluindo `index.ts`, `deno.json`, `handler.js`, `crypto.js` e `email.js`.
3. Publicar `script.js` e os módulos alterados de `js/` no GitHub Pages.
4. Confirmar `public.otp_policy()` com `enabled: true`, `verification_days: 30` e `verification_version: 2`, usando a ligação administrativa existente.

Não há segredos novos nem alterações ao remetente. Preservar `OTP_SECRET`, configuração Gmail e origens autorizadas. Manter `private` fora dos esquemas expostos pela Data API. O histórico remoto de migrações é gerido pela integração; os timestamps podem diferir dos nomes locais, pelo que não se deve executar `db push` sem conciliar o histórico.

## Testes e limites

- **141 testes locais aprovados** com `npm test`: PGlite com as migrações reais, handler com criptografia real e Auth/transporte simulados, navegação e renovação na interface. Incluem verificação inicial, prazo exato em sessões abertas, novo login dentro do prazo, alteração de email, sessões inválidas, Comando expirado, bloqueio de upload, concessão sem código/cancelada/repetida, tentativas e cinco pedidos/120 segundos.
- `tests/live-verification-period.sql` aprovado no Supabase real, com utilizador e sessão sintéticos em transação terminada com `ROLLBACK`: acesso inicial recusado, código confirmado, expiração na mesma sessão, renovação, repetição sem prolongamento e período de 720 horas.
- **14 verificações HTTP aprovadas** em `tests/live-verification.mjs`, com Auth, Edge Function e Data API e uma conta temporária `@example.invalid`. O teste confirma login sem código dentro do prazo, bloqueio da mesma sessão após expirar, recusa de concessão pelo cliente e renovação anónima, recuperação do acesso pela mesma sessão e login posterior sem prolongar o prazo. As fases de data/código são controladas administrativamente apenas para essa conta de teste.
- Esses testes de integração não enviam email: usam um desafio sintético para a concessão no servidor. Os testes locais confirmam a geração, o formato, a expiração e os contratos de envio. A entrega real por Gmail não foi repetida nesta alteração; o teste de entrega anterior está documentado em `ATIVAR_OTP_GMAIL.md`.
- O conselheiro de segurança mantém o aviso anterior de proteção contra palavras-passe comprometidas desativada e nove INFO esperados para tabelas privadas com RLS sem políticas de cliente. A tabela nova está deliberadamente fechada aos clientes. Referências: [proteção de palavras-passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) e [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- `npm run build`, verificação sintática e `git diff --check` aprovados. A conta, o agente e as sessões de teste foram removidos. Mantêm-se as quatro contas reais, 21 agentes, oito logs permanentes e o agendamento de limpeza de notificações a cada dez minutos.

Os scripts HTTP são opcionais e não correm com `npm test`. Usar exclusivamente contas descartáveis e credenciais por stdin, nunca contas reais. A eliminação dos dados de teste é feita com identificação exata; os logs administrativos permanentes são preservados.
