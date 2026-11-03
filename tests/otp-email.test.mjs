import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailSender} from '../supabase/functions/portal-otp/email.js';
import nodemailer from 'nodemailer';
const settings={OTP_EMAIL_PROVIDER:'gmail',OTP_GMAIL_USER:'ushe.example.test@gmail.com',OTP_GMAIL_APP_PASSWORD:'a'.repeat(16)};
const env=values=>key=>values[key];

test('Gmail fica preparado sem Resend e normaliza os grupos da palavra-passe de aplicação',()=>{
 const sender=createEmailSender({env:env({...settings,OTP_GMAIL_APP_PASSWORD:'aaaa aaaa aaaa aaaa'}),sendSmtp:async()=>({accepted:[]})});
 assert.equal(sender.provider,'gmail');assert.equal(sender.ready,true);
});
test('Gmail recusa configuração incompleta, formato inválido e fornecedor desconhecido',()=>{
 for(const values of [{...settings,OTP_GMAIL_APP_PASSWORD:''},{...settings,OTP_GMAIL_APP_PASSWORD:'normal-password'},
  {...settings,OTP_GMAIL_USER:'someone@example.test'},{...settings,OTP_EMAIL_PROVIDER:'unknown'}]) {
  assert.equal(createEmailSender({env:env(values),sendSmtp:async()=>({accepted:[]})}).ready,false);
 }
 assert.equal(createEmailSender({env:env(settings)}).ready,false);
});
test('Gmail usa TLS verificado em 465, remetente autenticado e nenhum log de credenciais',async()=>{
 let options,message;const sender=createEmailSender({env:env({...settings,OTP_FROM_EMAIL:'fake@example.test'}),sendSmtp:async(o,m)=>{options=o;message=m;return {accepted:['recipient@example.test']};}});
 await sender.send('recipient@example.test','0007');
 assert.equal(options.host,'smtp.gmail.com');assert.equal(options.port,465);assert.equal(options.secure,true);
 assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.logger,false);assert.equal(options.debug,false);
 assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);
 assert.equal(message.from.address,settings.OTP_GMAIL_USER);assert.deepEqual(message.to,[{address:'recipient@example.test'}]);
 assert.match(message.text,/0007/);assert.ok(!message.text.includes(settings.OTP_GMAIL_APP_PASSWORD));
});
test('Gmail exige aceitação do destinatário correto e não muda para outro fornecedor em caso de erro',async()=>{
 let fetches=0;
 for(const sendSmtp of [async()=>({accepted:[]}),async()=>({accepted:['another@example.test']}),async()=>{throw new Error('network');}]) {
  const sender=createEmailSender({env:env({...settings,RESEND_API_KEY:'fixture',OTP_FROM_EMAIL:'fixture@example.test'}),sendSmtp,fetcher:async()=>{fetches++;return {ok:true};}});
  await assert.rejects(sender.send('recipient@example.test','0042'));
 }
 assert.equal(fetches,0);
});
test('Resend continua a ser predefinido e conserva o seu formato HTTP',async()=>{
 let url,request;
 const sender=createEmailSender({env:env({RESEND_API_KEY:'fixture-only',OTP_FROM_EMAIL:'USHE <auth@example.test>'}),fetcher:async(u,r)=>{url=u;request=r;return {ok:true};}});
 assert.equal(sender.provider,'resend');assert.equal(sender.ready,true);await sender.send('recipient@example.test','0012');
 assert.equal(url,'https://api.resend.com/emails');assert.equal(request.headers.Authorization,'Bearer fixture-only');
 assert.equal(JSON.parse(request.body).from,'USHE <auth@example.test>');assert.match(JSON.parse(request.body).text,/0012/);
});
test('Nodemailer fixado gera a mensagem MIME real sem incluir credenciais',async()=>{
 const sender=createEmailSender({env:env(settings),sendSmtp:async(_options,message)=>{
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
  const info=await transport.sendMail(message),mime=info.message.toString();
  assert.match(mime,/From: USHE <ushe\.example\.test@gmail\.com>/);
  assert.match(mime,/To: recipient@example\.test/);assert.match(mime,/0007/);
  assert.ok(!mime.includes(settings.OTP_GMAIL_APP_PASSWORD));
  return {accepted:['recipient@example.test']};
 }});
 await sender.send('recipient@example.test','0007');
});
