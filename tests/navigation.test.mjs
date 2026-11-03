// Exercita o controlador real de rotas com Supabase/DOM simulados, sem credenciais.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../script.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'\nglobalThis.testAPI={render,navigation};');
function setup({hash='#/entrar',signedIn=true,recovery=false,loginError=false,otp=null}={}) {
  const nodes=new Map(),listeners={};
  const node=()=>({innerHTML:'',className:'',textContent:'',hidden:false,attrs:{},classList:{remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(){},querySelectorAll(){return [];},querySelector(selector){return selector==='h1'?{textContent:'Teste'}:null;},focus(){}});
  const document={querySelector(key){if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);},addEventListener(k,fn){listeners[k]=fn;}};
  const state={user:signedIn?{id:'user'}:null,profile:{approved:true,role:'member',full_name:'Teste'},permissions:[],publicInfo:null,recovery,otp};
  const location={hash,replacements:[],replace(value){this.hash=value;this.replacements.push(value);}};
  const views=new Proxy({filterPage(){}},{get(target,key){return target[key]||(()=>({html:`<h1>${key}</h1>`}));}});
  let error=null;
  const context={document,state,location,views,URLSearchParams,console,
    window:{scrollY:0,scrollTo(){},addEventListener(){}},
    db:{auth:{async getSession(){return {data:{session:{user:{id:'user'}}},error:null};}}},
    initMotion(){},initOTP(){},syncNotifications(){},stopNotifications(){},clearNotifications(){},setMenu(){},syncNavigation(nav,html){nav.innerHTML=html;},
    e:String,TABS:[['eventos','Eventos']],toast(){},errorMessage:String,empty:String,discordURL:()=>'',
    isCommand:()=>false,hasTab:()=>true,loadIdentity:async()=>{},hydrateImages:async()=>{},releaseImages(){},
    result:async q=>{const r=await q;if(r.error)throw r.error;return r.data;},
    submitAuth:async()=>{if(loginError)throw new Error('Credenciais inválidas');},formError:(_f,err)=>{error=err;},
    openEditor(){},openAccess(){},closeEditor(){},isDirty(){return false;},submitContent(){},submitAccess(){},deleteRecord(){},rpc(){},
  };
  vm.runInNewContext(source,context);
  return {context,state,location,nodes,listeners,getError:()=>error,...context.testAPI};
}
test('sessão existente na página de login vai para Início e ativa o menu',async()=>{
  const x=setup();await x.render({identity:false});assert.equal(x.location.hash,'#/');
  await x.render({identity:false});assert.match(x.nodes.get('#main-nav').innerHTML,/<a href="#\/" aria-current="page">Início<\/a>/);
  assert.equal(x.nodes.get('main').innerHTML,'<h1>home</h1>');
});
test('login bem-sucedido no controlador encaminha para Início',async()=>{
  const x=setup({signedIn:false}),button={disabled:false},error={hidden:true};
  const form={setAttribute(){},id:'auth-form',dataset:{mode:'login'},querySelector:s=>s==='[type="submit"]'?button:error};
  await x.listeners.submit({target:form,preventDefault(){}});
  assert.equal(x.location.hash,'/');assert.equal(x.getError(),null);assert.equal(button.disabled,false);
  assert.match(x.nodes.get('#main-nav').innerHTML,/<a href="#\/" aria-current="page">Início<\/a>/);
});
test('login falhado não redireciona nem simula sucesso',async()=>{
  const x=setup({signedIn:false,loginError:true}),button={disabled:false};
  await x.listeners.submit({target:{setAttribute(){},id:'auth-form',dataset:{mode:'login'},querySelector:()=>button},preventDefault(){}});
  assert.equal(x.location.hash,'#/entrar');assert.match(x.getError().message,/Credenciais inválidas/);
});
test('ligação direta a Eventos com sessão mantém a rota',async()=>{
  const x=setup({hash:'#/eventos'});await x.render({identity:false});
  assert.equal(x.location.hash,'#/eventos');assert.equal(x.nodes.get('main').innerHTML,'<h1>events</h1>');
  assert.match(x.nodes.get('#main-nav').innerHTML,/<a href="#\/eventos" aria-current="page">Eventos<\/a>/);
});
test('recuperação de palavra-passe com sessão não é desviada para Início',async()=>{
  const x=setup({recovery:true});await x.render({identity:false});
  assert.equal(x.location.hash,'#/entrar');assert.equal(x.nodes.get('main').innerHTML,'<h1>login</h1>');
});
test('visitante sem sessão continua a ver o login',async()=>{
  const x=setup({signedIn:false});await x.render({identity:false});
  assert.equal(x.location.hash,'#/entrar');assert.equal(x.nodes.get('main').innerHTML,'<h1>login</h1>');
});
test('área da conta continua acessível pelo cabeçalho e menu móvel',async()=>{
  const x=setup({hash:'#/conta'});await x.render({identity:false});
  assert.equal(x.nodes.get('main').innerHTML,'<h1>login</h1>');
  assert.equal(x.nodes.get('#header-account').attrs.href,'#/conta');
  assert.match(x.nodes.get('#main-nav').innerHTML,/class="mobile-account" href="#\/conta"/);
});
test('área da conta sem sessão encaminha para login',async()=>{
  const x=setup({hash:'#/conta',signedIn:false});await x.render({identity:false});assert.equal(x.location.hash,'#/entrar');
});
test('verificação pendente impede abrir páginas protegidas e mantém o ecrã de verificação',async()=>{
  const x=setup({hash:'#/eventos',otp:{status:'input'},signedIn:false});
  await x.render({identity:false});assert.equal(x.location.hash,'#/entrar');
  assert.ok(!x.nodes.get('main').innerHTML.includes('<h1>events</h1>'));
  await x.render({identity:false});assert.equal(x.location.hash,'#/entrar');
});
