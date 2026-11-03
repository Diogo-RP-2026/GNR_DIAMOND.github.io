# Perfil do Agente — instalação e utilização

Implementação para o portal USHE/GNR existente, em HTML, CSS e JavaScript com rotas por fragmento, sem compilação. O GitHub Pages serve os ficheiros; Supabase assegura autenticação, dados, permissões e fotografias.

## Ativação no portal existente

A migração desta atualização e a função `agent-avatar` já foram instaladas no projeto existente. Não reaplicar a migração nesse projeto. A associação de cada conta ao agente correspondente é feita pelo Comando em **Equipa → Gerir dados oficiais**, após confirmar a identidade.

## Instalação numa base de dados existente

1. Executar **uma vez** `supabase/migrations/20261103201646_agent_profiles.sql` no SQL Editor do projeto existente. Depende do esquema inicial, da atualização de eventos/contas e da migração OTP já existentes. Não voltar a executar `01_schema.sql`, `02_seed.sql` ou os dados de exemplo.
2. Publicar a Edge Function `agent-avatar`, com `verify_jwt = true`. O código está em `supabase/functions/agent-avatar/` (`index.ts`, `handler.js`, `validation.js`). O import do SDK está fixado em `2.118.0`. Usar o CLI ou o Dashboard. Os valores `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo ambiente Supabase; nunca os copiar para ficheiros públicos. O código verifica também o utilizador no Auth e consulta o agente através de RLS antes de aceitar qualquer upload.
3. Substituir no repositório os ficheiros `script.js`, `style.css`, `js/api.js`, `js/forms.js`, `js/views.js` e adicionar `js/profile.js`. O ZIP contém o portal completo, incluindo os ficheiros preservados.
4. Aguardar o GitHub Pages atualizar e recarregar a página. O menu da conta passa a incluir **O meu perfil**. O nome/cartão de cada agente na Equipa permite abrir o perfil.
5. Com uma conta de Comando: abrir **Equipa → Gerir dados oficiais** no agente correto. Selecionar a sua conta, confirmar a patente e preencher indicativo, número de agente, ingresso e subunidades (uma por linha). Guardar.
6. A conta associada pode abrir **O meu perfil → Editar perfil**, escolher uma fotografia e escrever a biografia. Formações, especializações e distinções são adicionadas pelo Comando no perfil correspondente.

O ficheiro `supabase/config.toml` inclui a configuração da nova função e preserva a função OTP existente. Não desativar o JWT de `agent-avatar`.

## Dados e identidade

- Reutiliza `members` como fonte oficial de nome, patente, indicativo e uniforme.
- `members.user_id` liga explicitamente um agente a uma conta de `profiles` (relação única). Não se associam automaticamente contas pelo nome ou email.
- `members.agent_number` é o número de agente, separado do uniforme. `joined_on` é a data oficial de ingresso: não se usa a data de criação da conta como data de serviço.
- `agent_personal`: biografia até 500 caracteres e caminho da fotografia pessoal.
- `member_subunits`: várias subunidades por agente.
- `agent_qualifications`: distingue `formacao` e `especializacao`, com conclusão e entidade/instrutor opcional.
- `agent_distinctions`: nome, descrição, atribuição e símbolo/insígnia em texto ou emoji opcional.
- Não são criadas patentes, formações, distinções, datas de ingresso ou participações fictícias. Os estados vazios permanecem visíveis até existirem registos oficiais.
- Alterar a ligação de uma conta remove a biografia/fotografia pessoal do perfil anterior, para não transferir conteúdo pessoal para o novo titular. A fotografia oficial existente pode continuar a ser usada como alternativa.

## Permissões

| Operação | Regra no servidor |
| --- | --- |
| Consultar o próprio perfil | Conta autenticada, aprovada, verificação OTP válida quando exigida e associação oficial |
| Consultar outro agente | As mesmas verificações e autorização existente para Equipa |
| Alterar biografia/fotografia pessoal | Apenas o titular associado |
| Alterar dados oficiais, subunidades, qualificações e distinções | Comando aprovado, com a verificação existente |
| Alterar cargo de acesso pelo perfil | Não permitido; o fluxo de acessos existente mantém-se separado |
| Consultar atividade | RLS do perfil e de cada evento/registo de origem |
| Carregar imagem diretamente pela API Storage com JWT de utilizador | Recusado; upload obrigatório pela função que valida o ficheiro |
| Descarregar fotografia | Pedido autenticado sujeito a RLS; bucket privado, sem URL pública |

As tabelas novas têm RLS, privilégios explícitos e proteção OTP. As funções públicas de gravação e atividade usam `SECURITY INVOKER`. Apenas verificações internas e o trigger de limpeza ficam no esquema `private`, com `search_path` fixo e execução pública revogada. A API de perfil não consulta emails de autenticação. O formulário administrativo de associação permite ao Comando confirmar a identidade usando os dados de conta que já pode consultar na administração.

## Fotografia

A Edge Function valida tamanho até 5 MiB (5 × 1024 × 1024 bytes), MIME permitido e assinatura do conteúdo JPEG, PNG ou WebP. Limita também a leitura do corpo HTTP, mesmo sem `Content-Length`, e ignora o nome/caminho enviado pelo cliente. O caminho guardado é `UUID_DA_CONTA/UUID_ALEATORIO.extensao`.

O bucket `ushe-avatars` também restringe tamanho e MIME. Apenas o serviço da função pode inserir objetos; agentes não podem contornar a validação carregando diretamente para o Storage nem substituir ficheiros de terceiros. A função usa a chave de serviço exclusivamente para guardar os bytes já validados, depois das verificações de identidade, OTP, aprovação e associação por um cliente sujeito a RLS.

A gravação da biografia e da referência da fotografia é atómica. O ficheiro novo é removido se a gravação falhar; o anterior só é removido depois do sucesso. Não é permitido remover diretamente uma imagem ainda referenciada pelo perfil. Se o navegador for encerrado entre o upload e a gravação poderá ficar um ficheiro sem referência, privado, que a administração poderá limpar posteriormente.

A fotografia tem proporções fixas, recorte central, `object-fit: cover` e círculo com `border-radius: 50%`, incluindo a pré-visualização. Na ausência de fotografia pessoal usa a fotografia oficial ou as iniciais.

## Atividade recente

`agent_activity` consulta os dados reais de `events`/`event_responses` e `event_logs`/`event_log_participants`. Apresenta os últimos 30 registos autorizados, ordenados do mais recente para o mais antigo.

- **Presença confirmada · Vou** e **Disponibilidade · Não vou** são respostas do agente à agenda. A data de atualização da resposta e a data do evento são apresentadas separadamente.
- **Participação registada** exige um registo operacional terminado que inclua o agente na lista de participantes. Não é inferida a partir de um voto, da passagem da data ou da criação de um evento.
- A consulta é `SECURITY INVOKER`, com JOIN às tabelas de origem: as respetivas políticas RLS continuam a filtrar linhas, incluindo políticas de restrição por evento que venham a ser acrescentadas.
- Não são devolvidos resumos, observações, localização, emails ou contagens de registos ocultos.
- Alterações administrativas nos registos de origem refletem-se na atividade; não existe edição livre da atividade no perfil.

## Validação executada

`npm ci` e `npm test`: **64 testes aprovados**. Testes PostgreSQL/PGlite executam a migração nova sobre o esquema existente e cobrem persistência da biografia, limite de caracteres, associação de conta, dados oficiais, leitura/edição por terceiros, utilizadores pendentes, visitante sem sessão, RLS da atividade por aba e por evento, distinção entre voto e participação, propriedade das fotografias e verificação OTP. Testes do serviço cobrem autenticação, associação, assinatura/MIME, limite do corpo e falhas Storage. Testes DOM verificam texto escapado, ausência de emails e botões de edição.

Inspeção visual no navegador em computador e num viewport interno de 375 px, incluindo abertura do editor pessoal. Foram usados dados fictícios exclusivamente numa página temporária de QA, que não faz parte do pacote. Os dados apresentados pelo portal são sempre obtidos do Supabase.

Os testes locais simulam as interfaces Auth e Storage para executar as políticas com PostgreSQL real em WASM. O envio de um ficheiro real e o ciclo completo com uma conta real/OTP no serviço de produção devem ser confirmados após aplicar a migração, publicar a função e associar a conta correta. Não foram enviadas mensagens nem alteradas identidades ou cargos de contas reais para testar.
