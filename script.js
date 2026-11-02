// Ponto de entrada: navegação por fragmento (#/), compatível com GitHub Pages.
import {e,TABS,toast,errorMessage,empty} from './js/core.js';
import {db,state,isCommand,hasTab,loadIdentity,hydrateImages,releaseImages,result,rpc} from './js/api.js';
import * as views from './js/views.js';
import {openEditor,openAccess,closeEditor,isDirty,submitContent,submitAccess,submitAuth,deleteRecord,formError} from './js/forms.js';

const main=document.querySelector('main'),dialog=document.querySelector('#editor');
let cache={},renderSequence=0,ready=false,authTimer;
const protectedPages={'quem-somos':views.about,equipa:views.team,anuncios:views.announcements,eventos:views.events,avisos:views.warnings,fardamento:views.uniforms,equipamento:views.equipment,regulamento:views.regulations,registos:views.logs};
function route() {
  const raw=location.hash.startsWith('#/')?location.hash.slice(2):'';
  const [name,query='']=raw.split('?');return {name,params:new URLSearchParams(query)};
}
function navigation() {
  const current=route().name;
  const links=[['','Início'],...TABS.filter(([key])=>hasTab(key)),['contactos','Contactos'],...(isCommand()?[['administracao','Administração']]:[])];
  document.querySelector('#main-nav').innerHTML=`<div class="nav-inner">${links.map(([key,label])=>`<a href="#/${key}" ${current===key?'aria-current="page"':''}>${e(label)}</a>`).join('')}<a class="nav-account" href="#/entrar" ${current==='entrar'?'aria-current="page"':''}>${state.user?e(state.profile?.full_name || 'A minha conta'):'Entrar ↗'}</a></div>`;
  const motto=state.publicInfo?.motto || 'Honra, Disciplina e Excelência';
  document.querySelector('.brand em').textContent=motto;document.querySelector('#footer-motto').textContent=motto;
}
async function render({preserveScroll=false,identity=true}={}) {
  const seq=++renderSequence,scroll=window.scrollY;
  releaseImages(main);cache={};main.innerHTML='<div class="container loading" role="status">A carregar…</div>';
  try {
    if(identity)await loadIdentity();
    if(seq!==renderSequence)return;
    navigation();
    const r=route();let page;
    if(!r.name)page=await views.home();
    else if(r.name==='contactos')page=await views.contacts();
    else if(r.name==='entrar')page=views.login(r.params.get('modo'));
    else if(r.name==='administracao')page=isCommand()?await views.administration(r.params.get('area') || 'users'):views.restricted();
    else if(protectedPages[r.name])page=hasTab(r.name)?await protectedPages[r.name]():views.restricted();
    else page={html:`<section class="container page"><h1>Página não encontrada</h1>${empty('Este endereço não corresponde a uma secção do portal.')}<a class="button" href="#/">Voltar ao Início</a></section>`};
    if(seq!==renderSequence)return;
    main.innerHTML=page.html;cache=page.cache || {};
    document.title=`${main.querySelector('h1')?.textContent || 'USHE'} · USHE Diamond`;
    views.filterPage(main);await hydrateImages(main);
    if(seq!==renderSequence)return;
    if(preserveScroll)window.scrollTo({top:scroll,behavior:'instant'});
    else {window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
  } catch(error) {
    if(seq!==renderSequence)return;
    main.innerHTML=`<section class="container page"><h1>Não foi possível carregar a secção.</h1><p class="notice">${e(errorMessage(error))}</p><button class="button" data-action="refresh">Tentar novamente</button></section>`;
  }
}
document.querySelector('#menu-toggle').addEventListener('click',event=>{
  const expanded=event.currentTarget.getAttribute('aria-expanded')!=='true';event.currentTarget.setAttribute('aria-expanded',expanded);document.querySelector('#main-nav').classList.toggle('open',expanded);
});
document.querySelector('#close-editor').addEventListener('click',()=>closeEditor());
dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
dialog.addEventListener('input',event=>{if(event.target.closest('form'))event.target.closest('form').dataset.dirty='true';});
dialog.addEventListener('change',event=>{
  if(event.target.name==='photo') {
    const img=document.querySelector('#photo-preview'),file=event.target.files[0];
    if(img.dataset.objectUrl)URL.revokeObjectURL(img.dataset.objectUrl);
    if(file&&['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=5242880){img.src=URL.createObjectURL(file);img.dataset.objectUrl=img.src;img.hidden=false;}else img.hidden=true;
  }
});
document.addEventListener('input',event=>{if(event.target.matches('[data-filter]'))views.filterPage(main);});
document.addEventListener('change',event=>{if(event.target.matches('[data-filter]'))views.filterPage(main);});
window.addEventListener('beforeunload',event=>{if(isDirty()){event.preventDefault();event.returnValue='';}});
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();main.focus();main.scrollIntoView({block:'start'});return;}
  const link=event.target.closest('a[href^="#/"]');
  if(link) {
    if(dialog.open&&!closeEditor()){event.preventDefault();return;}
    document.querySelector('#main-nav').classList.remove('open');document.querySelector('#menu-toggle').setAttribute('aria-expanded','false');
  }
  const el=event.target.closest('[data-action]');if(!el || el.disabled)return;
  const {action,table,id}=el.dataset;
  try {
    if(action==='new'||action==='edit')await openEditor(table,action==='new'?null:id,cache);
    else if(action==='close')closeEditor();
    else if(action==='access')openAccess(id,cache);
    else if(action==='delete') {
      el.disabled=true;if(await deleteRecord(table,id,cache)){toast('Registo apagado.');await render({preserveScroll:true});}
    } else if(action==='vote') {
      el.disabled=true;
      const isEvent=el.dataset.kind==='event',target=isEvent?'event_responses':'announcement_responses',key=isEvent?'event_id':'announcement_id';
      await result(db.from(target).upsert({[key]:id,user_id:state.user.id,attending:el.dataset.attending==='true',updated_at:new Date().toISOString()},{onConflict:`${key},user_id`}));
      const responses=await rpc('response_names',{p_kind:el.dataset.kind,p_id:id});
      const parent=el.closest('.responses');if(parent?.isConnected)parent.outerHTML=views.responseComponent(el.dataset.kind,id,responses);
      toast('Disponibilidade atualizada.');
    } else if(action==='copy') {await navigator.clipboard.writeText(el.dataset.value);toast(`Código ${el.dataset.value} copiado.`);}
    else if(action==='scroll')document.getElementById(el.dataset.target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    else if(action==='refresh') {state.publicInfo=await views.publicInfo();await render({preserveScroll:true});toast('Informação atualizada.');}
    else if(action==='logout') {el.disabled=true;await result(db.auth.signOut());state.user=null;await loadIdentity();location.hash='/';await render();toast('Sessão terminada.');}
  }catch(error){toast(errorMessage(error),true);}finally{el.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['auth-form','content-form','access-form'].includes(form.id))return;
  event.preventDefault();const submit=form.querySelector('[type="submit"]');if(submit.disabled)return;
  submit.disabled=true;form.querySelector('.form-error').hidden=true;
  form.dataset.saving='true';
  // Não permite fechar um formulário enquanto a gravação está em curso.
  const cancelButtons=[...dialog.querySelectorAll('button:not([type="submit"])')];cancelButtons.forEach(b=>b.disabled=true);
  try {
    if(form.id==='auth-form') {
      await submitAuth(form);
      const session=await result(db.auth.getSession());state.user=session.session?.user || null;
      await loadIdentity();
      if(form.dataset.mode==='reset'){form.reset();return;}
      location.hash='/entrar';await render();
    } else {
      if(form.id==='access-form')await submitAccess(form);else await submitContent(form,cache);
      closeEditor(true);state.publicInfo=await views.publicInfo();await render({preserveScroll:true});toast('Alterações guardadas.');
    }
  }catch(error){formError(form,error);}finally{form.dataset.saving='false';submit.disabled=false;cancelButtons.forEach(b=>b.disabled=false);}
});
window.addEventListener('hashchange',()=>render());

async function init() {
  if(db) {
    db.auth.onAuthStateChange((event,session)=>{
      state.user=session?.user || null;
      if(event==='PASSWORD_RECOVERY'){state.recovery=true;location.hash='/entrar';}
      if(event==='SIGNED_OUT') {
        state.profile=null;state.permissions=[];cache={};++renderSequence;releaseImages(main);main.replaceChildren();closeEditor(true);navigation();
      }
      // O callback de Auth é síncrono: consultas novas decorrem fora do seu bloqueio.
      if(ready&&event!=='TOKEN_REFRESHED'&&event!=='INITIAL_SESSION') {
        clearTimeout(authTimer);authTimer=setTimeout(()=>render(),0);
      }
    });
    try {const s=await result(db.auth.getSession());state.user=s.session?.user || null;}
    catch(error){toast(errorMessage(error),true);}
  }
  state.publicInfo=await views.publicInfo();ready=true;await render();
  // Revalida aprovações com a página aberta. A RLS valida sempre cada pedido.
  if(db)setInterval(async()=>{
    if(document.hidden||!state.user||dialog.open)return;
    const before=JSON.stringify([state.profile,state.permissions]);
    try {
      await loadIdentity();
      if(before!==JSON.stringify([state.profile,state.permissions])){toast('As tuas permissões foram atualizadas.');await render({identity:false,preserveScroll:true});}
      else if(route().name==='eventos')await render({identity:false,preserveScroll:true});
    }catch { /* Uma falha temporária não substitui os dados visíveis; novas operações continuam protegidas. */ }
  },45000);
}
init();
