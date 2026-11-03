import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCode,validCode,digest,seal,unseal} from '../supabase/functions/portal-otp/crypto.js';
import {createOtpHandler} from '../supabase/functions/portal-otp/handler.js';
test('quatro algarismos, zeros iniciais, rejeição de truncagens e aleatoriedade sem viés',()=>{
 assert.equal(generateCode(a=>a[0]=7),'0007');let n=0;
 assert.equal(generateCode(a=>a[0]=n++?42:4294967295),'0042');
 assert.ok(validCode('0000'));assert.ok(validCode('0123'));
 for(const value of ['123','12345','12a4','１２３４',1234,null])assert.equal(validCode(value),false);
});
test('HMAC associa código à operação/utilizador; payload cifrado e autenticado por desafio',async()=>{
 const secret='a'.repeat(40),id=crypto.randomUUID();
 assert.notEqual(await digest(secret,'code','id:user:login:0007'),await digest(secret,'code','id:user:signup:0007'));
 const encrypted=await seal(secret,{access_token:'private-session'},id);assert.ok(!encrypted.includes('private-session'));
 assert.deepEqual(await unseal(secret,encrypted,id),{access_token:'private-session'});
 await assert.rejects(unseal(secret,encrypted,'another-id'));
});
function fixture({deliveryError=false,authError=false,enabled=true,configured=true,newCode,identityError=false,provider='resend',linkError=false,startAllowed=true}={}){
 const secret='test-only-secret-with-more-than-32-characters',id='user-1';let row=null,mailCode=null,granted=false;
 const token='header.'+btoa(JSON.stringify({session_id:'session-1'}))+'.signature';
 const session={access_token:token,refresh_token:'refresh-private'};
 const admin={async rpc(name,{action,args}={}){
  if(name==='otp_policy')return {data:{enabled}};
  if(name==='otp_start_allowed')return {data:startAllowed};
  if(action==='limit')return {data:{ok:true}};
  if(action==='cleanup')return {data:{ok:true}};
  if(action==='issue'){row={...args,consumed:false,attempts:0};return {data:{ok:true}};}
  if(action==='grant'){granted=true;return {data:{ok:true}};}
  if(!row||args.proof_hash!==row.proof_hash)return {data:{ok:false,error:'invalid'}};
  if(row.consumed)return {data:{ok:false,error:'used'}};
  if(action==='lookup')return {data:{ok:true,...row}};
  if(action==='cancel'){row.consumed=true;return {data:{ok:true}};}
  if(action==='resend'){row.code_hash=args.code_hash;return {data:{ok:true,...row}};}
  if(action==='verify'){row.attempts++;if(row.code_hash!==args.code_hash)return {data:{ok:false,error:'invalid'}};row.consumed=true;return {data:{ok:true,...row}};}
 },auth:{async getUser(){return identityError?{error:{message:'offline'}}:{data:{user:{id}}};},admin:{async generateLink(){if(linkError)return {error:{message:'User does not exist'}};return {data:{user:{id},properties:{hashed_token:'native-hash'}}};}}}};
 const auth={auth:{async signInWithPassword(){return authError?{error:{message:'bad'}}:{data:{user:{id},session}};},async verifyOtp(){return {data:{session}};}}};
 const env=key=>({OTP_SECRET:configured?secret:'',OTP_EMAIL_PROVIDER:provider,OTP_GMAIL_USER:'ushe.example.test@gmail.com',OTP_GMAIL_APP_PASSWORD:'a'.repeat(16),RESEND_API_KEY:'mail-key',OTP_FROM_EMAIL:'USHE <auth@example.test>',OTP_ALLOWED_ORIGINS:'https://portal.example.test'}[key]);
 const handler=createOtpHandler({env,admin,auth,...(newCode?{newCode}:{}),sendSmtp:async(_settings,message)=>{if(deliveryError)throw new Error('offline; do not return credentials');mailCode=message.text.match(/é ([0-9]{4})/)[1];return {accepted:message.to.map(item=>item.address)};},fetcher:async(_url,options)=>{if(deliveryError)throw new Error('offline');const body=JSON.parse(options.body);mailCode=body.text.match(/é ([0-9]{4})/)[1];return {ok:true};}});
 const request=async body=>{const response=await handler(new Request('https://edge.example.test',{method:'POST',headers:{origin:'https://portal.example.test'},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};};
 return {request,get code(){return mailCode;},get row(){return row;},get granted(){return granted;}};
}
test('sessão só é devolvida depois do código real do serviço; incorreto e reutilizado falham',async()=>{
 const f=fixture(),start=await f.request({action:'start',operation:'login',email:'name@example.test',password:'password'});
 assert.equal(start.status,200);assert.match(f.code,/^[0-9]{4}$/);assert.ok(!('session' in start.data));assert.ok(!('code' in start.data));assert.ok(!JSON.stringify(f.row).includes('refresh-private'));
 const base={id:start.data.id,proof:start.data.proof};
 assert.equal((await f.request({...base,action:'verify',code:f.code==='0000'?'0001':'0000'})).status,400);assert.equal(f.granted,false);
 const correct=await f.request({...base,action:'verify',code:f.code});assert.equal(correct.data.verified,true);assert.equal(f.granted,true);assert.ok(correct.data.session.refresh_token);
 assert.equal((await f.request({...base,action:'verify',code:f.code})).data.reason,'used');
});
test('código com zero inicial é validado inteiro; reenvio evita repetir o código anterior',async()=>{
 let i=0;const sequence=['0007','0007','0098'];const f=fixture({newCode:()=>sequence[i++]});
 const start=await f.request({action:'start',operation:'login',email:'n@example.test',password:'pass'});
 const base={id:start.data.id,proof:start.data.proof};assert.equal(f.code,'0007');
 const resent=await f.request({...base,action:'resend'});assert.equal(resent.status,200);assert.equal(f.code,'0098');
 assert.equal((await f.request({...base,action:'verify',code:'0007'})).data.reason,'invalid');
 assert.equal((await f.request({...base,action:'verify',code:'0098'})).data.verified,true);
});
test('falha do Auth durante a confirmação não autoriza a sessão nem devolve tokens',async()=>{
 const f=fixture({identityError:true});
 const start=await f.request({action:'start',operation:'login',email:'n@example.test',password:'pass'});
 const response=await f.request({action:'verify',id:start.data.id,proof:start.data.proof,code:f.code});
 assert.equal(response.data.reason,'session');assert.equal(f.granted,false);assert.ok(!response.data.session);
});
test('falhas de rede/envio e configuração não simulam sucesso nem expõem código',async()=>{
 for(const params of [{deliveryError:true},{authError:true},{enabled:false},{configured:false}]){
  const f=fixture(params),response=await f.request({action:'start',operation:'login',email:'n@example.test',password:'pass'});
  assert.ok(response.status>=400);assert.ok(!response.data.verified);assert.ok(!response.data.session);assert.ok(!response.data.code);assert.equal(f.granted,false);
 }
});
test('signup e recuperação usam verificação nativa no servidor após validar os quatro dígitos',async()=>{
 for(const operation of ['signup','recovery']){const f=fixture(),start=await f.request({action:'start',operation,email:'n@example.test',password:'a-long-password',full_name:'Nome'});
 assert.equal(start.status,200);const response=await f.request({action:'verify',id:start.data.id,proof:start.data.proof,code:f.code});assert.equal(response.data.verified,true);assert.equal(response.data.operation,operation);}
});
test('Gmail: o transporte preserva o desafio e só autoriza a sessão após código confirmado',async()=>{
 const f=fixture({provider:'gmail'});const start=await f.request({action:'start',operation:'login',email:'recipient@example.test',password:'pass'});
 assert.equal(start.status,200);assert.ok(!start.data.session);assert.ok(!start.data.code);assert.equal(f.granted,false);
 const result=await f.request({action:'verify',id:start.data.id,proof:start.data.proof,code:f.code});assert.equal(result.data.verified,true);assert.equal(f.granted,true);
});
test('Gmail: recusa/erro de rede cancela o desafio e não expõe detalhes do transporte',async()=>{
 const f=fixture({provider:'gmail',deliveryError:true});const response=await f.request({action:'start',operation:'login',email:'recipient@example.test',password:'pass'});
 assert.equal(response.status,502);assert.equal(f.row.consumed,true);assert.equal(f.granted,false);
 assert.ok(!JSON.stringify(response.data).includes('credentials'));assert.ok(!response.data.session);assert.ok(!response.data.code);
});
test('status identifica configuração incompleta sem enviar mensagens ou expor segredos',async()=>{
 const incomplete=fixture({configured:false}),response=await incomplete.request({action:'status'});
 assert.equal(response.status,200);assert.equal(response.data.ready,false);
 assert.ok(!response.data.configuration);
 assert.equal(incomplete.code,null);assert.equal(incomplete.granted,false);
 const complete=fixture({provider:'gmail'}),ok=await complete.request({action:'status'});
 assert.equal(ok.data.ready,true);assert.ok(!ok.data.configuration);
 assert.ok(!JSON.stringify(ok.data).includes('mail-key'));assert.ok(!JSON.stringify(ok.data).includes('secret-with'));
});

test('audit: unknown recovery/existing signup returns indistinguishable challenge without session or email',async()=>{
 for(const operation of ['signup','recovery']){
  const f=fixture({linkError:true});const result=await f.request({action:'start',operation,email:'missing@example.test',password:'long-password-123',full_name:'Name'});
  assert.equal(result.status,200);assert.equal(result.data.operation,operation);assert.equal(result.data.proof.length,64);
  assert.equal(f.code,null);assert.equal(f.granted,false);assert.ok(!result.data.session);
 }
});

test('audit: decoy recovery also supports resend and never grants tokens for a guessed synthetic code',async()=>{
 let i=0;const f=fixture({linkError:true,newCode:()=>['0042','0077'][i++]});
 const start=await f.request({action:'start',operation:'recovery',email:'missing@example.test'});
 const args={id:start.data.id,proof:start.data.proof};
 assert.equal((await f.request({...args,action:'resend'})).status,200);
 assert.equal(f.code,null);
 const result=await f.request({...args,action:'verify',code:'0077'});
 assert.equal(result.data.reason,'invalid');assert.ok(!result.data.session);assert.equal(f.granted,false);
});

test('audit: per-email start cooldown runs before provider calls for real and decoy accounts',async()=>{
 for(const operation of ['login','recovery','signup']){
  const f=fixture({startAllowed:false});const result=await f.request({action:'start',operation,email:'n@example.test',password:'long-password-123',full_name:'Name'});
  assert.equal(result.status,429);assert.equal(f.row,null);assert.equal(f.code,null);assert.equal(f.granted,false);
 }
});
