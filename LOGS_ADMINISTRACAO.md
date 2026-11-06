# Logs da Administração

Abre **Administração → Logs** com uma conta de Comando aprovada e uma sessão verificada. A listagem apresenta vinte registos por página, dos mais recentes para os mais antigos. Podes pesquisar pelo autor, nome do registo ou referência e combinar os filtros de listagem, entidade e resultado.

**Ocultar da listagem** retira o registo da vista **Visíveis**. Em **Listagem → Ocultos** encontras o registo original, a pessoa que o ocultou e a data. A vista **Todos** inclui ambos os estados. A ação de ocultar gera um novo evento de auditoria. Repetir o pedido conserva a primeira ocultação.

## O que fica registado

| Área | Eventos |
| --- | --- |
| Contas | Aprovação, cargo, permissões de abas, alteração do nome e resultados da eliminação. |
| Perfis | Alterações oficiais de agente, subunidades, formações, especializações e distinções. |
| Equipamento | Criação, edição, eliminação, gestão de imagens e conflitos de edição. |
| Auditoria | Ocultação de um registo, com referência à ação original. |

O PostgreSQL atribui o autor a partir da sessão e do perfil da base de dados. Cada evento conserva a referência e o nome do registo afetado, mesmo depois de a conta ou o conteúdo serem removidos. Alterações administrativas executadas pelo proprietário da base de dados ficam identificadas como **Sistema**. As novas categorias começam a ser registadas na data da migração.

As alterações gravadas pelas interfaces e pela API acionam a auditoria na mesma transação. As permissões e subunidades são atualizadas por diferença, pelo que voltar a guardar os mesmos valores evita eventos repetidos. Os detalhes incluem campos alterados, estados e referências previstos para cada operação. Palavras-passe, códigos OTP, tokens, credenciais e o texto das notas ou biografias ficam fora dos detalhes.

## Migração e configuração

A migração `supabase/migrations/20261106223916_admin_audit_logs.sql` mantém o conteúdo de `private.admin_audit_log`. A tabela `private.admin_audit_hidden` guarda o autor e o instante da ocultação separadamente. As tabelas têm RLS e privilégios restritos. Os gatilhos impedem atualização, eliminação e truncamento de ambas. Nenhuma relação para contas ou conteúdos pode propagar uma eliminação aos logs.

As funções `admin_audit_list` e `admin_audit_hide` verificam no servidor o cargo, a aprovação, a sessão e a validade da verificação. Mantém `private` fora dos esquemas expostos na Data API. A configuração reutiliza a autenticação e a chave pública atuais. A limpeza de notificações é executada separadamente sobre a caixa de entrada.

Para outra instalação, aplica esta migração após as anteriores e publica os ficheiros estáticos. O frontend está em `js/admin-audit.js`, `js/views.js` e `style.css`. A migração já está aplicada no projeto atual.

## Validação

- Passaram 174 testes locais. Os novos cenários verificam permissões, autoria, pesquisa, filtros, paginação, ocultação repetida, preservação do conteúdo, auditoria de operações e bloqueio de sessões expiradas.
- `tests/live-admin-audit.sql` passou no PostgreSQL do Supabase com dados sintéticos e `ROLLBACK`. Validou a autoria, a recusa a Membros, a ocultação, a preservação do registo após eliminar o equipamento e as restrições de acesso e eliminação.
- Três verificações HTTP confirmaram a recusa de listagem e ocultação anónimas e de acesso ao esquema privado. Os 19 logs anteriores mantiveram a mesma impressão digital e os dados de teste foram revertidos.
- No Chrome, a pré-visualização com dados sintéticos confirmou pesquisa, paginação, o evento de ocultação e a leitura no filtro Ocultos. A compilação dos ficheiros públicos e a validação do diff passaram.
