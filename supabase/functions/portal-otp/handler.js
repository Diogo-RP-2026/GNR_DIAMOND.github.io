import {generateCode,randomProof,digest,seal,unseal,maskEmail,validCode} from './crypto.js';
import {createEmailSender} from './email.js';
const messages={invalid:'O código não está correto. Tenta novamente.',used:'Este código já foi utilizado. Inicia uma nova verificação.',expired:'O código expirou. Pede um novo código.',attempts:'Atingiste o limite de tentativas. Inicia novamente mais tarde.',rate_limit:'Aguarda antes de pedir outro código.',session:'A sessão expirou. Inicia sessão novamente.'};
export function createOtpHandler({env,admin,auth,fetcher=fetch,newCode=generateCode,sendSmtp}) {
 const secret=env('OTP_SECRET')||'',allowed=(env('OTP_ALLOWED_ORIGINS')||'https://diogo-rp-2026.github.io').split(',').map(s=>s.trim());
 const mail=createEmailSender({env,fetcher,sendSmtp});
 const ready=secret.length>=32&&mail.ready;
 const call=async(action,args)=>{const {data,error}=await admin.rpc('otp_service',{action,args});if(error)throw new Error('storage');return data;};
 const send=mail.send;
 const hash=(context,value)=>digest(secret,context,value);
 const limited=seconds=>Object.assign(new Error('rate_limit'),{retry_after:seconds});
 const rate=async(scope,key,max)=>{if(!(await call('limit',{key:await hash(scope,key),max})).ok)throw limited(900);};
 const reserveRequest=async email=>{
  const quota=await call('request_limit',{key:await hash('email',email)});
  if(!quota.ok)throw limited(quota.retry_after||120);
  return quota;
 };
 const identity=async token=>{
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data?.user)throw new Error('session');
  let claims;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new Error('session');}
  if(!claims.session_id)throw new Error('session');
  return {user:data.user,claims};
 };
 const bearer=req=>{const header=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(header))throw new Error('session');return header.slice(7);};
 const sessionStatus=async(user,claims)=>{
  const value=await call('session_status',{user_id:user.id,session_id:claims.session_id,jwt_exp:claims.exp});
  if(!value?.ok||value.authenticated!==true||typeof value.verified!=='boolean')throw new Error('session');return value;
 };
 const issue=async({user,payload,operation,quota,claims})=>{
  await call('cleanup',{});
  const id=crypto.randomUUID(),proof=randomProof(),code=newCode();
  const result=await call('issue',{id,user_id:user.id,operation,proof_hash:await hash('proof',proof),code_hash:await hash('code',`${id}:${user.id}:${operation}:${code}`),payload:await seal(secret,payload,id),session_id:claims?.session_id||null,jwt_exp:claims?.exp,verification_email:payload.email});
  if(!result.ok)throw new Error(result.error);
  try{if(!payload.decoy)await send(payload.email,code);}catch{await call('cancel',{id,proof_hash:await hash('proof',proof)});throw new Error('delivery');}
  return {id,proof,email:maskEmail(payload.email),operation,retry_after:quota.retry_after,expires_in:300};
 };
 return async req=>{
  const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,...(status===429?{'Retry-After':String(body.retry_after)}:{})}});
  if(!allowed.includes(origin))return reply({error:'Origem não autorizada.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Método não permitido.'},405);
  try {
   if(Number(req.headers.get('content-length'))>8192)return reply({error:'Pedido demasiado grande.'},413);
   const reader=req.body?.getReader();let text='',size=0;const decoder=new TextDecoder();
   if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return reply({error:'Pedido demasiado grande.'},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}
   if(size>8192)return reply({error:'Pedido demasiado grande.'},413);
   const body=JSON.parse(text);
   if(!body||typeof body!=='object'||Array.isArray(body)||!['status','start','renew','verify','resend'].includes(body.action))return reply({error:'Pedido inválido.'},400);
   if(body.action==='status')return reply({ready});
   if(!ready)return reply({error:'O envio de códigos ainda não está configurado. Contacta a administração.'},503);
   const {data:policy,error:policyError}=await admin.rpc('otp_policy');
   if(policyError||!policy?.enabled)return reply({error:'A verificação por código ainda não foi ativada.'},503);
   // Deployable before the migration: the old policy keeps the stricter legacy
   // flow until the new database contract becomes available atomically.
   const periodic=policy.verification_version===2&&policy.verification_days===30;
   await rate('ip',(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim(),40);
   if(body.action==='renew') {
    if(!periodic)return reply({error:'A renovação ainda não está disponível. Tenta novamente.'},503);
    const {user,claims}=await identity(bearer(req)),status=await sessionStatus(user,claims);
    if(status.verified)return reply({verified:true,operation:'renewal',already_verified:true,verification_expires_at:status.verification_expires_at});
    const email=String(user.email||'').trim().toLowerCase();if(!email)throw new Error('session');
    const quota=await reserveRequest(email);
    return reply(await issue({user,operation:'renewal',quota,claims,payload:{email,renewal:true,session_id:claims.session_id}}));
   }
   if(body.action==='start') {
    const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),operation=body.operation;
    if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['login','signup','recovery'].includes(operation)||password.length>128)return reply({error:'Dados de autenticação inválidos.'},400);
    let user,payload,claims,quota;
    if(operation==='login') {
     const {data,error}=await auth.auth.signInWithPassword({email,password});
     if(error||!data?.session)return reply({error:'Email ou palavra-passe incorretos, ou email por confirmar.'},401);
     user=data.user;payload={session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token},email};
     if(periodic&&body.verification_version===2){
      const current=await identity(data.session.access_token);if(current.user.id!==user.id)throw new Error('session');claims=current.claims;
      const status=await sessionStatus(user,claims);
      if(status.verified)return reply({verified:true,skip_verification:true,operation,session:payload.session,verification_expires_at:status.verification_expires_at});
     }
     quota=await reserveRequest(email);
    } else {
     quota=await reserveRequest(email);
     if(operation==='signup'&&(password.length<12||String(body.full_name||'').trim().length<2))return reply({error:'Preenche o nome e uma palavra-passe com pelo menos 12 caracteres.'},400);
     const {data,error}=await admin.auth.admin.generateLink({type:operation,email,...(operation==='signup'?{password,options:{data:{full_name:String(body.full_name).trim().slice(0,100)}}}:{})});
     if(error||!data?.properties?.hashed_token||!data?.user){user={id:null};payload={email,decoy:true};}
     else{user=data.user;payload={token_hash:data.properties.hashed_token,type:operation,email};}
    }
    return reply(await issue({user,payload,operation,quota,claims}));
   }
   if(!/^[a-f0-9-]{36}$/.test(body.id||'')||!/^[a-f0-9]{64}$/.test(body.proof||''))return reply({error:messages.invalid},400);
   const args={id:body.id,proof_hash:await hash('proof',body.proof)};
   const lookup=await call('lookup',args);if(!lookup.ok)throw new Error(lookup.error);
   if(body.action==='resend') {
    const payload=await unseal(secret,lookup.payload,body.id),quota=await reserveRequest(payload.email);
    // Um reenvio nunca volta a aceitar o número anterior, mesmo se o sorteio colidir.
    let code,code_hash;
    for(let i=0;i<16;i++) {
     code=newCode();code_hash=await hash('code',`${body.id}:${lookup.user_id}:${lookup.operation}:${code}`);
     if(code_hash!==lookup.code_hash)break;
    }
    if(code_hash===lookup.code_hash)throw new Error('storage');
    const rotated=await call('resend',{...args,code_hash});
    if(!rotated.ok)throw new Error(rotated.error);
    try{if(!payload.decoy)await send(payload.email,code);}catch{await call('cancel',args);throw new Error('delivery');}
    return reply({retry_after:quota.retry_after,expires_in:300});
   }
   if(body.action!=='verify'||!validCode(body.code))return reply({error:'Introduz os quatro algarismos do código.'},400);
   const checked=await call('verify',{...args,code_hash:await hash('code',`${body.id}:${lookup.user_id}:${lookup.operation}:${body.code}`)});
   if(!checked.ok)throw new Error(checked.error);
   const payload=await unseal(secret,checked.payload,body.id);if(payload.decoy)throw new Error('invalid');let session=payload.session,current;
   if(payload.renewal){
    current=await identity(bearer(req));
    if(current.claims.session_id!==payload.session_id)throw new Error('session');
   }else{
    if(!session){const {data,error}=await auth.auth.verifyOtp({token_hash:payload.token_hash,type:payload.type});if(error||!data.session)throw new Error('session');session=data.session;}
    current=await identity(session.access_token);
   }
   // Confirma a sessão real com Auth antes de autorizar o seu session_id na RLS.
   if(current.user.id!==checked.user_id)throw new Error('session');
   const granted=await call('grant',{session_id:current.claims.session_id,user_id:current.user.id,jwt_exp:current.claims.exp,challenge_id:body.id,proof_hash:args.proof_hash,verified_email:payload.email});if(!granted.ok)throw new Error('session');
   return reply({verified:true,operation:checked.operation,verification_expires_at:granted.verification_expires_at,...(payload.renewal?{}:{session:{access_token:session.access_token,refresh_token:session.refresh_token}})});
  } catch(error) {
   // Nunca registar corpos, passwords, códigos, tokens ou respostas do fornecedor.
   const code=error?.message,retry_after=Math.max(1,Math.ceil(Number(error?.retry_after)||120));
   return reply({error:code==='rate_limit'?`Atingiste o limite de pedidos. Tenta novamente dentro de ${retry_after} segundos.`:messages[code]||(code==='delivery'?'Não foi possível enviar o email. Inicia uma nova verificação.':'Não foi possível concluir o pedido. Verifica a ligação e tenta novamente.'),reason:messages[code]?code:'service',...(code==='rate_limit'?{retry_after}:{})},code==='rate_limit'?429:code==='delivery'?502:code==='session'?401:400);
  }
 };
}
