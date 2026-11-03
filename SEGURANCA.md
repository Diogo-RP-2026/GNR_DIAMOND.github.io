# Operação e validação de segurança

Atualização de 03/11/2026. Mantém HTML/CSS/JavaScript no GitHub Pages e os serviços existentes do Supabase. As palavras-passe continuam exclusivamente no Supabase Auth.

## Aplicação da atualização

No projeto de produção associado a este repositório, a migração `20261103214002_security_audit_hardening.sql` já foi aplicada e as funções já foram publicadas. Não repetir a migração no SQL Editor. Para outro ambiente, aplicar as migrações por ordem e publicar ambas as funções, incluindo os respetivos `deno.json` e ficheiros auxiliares. Não substituir os segredos existentes.

A função `portal-otp` mantém `verify_jwt=false` porque registo/recuperação começam sem JWT. Valida palavra-passe ou prova criptográfica e o código no backend. A função `agent-avatar` mantém `verify_jwt=true` e também valida o utilizador no Auth e a autorização pela RPC `reserve_portal_upload`.

O CORS de ambas usa `OTP_ALLOWED_ORIGINS`, com origens HTTPS exatas separadas por vírgulas. Caminhos não fazem parte de uma origem. CORS não substitui RLS nem autenticação.

## Testes reproduzíveis

1. `npm ci --ignore-scripts`.
2. `npm test` — inclui PostgreSQL em WASM, interfaces Auth/Storage simuladas e testes de handlers/imagens. Não envia emails.
3. `npm audit` — as versões do SDK, transporte de email e descodificador estão fixadas no lockfile. A cópia UMD do SDK deve coincidir com `node_modules/@supabase/supabase-js/dist/umd/supabase.js`.
4. No SQL Editor administrativo, executar `tests/live-security-audit.sql`. Cria identidades sintéticas e executa tudo dentro de uma transação com `ROLLBACK`; não envia emails. Nunca retirar o `ROLLBACK`.
5. Com duas contas de teste e uma de Comando, concluir os fluxos reais de login, registo, recuperação, logout e upload. Confirmar um email por fluxo, reenvio, rejeição de código anterior, expirado e reutilizado. Não usar palavras-passe reais em scripts nem guardar tokens em evidências.
6. Verificar pela API que um JWT obtido diretamente no Auth sem concluir os quatro dígitos não consegue ler ou modificar dados internos.

## Configurações ainda dependentes do Dashboard

- Authentication → Attack Protection / Password Security: ativar proteção contra palavras-passe comprometidas se o plano permitir. O advisor continua a indicar desativada.
- Authentication → URL Configuration: confirmar Site URL HTTPS exato e restringir Redirect URLs aos destinos de produção realmente utilizados; retirar curingas e ambientes antigos.
- Authentication → Rate Limits / Attack Protection: rever os limites nativos de login, signup, recuperação e refresh. Os limites da função OTP não substituem os endpoints nativos do Auth. Avaliar CAPTCHA também no fluxo personalizado; não o ativar sem integrar o token no fluxo existente.
- Authentication → Sessions e Email: verificar duração do JWT, expiração de links nativos, rotação de refresh tokens e políticas de alteração de palavra-passe. O código personalizado dura 5 minutos e é de utilização única; a sessão verificada dura até 24 horas.
- GitHub → Settings → Pages: confirmar Enforce HTTPS. O site respondeu por HTTPS com HSTS, mas a opção administrativa não foi lida.
- Para publicar só os recursos do site, usar `npm run build` e configurar o workflow Pages para publicar `dist/`. O modo atual publica a raiz do repositório e inclui documentação e fontes de backend; não deve conter segredos.

## Limitações da arquitetura estática

O SDK usa tokens Bearer e persistência no armazenamento do navegador. Não existem cookies de sessão criados pelo portal. `HttpOnly` exige um backend que detenha a sessão e intermedeie as operações (BFF); não pode ser implementado em JavaScript nem apenas no GitHub Pages. Não foram criados cookies falsamente marcados como HttpOnly.

As chamadas atuais não dependem de cookies enviados automaticamente, pelo que não apresentam a mesma superfície de CSRF de uma sessão baseada em cookies. Continuam sujeitos a roubo de tokens por XSS ou extensões maliciosas. Um futuro BFF deve usar cookies Secure/HttpOnly/SameSite e proteção CSRF própria.

A CSP está em meta, porque GitHub Pages não permite configurar livremente cabeçalhos. `frame-ancestors` e cabeçalhos como Permissions-Policy exigem alojamento/proxy que os defina na resposta HTTP. Não adicionar `frame-ancestors` a meta e considerá-lo funcional.

## Segredos e histórico

A chave `sb_publishable_` em `config.js` é pública por desenho. Credenciais administrativas, `SUPABASE_SERVICE_ROLE_KEY`, `OTP_SECRET`, `OTP_GMAIL_APP_PASSWORD` e `RESEND_API_KEY` pertencem apenas aos segredos das funções. Não foram encontrados valores secretos pelos padrões pesquisados no histórico disponível; isso não comprova ausência absoluta.

Se uma exposição for confirmada: revogar/rodar primeiro a credencial no fornecedor, atualizar o segredo do backend e testar um fluxo controlado. Inventariar commits e artefactos afetados apenas por caminho/ID. Preparar uma cópia e um plano de `git filter-repo`, rever o impacto e obter confirmação explícita antes de reescrever/purgar o histórico remoto. Nenhuma reescrita de histórico foi efetuada nesta auditoria.

A migração adicional `20261103223933_otp_start_cooldown.sql` aplica um intervalo fixo de 60 segundos por email antes de contactar o Auth, tanto em contas reais como em desafios sintéticos. Aplicar ambas as migrações de auditoria antes de publicar a função OTP atualizada.
