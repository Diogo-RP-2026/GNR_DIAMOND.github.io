# Eventos, votos e contas — 03/11/2026

## Resultado

O projeto continua estático (HTML/CSS/JavaScript, sem compilação obrigatória) e compatível com GitHub Pages. Mantém o design, as rotas e os acessos às abas existentes.

- Reutilizados os botões Editar/Apagar, formulário preenchido e mensagens de sucesso/erro existentes. Reforçada a verificação antes da eliminação: criador ou Comando, com acesso à aba Eventos. A confirmação contém o título. Editar atualiza apenas o evento; apagar usa o FK existente com ON DELETE CASCADE para remover os votos atomicamente.
- Listas Vou/Não vou em elementos `ul/li`, com um nome por linha. Ordenação explícita por `updated_at ASC, user_id ASC`, na função SQL, paginação e apresentação. Mantém a precisão dos microssegundos na ordenação JavaScript. O servidor marca a hora de cada novo voto/mudança de opção. Repetir a mesma opção conserva a posição. O par `(event_id,user_id)` continua a ser a chave primária, sem duplicações. Ambos os botões ficam desativados enquanto o pedido está em curso.
- Clientes não podem alterar o ID/autor do evento nem a identidade de um voto. Não podem eliminar contas/perfis ou alterar diretamente IDs, cargos e aprovação. A gestão legítima de acessos pelo Comando continua pela RPC `set_user_access`, com validação no servidor; os metadados editáveis do utilizador não decidem a autorização.

## Ficheiros

| Ficheiro | Alteração |
| --- | --- |
| `js/api.js` | Paginação ordenada dos nomes e verificação comum de gestão de eventos |
| `js/core.js` | Ordenação estável dos votos |
| `js/forms.js` | Autorização antes de apagar |
| `js/views.js` | Listas verticais, autorização comum e esclarecimento sobre contas |
| `script.js` | Hora de voto de eventos atribuída no servidor; prevenção de cliques concorrentes |
| `style.css` | Disposição vertical dos nomes e quebra de nomes longos |
| `supabase/05_eventos_contas.sql` | Migração compatível com os dados atuais |
| `tests/core.test.mjs`, `tests/rls.test.mjs` | Testes de renderização, ordenação, permissões e integridade |

## Migração

A migração `05_eventos_contas.sql` já foi aplicada ao projeto Supabase `ctplgtrfhinpuzrhtvch` durante esta implementação. Não é necessário voltar a executá-la neste projeto. Os dados anteriores foram preservados: 1 evento, 2 votos e 3 contas/perfis.

Numa instalação diferente, executar os ficheiros `01` a `04` como previsto no projeto e, depois, copiar **todo** o conteúdo de `supabase/05_eventos_contas.sql` para **Supabase → SQL Editor → New query → Run**, usando uma conta administrativa. Aplicar a migração antes de publicar o novo frontend, pois a RPC passa a devolver `updated_at`. A migração não elimina eventos, votos ou contas. Datas históricas de votos são conservadas; não é possível reconstruir instantes que o código antigo não tenha registado corretamente.

## Auditoria de contas

Foram inspecionados os ficheiros do repositório, funções públicas/privadas, políticas, triggers e Edge Functions do projeto. Não existia botão de eliminação de contas, RPC que apagasse `auth.users`/`profiles` ou Edge Function de eliminação. Não confundir a remoção de um elemento da tabela `members` (ficha de equipa) com a eliminação de uma conta de autenticação: continuam a ser entidades distintas.

A migração revoga privilégios de escrita/eliminação dos clientes em `profiles` e `auth.users`, incluindo eventuais privilégios por coluna dos perfis. Acrescenta políticas restritivas de UPDATE/DELETE em `profiles`; as RPCs administrativas existentes continuam a validar o Comando na base de dados. A eliminação administrativa em Auth conserva o cascade dos perfis. Nenhuma chave administrativa foi adicionada ao frontend; `api.js` continua a aceitar apenas chaves públicas e a rejeitar chaves secretas/service_role.

### Equipa administrativa do Supabase — revisão manual obrigatória

As contas **Authentication → Users** são utilizadores do portal. As pessoas em **Organization → Team** têm acesso administrativo ao serviço. RLS protege os primeiros; não restringe administradores com SQL Editor, credenciais de base de dados ou chaves secretas/service_role.

Abrir [Organization → Team](https://supabase.com/dashboard/org/rxvdnnkwizkmlhqloazr/team) e:

1. Conservar acesso administrativo apenas a pessoas de confiança que precisem de administrar o projeto. Não convidar utilizadores comuns do portal para a organização; criar/aprovar essas contas no portal.
2. Rever membros e convites pendentes. Remover o acesso administrativo de quem deva apenas usar o portal, preservando pelo menos um Owner de confiança. Esta implementação não removeu ninguém.
3. Não assumir que atribuir Developer resolve o problema: este cargo também pode aceder a conteúdos do projeto e a chaves de serviço. A organização atual está no plano Free; Read-Only e funções limitadas a projetos dependem de planos superiores, conforme a [documentação de acessos](https://supabase.com/docs/guides/platform/access-control).
4. Se alguma chave administrativa tiver sido partilhada fora do ambiente seguro, revogá-la/rodá-la e rever os acessos existentes. Não colocar essas chaves no repositório público.

A integração disponível permitiu confirmar o projeto e o plano, mas não listar os membros/convites da organização. A revisão individual tem de ser feita no painel. As regras de permissões da organização não são alteráveis pelo HTML/JavaScript ou por esta migração.

## Validação

`npm ci` e `npm test`: **21 testes aprovados**, usando PostgreSQL real em WASM (PGlite). Cobrem:

- Criador e Comando editam/apagam; outros utilizadores são bloqueados por RLS.
- Todos os campos de edição, preservação dos votos e eliminação em cascade.
- Voto único, mudança de opção, nova posição no fim, repetição sem reordenação, hora do servidor e impossibilidade de mover um voto para outra pessoa/evento.
- DELETE/TRUNCATE de perfis, DELETE de Auth e alterações diretas de ID/cargo bloqueadas para membros e Comando; eliminação administrativa continua possível.
- Nomes escapados, apresentação em `li`, desempate estável com microssegundos, contagens e paginação acima de 1000 nomes.
- Regressões: autenticação/aprovação, acessos às abas, fotografias e documentos existentes.

No projeto Supabase real, verificadas as permissões efetivas de escrita/eliminação e executados testes com papéis `authenticated` e identidades de membro/Comando em transações com **ROLLBACK**: criação, edição, preservação/mudança de voto, cascade, gestão por Comando e bloqueio de terceiros/eliminação de contas. Não foram usados passwords, tokens de sessão ou contas de teste permanentes. Estes testes de papéis SQL exercitam as permissões de backend; não são sessões completas de browser com JWT reais.

Testes DOM adicionais confirmaram o preenchimento dos campos atuais, a abertura pelo criador/Comando, o bloqueio de terceiros e da eliminação de perfis, e a confirmação com o título/cancelamento. Pedidos HTTP DELETE sem privilégios administrativos a `/auth/v1/admin/users/<uuid inexistente>` e `/rest/v1/profiles` devolveram 401.

`node --check` e `git diff --check` passaram. A validação visual completa num browser autenticado continua manual: o browser de teste não estava instalado e o download não foi concluído neste ambiente. Após o GitHub Pages atualizar, abrir Eventos, editar um evento próprio, cancelar uma confirmação de eliminação e mudar um voto. Confirmar desktop/móvel e atualizar com Ctrl+F5 se houver cache.
