import {removeMemberAccount} from './js/accounts.js';
import {syncNotifications,stopNotifications} from './js/notifications.js';
import {agentProfile,openPersonalProfile,previewProfilePhoto,submitPersonalProfile} from './js/profile.js';
import {initMotion,setMenu,syncNavigation,clearNotifications} from './js/motion.js';
import {initOTP} from './js/otp.js';
// Ponto de entrada: navegação por fragmento (#/), compatível com GitHub Pages.
import {e,TABS,toast,errorMessage,empty,discordURL} from './js/core.js';
import {db,state,isCommand,hasTab,loadIdentity,loadOtpPolicy,hydrateImages,releaseImages,result,rpc} from './js/api.js';
import * as views from './js/views.js';
import {openEditor,openAccess,closeEditor,isDirty,submitContent,submitAccess,submitAuth,deleteRecord,formError,openOfficialProfile,submitOfficialProfile} from './js/forms.js';

const main=document.querySelector('main'),dialog=document.querySelector('#editor');
let cache={},renderSequence=0,ready=false,authTimer,activeFeed=null,approvalTimer=null,approvalBusy=false;
const protectedPages={'quem-somos':views.about,equipa:views.team,anuncios:views.announcements,eventos:views.events,avisos:views.warnings,fardamento:views.uniforms,equipamento:views.equipment,regulamento:views.regulations,registos:views.logs};
function route() {
  const raw=location.hash.startsWith('#/')?location.hash.slice(2):'';
  const [name,query='']=raw.split('?');return {name,params:new URLSearchParams(query)};
}
function navigation() {
  const current=route().name;
  const links=[['','Início'],...TABS.filter(([key])=>hasTab(key)),['contactos','Contactos'],...(state.user?[['perfil','O meu perfil']]:[]),...(isCommand()?[['administracao','Administração']]:[])];
  syncNavigation(document.querySelector('#main-nav'),`<div class="nav-inner">${links.map(([key,label])=>`<a href="#/${key}" ${current===key?'aria-current="page"':''}>${e(label)}</a>`).join('')}<a class="mobile-account" href="${state.user?'#/conta':'#/entrar'}">${state.user?e(state.profile?.full_name || 'A minha conta'):'Entrar'}</a></div>`);
  const account=document.querySelector('#header-account');account.textContent=state.user?(state.profile?.full_name || 'A minha conta'):'Entrar';
  account.setAttribute('href',state.user?'#/conta':'#/entrar');
  if(['entrar','conta','perfil'].includes(current))account.setAttribute('aria-current','page');else account.removeAttribute('aria-current');
  const motto=state.publicInfo?.motto || 'Honra, Disciplina e Excelência';
  document.querySelector('#header-motto').textContent=motto;document.querySelector('#footer-motto').textContent=` · ${motto}`;
  document.querySelector('#footer-discord').href=discordURL(state.publicInfo?.discord_url) || 'https://discord.com';
  document.querySelector('#copyright-year').textContent=new Date().getFullYear();
}
function verificationGate(){
  if(!state.verificationRequired)return false;
  activeFeed?.dispose();activeFeed=null;stopNotifications();navigation();
  if(dialog.open){
    const form=dialog.querySelector('form');if(form){
      formError(form,new Error('É necessário verificar novamente o email antes de guardar. Os campos por guardar foram mantidos.'));
      form.querySelector('.form-error').insertAdjacentHTML('beforeend',' <button type="button" class="text-button" data-action="verify-email">Verificar email</button>');
    }
  }else if(route().name!=='entrar')location.replace('#/entrar');
  return true;
}
async function render({preserveScroll=false,identity=true}={}) {
  activeFeed?.dispose();activeFeed=null;
  const seq=++renderSequence,scroll=window.scrollY;
  const previousTab=main.querySelector('.admin-tabs a.active')?.getAttribute?.('href');
  releaseImages(main);cache={};main.innerHTML='<div class="container loading" role="status">A carregar…</div>';
  try {
    if(identity)await loadIdentity();
    syncNotifications();
    if(seq!==renderSequence)return;
    const r=route();
    if(state.otp&&r.name!=='entrar'){location.replace('#/entrar');return;}
    if(state.verificationRequired&&r.name!=='entrar'){location.replace('#/entrar');return;}
    // A recuperação de palavra-passe tem de continuar acessível com sessão.
    if(r.name==='entrar'&&state.user&&!state.recovery&&!state.otp&&!state.verificationRequired){location.replace('#/');return;}
    if(['conta','perfil'].includes(r.name)&&!state.user){location.replace('#/entrar');return;}
    navigation();
    let page;
    if(r.name==='treinamentos'&&!state.user){location.replace('#/entrar?reason=login');return;}
    if(!r.name)page=await views.home();
    else if(r.name==='contactos')page=await views.contacts();
    else if(r.name==='entrar'||r.name==='conta')page=views.login(r.params.get('modo'));
    else if(r.name==='perfil')page=await agentProfile(r.params.get('id'));
    else if(r.name==='administracao')page=isCommand()?await views.administration(r.params.get('area') || 'users'):views.restricted();
    else if(r.name==='treinamentos')page=hasTab('registos')?await views.training():views.restricted();
    else if(protectedPages[r.name])page=hasTab(r.name)?await protectedPages[r.name](r.params):views.restricted();
    else page={html:`<section class="container page"><h1>Página não encontrada</h1>${empty('Este endereço não corresponde a uma secção do portal.')}<a class="button" href="#/">Voltar ao Início</a></section>`};
    if(seq!==renderSequence)return;
    main.innerHTML=page.html;
    if(previousTab)main.querySelectorAll('.admin-tabs a:not(.active)').forEach(a=>{if(a.getAttribute('href')===previousTab)a.classList.add('ripple-leaving');});
    cache=page.cache || {};
    activeFeed=page.mount?.(main,cache)||null;
    main.className=r.name?'route-content':'home-content';
    document.title=r.name?`${main.querySelector('h1')?.textContent || 'USHE'} – USHE`:'USHE – Unidade de Segurança e Honras do Estado';
    views.filterPage(main);await hydrateImages(main);
    if(seq!==renderSequence)return;
    if(preserveScroll)window.scrollTo({top:scroll,behavior:'instant'});
    else {window.scrollTo({top:0,behavior:'instant'});(main.querySelector('#otp-continue:not([hidden]),.otp-digit:not(:disabled)') || main).focus({preventScroll:true});}
  } catch(error) {
    if(seq!==renderSequence)return;
    main.innerHTML=`<section class="container page"><h1>Não foi possível carregar a secção.</h1><p class="notice">${e(errorMessage(error))}</p><button class="button" data-action="refresh">Tentar novamente</button></section>`;
  }
}
document.querySelector('#menu-toggle').addEventListener('click',event=>setMenu(event.currentTarget.getAttribute('aria-expanded')!=='true'));
document.querySelector('#close-editor').addEventListener('click',()=>{if(closeEditor())verificationGate();});
dialog.addEventListener('cancel',event=>{event.preventDefault();if(closeEditor())verificationGate();});
dialog.addEventListener('input',event=>{if(event.target.closest('form'))event.target.closest('form').dataset.dirty='true';});
dialog.addEventListener('change',event=>{
  if(event.target.name==='agent_photo')previewProfilePhoto(event.target).catch(error=>formError(event.target.closest('form'),error));
  if(event.target.name==='photo') {
    const img=document.querySelector('#photo-preview'),file=event.target.files[0];
    if(img.dataset.objectUrl)URL.revokeObjectURL(img.dataset.objectUrl);
    if(file&&['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=5242880){img.src=URL.createObjectURL(file);img.dataset.objectUrl=img.src;img.hidden=false;}else img.hidden=true;
  }
});
document.addEventListener('input',event=>{if(event.target.name==='biography'){const count=document.querySelector('#biography-count');if(count)count.textContent=`${[...event.target.value].length}/500 caracteres`;}if(event.target.matches('[data-filter]'))views.filterPage(main);});
document.addEventListener('change',event=>{if(event.target.matches('[data-filter]'))views.filterPage(main);});
window.addEventListener('beforeunload',event=>{if(isDirty()){event.preventDefault();event.returnValue='';}});
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();main.focus();main.scrollIntoView({block:'start'});return;}
  const link=event.target.closest('a[href^="#/"]');
  if(link) {
    if(dialog.open&&!closeEditor()){event.preventDefault();return;}
    setMenu(false);
  }
  const el=event.target.closest('[data-action]');if(!el || el.disabled)return;
  const {action,table,id}=el.dataset;
  try {
    if(['new','edit','personal-profile','official-profile','access','delete-account','delete','vote'].includes(action)&&verificationGate())return;
    if(action==='new'||action==='edit')await openEditor(table,action==='new'?null:id,cache,el.dataset.kind);
    else if(action==='personal-profile')await openPersonalProfile(cache);
    else if(action==='official-profile')await openOfficialProfile(id,cache);
    else if(action==='close'){if(closeEditor())verificationGate();}
    else if(action==='verify-email'){if(dialog.open&&!closeEditor())return;location.hash='/entrar';await render();}
    else if(action==='access')openAccess(id,cache);
    else if(action==='delete-account') {
      const form=el.closest('form');if(form?.dataset.saving==='true')return;
      const controls=[...dialog.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));
      form.dataset.saving='true';form.setAttribute('aria-busy','true');controls.forEach(({button})=>button.disabled=true);
      try {
        const profile=cache.profiles?.find(p=>p.id===id),agent=cache.account_agents?.find(m=>m.user_id===id);
        if(await removeMemberAccount(profile,agent?.name)){
          closeEditor(true);await render({preserveScroll:true});toast('Conta, perfil e fotografias removidos. O histórico foi preservado.');
        }
      }catch(error){
        closeEditor(true);await render({preserveScroll:true});
        if(cache.profiles?.some(p=>p.id===id)){openAccess(id,cache);formError(document.querySelector('#access-form'),error);}else toast(errorMessage(error),true);
      }finally{form.dataset.saving='false';form.setAttribute('aria-busy','false');controls.forEach(({button,disabled})=>button.disabled=disabled);}
    }
    else if(action==='delete') {
      el.disabled=true;activeFeed?.invalidate();if(await deleteRecord(table,id,cache)){toast('Registo apagado.');if(activeFeed)await activeFeed.refresh();else await render({preserveScroll:true});}
    } else if(action==='vote') {
      const voting=el.closest('.responses');
      voting.querySelectorAll('[data-action="vote"]').forEach(button=>button.disabled=true);
      try {
        const isEvent=el.dataset.kind==='event',target=isEvent?'event_responses':'announcement_responses',key=isEvent?'event_id':'announcement_id';
        activeFeed?.invalidate();
        await result(db.from(target).upsert({[key]:id,user_id:state.user.id,attending:el.dataset.attending==='true',...(!isEvent?{updated_at:new Date().toISOString()}:{})},{onConflict:`${key},user_id`}));
        if(activeFeed){activeFeed.invalidate();await activeFeed.refresh();}
        else{const responses=await rpc('response_names',{p_kind:el.dataset.kind,p_id:id});
        const parent=el.closest('.responses');if(parent?.isConnected)parent.outerHTML=views.responseComponent(el.dataset.kind,id,responses);}
        toast('Disponibilidade atualizada.');
      } finally {voting.querySelectorAll('[data-action="vote"]').forEach(button=>button.disabled=false);}
    } else if(action==='copy') {await navigator.clipboard.writeText(el.dataset.value);toast(`Código ${el.dataset.value} copiado.`);}
    else if(action==='scroll')document.getElementById(el.dataset.target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    else if(action==='refresh') {state.publicInfo=await views.publicInfo();await render({preserveScroll:true});toast('Informação atualizada.');}
    else if(action==='logout') {el.disabled=true;await result(db.auth.signOut());state.user=null;await loadIdentity();location.hash='/';await render();toast('Sessão terminada.');}
  }catch(error){toast(errorMessage(error),true);}finally{el.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['auth-form','content-form','access-form','personal-profile-form','official-profile-form'].includes(form.id))return;
  event.preventDefault();const submit=form.querySelector('[type="submit"]');if(submit.disabled)return;
  submit.disabled=true;form.querySelector('.form-error').hidden=true;
  form.dataset.saving='true';form.setAttribute('aria-busy','true');
  const saving=form.querySelector('.profile-saving');if(saving)saving.hidden=false;
  // Não permite fechar um formulário enquanto a gravação está em curso.
  const cancelButtons=[...dialog.querySelectorAll('button:not([type="submit"])')];cancelButtons.forEach(b=>b.disabled=true);
  try {
    if(form.id!=='auth-form'&&verificationGate())throw new Error('Verifica novamente o email antes de guardar estas alterações.');
    if(form.id==='auth-form') {
      await submitAuth(form);
      const session=await result(db.auth.getSession());state.user=session.session?.user || null;
      await loadIdentity();
      if(state.otp){if(state.otp.operation!=='renewal')state.user=null;location.hash='/entrar';await render();return;}
      if(form.dataset.mode==='reset'){form.reset();return;}
      location.hash=state.user&&!state.recovery?'/':'/entrar';await render();
    } else {
      let savedMessage;
      if(form.id==='access-form')await submitAccess(form);
      else if(form.id==='personal-profile-form')await submitPersonalProfile(form,cache);
      else if(form.id==='official-profile-form')await submitOfficialProfile(form);
      else savedMessage=await submitContent(form,cache);
      closeEditor(true);state.publicInfo=await views.publicInfo();if(activeFeed){activeFeed.invalidate();await activeFeed.refresh();}else await render({preserveScroll:true});syncNotifications();toast(savedMessage||'Alterações guardadas.');
    }
  }catch(error){formError(form,error);}finally{form.dataset.saving='false';form.setAttribute('aria-busy','false');if(saving)saving.hidden=true;submit.disabled=false;cancelButtons.forEach(b=>b.disabled=false);}
});
window.addEventListener('hashchange',()=>render());
window.addEventListener('pagehide',()=>{activeFeed?.dispose();stopNotifications();clearTimeout(approvalTimer);approvalTimer=null;});
window.addEventListener('pageshow',event=>{if(event.persisted){syncNotifications();render({preserveScroll:true});document.dispatchEvent(new CustomEvent('ushe:session-active'));}});

async function init() {
  if(db) {
    db.auth.onAuthStateChange((event,session)=>{
      const identityChanged=state.user?.id!==session?.user?.id;
      if(identityChanged){activeFeed?.dispose();activeFeed=null;stopNotifications();clearNotifications();}
      state.user=session?.user || null;
      if(session?.user&&ready)setTimeout(()=>document.dispatchEvent(new CustomEvent('ushe:session-active')),0);
      if(event==='PASSWORD_RECOVERY'){state.recovery=true;location.hash='/entrar';}
      if(event==='SIGNED_OUT') {
        activeFeed?.dispose();activeFeed=null;stopNotifications();clearTimeout(approvalTimer);approvalTimer=null;
        state.otp=null;state.verificationRequired=false;state.verification=null;clearNotifications();
        state.profile=null;state.permissions=[];cache={};++renderSequence;releaseImages(main);main.replaceChildren();closeEditor(true);navigation();
      }
      // O callback de Auth é síncrono: consultas novas decorrem fora do seu bloqueio.
      if(ready&&(identityChanged||['SIGNED_OUT','PASSWORD_RECOVERY'].includes(event))) {
        clearTimeout(authTimer);authTimer=setTimeout(()=>render(),0);
      }
    });
    try {
      await loadOtpPolicy();
      const s=await result(db.auth.getSession());state.user=s.session?.user || null;
    }
    catch(error){toast(errorMessage(error),true);}
  }
  state.publicInfo=await views.publicInfo();ready=true;await render();
  // This timer checks identity only; event refresh has its own disposable controller.
  async function checkApproval(){
    clearTimeout(approvalTimer);
    if(!state.user)return;
    if(!document.hidden&&!approvalBusy){
      approvalBusy=true;const before=JSON.stringify([state.profile,state.permissions,state.verificationRequired]);
      try{await loadIdentity();syncNotifications();if(verificationGate()){if(!dialog.open)await render({identity:false,preserveScroll:true});}
        else if(!dialog.open&&before!==JSON.stringify([state.profile,state.permissions,state.verificationRequired])){toast('As tuas permissões foram atualizadas.');await render({identity:false,preserveScroll:true});}}
      catch{}finally{approvalBusy=false;}
    }
    if(state.user)approvalTimer=setTimeout(checkApproval,45000);
  }
  document.addEventListener('ushe:session-active',()=>{if(!approvalTimer)checkApproval();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkApproval();});
  if(db)checkApproval();

}
initMotion();
initOTP({render,goHome:recovering=>{location.hash=recovering?'/entrar':'/';render();}});
init();
