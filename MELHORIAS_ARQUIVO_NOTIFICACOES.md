# Eventos, arquivos e notificações — implementação e validação

Atualização de 03/11/2026. Mantém HTML/CSS/JavaScript, navegação por fragmentos, GitHub Pages e Supabase. O estilo dos cartões, permissões existentes, voto único, ordenação dos nomes e animação Fly to Inbox foram preservados.

## Comportamentos confirmados antes da alteração

- `script.js` chamava `render()` em Eventos a cada 45 segundos, reconstruindo o conteúdo e os filtros. O callback ignorava atualizações enquanto existisse um diálogo aberto.
- `views.events()` carregava todos os eventos e fazia uma RPC de respostas para cada evento, incluindo os antigos.
- `views.announcements()` e `views.logs()` faziam consultas sem range/cursor; a filtragem incidia sobre o conjunto recebido.
- `motion.js` guardava notificações num array em memória, perdido ao recarregar ou terminar sessão.

## Implementação

### Eventos e paginação

`js/feed.js` controla a página sem reconstruir o cabeçalho, filtros ou diálogo. Eventos usa um temporizador único, de 45 segundos, reagendado após cada atualização. O controlador também atualiza ao regressar a uma aba visível e é descartado ao sair da rota, terminar sessão ou abandonar a página. A recuperação pelo histórico do navegador reinicia os controladores necessários.

A RPC `portal_feed` avalia primeiro RLS, pesquisa e filtros; depois aplica ordenação por data e UUID e seleciona a página. Próximos/em curso são apresentados primeiro. O arquivo de eventos terminados é separado e paginado. A página tem 20 elementos; o backend limita qualquer pedido a 50.

Os votos são agregados **em conjunto para os IDs da página**, incluindo todos os nomes. Não existe uma RPC por evento. O resultado é um objeto JSON, pelo que as listas de nomes não ficam truncadas pelo limite de linhas de uma resposta tabular. Mantém-se um nome por `<li>`, ordenado pelo instante do voto e UUID.

Cada cartão recebe uma impressão do conteúdo e dos votos. Os pedidos seguintes enviam as impressões conhecidas; a resposta devolve os IDs atuais e apenas os cartões alterados. O servidor continua a recalcular a janela limitada à página; não foi implementado um log de alterações ou uma subscrição Realtime. Cartões sem alterações conservam os mesmos nós DOM. Nos alterados são repostas as listas abertas e o foco relevante, e a posição de leitura é ancorada. Eliminações e novas entradas na janela são reconciliadas.

Existe um pedido em curso e uma atualização posterior agregada; alterações de pesquisa, votos, mudanças de página e saída da rota invalidam respostas antigas. Uma falha conserva o conteúdo e apresenta a opção Atualizar. Formulários não são reconstruídos pela atualização periódica. O evento Auth `SIGNED_IN` com a mesma identidade também deixou de provocar uma reconstrução desnecessária ao recuperar o foco.

### Anúncios e Registos

Usam o mesmo controlador, paginação por cursor e desempate UUID. A pesquisa por palavras/raízes em português e todos os filtros são aplicados no banco, antes do limite. Em Registos são pesquisados tipo, local, resumo e observações; em Anúncios, título, corpo e assinatura. Datas usam Portugal continental.

A pesquisa espera 300 ms, descarta respostas anteriores e regressa à primeira página. As listas de tipos vêm do conjunto autorizado completo, não só da página carregada. Existem estados de carregamento, vazio e erro, navegação anterior/seguinte e ordenação ascendente/descendente. Uma atualização explícita permite incluir entradas novas no arquivo, mantendo os filtros.

O cursor conserva a data completa, incluindo precisão, e o UUID. Um limite temporal de criação estabiliza a navegação dos arquivos face a novas inserções. Não é uma transação MVCC longa entre pedidos: se outro dispositivo alterar a data usada na ordenação de um registo, a posição lógica desse registo também pode mudar. Para uma fotografia integral nova, regressar à primeira página e atualizar.

### Notificações

`public.notifications` guarda destinatário, título, mensagem genérica, tipo, criação, leitura, referência ao conteúdo e chave de deduplicação. Os textos não copiam títulos ou corpos de documentos reservados. A abertura passa por `notification_destination`, que volta a consultar o conteúdo sob as permissões atuais. Conteúdo removido ou sem autorização apresenta uma mensagem adequada.

Os destinatários de eventos e anúncios são contas aprovadas que possuem a aba correspondente, incluindo Comando. Não são geradas notificações de rascunhos. Criação, alteração efetiva e eliminação de conteúdo geram avisos; escritas idênticas não geram duplicados. Decisões sobre cargo/aprovação/abas produzem uma notificação apenas para a conta afetada, calculada sobre o estado final da transação. Repetir a mesma decisão não volta a notificá-la.

A caixa mostra as mais recentes primeiro, com páginas de 20, contador global de não lidas, leitura individual e leitura de todas as notificações até à fotografia mostrada. O estado reside no banco e é sincronizado a cada 30 segundos, ao recuperar visibilidade e após alterações. A leitura individual por ID também funciona quando a notificação foi criada na mesma instrução/transação; o teste remoto identificou esse caso e motivou a migração adicional de fronteira de leitura.

Abrir a caixa ou executar Fly to Inbox **não marca como lida**. Só a ação explícita de leitura ou a abertura autorizada do conteúdo o faz. Os avisos temporários de sucesso/erro continuam como toasts; o cliente não pode transformá-los em notificações arbitrárias para outras contas. Mensagens da caixa antiga, que existiam apenas em memória, não foram recuperadas nem retroativamente reconstruídas.

A RLS permite consultar e alterar apenas as próprias linhas, com sessão verificada. Só a coluna `read_at` é atualizável pelo cliente; o relógio é imposto pelo backend. Não existe privilégio de INSERT/DELETE de notificações para agentes ou Comando. As funções privilegiadas de geração ficam em `private`, com `search_path` fixo e execução direta revogada.

## Migrações, índices e configuração

Já aplicadas no projeto associado:

1. `supabase/migrations/20261103231152_archives_events_notifications.sql`.
2. `supabase/migrations/20261103232800_notification_read_boundary.sql`.

Não repetir estas migrações manualmente na produção já atualizada. Noutro ambiente, aplicar as migrações anteriores do projeto e estas duas por ordem, depois publicar o frontend completo.

Índices criados: GIN sobre a pesquisa de eventos, anúncios e registos; B-tree para data/UUID, tipo/data/UUID e término dos eventos; destinatário/data/UUID e destinatário não lido nas notificações. O índice único destinatário/chave impede avisos duplicados. A chave primária dos votos e o índice evento/instante/UUID foram preservados.

Não é necessário ativar Realtime, configurar canais, criar uma Edge Function nova, adicionar segredos ou alterar a CSP. Os polling controllers utilizam a ligação Supabase existente. `npm run build` continua a incluir todos os módulos e recursos públicos para publicação estática.

## Testes e evidência

**90 testes locais aprovados, zero falhas**, incluindo os anteriores de autenticação, OTP, perfis e RLS. `npm run build` passou; `git diff --check` passou; `npm audit` não encontrou vulnerabilidades conhecidas na árvore instalada.

| Verificação | Evidência | Limite da evidência |
|---|---|---|
| Arquivo superior a 1000 | PostgreSQL local em WASM: 1107 anúncios, 1107 registos, 1107 eventos futuros e 1107 passados, além dos dados de seed. Percurso completo por cursores, datas empatadas e IDs distintos. | Volume sintético local; não foi inserido este volume na produção. O valor administrativo atual de max_rows do PostgREST não foi alterado nem lido. |
| Pesquisa global | Pesquisa encontra texto num elemento fora da página inicial; filtros de tipo/período testados no banco. | Pesquisa por palavras/raízes, não uma medição de latência. |
| Votos sem truncagem | Um evento com 1107 votantes devolve todos os nomes numa única página RPC. Alterar apenas esse conjunto faz regressar apenas um cartão; repetir sem alterações devolve zero cartões. | O backend recalcula a página antes de comparar impressões. |
| Estado do ecrã | Testes DOM mantêm os nós inalterados, listas abertas, pesquisa, formulário com rascunho e âncora de leitura; testam criação, atualização e remoção de cartões. | DOM simulado, sem medição visual por píxeis num navegador real. |
| Concorrência de pedidos | Um pedido em curso, último pedido agregado, resposta antiga ignorada e respostas após descarte sem aplicação. Pesquisa com atraso e retorno à primeira página. | Teste determinístico de rede simulada; não é teste de carga. |
| Notificações | Mais de 1000 notificações paginadas, leitura persistida ao alternar identidades e ao recriar controladores, leitura total, duplicação e destinos revogados/removidos. | Não foi feita uma sessão interativa em dois dispositivos físicos. |
| Segurança | A conta B não consegue ler/alterar a notificação de A; INSERT arbitrário recusado; perda de aba bloqueia o destino e a consulta agregada de votos. | Casos locais e smoke remoto descrito abaixo. |
| Fly to Inbox | Abrir caixa ou animar toast não altera o contador nem chama a leitura; a ação explícita persiste e volta lida após recriar o controlador. | O teste usa preferência de movimento reduzido; o trajeto visual original foi mantido no código. |

### Pedidos: comparação instrumentada

O teste `tests/feed-ui.test.mjs` executa uma cópia da função de Eventos anterior, guardada em `tests/fixtures/events-before.js.txt`, com 20 eventos e contadores de chamadas. Compara-a com o controlador novo e um transporte instrumentado.

| Cenário controlado | Antes | Depois |
|---|---:|---:|
| Carregar 20 eventos e os respetivos votos | 1 consulta de eventos + 20 RPCs de nomes = **21 pedidos** | **1 RPC**, com página e votos agregados |
| Atualização sem mudança | Reconstrução da página no ciclo identificado | 1 RPC; zero cartões devolvidos/aplicados quando as versões são iguais |

A contagem inclui somente eventos e votos. Não inclui autenticação, revalidação de permissões, notificações ou recursos estáticos. Os pedidos da caixa persistente são novos e separados. Não foi medida uma redução de milissegundos, CPU, bytes ou tempo total em produção; não se declara um ganho percentual de latência com base nesta contagem.

### Teste no Supabase real

`tests/live-archives-smoke.sql` passou com identidades e dados sintéticos, papéis reais PostgreSQL e `ROLLBACK`. Confirmou RPC de página, resposta incremental sem alterações, trigger de notificação a partir de evento, leitura persistida, isolamento entre destinatários, recusa de criação pelo cliente, destino revogado e votos filtrados por RLS. Não valida a emissão de JWT nem substitui um percurso num navegador autenticado.

Depois do teste foram confirmadas zero contas sintéticas restantes. As notificações produzidas pelo smoke foram revertidas. Nenhum email foi enviado. O catálogo confirmou RLS nas duas tabelas novas e zero funções públicas `SECURITY DEFINER`.

O advisor só acrescentou a informação esperada de RLS sem políticas na tabela privada de estado de decisões, onde o acesso direto é revogado. O aviso preexistente sobre proteção contra palavras-passe comprometidas continua fora desta alteração.

## Ficheiros alterados/criados

- Frontend: `js/feed.js`, `js/notifications.js`, `js/views.js`, `js/motion.js`, `script.js`, `style.css`, `index.html`.
- Banco: as duas migrações indicadas acima, incluindo índices, funções, triggers e RLS.
- Testes: `tests/archives-db.test.mjs`, `tests/feed-ui.test.mjs`, `tests/notifications-ui.test.mjs`, `tests/navigation.test.mjs`, `tests/support/database.mjs`, `tests/fixtures/events-before.js.txt`, `tests/live-archives-smoke.sql`.
- Documentação: este ficheiro e `README.md`.

## Reprodução e passos pendentes

1. `npm ci --ignore-scripts`, `npm test`, `npm run build`.
2. O smoke SQL é administrativo, transacional e contém `ROLLBACK`; não retirar essa instrução.
3. Verificar visualmente no navegador real a animação e a posição de leitura em desktop/telemóvel, incluindo uma criação/edição enquanto outro utilizador vota.
4. Com duas contas de teste em navegadores/dispositivos distintos, confirmar a sincronização de leitura em até 30 segundos e o comportamento após logout/login. A persistência e o isolamento já foram testados no banco; esse percurso interativo não foi realizado nesta entrega.
5. Se for necessário quantificar latência/CPU em produção, recolher tempos/planos e métricas antes/depois num cenário comparável. Os testes desta entrega demonstram corretude e contagem de pedidos, não um benchmark de produção.
