# Verificação da entrega

## Verificado

- Sintaxe de todos os ficheiros JavaScript da aplicação, através de `node --check`.
- **16 testes aprovados**: tratamento de HTML, pesquisa sem acentos, conversão Europe/Lisbon, horas inexistentes/repetidas, duração de eventos, ordenação de agenda/arquivo, convites Discord e carregamento de mais de 1000 respostas.
- Execução real de `01_schema.sql` e `02_seed.sql` em PostgreSQL/PGlite, incluindo tabelas, funções, relações, índices e políticas RLS. Os esquemas Auth e Storage do Supabase são simulados nessa execução local.
- Visitantes sem acesso às tabelas internas; início limitado a títulos de anúncios e contagem de efetivos.
- Contas novas não se aprovam nem recebem Comando através de metadados de registo.
- Aprovação, acessos por aba, proteção contra auto-promoção e suspensão com o mesmo JWT.
- Uma resposta por conta/evento, alteração de resposta e impossibilidade de modificar votos de terceiros.
- Registos dependentes da permissão adicional de criação; documentos/participantes são guardados atomicamente.
- Fotografias privadas: leitura condicionada pela aba e escrita reservada ao Comando.
- Página inicial, contactos e bloqueio de uma ligação direta para Equipa sem sessão, no navegador.
- Interface interna com um cliente de teste e os dados iniciais: Equipa, Quem Somos, Anúncios, Eventos, Avisos, Fardamento, Equipamento, Regulamento, Registos e Administração.
- Pesquisa `joao` encontra João Barbosa; formulário de edição carrega os seus dados.
- Criação de um evento, troca Vou/Não vou e gravação de permissões no cliente de teste da interface.
- Apresentação desktop e menu móvel num enquadramento de 390 px; sem transbordo horizontal observado na página inicial móvel.
- O brasão e o favicon coincidem com os ficheiros da versão anterior do repositório.

## Limites

Não foi fornecido um projeto Supabase configurado nem as suas chaves públicas. Não foram criadas contas reais, executado SQL num serviço de produção, enviados emails, validados os limites do serviço ou carregadas fotografias num bucket real. Os formulários internos foram verificados com dados sintéticos; essa verificação não substitui um teste final da integração Auth/PostgREST/Storage depois da configuração.

O portal não apresenta uma sessão de demonstração em produção e não concede Comando à primeira conta. Os ficheiros de teste usados na pré-visualização não integram o site nem o ZIP.

Para a verificação final da instalação, cria uma conta Comando e uma conta membro. Aprova apenas Eventos para o membro, confirma o acesso e o voto, retira a permissão e confirma que a mesma conta deixa de conseguir consultar e votar. Depois atribui Registos, primeiro sem e depois com autorização de criação, e verifica o comportamento. Testa a confirmação/recuperação por email e o upload de uma fotografia com a configuração real.
