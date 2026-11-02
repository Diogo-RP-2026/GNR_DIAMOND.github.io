# USHE — GitHub Pages

Site estático pronto para enviar diretamente para um repositório do GitHub. Não é preciso instalar programas, executar npm, compilar o projeto, configurar chaves ou ligar um serviço de dados.

Esta versão utiliza apenas HTML, CSS, JavaScript e imagens. Foram retirados SQL, Supabase, autenticação remota, código de servidor e todas as dependências do projeto anterior.

## Atenção ao funcionamento dos dados

**Os perfis, eventos, votos, permissões e edições são locais ao navegador. Não existe sincronização entre pessoas ou computadores.**

Se criares um evento no teu PC, outra pessoa que abra o site no seu PC não o verá. Um perfil local também não comprova a identidade de uma pessoa: qualquer pessoa com acesso ao mesmo navegador pode selecionar outro perfil.

As preferências de cargo e visibilidade organizam a interface; **não oferecem autenticação, autorização ou confidencialidade reais**. Todos os ficheiros enviados para o site, incluindo os textos em `conteudo.js`, podem ser lidos pelos visitantes. Ocultar uma página no menu não torna esses textos privados.

Este comportamento é apresentado no próprio site. É o resultado da opção de usar exclusivamente GitHub Pages, sem qualquer serviço de dados ou autenticação.

## Ficheiros

| Ficheiro ou pasta | Função |
| --- | --- |
| `index.html` | Página inicial e estrutura do portal |
| `style.css` | Aspeto, cores, formulários e adaptação ao ecrã |
| `script.js` | Navegação, perfis, eventos, votos, editor e dados locais |
| `conteudo.js` | Textos públicos iniciais, hierarquia, emblema e nomes do menu |
| `images/` | Imagens, incluindo o emblema original |
| `favicon.ico` | Ícone do separador |
| `robots.txt` | Indicações básicas aos motores de pesquisa |
| `.nojekyll` | Desativa o processamento Jekyll |
| `README.md` | Este guia |
| `MIGRACAO.md` | Alterações face ao ZIP original |
| `VALIDACAO.md` | Verificações realizadas e limites da validação |

O ZIP tem `index.html` diretamente na raiz. **Extrai o ZIP e envia os ficheiros extraídos; não envies apenas o ZIP.** Não coloques tudo dentro de uma pasta adicional se publicares a raiz do repositório.

## Publicar no GitHub Pages

1. Extrai o ZIP no teu computador.
2. Cria um repositório no GitHub ou abre o repositório que vais usar. No plano GitHub Free, usa um repositório público.
3. Em **Add file → Upload files**, envia o conteúdo extraído, incluindo a pasta `images/`. Confirma que `index.html`, `style.css`, `script.js` e `conteudo.js` aparecem juntos na raiz. Guarda com **Commit changes**.
4. Abre **Settings → Pages**.
5. Em **Build and deployment → Source**, escolhe **Deploy from a branch**.
6. Em **Branch**, escolhe a branch para onde enviaste os ficheiros, normalmente **main**, e a pasta **/(root)**. Clica em **Save**.
7. Aguarda a publicação e abre o endereço mostrado nessa página.

O projeto funciona tanto em `utilizador.github.io` como em `utilizador.github.io/nome-do-repositorio/`. Não tens de escrever o nome do teu repositório no código: os recursos usam caminhos relativos.

Não é necessário adicionar um workflow próprio. O GitHub pode mostrar a execução automática de publicação do Pages no separador Actions; isso é normal mesmo usando «Deploy from a branch».

### Se já tinhas enviado o projeto antigo

1. Guarda uma cópia do repositório antigo ou cria uma branch de segurança antes de o substituir.
2. Na branch que vais publicar, substitui o conteúdo do projeto antigo pelo conteúdo deste ZIP. O histórico do Git mantém os commits anteriores; não é necessário apagá-lo nem forçar envios.
3. Remove o workflow antigo **`.github/workflows/pages.yml`**, que instalava e compilava o projeto anterior. Se existirem outros workflows desse projeto, verifica se ainda são necessários.
4. As pastas antigas `src/`, `pages/`, `public/`, `scripts/` e `supabase/`, assim como os ficheiros de configuração, dependências e ambiente, deixam de fazer parte desta versão. Não mistures as duas versões.
5. Altera a definição do Pages para **Deploy from a branch → main → /(root)**, ou para a branch que estiveres a usar. O workflow anterior não deve continuar responsável pela publicação.
6. Confirma a publicação e recarrega o site. Se o navegador mostrar ficheiros antigos, usa **Ctrl + F5**.

Num repositório que também contenha outros trabalhos, substitui apenas os ficheiros deste projeto. Conserva qualquer `CNAME` que já uses para um domínio personalizado e quaisquer ficheiros de licença de que precises.

## Navegação

As páginas usam o fragmento `#` do endereço:

| Página | Final do endereço |
| --- | --- |
| Início | `/#/` |
| Hierarquia | `/#/?secao=hierarquia` |
| Eventos | `/#/eventos` |
| Gestão local | `/#/gestao` |
| Perfis locais | `/#/entrar` |

Em sites de repositório, estes finais vêm depois de `/nome-do-repositorio`. Exemplo: `https://utilizador.github.io/ushe/#/eventos`.

O fragmento mantém a navegação dentro de `index.html`, pelo que podes abrir ou recarregar os links do menu sem precisar de regras de reencaminhamento. As antigas rotas sem `#`, como `/eventos/`, devem ser substituídas pelos novos links.

## Começar a usar

1. Abre **Entrar** ou **Escolher perfil**.
2. Cria um perfil com o teu nome. O primeiro perfil desse navegador recebe **Comando** para permitir a configuração local.
3. Os perfis criados depois recebem **Estagiário**. Em **Gestão**, o Comando pode alterar os cargos locais.
4. Não são pedidos emails nem palavras-passe. Para usar outro perfil, seleciona-o na mesma página e clica em **Mudar de perfil**.
5. **Sair** termina apenas a escolha de perfil. Os dados locais continuam guardados. Fechar o separador pode terminar a escolha; os perfis e eventos continuam no navegador.

Os cargos preservados são Comando, Primeiro Oficial, Oficial, Sargento, Operacional, Estagiário e Quadro Permanentes. O site impede remover o último Comando através da interface. Estas regras locais podem ser contornadas por quem controlar o navegador e não representam controlo de acesso real.

## Eventos

- Qualquer perfil local pode criar eventos com título, descrição, data, início, término e local.
- Os horários usam **Portugal continental — Europe/Lisbon**, independentemente do fuso do computador.
- O término tem de ser posterior ao início, no mesmo dia. Horas inexistentes na mudança para a hora de verão são recusadas; na hora repetida de outono é usada a primeira ocorrência.
- Eventos em curso e futuros aparecem primeiro, por data crescente. Os terminados aparecem depois, do mais recente para o mais antigo.
- **Vou** e **Não vou** mostram a contagem e os nomes dos perfis que responderam.
- Cada perfil tem uma resposta por evento. Trocar de opção substitui a resposta anterior. Não é possível garantir «uma pessoa» por perfil sem autenticação real.
- Não há um limite de participantes ou votos definido no código. A capacidade real depende do armazenamento e dos recursos do navegador.
- A lista pode ser filtrada por todos, próximos/em curso ou terminados.

Separadores do mesmo navegador, abertos no mesmo endereço do portal, podem partilhar os dados locais e usar perfis diferentes. Navegadores, dispositivos, modos privados e endereços diferentes não partilham os dados automaticamente. Alterações simultâneas em vários separadores não têm as garantias de transação de um serviço central; evita editar o mesmo registo ao mesmo tempo.

## Editar os textos

Em **Gestão → Conteúdo das páginas**, escolhe Início, Eventos, Gestão, Entrar ou Identidade, rodapé e nomes do menu.

Podes alterar títulos, subtítulos, secções, textos, imagens, itens da hierarquia e a respetiva ordem. Usa **Guardar neste navegador** para aplicar. Os perfis com permissão local de edição também podem editar os textos diretamente nas páginas autorizadas. A Gestão e a identidade do site são apresentadas apenas ao Comando.

Para uma imagem local, envia-a para `images/` no GitHub e usa `images/nome-do-ficheiro.png`. Respeita maiúsculas e minúsculas. Também é possível referenciar uma imagem HTTPS, mas os ficheiros iniciais não dependem de imagens, fontes ou scripts externos.

O editor trabalha com texto simples: etiquetas HTML e scripts introduzidos nos textos são apresentados como texto. Não alteres os identificadores dos itens do menu se editares `conteudo.js` manualmente.

Rascunhos não guardados são mantidos quando chega uma atualização de outro separador. A gravação é recusada se o conteúdo daquela página tiver mudado entretanto. Nesse caso, copia o rascunho e usa **Recarregar conteúdo guardado** antes de tentar novamente. Os botões do menu, a troca de página no editor e a saída do perfil avisam se houver rascunhos por guardar.

### Publicar as edições para todos

1. Guarda os textos no editor.
2. Em **Gestão → Publicar os textos para todos**, clica em **Descarregar conteudo.js**.
3. Substitui o ficheiro `conteudo.js` na raiz do repositório pelo ficheiro descarregado e faz commit.
4. Depois da publicação, os visitantes recebem os novos textos ao carregar o site. Perfis, eventos, votos e permissões individuais não são publicados por esta exportação.
5. Um navegador com edições locais mantém essas edições. Para passar a usar o conteúdo publicado, recarrega o site e escolhe **Usar os textos publicados neste navegador** na Gestão.

Este processo requer uma atualização manual no GitHub. O site não tem credenciais nem autorização para fazer commits ao teu repositório.

## Guardar e importar uma cópia

Em **Gestão → Cópia dos dados locais**, usa **Descarregar cópia JSON**. A cópia inclui os perfis, cargos, permissões, eventos, respostas e edições locais. Não inclui as imagens: conserva também os ficheiros da pasta `images/`.

Para recuperar uma cópia noutro navegador, abre o mesmo portal, cria um perfil local para teres acesso à Gestão e usa **Importar cópia JSON**. Confirma a substituição apenas depois de guardares os dados atuais que quiseres conservar. O ficheiro é validado antes da importação e o site pede confirmação com as contagens. A importação **substitui**, não junta, os dados locais. São aceites cópias até 20 MB; a capacidade de gravação pode ser inferior, consoante o navegador.

O JSON é lido apenas no navegador, sem envio para um serviço remoto. Não o coloques no repositório público se não quiseres publicar os nomes e restantes dados da cópia.

Se limpares os dados do navegador, usares navegação privada ou mudares de endereço, podes perder acesso aos registos locais. Faz cópias quando precisares de os conservar. Se o armazenamento ficar cheio ou bloqueado, o site apresenta um erro e não substitui os dados anteriores pela alteração recusada. Se o conteúdo local estiver corrompido, apresenta opções para descarregar os dados para recuperação ou repor o navegador.

## Referências

- [GitHub — O que é GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub — Configurar a origem da publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub — Criar um site do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

Não foi feita qualquer publicação ou alteração num repositório do GitHub durante a preparação deste ZIP.
