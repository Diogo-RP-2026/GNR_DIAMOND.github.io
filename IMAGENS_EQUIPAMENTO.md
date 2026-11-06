# Imagens de equipamento

Com uma conta de Comando, abre **Equipamento → Editar** ou **Adicionar equipamento**. O mesmo formulário está disponível em **Administração → Equipamento**.

1. Escolhe **Adicionar ou substituir imagem** e seleciona um ficheiro JPG, PNG ou WebP. O limite é de 5 MB, 4 megapíxeis e 4096 píxeis por lado.
2. Escolhe o recorte horizontal, quadrado, panorâmico ou com a proporção original. Arrasta a imagem com o rato ou um dedo. Ajusta o zoom no controlo deslizante, com a roda do rato ou com dois dedos. As setas e as teclas `+` e `−` também funcionam com o foco na pré-visualização.
3. Ajusta a largura ou a altura. O editor calcula a outra dimensão para manter a proporção escolhida.
4. Usa **Guardar** para ver a imagem ajustada no formulário. **Cancelar** fecha o editor e mantém a pré-visualização anterior.
5. Usa **Guardar alterações** para gravar o equipamento e a imagem. Podes escolher **Remover imagem atual** para voltar à imagem por defeito.

## Gravação e limpeza

A função `equipment-image` confirma a sessão e o cargo atual no Supabase. A regra dos 30 dias aplica-se às operações de equipamento. O serviço valida assinatura, formato, tamanho e dimensões, descodifica o ficheiro e grava a versão JPEG ajustada no bucket privado `ushe-media`.

O ficheiro novo fica identificado para limpeza desde o carregamento. A base de dados associa a imagem e guarda os campos do equipamento na mesma transação. Uma edição desatualizada recebe um pedido para atualizar a listagem. Se a associação falhar, a imagem atual continua disponível e o ficheiro novo segue para limpeza.

A remoção da última referência coloca o ficheiro na fila. O serviço consulta equipamento, membros e fardamento antes de o eliminar pela API de Storage. Enquanto a remoção decorre, a base de dados impede novas referências ao ficheiro. Imagens partilhadas continuam acessíveis enquanto houver referências.

A tarefa `ushe-equipment-image-cleanup` repete a limpeza a cada dez minutos. Também recupera carregamentos sem associação e tarefas interrompidas após 15 minutos. O `pg_cron` agenda a execução e o `pg_net` envia um identificador de utilização única à função. A fila de ficheiros e os registos de auditoria ficam em tabelas distintas. A autoria, a data, o equipamento e o resultado das alterações de imagem são registados pelo servidor.

## Ficheiros e configuração

| Área | Ficheiros ou configuração |
| --- | --- |
| Editor e apresentação | `js/image-crop.js`, `js/forms.js`, `js/views.js`, `js/api.js`, `script.js`, `style.css`, `images/equipamento-default.svg` |
| Serviço de imagens | `supabase/functions/equipment-image/` e validação reutilizada de `supabase/functions/agent-avatar/validation.js` |
| Migração | `20261105211331_equipment_image_editor.sql` |
| Resposta a edições concorrentes | `20261106222238_equipment_image_revision_conflict.sql` |
| Configuração | `supabase/config.toml`, bucket privado `ushe-media`, `pg_cron` e `pg_net` |

Para instalar noutro projeto já atualizado com as migrações anteriores, aplica as duas migrações por ordem. Confirma que o endereço em `private.equipment_media_settings.worker_url` aponta para a função `equipment-image` desse projeto. Publica a função com o `deno.json` e o módulo partilhado de validação. O handler valida os tokens de utilizador e os pedidos agendados, conforme a entrada em `supabase/config.toml`. Usa os segredos injetados pelo Supabase e a lista de origens já configurada. Publica depois os ficheiros estáticos no GitHub Pages.

No projeto atual, as duas migrações foram aplicadas e a função `equipment-image` está ativa na versão 2. O conselheiro assinala o registo de `pg_net` no esquema `public`. As funções e tabelas da extensão estão no esquema `net`, separado da API pública do portal. O pedido agendado transporta apenas o identificador temporário de manutenção. [Ver regra do conselheiro](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)

## Testes

- `npm test` aprovou 162 testes. Os cenários de equipamento cobrem limites de imagem, recorte, dimensões, permissões, concorrência, ficheiros partilhados e retoma após falhas.
- `tests/equipment-editor.html` permite repetir o ensaio do navegador com uma imagem sintética. No Chrome foram verificados o cancelamento, o arrasto, o zoom, a pré-visualização e a exportação JPEG de 800 × 600 píxeis, com o conteúdo do recorte selecionado.
- `tests/live-equipment.mjs` aprovou 17 verificações HTTP no Supabase. Confirmou a gravação e leitura do JPEG privado, a recusa de acessos indevidos, a substituição com imagem partilhada, o conflito de edição e a limpeza depois da última referência.
- A execução agendada de 6 de novembro de 2026 às 22h30 removeu o último ficheiro de teste. O serviço respondeu com HTTP 200 e a fila ficou vazia. As dez fichas e as seis imagens originais continuaram disponíveis.
- Os ensaios usaram apenas equipamentos, ficheiros e contas descartáveis. As contas foram removidas por uma operação administrativa de teste. Os registos permanentes dos ensaios foram preservados.
- O toque usa os mesmos eventos de ponteiro do editor. A validação num telemóvel físico fica pendente.
