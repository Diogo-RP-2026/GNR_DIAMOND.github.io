# Administração de contas de Membros — ponto 1

Implementação de 5 de novembro de 2026. Mantém HTML/CSS/JavaScript no GitHub Pages e Supabase no backend. Não implementa os pontos seguintes do pedido nem integração com Discord.

## Utilização

Em **Administração → Utilizadores e acessos → Gerir/Editar conta**, o Comando pode manter os acessos existentes ou escolher **Apagar conta** para uma conta de Membro. A confirmação identifica o agente e explica a remoção da conta, perfil e fotografias. Cancelar não inicia a operação.

Uma conta de Comando não apresenta a ação de eliminação nem permite reduzir o cargo. A base de dados recusa igualmente a despromoção ou eliminação através de pedidos diretos, mesmo quando feitos por outro Comando. A aprovação e os acessos continuam a obedecer às regras anteriores.

## Segurança e consistência

1. `account-admin` valida o JWT com `Auth.getUser()`. A RPC `account_admin` volta a verificar a sessão, OTP, aprovação e cargo atuais na base de dados em cada fase.
2. A preparação bloqueia a conta e remove sessões e refresh tokens. Guarda um plano persistente de eliminação e uma lista de ficheiros determinada pelo servidor. Alterações de cargo, associação e referências às fotografias ficam bloqueadas durante a operação.
3. A função remove os ficheiros através da API Storage, usando exclusivamente a credencial administrativa do servidor. Fotografias partilhadas por outros agentes/conteúdos são preservadas; a propriedade de objetos históricos é dissociada da conta removida.
4. A finalização confirma que os objetos exclusivos já não existem no catálogo Storage. A remoção de Auth, perfil, agente, dados pessoais associados e o resultado de auditoria é feita numa transação PostgreSQL. As relações históricas passam a `NULL`, conservando uma identificação do agente e do autor.
5. Se Storage ou a finalização falharem, não é apresentado sucesso. A conta fica bloqueada e a operação aparece como pendente; **Retomar eliminação** repete o plano de forma idempotente. Outro Comando autorizado pode retomar. A finalização PostgreSQL é revertida integralmente em caso de erro.

Storage e PostgreSQL são serviços distintos: não existe uma transação distribuída entre a remoção de bytes e Auth. O estado persistente de eliminação permite recuperar as fases interrompidas. Depois de iniciada a eliminação, a operação deve ser retomada até terminar; não existe uma opção de anular a operação parcialmente executada.

Os logs administrativos são gerados pelo backend em `private.admin_audit_log`, com autor, conta afetada, hora do servidor, resultado e motivo técnico limitado. Não contêm palavras-passe, tokens, OTP ou credenciais e não possuem FKs para contas elimináveis. INSERT/UPDATE/DELETE/TRUNCATE diretos são recusados às credenciais da aplicação; triggers impedem alteração, DELETE e TRUNCATE do conteúdo. A interface de consulta/ocultação pertence ao ponto 5 e ainda não foi implementada.

Os participantes históricos em avisos e registos conservam nome, patente, uniforme e identificador de referência. A edição posterior dos documentos preserva participantes cujos perfis foram removidos; a apresentação não cria ligações para perfis apagados.

O fornecedor pode continuar a devolver durante a propagação da invalidação uma imagem que já tinha sido servida pela CDN. O portal usa `cacheNonce` e `cache: no-store` nos descarregamentos autenticados para consultar a origem com a autorização atual. Isto não remove cópias de imagens que já tenham sido guardadas no dispositivo. [Documentação oficial da cache](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Instalação noutro ambiente

No projeto associado, a migração e a função são publicadas durante a entrega. **Não voltar a aplicar uma migração já instalada.** Para outro projeto com o esquema anterior:

1. Aplicar as migrações anteriores pela ordem documentada.
2. Aplicar `supabase/migrations/20261105191630_member_account_deletion.sql` uma única vez. A migração acrescenta tabelas, colunas, constraints e triggers; não recria tabelas nem remove dados existentes.
3. Publicar `supabase/functions/account-admin/index.ts` com `handler.js`. Manter `verify_jwt = false` para esta função, conforme `supabase/config.toml`: a própria função valida o JWT com Auth e a RPC valida a sessão e os cargos no servidor. Não retirar essas verificações.
4. Manter os segredos backend existentes `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. `OTP_ALLOWED_ORIGINS` é reutilizado para a origem HTTPS do portal. Nenhum segredo novo é necessário e a chave administrativa nunca vai para `config.js`.
5. Publicar os ficheiros frontend atualizados. `npm run build` prepara `dist/` apenas com recursos públicos; SQL, testes e funções não são incluídos nessa pasta.

A conta administradora do PostgreSQL continua a conseguir modificar o esquema e desativar triggers: não deve ser disponibilizada à aplicação. As proteções descritas são impostas aos caminhos e credenciais utilizados pelo portal.

## Ficheiros

| Grupo | Ficheiros |
|---|---|
| Interface e sessão | `js/accounts.js`, `js/forms.js`, `js/views.js`, `js/api.js`, `script.js`, `style.css` |
| Backend e configuração | `supabase/functions/account-admin/index.ts`, `handler.js`, `supabase/config.toml` |
| Migração | `supabase/migrations/20261105191630_member_account_deletion.sql` |
| Testes | `tests/accounts-db.test.mjs`, `accounts-backend.test.mjs`, `accounts-ui.test.mjs`, `support/database.mjs`, `live-account-admin.sql`, `live-account-admin.mjs` |
| Documentação | `README.md`, `CONTAS_MEMBROS.md` |

## Validação

- `npm test`: 109 testes locais aprovados, incluindo PostgreSQL real em WASM, o handler da função e a interface em DOM. Auth e Storage são simulados nesta camada.
- `npm run build`, verificações de sintaxe JavaScript e `git diff --check` aprovados.
- `tests/live-account-admin.sql`: teste aprovado no PostgreSQL remoto, com contas, sessões e registo histórico sintéticos. Todas as alterações desse teste são revertidas por `ROLLBACK`.
  A versão da entrega final usa as migrações dos 30 dias e dos logs para confirmar também a preservação de um log oculto após a eliminação.
- `tests/live-account-admin.mjs`: teste HTTP com contas temporárias reservadas em `example.invalid`, login real, verificação concedida apenas às sessões dessas fixtures, carregamento e associação de fotografias reais, eliminação e recusa dos acessos antigos. Resultado final: **16 cenários HTTP aprovados**. Os quatro utilizadores temporários criados nas duas execuções foram removidos; não restam eliminações pendentes. As contagens reais mantêm-se em 4 contas, 21 agentes, 1 aviso e 0 registos operacionais. Os 8 logs administrativos dessas operações de teste permanecem, conforme a regra de auditoria permanente.
- Advisor: permanece o aviso anterior de proteção contra palavras-passe comprometidas desativada. As tabelas privadas sem políticas são intencionais: não concedem acesso direto ao cliente e só são manipuladas por funções autorizadas.

O teste HTTP recebe credenciais de teste por stdin sem as imprimir. Não recebe contas reais. Contas temporárias de Comando só podem ser limpas pelo administrador do banco; o teste não introduz um caminho de despromoção/eliminação de Comando na aplicação. Os logs das operações HTTP são preservados.
