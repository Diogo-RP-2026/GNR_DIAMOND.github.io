# Notificações — leitura e limpeza automática (ponto 2)

Implementação de 5 de novembro de 2026. Mantém GitHub Pages, Supabase, o desenho da caixa de notificações e a animação Fly to Inbox. Não implementa a renovação de verificação, o editor de equipamento ou a área de logs dos pontos seguintes.

## Comportamento

- A caixa mantém as notificações persistentes da conta. Abrir a caixa ou executar a animação não marca mensagens como lidas.
- **Marcar como lida** atualiza a notificação selecionada. **Marcar todas como lidas** atua sobre as notificações do utilizador até ao instante da listagem, preservando mensagens que cheguem depois desse instante.
- A leitura é validada e datada pelo servidor. A interface aguarda a resposta e atualiza a lista e o contador sem reconstruir a página principal ou os formulários.
- A tarefa de limpeza executa-se no PostgreSQL aos minutos **00, 10, 20, 30, 40 e 50** de cada hora. Elimina todas as notificações com `read_at IS NOT NULL`. Não exige uma idade mínima desde a leitura e mantém as notificações não lidas independentemente da sua antiguidade.
- A limpeza funciona sem qualquer navegador aberto. A lista visível sincroniza-se na atualização periódica existente de 30 segundos, ao abrir a caixa e ao voltar ao separador. A leitura explícita provoca uma atualização imediata após confirmação do servidor.
- Se a limpeza esvaziar uma página de resultados, a caixa regressa à primeira página disponível. Falhas de rede mantêm os dados anteriores e permitem repetir a ação. Pedidos repetidos para marcar mensagens ficam bloqueados enquanto a escrita está pendente.

## Notificações e logs são separados

`public.notifications` contém mensagens temporárias por destinatário. Os logs administrativos estão em `private.admin_audit_log`; os registos operacionais estão em `public.event_logs`. A rotina de limpeza apenas executa `DELETE` sobre notificações lidas e não consulta, altera ou elimina qualquer dessas tabelas de logs. As proteções permanentes introduzidas no ponto 1 mantêm-se.

A política RLS existente exige `recipient_id = auth.uid()` e uma sessão válida/verificada. Nem o Comando consulta ou marca notificações de terceiros por esta interface. O cliente não tem permissão de INSERT ou DELETE direto nem pode mudar o destinatário. A função global de limpeza não está exposta como RPC pública e não é executável por `anon`, `authenticated` ou `service_role`.

## Migrações e configuração

| Ficheiro | Efeito |
|---|---|
| `supabase/migrations/20261105195642_notifications_read_cleanup.sql` | Índice parcial das notificações lidas e função privada `private.purge_read_notifications()`; execução apenas pelo dono da tarefa. Um lock impede limpezas sobrepostas. |
| `supabase/migrations/20261105195653_notifications_read_cron.sql` | Ativa `pg_cron`, restringe a administração do agendador e regista a tarefa `ushe-notifications-read-cleanup`, com expressão `*/10 * * * *`. |

No projeto associado, ambas as migrações já foram aplicadas e a tarefa está ativa. Não voltar a aplicá-las manualmente. Noutro ambiente, aplicar as migrações anteriores e depois estes dois ficheiros, pela ordem indicada. Não existem novas credenciais, Edge Functions, serviços externos ou configurações frontend para esta limpeza.

O nome da tarefa é estável: `cron.schedule` atualiza o registo desse nome se for necessário repetir o seu registo, evitando duplicações. Não desativar a extensão `pg_cron` para alterar esta tarefa, pois isso removeria também outras tarefas eventualmente instaladas.

O agendador depende do projeto Supabase estar operacional. Uma pausa ou indisponibilidade do banco suspende as execuções; as notificações lidas remanescentes são recolhidas numa execução posterior. O histórico de execuções está em `cron.job_run_details` e não é apagado por esta implementação.

## Ficheiros afetados

- Interface: `index.html`, `js/notifications.js`.
- Base de dados: as duas migrações anteriores.
- Testes: `tests/notifications-cleanup-db.test.mjs`, `tests/notifications-ui.test.mjs`, `tests/live-notifications.mjs`, `tests/support/database.mjs`.
- Documentação: `README.md`, `NOTIFICACOES_LIMPEZA.md`.

## Validação

- **119 testes locais aprovados**, incluindo isolamento entre utilizadores, leitura individual e global para mais de 1000 notificações, hora de leitura do servidor, notificações não lidas antigas, limpeza de lidas recentes, integridade dos logs, animação, concorrência de cliques, falhas de rede e recuperação de uma página esvaziada. `PGlite` executa o SQL real da limpeza; o agendador com background workers é validado no Supabase.
- `npm run build`, verificação de sintaxe e `git diff --check` aprovados.
- **Execução agendada real em 2026-11-05 às 20:10 (Lisboa):** `cron.job_run_details` registou sucesso. A notificação de teste tinha sido lida às 20:09:40 e foi removida; outra não lida há 90 dias permaneceu com o mesmo conteúdo. Os 8 logs administrativos existentes permaneceram.
- O teste HTTP usa contas temporárias reservadas em `example.invalid`, login real e verificação concedida apenas às sessões de teste, sem alterar a política do portal nem enviar emails. Credenciais e tokens ficam apenas na memória do teste. **15 cenários HTTP aprovados**: leitura individual/global, contador, isolamento entre contas, tentativas de alteração do destinatário e eliminação direta e acesso anónimo recusados. As três contas temporárias e todas as suas notificações foram removidas. No final mantêm-se 4 contas reais, 21 agentes, 3 notificações não lidas com o mesmo conteúdo e 8 logs administrativos; não restam notificações lidas da população inicial nem configurações pendentes.

Não foi alterada a política de autenticação dos 30 dias; pertence ao ponto 3. A área administrativa de consulta e ocultação de logs pertence ao ponto 5.

Referências: [instalação do Cron](https://supabase.com/docs/guides/cron/install) e [agendamento e histórico](https://supabase.com/docs/guides/cron/quickstart).
