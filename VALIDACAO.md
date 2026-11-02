# Validação desta entrega

Verificação realizada em 2 de novembro de 2026.

## Verificações automáticas

- Sintaxe de `script.js` e `conteudo.js`: aprovada.
- **31 testes aprovados**, sem falhas, executados também com o fuso do processo definido para Nova Iorque para verificar a independência dos horários de Lisboa.
- Conteúdos iniciais: cinco páginas e os sete cargos da hierarquia preservados.
- Imagens: referências locais válidas, sem percursos absolutos dependentes da raiz do domínio.
- Ausência de pedidos de dados externos, importações de bibliotecas, configuração remota, código de servidor e ficheiros `.sql` no pacote.

Os testes abrangem conversão de datas de Lisboa no verão/inverno, mudança de hora, datas impossíveis, ordenação, validação de eventos, identidade das referências importadas, recusa de votos duplicados, mais de 1200 votos, preferências dos cargos, delegação local da edição, tratamento seguro do texto e das imagens, falhas de quota, dados corrompidos e preservação dos dados anteriores quando uma gravação é recusada.

A geração de `conteudo.js` foi executada e o resultado foi interpretado como JavaScript: contém as cinco páginas e não inclui perfis, eventos, votos ou permissões individuais. A cópia JSON gerada foi novamente validada sem perda de registos.

## Verificação no navegador

- Página inicial, emblema e hierarquia carregados e inspecionados visualmente.
- Criação do primeiro perfil local como Comando e do segundo como Estagiário.
- Gestão apresentada apenas ao perfil Comando na navegação local.
- Criação de um evento com título, descrição, data, início, término e local.
- Voto «Vou», troca para «Não vou» e persistência depois de recarregar a página.
- Resposta com o segundo perfil, confirmando as duas contagens e as listas de nomes.
- Edição do título do Início e confirmação do texto na página inicial.
- Exportação efetiva de uma cópia JSON com dois perfis, um evento e duas respostas; importação validada, confirmação apresentada e perfis recuperados.
- Carregamento direto e recarregamento de `#/eventos` dentro de uma subpasta de teste.
- Página inicial e imagens carregadas nessa subpasta; dados locais isolados do portal na raiz.

O download de `conteudo.js` não foi confirmado na sessão de pré-visualização; a geração e o conteúdo do ficheiro foram verificados automaticamente. Não foi efetuada uma auditoria completa de acessibilidade nem um teste em todos os navegadores ou tamanhos de ecrã.

## Limites

Não foi publicado nem alterado um repositório real do GitHub. A compatibilidade foi verificada na estrutura dos ficheiros, na navegação estática e na pré-visualização em raiz e subpasta.

Esta versão não fornece sincronização entre dispositivos, autenticação real ou permissões de servidor. Os testes das preferências locais não representam validação de segurança multiutilizador.

Os registos usados nos testes são fictícios e **não estão incluídos no ZIP**. O portal começa com os textos públicos e sem perfis, eventos ou votos de teste.
