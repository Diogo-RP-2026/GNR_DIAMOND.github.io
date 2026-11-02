# Migração do portal local para Supabase

A versão anterior guardava perfis, votos e conteúdos no navegador. Esta versão substitui esse comportamento por contas reais, Postgres, RLS e Storage privado no Supabase, conforme o pedido atualizado.

1. Conserva o histórico Git e uma cópia dos dados locais que precisares de consultar.
2. Substitui `index.html`, `style.css` e `script.js`. Adiciona `config.js`, `js/`, `vendor/`, `supabase/` e os restantes ficheiros desta entrega.
3. O antigo `conteudo.js` é removido e deixa de ser carregado. O portal novo não lê nem elimina o armazenamento da versão anterior.
4. Segue os passos Supabase do `README.md`. Cada pessoa cria uma conta; o Comando aprova-a e atribui abas.
5. Não importes cargos/permissões locais como prova de identidade. Não existe promoção automática da primeira pessoa que entra.
6. O GitHub Pages continua a servir a raiz de `main`, sem compilação. Os dados partilhados e as fotografias passam a ser guardados no Supabase.

As capturas e os dados de exemplo fornecidos aparecem em `02_seed.sql`, de forma deliberada e editável. O código e os scripts SQL de um repositório público podem ser consultados por qualquer visitante. Dados novos guardados no Supabase são protegidos por RLS e não são copiados para os ficheiros públicos do site.
