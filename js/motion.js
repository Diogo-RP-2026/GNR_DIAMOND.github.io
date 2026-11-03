// Efeitos 5/5/3/4 dos vídeos. Nenhuma alteração de permissões neste módulo.
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function setMenu(open,focus=false) {
 const nav=document.querySelector('#main-nav'),toggle=document.querySelector('#menu-toggle');
 nav.classList.toggle('open',open);nav.inert=!open;toggle.setAttribute('aria-expanded',String(open));
 if(focus&&open)nav.querySelector('a')?.focus();
}
export function syncNavigation(nav,html) {
 const template=document.createElement('template');template.innerHTML=html;
 const old=[...nav.querySelectorAll('a')],next=[...template.content.querySelectorAll('a')];
 if(old.length!==next.length||old.some((a,i)=>a.getAttribute('href')!==next[i].getAttribute('href')||a.textContent!==next[i].textContent))nav.innerHTML=html;
 else old.forEach((a,i)=>{if(next[i].hasAttribute('aria-current'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 nav.querySelectorAll('a').forEach((a,i)=>a.style.setProperty('--item-delay',`${Math.min(i,12)*35}ms`));
}
export function initMotion() {
 const nav=document.querySelector('#main-nav'),toggle=document.querySelector('#menu-toggle');setMenu(false);
 toggle.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();setMenu(true,true);}});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(toggle.getAttribute('aria-expanded')==='true'){setMenu(false);toggle.focus();}if(!document.querySelector('#inbox-panel')?.hidden)document.querySelector('#inbox-toggle').focus();closeInbox();}
  if(!nav.contains(event.target))return;
  const links=[...nav.querySelectorAll('a')],index=links.indexOf(event.target);
  const next=event.key==='ArrowDown'?(index+1)%links.length:event.key==='ArrowUp'?(index-1+links.length)%links.length:event.key==='Home'?0:event.key==='End'?links.length-1:null;
  if(next!==null){event.preventDefault();links[next]?.focus();}
 });
 document.addEventListener('click',event=>{
  if(!nav.contains(event.target)&&!toggle.contains(event.target))setMenu(false);
  if(nav.contains(event.target)&&event.target.closest('a'))setMenu(false);
  const shine=event.target.closest('.button:not(.danger):not(.outline):not(:disabled)');
  if(shine){shine.classList.remove('shine-play');void shine.offsetWidth;shine.classList.add('shine-play');}
  if(!event.target.closest('#inbox-panel,#inbox-toggle'))closeInbox();
 });
 document.addEventListener('animationend',event=>event.target.classList?.remove('shine-play'));
 initInbox();
}
const notifications=[];let queue=[],active=null,flying=false,timer,remaining=0,started=0,generation=0;
function paintInbox() {
 const list=document.querySelector('#inbox-list'),count=notifications.filter(n=>!n.read).length;list.replaceChildren();
 document.querySelector('#inbox-count').textContent=String(count);document.querySelector('#inbox-count').hidden=!count;
 document.querySelector('#inbox-toggle').setAttribute('aria-label',`Notificações, ${count} por ler`);
 if(!notifications.length){const empty=document.createElement('li');empty.textContent='Ainda não tens notificações nesta sessão.';list.append(empty);}
 for(const entry of [...notifications].reverse()){
  const li=document.createElement('li'),p=document.createElement('p'),time=document.createElement('time');
  li.className=entry.error?'inbox-message error':'inbox-message';p.textContent=entry.message;time.dateTime=entry.time;time.textContent=new Date(entry.time).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});li.append(p,time);
  if(!entry.read){const button=document.createElement('button');button.className='text-button';button.textContent='Marcar como lida';button.addEventListener('click',()=>{entry.read=true;paintInbox();});li.append(button);}list.append(li);
 }
}
function closeInbox(){const panel=document.querySelector('#inbox-panel');if(panel){panel.hidden=true;document.querySelector('#inbox-toggle').setAttribute('aria-expanded','false');}}
function initInbox(){
 document.querySelector('#inbox-toggle').addEventListener('click',()=>{const panel=document.querySelector('#inbox-panel');panel.hidden=!panel.hidden;document.querySelector('#inbox-toggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)panel.querySelector('button')?.focus();});
 document.querySelector('#inbox-close').addEventListener('click',()=>{closeInbox();document.querySelector('#inbox-toggle').focus();});
 document.querySelector('#toast-dismiss').addEventListener('click',()=>flyToInbox());
 const el=document.querySelector('#toast');
 const pause=()=>{if(!timer)return;clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(Date.now()-started));};
 const resume=()=>{if(!active||timer||el.matches(':hover,:focus-within')||document.hidden)return;started=Date.now();timer=setTimeout(flyToInbox,remaining);};
 el.addEventListener('pointerenter',pause);el.addEventListener('pointerleave',resume);el.addEventListener('focusin',pause);el.addEventListener('focusout',()=>queueMicrotask(resume));
 document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
 document.addEventListener('ushe:notify',event=>{
  const entry={message:String(event.detail.message),error:!!event.detail.error,read:false,time:new Date().toISOString()};notifications.push(entry);queue.push(entry);paintInbox();if(!active&&!flying)showNext();
 });
}
function showNext(){
 active=queue.shift();if(!active)return;const el=document.querySelector('#toast');el.hidden=false;el.classList.toggle('error',active.error);el.setAttribute('role',active.error?'alert':'status');document.querySelector('#toast-message').textContent=active.message;
 remaining=Math.max(8000,Math.min(30000,active.message.length*85));started=Date.now();timer=document.hidden?null:setTimeout(flyToInbox,remaining);
}
async function flyToInbox(){
 if(!active)return;clearTimeout(timer);timer=null;const mine=++generation,el=document.querySelector('#toast'),target=document.querySelector('#inbox-toggle'),box=el.getBoundingClientRect(),to=target.getBoundingClientRect();active=null;flying=true;
 if(el.contains(document.activeElement))target.focus();
 if(!reduced()&&el.animate){
  await el.animate([{transform:'scale(1)',opacity:1},{transform:'scale(.06)',opacity:.3}],{duration:260,easing:'ease-in',fill:'forwards'}).finished.catch(()=>{});
  if(mine!==generation)return;
  const dot=document.createElement('span');dot.className='notification-dot';dot.setAttribute('aria-hidden','true');document.body.append(dot);
  const x=box.left+box.width/2,y=box.top+box.height/2,dx=to.left+to.width/2-x,dy=to.top+to.height/2-y;
  const frames=Array.from({length:25},(_,i)=>{const t=i/24;return {transform:`translate(${x+dx*t+Math.sin(Math.PI*t)*90}px,${y+dy*t-Math.sin(Math.PI*t)*90}px) scale(${1-.5*t})`,opacity:1-t*.3};});
  el.hidden=true;await dot.animate(frames,{duration:720,easing:'cubic-bezier(.3,.1,.4,1)'}).finished.catch(()=>{});dot.remove();
 }
 el.getAnimations?.().forEach(a=>a.cancel());el.hidden=true;if(mine===generation){flying=false;showNext();}
}
export function clearNotifications(){generation++;clearTimeout(timer);active=null;flying=false;queue=[];notifications.length=0;document.querySelector('#toast')?.getAnimations?.().forEach(a=>a.cancel());const toast=document.querySelector('#toast');if(toast)toast.hidden=true;document.querySelectorAll('.notification-dot').forEach(n=>n.remove());if(document.querySelector('#inbox-list'))paintInbox();closeInbox();}
