# Portal USHE — Eventos e Gestão

Projeto completo baseado no ZIP `5k5js3n.zip`. Mantém React, TypeScript, TanStack Router/Start e o tema USHE. A página inicial foi adaptada; não foram duplicadas abas existentes. Foram criadas as rotas `/eventos`, `/gestao` e `/entrar`, ligadas ao menu.

## Instalar e configurar

Requer Node.js 22.12 ou superior e npm. Usa `npm ci` com o `package-lock.json` incluído. O `bun.lock` original foi preservado como referência; este pacote usa npm.

1. Cria um projeto Supabase ou usa uma base onde os nomes abaixo ainda não existam.
2. No SQL Editor do Supabase, como `postgres`, executa **primeiro** `supabase/001_schema.sql` e **depois** `supabase/002_conteudo_inicial.sql`, integralmente.
3. Copia `.env.example` para `.env`. Preenche a URL do projeto e a chave pública `anon` ou `publishable`. Nunca uses a chave `service_role` no site.
4. Em Supabase Authentication, ativa email/palavra-passe. Define o Site URL e os Redirect URLs para o endereço onde vais testar/publicar; inclui a rota `/entrar/` e a raiz do site. Mantém a confirmação de email se pretenderes confirmar os endereços.
5. Executa os comandos abaixo, abre o endereço que o Vite indicar, entra em `/entrar` e cria/confirma a tua conta.
6. Em `supabase/003_primeiro_comando.sql`, substitui `SUBSTITUI_PELO_TEU_EMAIL` pelo email dessa conta. Executa o ficheiro no SQL Editor. Nunca existe promoção automática do primeiro registo.
7. Recarrega o site. A aba Gestão aparecerá para essa conta.

```bash
npm ci
npm run dev
```

**Ordem do SQL:** `001_schema.sql` → `002_conteudo_inicial.sql` → criar/confirmar conta → `003_primeiro_comando.sql`.

`001` é uma instalação inicial, executada uma única vez. Se já existirem tabelas `perfis`, `paginas`, `permissoes_paginas`, `eventos`, `votos_eventos` ou o enum `cargo_ushe`, não apagues dados: é necessário comparar o teu esquema com esta migração. O ZIP não continha um esquema Supabase anterior. `002` pode ser repetido: não substitui páginas que já existam. Mantém o schema `private` fora da lista de schemas expostos da Data API; não é necessário expô-lo para as políticas funcionarem.

## GitHub e GitHub Pages

Foi acrescentado um build estático próprio, além do build TanStack Start original. O GitHub Pages serve os ficheiros estáticos e o Supabase fornece autenticação, dados e autorização. Não é necessário um servidor Node no alojamento do Pages.

1. Envia o conteúdo da pasta do projeto para a raiz do repositório, incluindo `.github/workflows/pages.yml`. Nunca envies `.env` nem `node_modules`.
2. Em **Settings → Secrets and variables → Actions → Variables**, cria `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores públicos do projeto. Estas variáveis entram no JavaScript publicado; isso é esperado para a chave pública, e as políticas RLS protegem os dados.
3. Em **Settings → Pages → Build and deployment**, escolhe **GitHub Actions**.
4. Envia as alterações para `main` ou executa manualmente o workflow. Se a tua branch tiver outro nome, ajusta `branches: [main]`.
5. Atualiza o Site URL e os Redirect URLs do Supabase para o URL real do Pages, incluindo o nome do repositório quando existir.

O workflow deteta se o site está na raiz (`utilizador.github.io`) ou em `/nome-do-repositorio/`. O build cria HTML para `/`, `/eventos/`, `/gestao/` e `/entrar/`, permitindo abrir e atualizar diretamente essas rotas. Imagens locais `/images/...` são ajustadas ao caminho do repositório.

Para compilar manualmente na raiz de um domínio:

```bash
npm run build:pages
npm run preview:pages
```

Para um repositório com subpasta, em PowerShell:

```powershell
$env:PAGES_BASE_PATH='/nome-do-repositorio/'
npm run build:pages
npm run preview:pages
```

Em bash:

```bash
PAGES_BASE_PATH=/nome-do-repositorio/ npm run build:pages
PAGES_BASE_PATH=/nome-do-repositorio/ npm run preview:pages
```

Publica apenas o conteúdo de `dist-pages/`. O comando original `npm run build` continua a compilar TanStack Start/Nitro; a saída desse comando não é o pacote estático para GitHub Pages.

Não foi criado ou publicado um repositório nem foi alterada uma base Supabase nesta entrega.

## Eventos

- Todas as contas com sessão iniciada podem criar eventos e votar, sem restrição por cargo.
- Campos obrigatórios: título, descrição, data, início, término e local.
- Horas de Portugal continental (`Europe/Lisbon`), guardadas como instantes `timestamptz`.
- O término deve ser posterior ao início e no mesmo dia. Horas inexistentes na mudança para a hora de verão são recusadas. Na hora repetida do outono é usada a interpretação de `date-fns-tz`; o formulário não permite escolher a ocorrência.
- Eventos em curso/futuros primeiro, por início crescente; terminados depois, do mais recente para o mais antigo.
- Os dois botões mostram contagens e listas de nomes. Uma chave primária composta garante **um voto por pessoa e evento**, independentemente de pedidos simultâneos. O `upsert` substitui a resposta anterior.
- Não existe campo de lotação, limite de participantes ou teto de votos no modelo. As consultas percorrem todas as páginas da API, incluindo listas com mais de 1000 votos. Aplicam-se os recursos disponíveis no plano contratado do Supabase.
- O site atualiza os dados a cada 15 segundos e permite atualização manual. Não exige configuração de Realtime.
- Criar eventos e responder são operações distintas da edição dos textos institucionais das páginas.

## Gestão, cargos e permissões

Só **Comando** vê a Gestão e pode gerir cargos, visibilidade e permissões. As regras são verificadas na base: abrir a rota diretamente ou chamar a API manualmente não concede acesso.

Os cargos são: **Comando, Primeiro Oficial, Oficial, Sargento, Operacional, Estagiário e Quadro Permanentes**. Cada perfil tem um cargo. Novas contas recebem Estagiário, mesmo que enviem uma tag Comando em `user_metadata`. Apenas o Comando pode promover através de uma função com validação no servidor. A função impede remover o último Comando pelo site/API.

| Página/área | Leitura | Edição do conteúdo |
| --- | --- | --- |
| Início | Visibilidade geral + exceção individual | Comando ou autorização individual |
| Eventos | Todas as contas com sessão | Comando ou autorização individual para os textos da página |
| Entrar | Pública | Comando ou autorização individual para os textos da página |
| Gestão | Exclusiva do Comando | Comando |
| Identidade, nomes do menu e rodapé | Pública | Comando |

No Início, **Predefinido** segue a visibilidade geral; **Sem acesso** recusa leitura à conta; **Ver** concede leitura; **Ver e editar** concede ambas. Para conteúdo reservado, desativa a visibilidade pública e concede os acessos individuais. Se a página continuar pública, também continuará acessível sem sessão.

Em Eventos, os acessos à criação e à votação mantêm-se disponíveis a todos os cargos; a permissão adicional refere-se apenas ao conteúdo institucional da página. A página Entrar permanece pública para não bloquear o acesso às contas. Gestão e identidade partilhada não podem ser delegadas a outros cargos. Os restantes cargos não recebem privilégios implícitos.

A base não permite atualizar livremente `perfis`, nem alterar `publica`, revisões ou chaves de página pela API. Cargos e visibilidade usam funções privadas com `search_path` fixo, chamadas por wrappers sem privilégios elevados. Todas as tabelas têm RLS e privilégios explícitos. Votos de outras pessoas não podem ser alterados, nem pelo Comando através da API da aplicação.

## Editor sem mexer no código

Em **Gestão → Conteúdo das páginas**, seleciona a página. Podes editar título, subtítulo, secções, textos, imagens, listas/hierarquia e a sua ordem. Podes adicionar e remover secções e itens. Guarda para aplicar. Cabeçalho, emblema, nomes do menu e rodapé são editados na opção **Identidade, rodapé e nomes do menu**.

As imagens são referências guardadas no Supabase: cola uma URL HTTPS, por exemplo uma imagem já alojada num serviço de imagens ou no Supabase Storage. Também podes usar imagens já existentes em `/images/`. Foi assumida edição por URL, sem criar um sistema de upload ou políticas de Storage.

O editor utiliza texto simples, sem executar HTML ou scripts. O conteúdo é lido de `paginas`; não há uma cópia local que contorne a RLS. Os dados iniciais do site foram transferidos para `002_conteudo_inicial.sql`, incluindo os textos originais da hierarquia e o emblema.

Textos de navegação e títulos institucionais são editáveis. Rótulos funcionais dos formulários (por exemplo «Guardar conteúdo» e «Palavra-passe»), validações, código das rotas e políticas de segurança continuam definidos no código. Os campos dos eventos e as respostas ficam nas tabelas próprias. Alterar o texto descritivo da hierarquia não altera o cargo de ninguém: usa a tabela de utilizadores para isso.

A revisão do conteúdo é verificada ao guardar. Se outra pessoa guardar entretanto, o teu rascunho é preservado e a gravação é recusada, para não substituir silenciosamente alterações de outra pessoa. Copia o que precisares e recarrega a página. Mudar de página no editor ou fechar a página do browser descarta rascunhos não guardados.

## Pressupostos e elementos que faltavam

O ZIP tinha apenas a página inicial/hierarquia e componentes de interface. Não tinha abas Eventos/Gestão, login, cliente Supabase, esquema SQL, políticas RLS ou ficheiro de ambiente. Esses ficheiros foram criados; a página inicial foi adaptada.

Faltam apenas dados externos que não foram fornecidos: a URL/chave pública do Supabase, a conta a promover inicialmente e o esquema de uma eventual base já existente. Não foram inventadas credenciais nem confirmada uma integração com a tua base real.

Assumiu-se login por email/palavra-passe, registo aberto, um cargo por conta e nomes visíveis às contas autenticadas para apresentar os votos. «Qualquer pessoa» foi interpretado como qualquer conta autenticada, sem restrição de cargo. Quadro Permanentes foi tratado como cargo próprio e apresentado depois de Estagiário, na ordem que forneceste. A descrição desse cargo foi acrescentada e pode ser alterada no editor. Não foram criadas páginas institucionais adicionais que não existiam no ZIP.

## Testar rapidamente

1. Com duas contas, uma Comando e uma Estagiário, verifica que só o Comando vê Gestão; tenta abrir `/gestao` diretamente com a outra conta.
2. Com Estagiário, cria um evento. Noutra sessão/browser, abre-o com Comando e confirma os campos e a ordem cronológica.
3. Vota «Vou» com as duas contas. Muda uma resposta para «Não vou»: devem ficar 1/1 e os nomes nas listas certas. Recarrega para confirmar a persistência.
4. Com Comando, muda o título, a imagem e a ordem de duas secções no Início. Guarda e verifica na outra sessão.
5. Torna o Início privado e concede «Ver e editar» à outra conta. Confirma que aparece o editor diretamente nessa página, sem dar acesso à Gestão. Retira a permissão e confirma que a API deixa de permitir as alterações.
6. Abre o mesmo editor em duas sessões. Guarda numa delas e tenta guardar na outra: deve avisar do conflito.
7. No Pages, abre e recarrega diretamente `/eventos/` e `/gestao/`; confirma que não dão 404 e que as restrições se mantêm.

Validações automáticas:

```bash
npm run check
npm run build
npm run build:pages
```

`npm run check` executa TypeScript, testes de rotas/eventos/editor e testes das migrações/RLS em PostgreSQL através de PGlite, com utilizadores e dados fictícios isolados. Não toca na base de produção. A execução no teu Supabase e os fluxos de confirmação de email dependem da configuração externa acima.

A pré-visualização visual neste ambiente ficou bloqueada pela configuração de host da infraestrutura de preview. O código foi verificado por compilação e testes; não foi possível fazer a validação visual com o Supabase real.

## Referências técnicas

- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — upsert](https://supabase.com/docs/reference/javascript/upsert)
- [Vite — publicação estática e base path](https://vite.dev/guide/static-deploy)
- [GitHub — workflows de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
