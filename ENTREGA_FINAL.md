# Entrega do portal USHE/GNR

O portal usa HTML, CSS e JavaScript no GitHub Pages e Supabase para autenticação, dados, Storage, funções e tarefas agendadas. Os cinco pontos estão instalados no projeto atual. [Abrir o portal](https://diogo-rp-2026.github.io/GNR_DIAMOND.github.io/)

| Ponto | Utilização e comportamento | Documentação |
| --- | --- | --- |
| 1. Contas | **Administração → Utilizadores e acessos → Gerir/Editar conta → Apagar conta**. O Comando pode eliminar um Membro. A operação confirma o nome, revoga as sessões, remove conta, perfil e fotografias exclusivas e conserva o histórico. Uma falha deixa a operação disponível para retoma. | [Contas de Membros](CONTAS_MEMBROS.md) |
| 2. Notificações | Na caixa de entrada, **Marcar como lida** e **Marcar todas como lidas** atualizam a lista e o contador. O PostgreSQL recolhe as lidas a cada dez minutos. A animação Fly to Inbox mantém a notificação por ler até à ação explícita. | [Limpeza de notificações](NOTIFICACOES_LIMPEZA.md) |
| 3. Verificação | O código inicial tem quatro dígitos. Cada verificação concluída inicia 30 dias de validade no servidor. A renovação também se aplica a sessões abertas. Após cinco pedidos de código, o servidor impõe uma espera de dois minutos. | [Verificação a cada 30 dias](VERIFICACAO_30_DIAS.md) |
| 4. Equipamento | **Equipamento → Editar → Adicionar ou substituir imagem**. O editor permite recorte, zoom, reposicionamento e dimensões proporcionais. O Supabase guarda o JPEG ajustado e remove ficheiros sem referências. | [Imagens de equipamento](IMAGENS_EQUIPAMENTO.md) |
| 5. Logs | **Administração → Logs**. O Comando pesquisa, filtra, percorre páginas e pode escolher **Ocultar da listagem**. O original permanece em **Ocultos** e o servidor regista quem o ocultou e quando. | [Logs da Administração](LOGS_ADMINISTRACAO.md) |

## Ficheiros entregues

| Área | Ficheiros principais |
| --- | --- |
| Interface e navegação | `index.html`, `style.css`, `script.js`, `js/api.js`, `js/forms.js`, `js/views.js` |
| Funcionalidades | `js/accounts.js`, `js/notifications.js`, `js/otp.js`, `js/image-crop.js`, `js/admin-audit.js`, `images/equipamento-default.svg` |
| Backend e configuração | `supabase/functions/account-admin/`, `supabase/functions/portal-otp/`, `supabase/functions/equipment-image/`, `supabase/config.toml` |
| Validação | `tests/`, incluindo testes de permissões, interface, serviços, SQL e integração HTTP |
| Entrega | `README.md`, este guia e os guias por ponto |

## Migrações e configuração

Os ficheiros seguintes estão em `supabase/migrations/` e foram aplicados ao projeto associado. A ordem serve para instalar esta entrega noutro projeto que já tenha as migrações anteriores. Em instalações com dados, aplica apenas as migrações em falta e preserva o esquema e os dados de origem. O histórico remoto gerido pela integração pode ter versões com timestamps diferentes dos nomes locais.

| Ordem | Migração | Alteração |
| --- | --- | --- |
| 1 | `20261105191630_member_account_deletion.sql` | Permissões, retoma de eliminações, preservação das referências e auditoria permanente. |
| 2 | `20261105195642_notifications_read_cleanup.sql` | Limpeza privada de notificações lidas. |
| 3 | `20261105195653_notifications_read_cron.sql` | Agendamento da limpeza de notificações com `pg_cron`. |
| 4 | `20261105204159_email_verification_thirty_days.sql` | Última verificação por conta, renovação e autorização no servidor. |
| 5 | `20261105211331_equipment_image_editor.sql` | Associação e limpeza de ficheiros de equipamento com proteção das imagens partilhadas. |
| 6 | `20261106222238_equipment_image_revision_conflict.sql` | Tratamento de edições desatualizadas. |
| 7 | `20261106223916_admin_audit_logs.sql` | Listagem, ocultação e registo das alterações administrativas. |

O GitHub Pages publica a partir da `main`. `config.js` contém o URL do Supabase e a chave pública. Numa instalação nova, confirma o mesmo endereço nas URLs do Auth, a origem em `OTP_ALLOWED_ORIGINS` e os destinos da política de segurança em `index.html`. Mantém `private` e `net` fora dos esquemas expostos na Data API e os buckets `ushe-avatars` e `ushe-media` privados.

As funções ativas na verificação final eram `account-admin` v1, `portal-otp` v14, `agent-avatar` v2 e `equipment-image` v2. A configuração de autenticação das funções está em `supabase/config.toml`. As credenciais administrativas e os segredos de email ficam nas Edge Functions. Para o remetente Gmail, segue a configuração dos nomes de segredos do guia. [Configurar o Gmail](ATIVAR_OTP_GMAIL.md)

As tarefas `ushe-notifications-read-cleanup` e `ushe-equipment-image-cleanup` estão ativas com `*/10 * * * *`. O segundo agendamento usa `pg_net` e o endereço em `private.equipment_media_settings.worker_url`. Ao mudar de projeto, aponta esse endereço para a função `equipment-image` correspondente.

## Validação final

| Requisito | Evidência |
| --- | --- |
| Eliminação reservada ao Comando e apenas para Membros | Testes de permissões, tentativa de despromoção de outro Comando, teste SQL com sessão sintética e 16 verificações HTTP da fase de contas. O teste HTTP confirmou a remoção da fotografia pela API de Storage. |
| Sessão revogada e histórico preservado | O ensaio SQL final eliminou um Membro sintético, recusou a sessão antiga e confirmou que o log oculto associado manteve o conteúdo. O perfil e o agente desapareceram durante o ensaio, e o histórico continuou disponível. |
| Limpeza apenas das lidas e isolamento por utilizador | Testes locais, 15 verificações HTTP e execução agendada real. A execução de 5 de novembro às 20h10 removeu uma notificação lida há segundos e preservou outra por ler há 90 dias. |
| Verificação inicial e renovação de sessões abertas | Testes de código incorreto, consumo único, prazo de 720 horas, cinco pedidos e espera de dois minutos. Os ensaios SQL e as 14 verificações HTTP confirmaram bloqueio e renovação no servidor. |
| Imagem ajustada, permissões e limpeza segura | O Chrome exportou o recorte a 800 × 600 píxeis. As 17 verificações HTTP confirmaram o JPEG no Storage, preservação de uma imagem partilhada e recusa de escritas indevidas. A tarefa agendada de 6 de novembro às 22h30 removeu o último ficheiro descartável. |
| Ocultação de logs | Testes de pesquisa, paginação, autorização e ocultação repetida. O ensaio SQL confirmou a conservação do original e três verificações HTTP confirmaram as recusas de acesso anónimo e ao esquema privado. |

Na revisão final passaram **174 testes locais**, `npm run build` e os **sete ensaios SQL no Supabase**. A bateria SQL inclui `live-account-admin.sql`, `live-archives-smoke.sql`, `live-otp-smoke.sql`, `live-otp-request-limit.sql`, `live-verification-period.sql`, `live-security-audit.sql` e `live-admin-audit.sql`. Todos os ensaios SQL usaram dados sintéticos e terminaram com `ROLLBACK`. Os testes HTTP de cada ponto estão documentados nos guias respetivos.

A verificação de 6 de novembro de 2026 às 23h09, hora de Lisboa, confirmou quatro contas, 21 agentes, dez equipamentos, sete imagens de equipamento associadas e os 19 logs permanentes com o conteúdo original. As filas de eliminação de contas e limpeza de imagens estavam vazias. Os papéis usados pela aplicação ficaram sem privilégios de escrita direta nas tabelas de auditoria.

Para repetir os testes locais, usa Node.js 22 ou superior e executa na raiz do repositório:

```bash
npm ci --ignore-scripts
npm test
npm run build
```

Executa os ensaios SQL completos pelo acesso administrativo, incluindo `ROLLBACK`. Os testes HTTP opcionais usam contas e ficheiros descartáveis. Introduz as credenciais dessas contas por stdin conforme cada script.

## Validação manual pendente

- Repetir a entrega real do email de verificação numa caixa de correio de teste, incluindo a renovação. O transporte foi simulado nos testes locais e o Supabase confirmou a configuração disponível e as regras de verificação. A receção de um novo email não foi ensaiada nesta revisão.
- Testar o editor num telemóvel físico com uma imagem e equipamento descartáveis. Verificar o arrasto, o zoom com dois dedos e a gravação. O ensaio no Chrome validou a edição com rato e a exportação.

O conselheiro do Supabase mantém os avisos sobre a proteção de palavras-passe comprometidas e o registo da extensão `pg_net` no esquema `public`. As rotinas da extensão encontram-se em `net`, cujo acesso pela Data API foi recusado nos testes. [Proteção de palavras-passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) · [Regra de extensões](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
