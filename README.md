# USHE — GitHub Pages

Site estático da Unidade de Segurança e Honra do Estado. Mantém o conteúdo, o emblema e a identidade visual do projeto original, com HTML, CSS e JavaScript simples.

## Estrutura

| Ficheiro ou pasta | Função |
| --- | --- |
| `index.html` | Página inicial e conteúdo da hierarquia |
| `style.css` | Aspeto do site e adaptação a telemóveis |
| `script.js` | Destaque da secção visível no menu |
| `images/` | Imagens, incluindo o emblema original |
| `favicon.ico` | Ícone do separador |
| `robots.txt` | Instruções para motores de pesquisa |
| `.nojekyll` | Indica que o conteúdo já está pronto a publicar |

## Publicar no GitHub Pages

1. Extrai este ZIP no teu computador.
2. Cria ou abre o repositório no GitHub. No GitHub Free, usa um repositório público para publicar com Pages.
3. Carrega o conteúdo extraído na raiz do repositório: `index.html` deve ficar diretamente na raiz, e não dentro de outra pasta. Usa **Add file → Upload files** e confirma em **Commit changes**. Para incluir também o ficheiro `.nojekyll`, podes usar Git ou criá-lo na interface do GitHub.
4. Se o repositório já contiver a versão React/TanStack anterior, substitui os ficheiros e remove a estrutura antiga desta aplicação: `src/`, `public/`, `package.json`, `bun.lock`, `bunfig.toml`, `components.json`, `eslint.config.js`, `tsconfig.json`, `vite.config.ts` e `vitest.config.ts`. Confirma que não existem workflows antigos a publicar uma versão diferente. Não apagues ficheiros de outros projetos.
5. Abre **Settings → Pages → Build and deployment**.
6. Em **Source**, escolhe **Deploy from a branch**.
7. Escolhe o ramo que contém os ficheiros (normalmente `main`) e a pasta **/(root)**. Clica em **Save**.
8. Aguarda a publicação. O endereço será apresentado nessa página.

Num repositório de projeto, o endereço habitual é `https://UTILIZADOR.github.io/REPOSITORIO/`. Se o repositório se chamar `UTILIZADOR.github.io`, será `https://UTILIZADOR.github.io/`.

Não é necessário instalar Node.js, executar npm, compilar ou criar um workflow personalizado. As referências locais são relativas, pelo que funcionam nos dois formatos de endereço. Não existe um servidor de aplicação para executar no Pages.

## Editar e testar

- Textos e hierarquia: `index.html`.
- Cores, fontes e disposição: `style.css`.
- Comportamento do menu: `script.js`.
- Emblema: `images/ushe-emblema-t.png`.

Podes abrir `index.html` diretamente no navegador. O conteúdo e as ligações entre secções funcionam também com JavaScript desativado. As fontes Orbitron e Rajdhani são carregadas do Google Fonts, tal como na versão original; sem ligação à Internet são usadas as fontes alternativas do sistema.

Documentação oficial: https://docs.github.com/pt/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
