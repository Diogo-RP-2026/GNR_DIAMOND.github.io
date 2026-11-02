# Verificação da entrega

## Verificado

- Sintaxe de todos os ficheiros JavaScript da aplicação, através de `node --check`.
- **17 testes aprovados**: tratamento de HTML, pesquisa sem acentos, conversão Europe/Lisbon, horas inexistentes/repetidas, duração de eventos, ordenação de agenda/arquivo, convites Discord e carregamento de mais de 1000 respostas.
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

## Atualização visual — referência Lovable

A aparência pública foi reconstruída a partir de `pixel-perfect-recreation-506.lovable.app`, com os mesmos recursos de fundo e brasão e as famílias Barlow / Barlow Condensed servidas localmente. A comparação de Início confirmou as mesmas dimensões principais no mesmo navegador: cabeçalho de 73 px, destaque de 424 px e cartões de 144 px. Contactos e Entrar também foram comparados. As áreas privadas da referência exigem conta aprovada e não foram consultadas. O tema foi aplicado às funcionalidades internas existentes.

Foi acrescentado um teste PostgreSQL para confirmar que a estatística de treinamentos divulga apenas contagens e não permite a visitantes ler os documentos. Os 17 testes passaram.

## Instalação real no Supabase — 2 de novembro de 2026

O esquema e o seed foram aplicados ao projeto `GNR_DIAMOND.github.io` (plano Free). Foram confirmados 22 membros, 2 anúncios, 1 evento, 1 aviso, 2 categorias de fardamento, 10 itens de equipamento e 5 artigos. Todas as tabelas têm RLS ativa e o bucket `ushe-media` é privado, limitado a JPG/PNG/WebP até 5 MB.

As rotinas privilegiadas foram colocadas no esquema privado; as funções públicas de acesso são `SECURITY INVOKER`. A nova verificação de segurança do Supabase terminou sem avisos. Os 17 testes automáticos continuaram a passar. A API real devolveu HTTP 200 para estatísticas/contactos e HTTP 401 para pedidos anónimos a membros, perfis e anúncios. Autenticação por email e registos de contas estão ativos, com confirmação de email obrigatória.

Ainda não existiam contas Auth no momento da instalação. A criação da primeira conta e a sua promoção a Comando requerem a identificação do email pretendido e a escolha privada da palavra-passe pelo utilizador. As mensagens de confirmação/recuperação e o login completo serão verificados depois dessa etapa e da configuração dos endereços de autenticação.
