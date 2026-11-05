import {db,result,state} from './api.js';
import {errorMessage,toast} from './core.js';
import {setInboxRenderer} from './motion.js';
import {requestGate} from './feed.js';
let controller=null;
export function syncNotifications(){
 const id=state.user?.id;
 if(controller?.user===id)return;
 controller?.dispose();controller=null;
 if(id)controller=startNotifications({user:id});
 else {setInboxRenderer(()=>paintSignedOut());paintSignedOut();}
}
function paintSignedOut(){
 const list=document.querySelector('#inbox-list');if(!list)return;list.replaceChildren();const li=document.createElement('li');li.textContent='Inicia sessão para consultar as tuas notificações.';list.append(li);
 const count=document.querySelector('#inbox-count');count.hidden=true;count.textContent='0';document.querySelector('#inbox-toggle').setAttribute('aria-label','Notificações, 0 por ler');
}
export function stopNotifications(){controller?.dispose();controller=null;setInboxRenderer(()=>paintSignedOut());paintSignedOut();}
export function startNotifications({user,request=(name,args)=>result(db.rpc(name,args)),navigate=route=>{location.hash=route;},interval=30000}={}) {
 const gate=requestGate(),cursors=[null],seen=new Set();let data={items:[],unread:0},page=0,next=null,timer,dead=false,primed=false,message='',busy=false,outstanding=0,marking=false;
 const list=document.querySelector('#inbox-list'),panel=document.querySelector('#inbox-panel');
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const action=(label,fn,disabled=false)=>{const b=el('button',label,'text-button');b.type='button';b.disabled=disabled;b.addEventListener('click',()=>Promise.resolve(fn()).catch(err=>{message=errorMessage(err);paint();}));return b;};
 async function mark(ids=null){
  if(dead||marking)return false;marking=true;message='';gate.invalidate();paint();
  try{
   await request('mark_notifications_read',{p_ids:ids,p_before:ids?null:data.snapshot});
   if(dead)return false;
   // A read started during the write must not restore the old unread count.
   gate.invalidate();await refresh();return true;
  }finally{marking=false;paint();}
 }
 async function open(n){
  if(dead||marking)return;
  // No title/message copied from the protected target: authorization is rechecked on opening.
  const destination=await request('notification_destination',{p_id:n.id});if(dead)return;
  if(!destination?.available){message='O conteúdo foi apagado ou já não tens autorização para o consultar.';paint();return;}
  if(!(await mark([n.id]))||dead)return;panel.hidden=true;document.querySelector('#inbox-toggle').setAttribute('aria-expanded','false');
  navigate(`/${destination.route}${destination.id?'?id='+encodeURIComponent(destination.id):''}`);
 }
 function paint(){
  if(dead)return;const scroll=list.scrollTop;list.replaceChildren();list.setAttribute('aria-busy',String(busy||marking));
  const count=document.querySelector('#inbox-count');count.textContent=String(data.unread);count.hidden=!data.unread;document.querySelector('#inbox-toggle').setAttribute('aria-label',`Notificações, ${data.unread} por ler`);
  if(message)list.append(el('li',message,'inbox-feedback'));
  if(!data.items.length)list.append(el('li',busy?'A carregar notificações…':'Não tens notificações nesta página.'));
  for(const n of data.items){const li=el('li',undefined,`inbox-message ${n.read_at?'read':''}`);li.dataset.notificationId=n.id;li.append(el('h3',n.title),el('p',n.message));const time=el('time',new Date(n.created_at).toLocaleString('pt-PT'));time.dateTime=n.created_at;li.append(time);const actions=el('div',undefined,'inbox-actions');actions.append(action('Abrir',()=>open(n),marking));if(!n.read_at)actions.append(action('Marcar como lida',()=>mark([n.id]),marking));li.append(actions);list.append(li);}
  const controls=el('li',undefined,'inbox-pagination');controls.append(action('← Anterior',()=>{if(!busy&&page){gate.invalidate();page--;return refresh();}},busy||page===0),el('span',`Página ${page+1}`),action('Seguinte →',()=>{if(busy)return;gate.invalidate();cursors[++page]=next;return refresh();},busy||!data.has_more));list.append(controls);
  const end=el('li',undefined,'inbox-actions');end.append(action('Marcar todas como lidas',()=>mark(),marking||!data.unread),action('Atualizar',()=>refresh(),marking));list.append(end);list.scrollTop=scroll;
 }
 const schedule=()=>{clearTimeout(timer);if(!dead)timer=setTimeout(async()=>{if(!document.hidden&&!marking)await refresh();else schedule();},interval);};
 async function refresh(){if(dead)return;clearTimeout(timer);outstanding++;busy=true;paint();
  const requestedPage=page,cursor=cursors[page];
  await gate.run(async()=>{
   const value=await request('inbox_page',{p_cursor:cursor});
   // The scheduled sweep can empty the current page while the inbox is open.
   // Fetch its replacement within the same gate, without a recursive refresh.
   if(requestedPage>0&&!value.items.length)return {value:await request('inbox_page',{p_cursor:null}),reset:true};
   return {value,reset:false};
  },({value,reset})=>{
   if(reset){page=0;cursors.splice(1);}
   data=value;next=value.next_cursor;message='';
   if(page===0){for(const n of data.items){if(primed&&!seen.has(n.id)&&!n.read_at)toast(`${n.title}: ${n.message}`);seen.add(n.id);}primed=true;}
   paint();
  },error=>{message=errorMessage(error)+' Usa Atualizar para tentar novamente.';paint();});busy=--outstanding>0;paint();schedule();
 }
 const visible=()=>{if(!document.hidden&&!marking)refresh();};
 const opened=()=>{if(!panel.hidden&&!marking)refresh();};
 const toggle=document.querySelector('#inbox-toggle');
 document.addEventListener('visibilitychange',visible);toggle.addEventListener('click',opened);setInboxRenderer(paint);paint();refresh();
 return {user,refresh,dispose(){dead=true;gate.stop();clearTimeout(timer);document.removeEventListener('visibilitychange',visible);toggle.removeEventListener('click',opened);seen.clear();}};
}
