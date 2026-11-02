# USHE — Unidade de Segurança e Honras do Estado

Portal institucional da cidade Diamond em português de Portugal. HTML, CSS e JavaScript sem compilação, com Supabase para autenticação, Postgres e fotografias privadas. O alojamento dos ficheiros é feito no GitHub Pages.

**Estado da instalação:** o esquema, os conteúdos iniciais, as políticas RLS e o bucket privado foram instalados no projeto Supabase `GNR_DIAMOND.github.io`. A URL e a chave pública estão configuradas em `config.js`. A primeira conta de Comando tem de ser uma conta Auth real: cria a tua conta e promove o email correto com `03_primeiro_comando.sql`. A confirmação de email e a recuperação exigem que o endereço GitHub Pages esteja autorizado em Authentication → URL Configuration. Os passos abaixo também permitem reinstalar o portal num projeto novo.

As funções privilegiadas ficam no esquema `private`; a API pública usa funções `SECURITY INVOKER` que chamam apenas as operações explicitamente autorizadas. As verificações reais da API confirmaram que visitantes leem estatísticas e contactos, mas não os membros, perfis ou corpos dos anúncios.

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
   - Site URL: o endereço completo do teu GitHub Pages, incluindo `/GNR_DIAMOND.github.io/`.
   - Redirect URLs: `http://localhost:8000/` para desenvolvimento e o mesmo endereço completo do Pages para produção. Se usares outro porto no Live Server, adiciona também esse endereço exato.
   - Os links de confirmação/recuperação usam esse endereço com `#/entrar`. O fragmento identifica a página do portal; não precisa de regras de reencaminhamento no servidor.
9. Abre o diálogo **Connect**, ou **Settings → API Keys**, e copia a URL do projeto e a **publishable key** (`sb_publishable_...`). Uma `anon` key legada também é aceite.
10. Edita `config.js`:

```javascript
window.USHE_CONFIG = Object.freeze({
  supabaseUrl: 'https://O-TEU-PROJETO.supabase.co',
  supabasePublishableKey: 'sb_publishable_A-TUA-CHAVE-PUBLICA',
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

1. Coloca os ficheiros e pastas na raiz do repositório **Diogo-RP-2026/GNR_DIAMOND.github.io**. O `index.html` fica diretamente na raiz, sem uma pasta adicional.
2. Se estiveres a usar a versão antiga, lê `MIGRACAO.md`. O antigo `conteudo.js` deixa de ser usado.
3. No GitHub abre **Settings → Pages → Build and deployment**.
4. Escolhe **Deploy from a branch → main → /(root) → Save**.
5. Aguarda a publicação automática e abre o endereço indicado no GitHub. O endereço de projeto segue a forma `https://diogo-rp-2026.github.io/GNR_DIAMOND.github.io/`.
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

## 9. Decisões assumidas

- O pedido atual de HTML/CSS/JS + Supabase e SQL substitui o pedido anterior de funcionamento exclusivamente local e sem SQL.
- **Quem Somos é uma aba reservada**, pois a regra de permissões diz explicitamente que visitantes só veem Início e Contactos.
- A aprovação e o acesso a Eventos permitem criar eventos e responder, independentemente da patente. A criação de registos exige a autorização adicional individual.
- Uniform-02 é Diogo Oconner; João Barbosa está em Primeiro Oficial, conforme a equipa indicada. Não inventámos o nome oculto na captura do comunicado.
- Os indicativos não visíveis ficam em branco, editáveis pelo Comando.
- O exemplo Ocean Vibe é de **23/10/2026**, uma sexta-feira. Está no arquivo se já terminou. O fim às 23:00 é exemplificativo e assinalado na descrição.
- O convite Discord continua editável. Na sua ausência, os botões abrem `https://discord.com`, como na referência; não existe um convite fictício para a cidade Diamond. Fotografias de fardamento continuam disponíveis por upload. O fundo e o brasão do site de referência foram integrados; o brasão anterior também foi conservado.
- As capturas e o regulamento incompleto são referências; os textos e as regras do pedido atual prevalecem.
- Não existe migração automática de perfis/votos locais: esses perfis nunca comprovaram a identidade das pessoas.

## Atualização visual a partir da referência

Referência indicada pelo utilizador: https://pixel-perfect-recreation-506.lovable.app/ . A reconstrução usa HTML/CSS/JS próprios; não depende do projeto Lovable nem inclui o seu selo de edição.

- Início: mesma fotografia, brasão, fontes Barlow, título, cores, degradé e cartões de estatísticas.
- Contactos: cartão central com Abrir Ticket e DM ao Comando.
- Entrar: formulário central e ligação de criação de conta; mantêm-se os modos de recuperação e as validações existentes.
- As áreas internas continuam protegidas pelas permissões anteriores e usam o mesmo tema. A referência não permite consultar essas áreas sem uma conta aprovada; não se afirma equivalência com páginas privadas não observadas.
- O cartão Treinamentos abre `#/treinamentos`. Sem sessão, encaminha para Entrar; com sessão, exige acesso a Registos. Os treinos são registos de tipo iniciado por `Trein` ou do tipo `Formação`/`Formacao`.
- As estatísticas vêm da função `unit_statistics()`, que divulga apenas contagens. Se já tinhas instalado o SQL anterior, executa **apenas** `supabase/04_estatisticas_publicas.sql`. Em instalações novas, a função já faz parte de `01_schema.sql`.
- Sem configuração Supabase, a apresentação inicial usa os dados fornecidos: **22 efetivos, 7 cargos e 0 treinamentos**. Quando o Supabase está configurado, os valores vêm da base de dados; uma falha de ligação não é apresentada como uma contagem real.
- O favicon, a autenticação, os documentos, os votos e as permissões existentes foram preservados. A nova aparência não cria sessões nem atribui novos acessos.

## Referências técnicas

- [GitHub Pages — origem de publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase — JavaScript](https://supabase.com/docs/reference/javascript/installing)
- [Supabase — chaves públicas e secretas](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — funções de base de dados](https://supabase.com/docs/guides/database/functions)
- [Supabase — Storage privado](https://supabase.com/docs/guides/storage/serving/downloads)
