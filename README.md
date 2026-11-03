# USHE — Unidade de Segurança e Honras do Estado

O portal inclui **Perfil do Agente**, acessível pela conta e pela Equipa, com fotografia circular, biografia, dados oficiais, subunidades, qualificações, distinções e atividade sujeita a permissões. Instalação e regras em [PERFIL_AGENTE.md](PERFIL_AGENTE.md).

O portal inclui efeitos de interface e verificação por código de quatro dígitos, validado no backend. As instruções para configurar o envio estão no [guia de email](ATIVAR_OTP_GMAIL.md) e na [documentação técnica](ALTERACOES_MOVIMENTO_OTP.md).

Portal institucional da cidade Diamond em português de Portugal. HTML, CSS e JavaScript sem compilação, com Supabase para autenticação, Postgres e fotografias privadas. O alojamento dos ficheiros é feito no GitHub Pages.

**Configuração:** `config.js` contém apenas a URL e a chave pública do projeto Supabase. Credenciais administrativas e segredos de envio são configurados exclusivamente no backend. Os passos abaixo descrevem a instalação num projeto novo; não reapliques o esquema inicial nem os dados de exemplo a uma instalação existente.

As funções privilegiadas ficam no esquema `private`; a API pública usa funções `SECURITY INVOKER` que chamam apenas as operações explicitamente autorizadas. As políticas RLS controlam o acesso aos dados protegidos.

## 1. Estrutura dos ficheiros

```text
index.html                       Estrutura do portal
style.css                        Identidade visual e responsividade
script.js                        Navegação, sessões e ações da interface
config.js                        URL e chave pública do Supabase
js/
  api.js                         Cliente Supabase, permissões e fotografias
  core.js                        Datas, pesquisa, apresentação e segurança de texto
  views.js                       Todas as páginas e cartões reutilizáveis
  forms.js                       Formulários de edição e administração
  motion.js                      Efeitos e caixa de notificações
  otp.js                         Interface de verificação por código
  profile.js                     Perfil e edição pessoal do agente
images/
  ushe-brasao.png                 Brasão da referência
  ushe-hero.jpg                   Fundo fotográfico da referência
  ushe-emblema.png                Brasão da versão anterior, preservado
fonts/                           Barlow e Barlow Condensed, com licenças OFL
vendor/
  supabase.js                    Supabase JS 2.118.0, distribuição oficial local
  LICENSE-supabase               Licença MIT
  README.md                      Origem e versão da dependência
supabase/
  01_schema.sql                  Tabelas, índices, relações, funções, RLS e Storage
  02_seed.sql                    Conteúdo inicial editável
  03_primeiro_comando.sql         Promoção da primeira conta de Comando
  04_estatisticas_publicas.sql    Atualização para instalações já existentes
  05_eventos_contas.sql           Proteções adicionais de contas e eventos
  migrations/                    Migrações posteriores
  functions/portal-otp/           Backend da verificação por código
  functions/agent-avatar/         Upload autenticado e validação de fotografias
tests/
  core.test.mjs                  Datas, pesquisa e tratamento de texto
  rls.test.mjs                   Políticas e transações em PostgreSQL/PGlite
favicon.ico
.nojekyll
.gitignore
robots.txt
package.json / package-lock.json Apenas dependências dos testes
README.md
MIGRACAO.md
VALIDACAO.md
```

## 2. Correr no computador

Não abras apenas o HTML com duplo clique: os módulos JavaScript precisam de um servidor HTTP.

1. Extrai o ZIP para uma pasta.
2. Abre um terminal nessa pasta (a que contém `index.html`).
3. No Windows com Python instalado, executa:

```powershell
py -m http.server 8000
```

Em Linux/macOS:

```bash
python3 -m http.server 8000
```

4. Abre **http://localhost:8000/** no navegador.
5. Para parar o servidor, usa `Ctrl + C`.

Alternativa no VS Code: abre a pasta e usa a extensão Live Server. O Node.js e o npm **não são necessários para servir ou publicar o portal**; são usados apenas nos testes opcionais.

## 3. Criar o projeto Supabase

1. Entra em https://supabase.com/dashboard e cria um projeto para a USHE. Escolhe a região e guarda a palavra-passe da base de dados fora do repositório.
2. Espera que o projeto fique disponível e abre **SQL Editor → New query**.
3. Copia o ficheiro `supabase/01_schema.sql` completo e executa-o. Destina-se a um projeto novo; é uma migração de execução única e uma falha faz rollback da transação. Não apaga tabelas de outra aplicação. Se já tens outro esquema de USHE, usa um projeto novo ou prepara uma migração específica.
4. Executa `supabase/02_seed.sql`. Cria os membros, exemplos das capturas, códigos e textos. Pode ser repetido sem substituir os registos iniciais que entretanto editaste.
5. Em **Data API / API settings**, confirma que a Data API está ativa e o esquema `public` está exposto. Mantém o esquema `private` fora dos esquemas expostos. Os scripts atribuem os privilégios necessários e ativam RLS nas tabelas.
6. Em **Storage**, confirma o bucket privado `ushe-media`, criado pelo SQL. Aceita JPG, PNG e WebP, até 5 MB por ficheiro. Não o tornes público.
7. Em **Authentication → Providers / Sign In**, ativa email/palavra-passe e a confirmação de email. Para utilização regular, configura o envio de emails em Authentication/SMTP; os envios do serviço de demonstração podem ter restrições. Ajusta os limites de email e proteção contra abuso às necessidades do servidor.
8. Em **Authentication → URL Configuration**, define:
   - Site URL: o endereço público do teu portal, por exemplo `https://UTILIZADOR.github.io/REPOSITORIO/`.
   - Redirect URLs de produção: o mesmo endereço e a variante terminada em `#/entrar`. Usa endereços exatos, sem wildcards, substituindo os exemplos pelos valores da tua instalação.
   - Para testar localmente, autoriza `http://localhost:8000/` e `http://localhost:8000/#/entrar` no ambiente de desenvolvimento. Se usares outro porto no Live Server, autoriza os endereços correspondentes.
   - Os links de confirmação/recuperação usam esse endereço com `#/entrar`. O fragmento identifica a página do portal; não precisa de regras de reencaminhamento no servidor.
9. Abre o diálogo **Connect**, ou **Settings → API Keys**, e copia a URL do projeto e a **publishable key** (`sb_publishable_...`). Uma `anon` key legada também é aceite.
10. Edita `config.js`:

```javascript
window.USHE_CONFIG = Object.freeze({
  supabaseUrl: 'https://O-TEU-PROJETO.supabase.co',
  supabasePublishableKey: 'CHAVE_PUBLICA_DO_PROJETO',
});
```

Só estes dois valores públicos vão para o navegador. **Nunca coloques uma secret key, `service_role`, palavra-passe ou token de administração no GitHub ou em `config.js`.** A chave pública identifica o projeto; as políticas RLS validam o utilizador e os seus acessos em cada pedido.

## 4. Criar o primeiro Comando

1. No portal, usa **Entrar → Pedir acesso**, regista uma conta e confirma o email. Alternativamente, cria-a em **Authentication → Users → Add user** no Supabase.
2. Abre `supabase/03_primeiro_comando.sql` e substitui `SUBSTITUIR_PELO_EMAIL_DO_COMANDO` pelo email dessa conta.
3. Executa esse script no SQL Editor do Supabase, como proprietário do projeto.
4. Entra no portal com a conta. O menu apresenta todas as secções e **Administração**.
5. Vai a **Administração → Utilizadores e acessos** para aprovar as contas seguintes e atribuir as respetivas abas.

O script promove uma conta real criada pelo serviço Auth. Não manipula manualmente palavras-passe, identidades ou sessões em `auth.users`. O número de uniforme de um membro da Equipa é independente da conta de login e não lhe concede privilégios.

## 5. Acessos e funcionamento

| Pessoa | Acesso |
| --- | --- |
| Visitante | Início e Contactos. Formulários de entrada/registo/recuperação disponíveis. |
| Conta por aprovar | O mesmo conteúdo público e o estado do seu pedido. |
| Membro aprovado | Apenas as abas atribuídas pelo Comando. |
| Comando aprovado | Todas as abas, conteúdos e administração. |

Em **Gerir acessos** podes aprovar/suspender a conta, escolher Membro ou Comando e ativar/desativar cada aba individualmente. A caixa **Permitir criar registos** só tem efeito com a aba Registos autorizada. A leitura dos registos não implica autorização para os criar.

As permissões ficam na base de dados, não no armazenamento local. Nenhum utilizador se aprova ou promove a si próprio através da API. A interface revalida os acessos ao navegar e periodicamente; a RLS aplica-os imediatamente em cada consulta/gravação. Fotografias já descarregadas não podem ser retiradas da memória de quem já as viu.

**Equipa e conteúdo institucional:** só o Comando cria, edita e apaga. Os membros podem ser marcados como inativos. Se um membro estiver associado a documentos, a base de dados impede apagá-lo para preservar o histórico; usa o estado inativo.

**Eventos:** os membros aprovados com a aba Eventos podem criar eventos e editar/apagar os que criaram. O Comando gere todos. Há título, descrição, início, fim e local. Os próximos/em curso aparecem primeiro; o arquivo aparece depois, do mais recente para o mais antigo. Cada conta tem uma resposta por evento (Vou/Não vou), pode mudá-la e vê contagens e nomes. Não existe limite artificial de respostas ou participantes; aplicam-se os recursos/quotas do serviço. As listas são atualizadas após votar, ao navegar e, com Eventos aberto, a cada 45 segundos.

**Anúncios:** só o Comando escreve. Pode usar Evento, Reunião ou Comunicado Oficial, escolher autor/data, permitir respostas opcionais e guardar rascunhos. A página inicial segue a referência visual: fotografia escurecida, título e três estatísticas. O corpo dos anúncios, os votos e os perfis continuam reservados. A projeção SQL anterior dos três títulos públicos é preservada por compatibilidade.

**Avisos:** seleção de um ou vários membros; título oficial, alíneas da conduta, sanção, data e assinatura. Filtros por membro, sanção e pesquisa. O selo de sanção é vermelho.

**Fardamento:** categorias livres, códigos copiáveis, nota editável e upload de fotografias. Cada linha do formulário usa `Peça = código`, por exemplo `T-Shirt = 192-3`. Usa `N/A` se não se aplicar. Podes adicionar novas peças e categorias.

**Equipamento:** categorias livres, notas, ordem, fotografias e indicação obrigatório/opcional. Não é necessário editar código para adicionar categorias.

**Regulamento:** artigos por capítulo, índice e pesquisa. O conteúdo inicial é um **modelo a validar pelo Comando**, pois a captura não mostra os artigos.

**Registos:** tipo livre, início/fim, local, participantes, resumo e observações, com filtros por data e tipo. A gravação do documento e dos participantes é uma única transação. Depois de submetidos, apenas o Comando corrige ou apaga registos. Registos hospitalares referem-se ao roleplay da cidade Diamond.

As datas usam **Europe/Lisbon** em qualquer computador. O fim pode ser no dia seguinte mas tem de ser posterior ao início. Horas inexistentes na mudança para a hora de verão são recusadas; na hora repetida de outono é usada a primeira ocorrência.

O Comando gere acesso e cargos das contas existentes; a eliminação definitiva de contas Auth e os convites administrativos por email são feitos no painel Supabase, sem colocar segredos no browser. O portal não envia mensagens no Discord.

## 6. Publicar/atualizar no GitHub Pages

1. Coloca os ficheiros e pastas na raiz do repositório escolhido. O `index.html` fica diretamente na raiz, sem uma pasta adicional.
2. Se estiveres a usar a versão antiga, lê `MIGRACAO.md`. O antigo `conteudo.js` deixa de ser usado.
3. No GitHub abre **Settings → Pages → Build and deployment**.
4. Escolhe **Deploy from a branch → main → /(root) → Save**.
5. Aguarda a publicação automática e abre o endereço indicado no GitHub Pages. Para um site de projeto, o formato habitual é `https://UTILIZADOR.github.io/REPOSITORIO/`.
6. Ativa **Enforce HTTPS**, quando disponível nas definições do Pages.
7. Confirma que o mesmo endereço está autorizado nas Redirect URLs do Supabase.

Não é necessário um workflow de compilação, Vercel, Next.js ou um servidor Node. As rotas usam `#/equipa`, `#/eventos`, etc., pelo que também funcionam ao recarregar uma página num subdiretório do GitHub Pages.

Para fazer alterações, substitui os ficheiros correspondentes e faz commit. O Git mantém as versões anteriores. As edições feitas no painel do Comando ficam no Supabase e passam a estar disponíveis a todos os utilizadores autorizados, sem novos commits.

## 7. O que podes personalizar

| Elemento | Onde alterar |
| --- | --- |
| Cores, fontes, largura, bordas | Variáveis `:root` no início de `style.css` |
| Brasão | Substituir `images/ushe-brasao.png` |
| Ícone do separador | Substituir `favicon.ico` |
| Título, apresentação, lema e recrutamento | Administração → Início e Contactos |
| Convite do Discord | Administração → Início e Contactos → Convite Discord |
| Texto institucional, missão e valores | Administração → Quem Somos |
| Membros, indicativos, patentes e estados | Administração → Equipa |
| Fotografias | Formulários de Equipa, Fardamento e Equipamento |
| Anúncios, avisos, regulamento e registos | Páginas respetivas ou Administração |
| URL e chave pública Supabase | `config.js` |

A página inicial e Contactos reproduzem a referência fornecida. O fundo é `images/ushe-hero.jpg`; as fontes são servidas da pasta `fonts/`. O título e os textos de apresentação/contactos continuam editáveis no painel. O lema é preservado no conteúdo acessível do cabeçalho e do rodapé, sem adicionar texto visível à composição da referência. Os nomes/ordem das abas e das patentes encontram-se em `js/core.js`. Adicionar novas abas requer também atualizar o enum e as políticas SQL.

## 8. Testes opcionais

Com Node.js 22 ou superior:

```bash
npm ci
npm test
```

Os testes executam as tabelas e políticas num PostgreSQL local em WASM (PGlite), com interfaces `auth`/`storage` simuladas. Não contactam nem alteram o projeto Supabase de produção. Consulta `VALIDACAO.md` para o alcance e limites da verificação.

## 9. Interface e navegação

- O Início apresenta a identidade visual do portal e estatísticas agregadas. Depois do login e da verificação necessária, essa página abre com a opção correspondente ativa no menu.
- O menu mantém os destinos e permissões existentes, com abertura animada e suporte de teclado.
- As notificações continuam disponíveis na caixa após a animação; só uma ação explícita as marca como lidas.
- Os efeitos de botões e separadores respeitam os estados de foco, carregamento e desativação, bem como `prefers-reduced-motion`.
- As páginas internas exigem uma conta aprovada e as permissões adequadas. Os treinos são apresentados através da navegação existente para registos.
- As estatísticas de uma instalação configurada vêm da base de dados. Uma falha de ligação não é apresentada como uma contagem real.

## Referências técnicas

- [GitHub Pages — origem de publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase — JavaScript](https://supabase.com/docs/reference/javascript/installing)
- [Supabase — chaves públicas e secretas](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — funções de base de dados](https://supabase.com/docs/guides/database/functions)
- [Supabase — Storage privado](https://supabase.com/docs/guides/storage/serving/downloads)


## Atualização de segurança — 03/11/2026

A migração `supabase/migrations/20261103214002_security_audit_hardening.sql` e as funções `portal-otp` e `agent-avatar` reforçam a validação das sessões, recuperação de conta, validação de ficheiros e limites no backend. As fotografias pessoais e oficiais passam pela função `agent-avatar`; uploads diretos por agentes ou Comando não são permitidos. Não reativar as políticas antigas de escrita do bucket.

As imagens aceites são JPEG, PNG e WebP até 5 MB, 4 milhões de píxeis e 4096 píxeis por lado. O backend descodifica e converte para JPEG, sem metadados. A quota fixa é de 20 pedidos de upload por utilizador em 15 minutos, incluindo tentativas inválidas.

Consulta `SEGURANCA.md` para instalação, testes e configurações manuais. O relatório completo entregue separadamente distingue testes locais, testes na base de dados e testes HTTP. Não é uma garantia de segurança absoluta.

`npm ci --ignore-scripts && npm test` executa os testes. `npm run build` gera `dist/` com os ficheiros públicos necessários. Se mudares o endereço Supabase em `config.js`, atualiza também a lista exata de destinos em `connect-src` no `index.html`.
