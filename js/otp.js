import {db,state,result,loadIdentity} from './api.js';
import {e,errorMessage} from './core.js';
export const validOTP=value=>typeof value==='string'&&/^[0-9]{4}$/.test(value);
export async function otpRequest(body) {
 const {data,error}=await db.functions.invoke('portal-otp',{body});
 if(error){let detail;try{detail=await error.context?.json();}catch{}const err=new Error(detail?.error||'Não foi possível ligar ao serviço. Verifica a ligação e tenta novamente.');err.reason=detail?.reason;throw err;}
 if(data?.error)throw new Error(data.error);return data;
}
export async function startOTP(form) {
 const fd=new FormData(form),mode=form.dataset.mode;
 if(mode==='signup'&&fd.get('password')!==fd.get('confirmation'))throw new Error('As palavras-passe não coincidem.');
 const data=await otpRequest({action:'start',operation:mode==='signup'?'signup':mode==='reset'?'recovery':'login',email:String(fd.get('email')||'').trim(),password:String(fd.get('password')||''),full_name:String(fd.get('full_name')||'').trim()});
 if(!data?.id||!data.proof||!data.email)throw new Error('Não foi possível iniciar a verificação. Tenta novamente.');
 state.otp={...data,status:'input',retryAt:Date.now()+data.retry_after*1000,expiresAt:Date.now()+data.expires_in*1000};
 state.profile=null;state.permissions=[];form.reset();
}
const lock='<svg viewBox="0 0 32 32" aria-hidden="true"><g class="otp-lock-path"><rect x="8" y="14" width="16" height="13" rx="3"/><path d="M11 14V9a5 5 0 0 1 10 0v5M16 19v3"/></g><path class="otp-check-path" d="m8 16 5 5 11-11"/></svg>';
export function otpScreen(){
 const otp=state.otp,success=otp.status==='success',busy=otp.status==='verifying';
 return {html:`<section class="container page auth-page"><div class="otp-card" data-state="${success?'success':busy?'verifying':['error','locked','expired'].includes(otp.status)?'error':'input'}"><div class="otp-lock">${lock}</div><h1>${success?'Verificação concluída':'Confirma que és tu'}</h1><p class="muted otp-intro">Introduz o código de quatro dígitos enviado para<br><strong>${e(otp.email)}</strong></p><form id="otp-form" novalidate><fieldset class="otp-digits"><legend class="sr-only">Código de verificação, quatro algarismos</legend>${[0,1,2,3].map(i=>`<label class="sr-only" for="otp-${i}">Algarismo ${i+1}</label><input id="otp-${i}" name="digit-${i}" class="otp-digit" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1" autocomplete="${i===0?'one-time-code':'off'}" aria-describedby="otp-feedback" value="${e(otp.digits?.[i]||'')}" ${success||busy?'disabled':''} required>`).join('')}</fieldset><p id="otp-feedback" class="otp-feedback" role="status" aria-live="polite">${e(otp.message||'O código é válido durante cinco minutos.')}</p><button class="button primary otp-submit" type="submit" ${['verifying','success','locked','expired'].includes(otp.status)||!validOTP((otp.digits||[]).join(''))?'disabled':''} ${success?'hidden':''}><span class="otp-spinner" aria-hidden="true"></span><span>${busy?'A verificar…':'Verificar código'}</span></button></form><button id="otp-continue" class="button primary" ${success?'':'hidden'}>Continuar →</button><p class="otp-resend">Não recebeste o código? <button id="otp-resend" class="text-button" disabled>Reenviar</button></p><a class="text-link" href="#/entrar" data-otp-cancel>Voltar ao início de sessão</a></div></section>`};
}
// Permite exercitar respostas e falhas de rede nos testes sem códigos de demonstração.
export function initOTP({render,goHome,request=otpRequest,client=db,now=Date.now}) {
 const digits=()=>[...document.querySelectorAll('.otp-digit')];
 const feedback=(message,status='input')=>{
  const card=document.querySelector('.otp-card');if(!card)return;card.dataset.state=status;if(state.otp)state.otp.message=message;document.querySelector('#otp-feedback').textContent=message;digits().forEach(el=>el.setAttribute('aria-invalid',String(status==='error')));
  if(status==='error'){card.classList.remove('otp-shake');void card.offsetWidth;card.classList.add('otp-shake');}
 };
 function update(){
  const inputs=digits(),otp=state.otp;if(!inputs.length||!otp)return;
  document.querySelector('.otp-submit').disabled=['verifying','success','locked','expired'].includes(otp.status)||!validOTP(inputs.map(el=>el.value).join(''));
  document.querySelector('#otp-form').setAttribute('aria-busy',String(otp.status==='verifying'));
  if(['verifying','success','locked'].includes(otp.status)||otp.resending||now()<otp.retryAt)document.querySelector('#otp-resend').disabled=true;
 }
 function fill(input,text){
  if(!state.otp||['verifying','success','locked'].includes(state.otp.status))return;
  const inputs=digits(),index=inputs.indexOf(input);
  if(validOTP(text)){inputs.forEach((el,i)=>el.value=text[i]);inputs[3].focus();}
  else if(/^[0-9]?$/.test(text)){input.value=text;if(input.value&&index<3)inputs[index+1].focus();}
  else{input.value='';feedback('Usa apenas o código de quatro algarismos.','error');update();return;}
  state.otp.digits=inputs.map(el=>el.value);
  if(state.otp?.status==='error'){state.otp.status='input';feedback('Introduz novamente o código.');}update();
 }
 document.addEventListener('input',event=>{if(event.target.matches('.otp-digit'))fill(event.target,event.data?.length>1?event.data:event.target.value);});
 document.addEventListener('paste',event=>{
  if(!event.target.matches('.otp-digit'))return;event.preventDefault();const text=event.clipboardData.getData('text').trim();
  if(!validOTP(text)){feedback('Cola apenas o código completo de quatro algarismos.','error');return;}fill(event.target,text);
 });
 document.addEventListener('keydown',event=>{
  if(!event.target.matches('.otp-digit'))return;const inputs=digits(),index=inputs.indexOf(event.target);
  if(event.key==='Backspace'&&!event.target.value&&index>0){event.preventDefault();inputs[index-1].value='';inputs[index-1].focus();if(state.otp)state.otp.digits=inputs.map(el=>el.value);update();}
  if(event.key==='ArrowLeft'&&index>0){event.preventDefault();inputs[index-1].focus();}
  if(event.key==='ArrowRight'&&index<3){event.preventDefault();inputs[index+1].focus();}
 });
 document.addEventListener('focusin',event=>{if(event.target.matches('.otp-digit'))event.target.select();});
 document.addEventListener('submit',async event=>{
  if(event.target.id!=='otp-form')return;event.preventDefault();const otp=state.otp,code=digits().map(el=>el.value).join('');
  if(!otp||['verifying','success','locked','expired'].includes(otp.status)||!validOTP(code))return;
  otp.status='verifying';feedback('A verificar…','verifying');digits().forEach(el=>el.disabled=true);update();
  const submit=document.querySelector('.otp-submit');submit.setAttribute('aria-busy','true');submit.lastElementChild.textContent='A verificar…';
  try{
   const data=await request({action:'verify',id:otp.id,proof:otp.proof,code});
   if(state.otp!==otp)return;if(data.verified!==true||!data.session?.access_token||!data.session?.refresh_token)throw new Error('Não foi possível confirmar a verificação.');
   otp.status='success';otp.session=data.session;feedback('Identidade confirmada. Podes continuar.','success');
   document.querySelector('.otp-card h1').textContent='Verificação concluída';document.querySelector('.otp-intro').textContent='A tua identidade foi confirmada.';document.querySelector('.otp-submit').hidden=true;document.querySelector('#otp-continue').hidden=false;document.querySelector('#otp-continue').focus();
  }catch(error){if(state.otp===otp){otp.status=['attempts','used'].includes(error.reason)?'locked':error.reason==='expired'?'expired':'error';feedback(errorMessage(error),'error');digits().forEach(el=>el.disabled=false);digits()[0]?.focus();}}
  finally{if(state.otp===otp){submit.removeAttribute('aria-busy');submit.lastElementChild.textContent='Verificar código';update();}}
 });
 document.addEventListener('click',async event=>{
  if(event.target.closest('[data-otp-cancel]')){if(state.otp?.status==='verifying'||state.otp?.continuing){event.preventDefault();return;}state.otp=null;if(state.user){await client.auth.signOut({scope:'local'});state.user=null;}await render();return;}
  if(event.target.id==='otp-continue'){
   const otp=state.otp,button=event.target;if(!otp?.session||otp.status!=='success'||otp.continuing)return;otp.continuing=true;button.disabled=true;
   try{
    state.recovery=otp.operation==='recovery';
    const data=await result(client.auth.setSession(otp.session));
    if(!data.session||!(await result(client.rpc('otp_session_verified'))))throw new Error('Não foi possível confirmar a sessão. Tenta continuar novamente.');
    state.otp=null;state.user=data.user;await loadIdentity();
    if(!state.user)throw new Error('A sessão já não é válida. Inicia sessão novamente.');
    goHome(otp.operation==='recovery');
   }catch(error){if(!state.otp)state.otp=otp;feedback(errorMessage(error),'error');button.disabled=false;}finally{otp.continuing=false;}return;
  }
  if(event.target.id!=='otp-resend')return;
  const otp=state.otp;if(!otp||['verifying','success','locked'].includes(otp.status)||otp.resending||now()<otp.retryAt)return;
  otp.resending=true;event.target.disabled=true;
  try{const data=await request({action:'resend',id:otp.id,proof:otp.proof});if(state.otp!==otp)return;otp.retryAt=now()+data.retry_after*1000;otp.expiresAt=now()+data.expires_in*1000;otp.status='input';otp.digits=[];digits().forEach(el=>{el.value='';el.disabled=false;});feedback('Enviámos um novo código. O anterior deixou de ser válido.');digits()[0]?.focus();}
  catch(error){feedback(errorMessage(error),'error');if(error.reason==='rate_limit')otp.retryAt=now()+60000;}
  finally{otp.resending=false;update();}
 });
 const interval=setInterval(()=>{
  const button=document.querySelector('#otp-resend'),otp=state.otp;if(!button||!otp)return;
  const left=Math.max(0,Math.ceil((otp.retryAt-now())/1000));button.disabled=left>0||otp.resending||['verifying','success','locked'].includes(otp.status);button.textContent=otp.resending?'A enviar…':left?`Reenviar em ${left}s`:'Reenviar código';
  if(['input','error'].includes(otp.status)&&now()>otp.expiresAt){otp.status='expired';feedback('O código expirou. Pede um novo código.','error');update();}
 },500);
 return ()=>clearInterval(interval);
}
