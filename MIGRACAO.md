# Alterações face ao ZIP original

O ZIP original tinha 105 ficheiros: aplicação React/TypeScript, componentes de interface, configuração de compilação, execução no servidor e integração remota para conteúdos, perfis, eventos e votos.

Foi reescrito como um portal estático que o GitHub Pages pode servir diretamente.

| Área anterior | Resultado nesta versão |
| --- | --- |
| Migrações SQL, políticas e testes de RLS | Removidos integralmente; não há ficheiros `.sql` |
| Cliente e dependências Supabase | Removidos; não há chaves nem configuração externa |
| Login por email/palavra-passe | Substituído por seleção de perfil local, explicitamente sem autenticação |
| Perfis e cargos remotos | Guardados localmente no navegador |
| Eventos e respostas remotos | Guardados localmente; uma resposta por perfil e evento |
| Permissões e visibilidade | Preferências da interface local, sem proteção de informação |
| Conteúdos iniciais no script de instalação | Transferidos para `conteudo.js`, preservando os textos institucionais |
| Editor de conteúdos | Reescrito em JavaScript; títulos, secções, imagens, itens e ordem preservados |
| Editor de identidade e menu | Preservado na Gestão local |
| React, TypeScript, TanStack, Tailwind e bibliotecas de componentes | Substituídos por HTML, CSS e JavaScript normais |
| Servidor, renderização no servidor e Nitro | Removidos |
| npm, Bun, dependências, lockfiles e build Vite | Removidos; não existe etapa de compilação |
| Workflow de compilação e publicação | Substituído por publicação direta de uma branch |
| Rotas `/eventos`, `/gestao`, `/entrar` | Convertidas em `#/eventos`, `#/gestao`, `#/entrar` |
| Imagens em `src/assets/` e `public/` | Emblema consolidado em `images/`; ícone preservado na raiz |
| Fontes Google e hooks de reporte do editor anterior | Removidos; não existem pedidos obrigatórios a serviços externos |
| Tema e estrutura da unidade | Preservados: verde escuro, dourado, emblema e sete cargos |

Foram acrescentados filtros de eventos, cópia/importação JSON, exportação dos textos públicos em `conteudo.js`, tratamento de falhas de armazenamento e navegação por teclado.

O estado local é separado por caminho do site. Dois projetos publicados em subpastas diferentes do mesmo domínio não usam a mesma chave de dados. A seleção do perfil fica por separador; os dados ficam no armazenamento local do mesmo navegador.

Não há migração automática de dados de um serviço anteriormente usado: o ZIP original contém código e textos iniciais, mas não contém um export dos perfis, eventos ou votos de uma instalação real.

Esta entrega mantém os fluxos de Eventos e Gestão como funcionalidades locais. Não substitui um sistema partilhado com identidade verificada, permissões no servidor e sincronização entre utilizadores.
