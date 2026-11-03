# Ativar códigos de quatro dígitos com Gmail

Esta opção permite usar uma conta Gmail como remetente, sem comprar domínio nem configurar Resend. O endereço Gmail escolhido aparece como remetente aos membros; pode ser uma conta dedicada à USHE.

**Estado — 03/11/2026:** a função reconhece a configuração Gmail (`ready: true`, sem campos em falta) e a política OTP está ativa no Supabase. Os 55 testes locais passaram. Num teste real autorizado com uma conta existente, o Gmail aceitou o envio, o utilizador recebeu e introduziu o código pela janela segura, o backend confirmou a identidade e o botão **Continuar** abriu o **Início**, com essa opção ativa no menu (`aria-current="page"`). Nenhuma conta foi criada nem foram alteradas permissões para realizar o teste.

## 1. Preparar a conta Google

1. Entra, no teu próprio navegador, na conta Gmail que vai enviar os códigos.
2. Abre **Conta Google → Segurança e início de sessão → Como inicia sessão no Google → Verificação em dois passos** e ativa-a, caso ainda não esteja ativa.
3. Abre [Palavras-passe de aplicações](https://myaccount.google.com/apppasswords). Dá o nome **USHE Portal** à aplicação e gera a palavra-passe de aplicação.
4. Guarda-a diretamente no gestor de palavras-passe ou no painel Supabase do passo seguinte. Não a envies pelo chat. A aplicação usa esta palavra-passe de aplicação, não a palavra-passe habitual da conta.

A opção de palavras-passe de aplicações pode não estar disponível em contas com Proteção Avançada, contas de organizações ou determinadas configurações de chaves de segurança. Se a opção não aparecer, não desligues as proteções da conta: confirma o tipo/configuração da conta antes de continuar.

## 2. Configurar no Supabase

Abre **Supabase → projeto GNR_DIAMOND.github.io → Edge Functions → Secrets**. Configura:

| Nome | Valor |
| --- | --- |
| `OTP_EMAIL_PROVIDER` | `gmail` |
| `OTP_GMAIL_USER` | O endereço completo da conta Gmail que vai enviar, sem nome nem `< >`. |
| `OTP_GMAIL_APP_PASSWORD` | A palavra-passe de aplicação gerada pelo Google. Os espaços entre grupos são removidos pelo backend. |
| `OTP_SECRET` | Segredo criptográfico aleatório de pelo menos 32 bytes; manter privado. |
| `OTP_ALLOWED_ORIGINS` | `https://diogo-rp-2026.github.io` |

Não são necessárias `RESEND_API_KEY` nem `OTP_FROM_EMAIL` quando o fornecedor escolhido é `gmail`. Mantém as variáveis administrativas que o próprio Supabase injeta na função.

Para gerar `OTP_SECRET` no teu computador com Python, sem o colocar no repositório:

```text
python -c "import secrets; print(secrets.token_hex(32))"
```

Cola o resultado apenas no campo do segredo no Supabase. Não substituas um `OTP_SECRET` existente sem planear a invalidação dos desafios pendentes.

## 3. Confirmar preparação, ativar e testar

O `status` da função `portal-otp` deve responder `ready: true` depois dos segredos configurados. O campo `configuration` apresenta apenas o fornecedor reconhecido (`gmail`, `resend` ou `invalid`) e os nomes de configurações em falta/inválidas, nunca os seus valores. Se indicar `OTP_EMAIL_PROVIDER`, guardar exatamente `gmail` no campo Value do Supabase, sem aspas nem formatação. Este estado valida apenas o formato/configuração; não autentica a conta no Gmail nem confirma que uma mensagem chegou à caixa.

Quando estiver tudo preparado, um administrador ativa no SQL Editor:

```sql
update private.otp_settings set enabled = true where id;
select public.otp_policy();
```

Depois, inicia sessão no portal com uma conta própria e confirma a receção, o código correto/incorreto e o reenvio. Completa também um teste de registo e recuperação. A confirmação só autoriza a sessão após validar o código no backend.

Se o Gmail recusar o envio ou a entrega não funcionar, mantém o acesso anterior durante a resolução:

```sql
update private.otp_settings set enabled = false where id;
```

O backend Gmail usa `smtp.gmail.com:465` com TLS e validação de certificados, sem registar credenciais/códigos. Não usa as portas 25/587, bloqueadas nas Edge Functions. A aceitação pelo SMTP não garante chegada à caixa: é necessário o teste real de receção.

## Limites e verificação realizada

O envio fica sujeito aos limites e controlos da conta Gmail. Esta opção destina-se ao volume reduzido do portal; não é um serviço de envio em massa nem garante entrega ilimitada.

- Testes do formato e normalização da configuração Gmail.
- Contrato TLS/porta 465, remetente autenticado e ausência de logs do transporte.
- Erro de rede/recusa cancela o desafio, sem devolver sessões nem detalhes do SMTP.
- Código incorreto/correto e sessão confirmada pelo handler, com transporte/Auth simulados nos testes locais.
- Os testes anteriores de RLS, eventos, votos, contas, navegação e OTP continuam a ser executados por `npm test`.
- Nodemailer está fixado em 10.3.1 no runtime e no lockfile npm dos testes; a mensagem MIME foi gerada com a biblioteca real, sem contactar o servidor Gmail.
- O cache de dependências pelo CLI Deno local não conseguiu aceder ao registo npm; o arranque da função com a dependência real foi confirmado no Supabase publicado.
- Teste real adicional no portal publicado: autenticação por palavra-passe, envio SMTP Gmail, receção e validação do código, instalação da sessão e redirecionamento para Início confirmados. Credenciais e código foram introduzidos pela janela segura, sem serem lidos ou registados pelo assistente.
- A interface do teste não expõe o endereço configurado como remetente. O seu endereço exato no cabeçalho da mensagem não foi verificado nesta execução.
- Registo, recuperação, reenvio, expiração e restantes recusas foram cobertos pelos testes locais/SQL descritos no relatório; ainda não foram repetidos ponta a ponta com emails reais. Não confundir estes testes com o login real concluído.

Referências oficiais: [Google — palavras-passe de aplicações](https://support.google.com/accounts/answer/185833), [Google — verificação em dois passos](https://support.google.com/accounts/answer/185839), [Google — limites de envio](https://support.google.com/mail/answer/22839), [Supabase — limites das Edge Functions](https://supabase.com/docs/guides/functions/limits), [Nodemailer — SMTP/TLS](https://nodemailer.com/smtp).
