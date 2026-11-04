import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function dom(){const {document,window}=parseHTML(html);globalThis.document=document;globalThis.window=window;window.matchMedia=()=>({matches:true});globalThis.CustomEvent=window.CustomEvent;return {document,window};}
test('menu: inert fechado, seta aria, teclado, seleção, clique fora e Escape',async()=>{
 const {document,window}=dom();const {initMotion,setMenu,syncNavigation}=await import('../js/motion.js');
 syncNavigation(document.querySelector('#main-nav'),'<div class="nav-inner"><a href="#/" aria-current="page">Início</a><a href="#/eventos">Eventos</a></div>');
 initMotion();const nav=document.querySelector('#main-nav'),toggle=document.querySelector('#menu-toggle');assert.equal(nav.inert,true);
 setMenu(true);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(nav.inert,false);
 const key=new window.Event('keydown',{bubbles:true});Object.defineProperty(key,'key',{value:'Escape'});toggle.dispatchEvent(key);assert.equal(nav.inert,true);
 setMenu(true);document.body.click();assert.equal(nav.inert,true);
 setMenu(true);nav.querySelector('a').click();assert.equal(nav.inert,true);
 const first=nav.querySelector('a');syncNavigation(nav,'<div class="nav-inner"><a href="#/">Início</a><a href="#/eventos" aria-current="page">Eventos</a></div>');
 assert.equal(nav.querySelector('a'),first);assert.equal(first.hasAttribute('aria-current'),false);assert.equal(nav.querySelectorAll('a')[1].getAttribute('aria-current'),'page');
});
test('notificação permanece na caixa sem ser marcada como lida pela animação',async()=>{
 const {document,window}=dom();const {initMotion,clearNotifications}=await import('../js/motion.js');initMotion();
 document.dispatchEvent(new window.CustomEvent('ushe:notify',{detail:{message:'Teste <seguro>',error:false}}));
 assert.equal(document.querySelector('#toast-message').textContent,'Teste <seguro>');
 assert.equal(document.querySelector('#inbox-count').textContent,'1');
 document.querySelector('#toast-dismiss').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(document.querySelector('#toast').hidden,true);assert.equal(document.querySelector('#inbox-count').textContent,'1');
 assert.equal(document.querySelector('.inbox-message p').textContent,'Teste <seguro>');
 document.querySelector('#inbox-toggle').click();assert.equal(document.querySelector('#inbox-count').textContent,'1');
 document.querySelector('.inbox-message button').click();assert.equal(document.querySelector('#inbox-count').textContent,'0');clearNotifications();
});
test('OTP DOM: quatro campos, zeros, colagem, retrocesso, erro real e sem sucesso falso',async()=>{
 const {document,window}=dom();const {state}=await import('../js/api.js');const {initOTP,otpScreen,validOTP}=await import('../js/otp.js');
 state.otp={email:'e••••@example.test',status:'input',id:'id',proof:'proof',retryAt:Date.now()+60000,expiresAt:Date.now()+300000};
 document.querySelector('main').innerHTML=otpScreen().html;
 const previousInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
 initOTP({render(){},goHome(){}});globalThis.setInterval=previousInterval;
 const inputs=[...document.querySelectorAll('.otp-digit')];inputs.forEach(el=>{el.focus=()=>{};el.select=()=>{};});
 assert.equal(inputs.length,4);assert.ok(inputs.every(el=>el.getAttribute('inputmode')==='numeric'));
 const paste=new window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{getData:()=> '0123'}});inputs[0].dispatchEvent(paste);
 assert.equal(inputs.map(i=>i.value).join(''),'0123');assert.equal(document.querySelector('.otp-submit').disabled,false);assert.equal(validOTP('01234'),false);
 const invalid=new window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(invalid,'clipboardData',{value:{getData:()=> '12345'}});inputs[0].dispatchEvent(invalid);assert.equal(document.querySelector('.otp-card').dataset.state,'error');
 inputs[1].value='';const back=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(back,'key',{value:'Backspace'});inputs[1].dispatchEvent(back);assert.equal(inputs[0].value,'');
 // Não há cliente Supabase neste DOM: uma falha real de ligação não pode produzir sucesso.
 inputs.forEach((i,n)=>i.value=String(n));document.querySelector('#otp-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 assert.equal(state.otp.status,'error');assert.equal(document.querySelector('#otp-continue').hidden,true);state.otp=null;
});
async function otpFixture(request,{sessionError=false}={}) {
 const {document,window}=dom(),{state}=await import('../js/api.js'),{initOTP,otpScreen}=await import('../js/otp.js');
 let time=100000,tick,sessions=0,continued=null;
 state.user=null;state.otp={email:'e••••@example.test',operation:'login',status:'input',id:'challenge',proof:'proof',retryAt:time+60000,expiresAt:time+300000};
 document.querySelector('main').innerHTML=otpScreen().html;
 const previous=globalThis.setInterval;globalThis.setInterval=callback=>{tick=callback;return 0;};
 initOTP({request,render(){},goHome:value=>continued=value,now:()=>time,client:{auth:{async setSession(session){sessions++;if(sessionError)throw new Error('Falha ao guardar sessão');return {data:{session,user:{id:'verified-user'}}};}},async rpc(){return {data:true};}}});
 globalThis.setInterval=previous;
 const inputs=[...document.querySelectorAll('.otp-digit')];inputs.forEach(el=>{el.focus=()=>{};el.select=()=>{};});
 const fill=code=>{const event=new window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=>code}});inputs[0].dispatchEvent(event);};
 const submit=()=>document.querySelector('#otp-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 return {document,window,state,inputs,fill,submit,tick,advance:value=>time+=value,get sessions(){return sessions;},get continued(){return continued;}};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('OTP: a validação bloqueia pedidos repetidos e Continuar só usa uma resposta confirmada',async()=>{
 let resolve,calls=0;const pending=new Promise(r=>resolve=r);
 const f=await otpFixture(async()=>{calls++;return pending;});
 f.fill('0007');f.submit();f.submit();assert.equal(calls,1);
 assert.equal(f.document.querySelector('#otp-form').getAttribute('aria-busy'),'true');
 assert.equal(f.document.querySelector('#otp-continue').hidden,true);assert.equal(f.sessions,0);
 resolve({verified:true,session:{access_token:'test-only-token',refresh_token:'test-only-refresh'}});await flush();
 assert.equal(f.state.otp.status,'success');assert.equal(f.document.querySelector('.otp-card').dataset.state,'success');
 assert.equal(f.document.querySelector('#otp-continue').hidden,false);assert.equal(f.sessions,0);
 f.document.querySelector('#otp-continue').click();await flush();assert.equal(f.sessions,1);assert.equal(f.continued,false);assert.equal(f.state.otp,null);
});
test('OTP: falha de rede e resposta sem confirmação nunca permitem continuar',async()=>{
 for(const request of [async()=>{throw new Error('Falha de rede');},async()=>({verified:false,session:{access_token:'invalid',refresh_token:'invalid'}})]) {
  const f=await otpFixture(request);f.fill('0012');f.submit();await flush();
  assert.equal(f.state.otp.status,'error');assert.equal(f.document.querySelector('#otp-continue').hidden,true);assert.equal(f.sessions,0);
 }
});
test('OTP: falha ao instalar a sessão mantém a confirmação e permite repetir Continuar',async()=>{
 const f=await otpFixture(async()=>({verified:true,session:{access_token:'test-only-token',refresh_token:'test-only-refresh'}}),{sessionError:true});
 f.fill('0007');f.submit();await flush();f.document.querySelector('#otp-continue').click();await flush();
 assert.equal(f.continued,null);assert.equal(f.state.otp.status,'success');assert.equal(f.document.querySelector('#otp-continue').disabled,false);
 assert.match(f.document.querySelector('#otp-feedback').textContent,/Falha ao guardar sessão/);f.state.otp=null;f.state.user=null;
});
test('OTP: expiração e limite de tentativas bloqueiam a submissão; reenvio tem contagem',async()=>{
 let calls=0;const f=await otpFixture(async()=>{calls++;return {retry_after:60,expires_in:300};});
 f.fill('0123');f.tick();assert.equal(f.document.querySelector('#otp-resend').textContent,'Reenviar em 60s');
 f.document.querySelector('#otp-resend').click();await flush();assert.equal(calls,0);
 f.advance(300001);f.tick();assert.equal(f.state.otp.status,'expired');assert.equal(f.document.querySelector('.otp-submit').disabled,true);
 f.submit();assert.equal(calls,0);f.document.querySelector('#otp-resend').click();await flush();
 assert.equal(calls,1);assert.equal(f.state.otp.status,'input');assert.equal(f.inputs.map(el=>el.value).join(''),'');
 f.tick();assert.equal(f.document.querySelector('#otp-resend').textContent,'Reenviar em 60s');
 const locked=await otpFixture(async()=>{const error=new Error('Limite de tentativas');error.reason='attempts';throw error;});
 locked.fill('0042');locked.submit();await flush();assert.equal(locked.state.otp.status,'locked');assert.equal(locked.document.querySelector('.otp-submit').disabled,true);
});

test('OTP: immediate resend and server remaining cooldown, without extending the block',async()=>{
 let calls=0;const f=await otpFixture(async()=>{calls++;if(calls===1)return {retry_after:0,expires_in:300};const error=new Error('Aguarda');error.reason='rate_limit';error.retry_after=37;throw error;});
 f.advance(60000);f.tick();f.document.querySelector('#otp-resend').click();await flush();
 assert.equal(calls,1);assert.equal(f.document.querySelector('#otp-resend').disabled,false);
 f.document.querySelector('#otp-resend').click();await flush();
 assert.equal(f.document.querySelector('#otp-resend').textContent,'Reenviar em 37s');
 f.advance(37000);f.tick();assert.equal(f.document.querySelector('#otp-resend').disabled,false);
});
