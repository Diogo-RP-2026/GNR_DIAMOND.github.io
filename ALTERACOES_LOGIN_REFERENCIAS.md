# Login e referências de animação — 03/11/2026

## Implementado

- Após login bem-sucedido, o utilizador vai para `#/` (Início), marcado com `aria-current="page"` no menu existente.
- Abrir `#/entrar` com sessão existente encaminha para o Início. A recuperação de palavra-passe é uma exceção necessária: continua a apresentar o formulário para definir a nova palavra-passe.
- Ligações diretas a páginas protegidas continuam a funcionar conforme as permissões existentes; não há redirecionamento global de todas as sessões para o Início.
- A área da conta, aprovação e botão Terminar sessão foi preservada em `#/conta`, acessível pelo cabeçalho e menu móvel. Sem sessão, esta rota encaminha para o login.
- Mantidos HTML/CSS/JavaScript estáticos, sem dependências de produção novas. Não houve alterações ao Supabase, RLS, eventos, votos ou proteções de contas.

## Ficheiros

- `script.js`: encaminhamento, rota da conta e ligações de conta no menu/cabeçalho.
- `tests/navigation.test.mjs`: oito testes do controlador real de navegação com DOM e respostas de autenticação simulados.
- `package.json`: inclui os testes de navegação no comando `npm test`.
- Este relatório.

## Verificações

`npm test`: 29 testes aprovados (incluindo os 21 testes anteriores de dados, RLS, votos, eventos e contas). Os oito novos testes cobrem: sessão existente na página de login; login bem-sucedido; login falhado; acesso direto a Eventos; recuperação de palavra-passe; visitante sem sessão; área da conta e respetivas ligações; área da conta sem sessão.

`node --check script.js`, `node --check tests/navigation.test.mjs` e verificação de espaços do diff das novas alterações passaram. Os testes de autenticação usam respostas simuladas do Supabase; não foram usados passwords ou tokens reais. A revisão visual em navegador autenticado continua pendente.

## Referências inacessíveis — pendente, sem imitações não verificadas

Foi tentada a abertura de todas as publicações fornecidas; as cinco devolveram erro de acesso `DisabledError` neste ambiente. Não foi possível observar o movimento, confirmar qual é a opção numerada, identificar o código do autor ou verificar a licença. Por isso, os seguintes pontos não foram implementados:

| Pedido | Referência | Material necessário |
| --- | --- | --- |
| Menu 5 — Staggered Dropdown | https://www.instagram.com/p/DfN-I_Mghgz/ | Vídeo do efeito 5 a abrir/fechar; código se disponibilizado |
| Botão 5 — Shine Sweep | https://www.instagram.com/p/DfMXIvrG9Fq/ | Vídeo do efeito 5; código se disponibilizado |
| Notificação 3 — Fly to Inbox | https://www.instagram.com/p/DfOSs0XCZXT/ | Vídeo do efeito 3, incluindo destino e sequência completa |
| Separadores 4 — Ripple Fill | https://www.instagram.com/p/DfNU5TXkdDw/ | Vídeo do efeito 4 a trocar entre separadores |
| Verificação | https://www.instagram.com/p/DewfIUSThe_/ | Vídeo do fluxo completo e código/licença, se disponibilizados |

Um vídeo/gravação de cada exemplo, ou uma gravação única com os cinco trechos identificados, permite confirmar os movimentos. Capturas fixas ajudam no aspeto, mas não bastam para confirmar sequências animadas. Caso exista código, enviar também o trecho/ligação e a licença que o acompanha.

## Método atual de autenticação confirmado no código

O portal usa `signInWithPassword` (email e palavra-passe), `signUp` com confirmação por ligação de email, `resetPasswordForEmail` e `updateUser({password})` para recuperação. Não existe atualmente formulário OTP de código numérico. Não foi alterado o método nem acrescentado um código fixo ou sucesso visual de verificação. A adaptação de verificação aguarda a referência observável e deverá preservar este mecanismo real do Supabase.
