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
function fixture({deliveryError=false,authError=false,enabled=true,configured=true,newCode,identityError=false,provider='resend',linkError=false,requestAllowed=true,requestRetry=0,periodic=false,verified=false,sessionActive=true,grantError=false}={}){
 const secret='test-only-secret-with-more-than-32-characters',id='user-1';let row=null,mailCode=null,granted=false,deliveries=0;const actions=[];
 const token='header.'+btoa(JSON.stringify({sub:id,session_id:'session-1',exp:Math.floor(Date.now()/1000)+3600}))+'.signature';
 const session={access_token:token,refresh_token:'refresh-private'};
 const admin={async rpc(name,{action,args}={}){
  if(name==='otp_policy')return {data:{enabled,...(periodic?{verification_days:30,verification_version:2}:{})}};
  actions.push({action,args});
  if(action==='session_status')return {data:{ok:true,authenticated:sessionActive,verified,needs_verification:!verified,verification_expires_at:'2026-12-01T00:00Z'}};
  if(action==='request_limit')return {data:{ok:requestAllowed,retry_after:requestRetry}};
  if(action==='limit')return {data:{ok:true}};
  if(action==='cleanup')return {data:{ok:true}};
  if(action==='issue'){row={...args,consumed:false,attempts:0};return {data:{ok:true}};}
  if(action==='grant'){if(grantError)return {data:{ok:false,error:'session'}};granted=true;verified=true;return {data:{ok:true}};}
  if(!row||args.proof_hash!==row.proof_hash)return {data:{ok:false,error:'invalid'}};
  if(row.consumed)return {data:{ok:false,error:'used'}};
  if(action==='lookup')return {data:{ok:true,...row}};
  if(action==='cancel'){row.consumed=true;return {data:{ok:true}};}
  if(action==='resend'){row.code_hash=args.code_hash;return {data:{ok:true,...row}};}
  if(action==='verify'){row.attempts++;if(row.code_hash!==args.code_hash)return {data:{ok:false,error:'invalid'}};row.consumed=true;return {data:{ok:true,...row}};}
 },auth:{async getUser(){return identityError?{error:{message:'offline'}}:{data:{user:{id,email:'n@example.test'}}};},admin:{async generateLink(){if(linkError)return {error:{message:'User does not exist'}};return {data:{user:{id},properties:{hashed_token:'native-hash'}}};}}}};
 const auth={auth:{async signInWithPassword(){return authError?{error:{message:'bad'}}:{data:{user:{id},session}};},async verifyOtp(){return {data:{session}};}}};
 const env=key=>({OTP_SECRET:configured?secret:'',OTP_EMAIL_PROVIDER:provider,OTP_GMAIL_USER:'ushe.example.test@gmail.com',OTP_GMAIL_APP_PASSWORD:'a'.repeat(16),RESEND_API_KEY:'mail-key',OTP_FROM_EMAIL:'USHE <auth@example.test>',OTP_ALLOWED_ORIGINS:'https://portal.example.test'}[key]);
 const handler=createOtpHandler({env,admin,auth,...(newCode?{newCode}:{}),sendSmtp:async(_settings,message)=>{if(deliveryError)throw new Error('offline; do not return credentials');mailCode=message.text.match(/é ([0-9]{4})/)[1];return {accepted:message.to.map(item=>item.address)};},fetcher:async(_url,options)=>{if(deliveryError)throw new Error('offline');deliveries++;const body=JSON.parse(options.body);mailCode=body.text.match(/é ([0-9]{4})/)[1];return {ok:true};}});
 const request=async(body,authorization)=>{const response=await handler(new Request('https://edge.example.test',{method:'POST',headers:{origin:'https://portal.example.test',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify({...periodic?{verification_version:2}:{},...body})}));return {status:response.status,data:await response.json()};};
 return {request,actions,session,get deliveries(){return deliveries;},get code(){return mailCode;},get row(){return row;},get granted(){return granted;}};
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

test('audit: per-email quota runs before provider calls for real and decoy accounts',async()=>{
 for(const operation of ['login','recovery','signup']){
  const f=fixture({requestAllowed:false,requestRetry:87});const result=await f.request({action:'start',operation,email:'n@example.test',password:'long-password-123',full_name:'Name'});
  assert.equal(result.status,429);assert.equal(result.data.retry_after,87);assert.equal(f.row,null);assert.equal(f.code,null);assert.equal(f.granted,false);
 }
});

test('OTP: successful requests allow immediate resend; fifth request exposes two-minute countdown',async()=>{
 for(const requestRetry of [0,120]){
  const f=fixture({requestRetry});
  const start=await f.request({action:'start',operation:'login',email:'n@example.test',password:'pass'});
  assert.equal(start.status,200);assert.equal(start.data.retry_after,requestRetry);
  const resend=await f.request({action:'resend',id:start.data.id,proof:start.data.proof});
  assert.equal(resend.status,200);assert.equal(resend.data.retry_after,requestRetry);
 }
});

test('30 days: valid password login skips email without granting or extending verification',async()=>{
 const f=fixture({periodic:true,verified:true});
 for(let i=0;i<2;i++){
  const r=await f.request({action:'start',operation:'login',email:'n@example.test',password:'pass',last_verified_at:'2099-01-01'});
  assert.equal(r.status,200);assert.equal(r.data.verified,true);assert.equal(r.data.skip_verification,true);assert.ok(r.data.session);assert.equal(r.data.verification_expires_at,'2026-12-01T00:00Z');
 }
 assert.equal(f.deliveries,0);assert.equal(f.row,null);assert.equal(f.granted,false);assert.ok(!f.actions.some(x=>['grant','issue','request_limit'].includes(x.action)));
});
test('an older cached frontend keeps its compatible OTP response instead of receiving an unsupported shortcut',async()=>{
 const f=fixture({periodic:true,verified:true});const r=await f.request({action:'start',verification_version:1,operation:'login',email:'n@example.test',password:'pass'});assert.equal(r.status,200);assert.ok(r.data.id);assert.ok(!r.data.skip_verification);assert.equal(f.deliveries,1);
});
test('30 days: missing/expired verification requires a real code and a failed grant never returns success',async()=>{
 for(const grantError of [false,true]){
  const f=fixture({periodic:true,grantError});const start=await f.request({action:'start',operation:'login',email:'n@example.test',password:'pass',verified:true});
  assert.equal(start.status,200);assert.ok(!start.data.session);assert.ok(!start.data.verified);assert.equal(f.deliveries,1);
  const r=await f.request({action:'verify',id:start.data.id,proof:start.data.proof,code:f.code});
  assert.equal(r.data.verified===true,!grantError);
  const grant=f.actions.find(x=>x.action==='grant');assert.equal(grant.args.challenge_id,start.data.id);assert.ok(grant.args.proof_hash);assert.equal(grant.args.verified_email,'n@example.test');
 }
});
test('renewal: an authenticated existing session can verify without sending tokens in the response',async()=>{
 const f=fixture({periodic:true}),authorization='Bearer '+f.session.access_token;
 const start=await f.request({action:'renew',email:'attacker@example.test'},authorization);assert.equal(start.status,200);assert.equal(start.data.operation,'renewal');assert.ok(!start.data.session);
 const verified=await f.request({action:'verify',id:start.data.id,proof:start.data.proof,code:f.code},authorization);assert.equal(verified.data.verified,true);assert.ok(!verified.data.session);assert.equal(f.granted,true);
});
test('renewal: missing identity, revoked session or a different session never authorizes an account',async()=>{
 const f=fixture({periodic:true});assert.equal((await f.request({action:'renew'})).status,401);assert.equal(f.deliveries,0);
 const banned=fixture({periodic:true,sessionActive:false});assert.equal((await banned.request({action:'renew'},'Bearer '+banned.session.access_token)).status,401);assert.equal(banned.deliveries,0);
 const start=await f.request({action:'renew'},'Bearer '+f.session.access_token);
 const different='h.'+btoa(JSON.stringify({session_id:'different-session'}))+'.s';
 const result=await f.request({action:'verify',id:start.data.id,proof:start.data.proof,code:f.code},'Bearer '+different);assert.equal(result.status,401);assert.equal(f.granted,false);
});
test('renewal does not send mail for an already verified account; signup/recovery still require codes',async()=>{
 const f=fixture({periodic:true,verified:true});const r=await f.request({action:'renew'},'Bearer '+f.session.access_token);assert.equal(r.data.already_verified,true);assert.equal(f.deliveries,0);assert.equal(f.granted,false);
 for(const operation of ['signup','recovery']){const account=fixture({periodic:true,verified:true});const start=await account.request({action:'start',operation,email:'n@example.test',password:'long-password-123',full_name:'Name'});assert.equal(start.status,200);assert.ok(start.data.id);assert.equal(account.deliveries,1);assert.ok(!start.data.session);}
});
