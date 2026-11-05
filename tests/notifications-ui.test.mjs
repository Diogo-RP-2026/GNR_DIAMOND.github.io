import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function dom(){const {document,window}=parseHTML(html);globalThis.document=document;globalThis.window=window;window.matchMedia=()=>({matches:true});globalThis.CustomEvent=window.CustomEvent;return {document,window};}
dom();const {startNotifications}=await import('../js/notifications.js');const {initMotion,clearNotifications,setInboxRenderer}=await import('../js/motion.js');
const flush=()=>new Promise(r=>setTimeout(r,0));
test('persistent inbox survives controller recreation, opening/flying does not mark read, explicit read syncs; links check permissions',async()=>{
 const {document,window}=dom();initMotion();let stored=[{id:'a',title:'Agenda atualizada',message:'Abre para consultar.',created_at:'2026-11-03T10:00Z',read_at:null}],writes=0,allowed=false,routes=[];
 const request=async(name,args)=>{
  if(name==='inbox_page')return {items:structuredClone(stored),unread:stored.filter(n=>!n.read_at).length,has_more:false,snapshot:'2026-11-03T12:00Z'};
  if(name==='notification_destination')return {available:allowed,route:'eventos',id:'event-id'};
  if(name==='mark_notifications_read'){writes++;stored.forEach(n=>{if(!args.p_ids||args.p_ids.includes(n.id))n.read_at='2026-11-03T12:00Z';});}
 };
 let c=startNotifications({user:'a',request,navigate:r=>routes.push(r),interval:100000});
 try{
  await flush();assert.equal(document.querySelector('#inbox-count').textContent,'1');
  document.querySelector('#inbox-toggle').click();document.dispatchEvent(new window.CustomEvent('ushe:notify',{detail:{message:'Guardado'}}));document.querySelector('#toast-dismiss').click();await flush();assert.equal(writes,0);assert.equal(document.querySelector('#inbox-count').textContent,'1');
  [...document.querySelectorAll('.inbox-message button')].find(x=>x.textContent==='Abrir').click();await flush();assert.match(document.querySelector('#inbox-list').textContent,/apagado|autorização/);assert.deepEqual(routes,[]);assert.equal(writes,0);
  [...document.querySelectorAll('.inbox-message button')].find(x=>x.textContent==='Marcar como lida').click();await flush();assert.equal(writes,1);assert.equal(document.querySelector('#inbox-count').textContent,'0');
  c.dispose();c=startNotifications({user:'a',request,navigate:r=>routes.push(r),interval:100000});await flush();assert.ok(document.querySelector('.inbox-message').classList.contains('read'));assert.equal(document.querySelector('#inbox-count').textContent,'0');
  allowed=true;[...document.querySelectorAll('.inbox-message button')].find(x=>x.textContent==='Abrir').click();await flush();assert.deepEqual(routes,['/eventos?id=event-id']);
 }finally{c.dispose();setInboxRenderer(null);clearNotifications();}
});

const button=label=>[...document.querySelectorAll('#inbox-list button')].find(b=>b.textContent===label);
const note=(id,read=false)=>({id,title:'Notificação '+id,message:'Mensagem de teste',created_at:'2026-11-05T10:00Z',read_at:read?'2026-11-05T11:00Z':null});
test('mark all waits for the backend, blocks duplicate clicks and updates the inbox/count without rerendering main',async()=>{
 const {document}=dom();const main=document.querySelector('main');main.innerHTML='<input id="unsaved" value="Texto por guardar">';const field=document.querySelector('#unsaved');
 let stored=[note('a'),note('b')],writes=0,resolveWrite;
 const pending=new Promise(resolve=>resolveWrite=resolve);
 const request=async(name,args)=>{
  if(name==='inbox_page')return {items:structuredClone(stored),unread:stored.filter(n=>!n.read_at).length,has_more:false,snapshot:'2026-11-05T12:00Z'};
  if(name==='mark_notifications_read'){writes++;assert.equal(args.p_before,'2026-11-05T12:00Z');await pending;stored.forEach(n=>n.read_at='2026-11-05T12:00Z');}
 };
 const c=startNotifications({user:'a',request,interval:100000});
 try{
  await flush();const mark=button('Marcar todas como lidas');mark.click();mark.click();await flush();assert.equal(writes,1);assert.equal(document.querySelector('#inbox-count').textContent,'2');assert.equal(button('Marcar todas como lidas').disabled,true);
  resolveWrite();await flush();assert.equal(document.querySelector('#inbox-count').textContent,'0');assert.equal(document.querySelectorAll('.inbox-message.read').length,2);assert.equal(document.querySelector('#unsaved'),field);
  // A server sweep removes read rows. Only the inbox is patched on refresh.
  stored=[];await c.refresh();assert.equal(document.querySelectorAll('.inbox-message').length,0);assert.equal(document.querySelector('#unsaved'),field);assert.equal(field.value,'Texto por guardar');
 }finally{resolveWrite();c.dispose();setInboxRenderer(null);clearNotifications();}
});
test('a read failure keeps the unread count and offers a working retry',async()=>{
 dom();let stored=[note('a')],fail=true;
 const request=async name=>{
  if(name==='inbox_page')return {items:structuredClone(stored),unread:stored.filter(n=>!n.read_at).length,has_more:false,snapshot:'2026-11-05T12:00Z'};
  if(name==='mark_notifications_read'){if(fail)throw new Error('Sem ligação');stored[0].read_at='2026-11-05T12:00Z';}
 };
 const c=startNotifications({user:'a',request,interval:100000});
 try{
  await flush();button('Marcar como lida').click();await flush();assert.equal(document.querySelector('#inbox-count').textContent,'1');assert.match(document.querySelector('#inbox-list').textContent,/Sem ligação/);assert.equal(button('Marcar como lida').disabled,false);
  fail=false;button('Marcar como lida').click();await flush();assert.equal(document.querySelector('#inbox-count').textContent,'0');
 }finally{c.dispose();setInboxRenderer(null);clearNotifications();}
});
test('cleanup of the last page returns to a valid first page while keeping newer unread notifications',async()=>{
 dom();let swept=false;const calls=[];
 const request=async(name,args)=>{
  assert.equal(name,'inbox_page');calls.push(args.p_cursor);
  if(args.p_cursor)return {items:swept?[]:[note('old',true)],unread:1,has_more:false,next_cursor:null};
  return {items:[note('new')],unread:1,has_more:!swept,next_cursor:{at:'2026-11-04T10:00Z',id:'new'}};
 };
 const c=startNotifications({user:'a',request,interval:100000});
 try{
  await flush();button('Seguinte →').click();await flush();assert.match(document.querySelector('.inbox-pagination').textContent,/Página 2/);
  swept=true;await c.refresh();assert.match(document.querySelector('.inbox-pagination').textContent,/Página 1/);assert.ok(document.querySelector('[data-notification-id="new"]'));assert.equal(document.querySelector('#inbox-count').textContent,'1');assert.equal(calls.at(-1),null);
 }finally{c.dispose();setInboxRenderer(null);clearNotifications();}
});
test('opening a persistent inbox refreshes it and disposal removes its listener',async()=>{
 const {document}=dom();initMotion();let queries=0;
 const request=async()=>{queries++;return {items:[],unread:0,has_more:false};};
 const c=startNotifications({user:'a',request,interval:100000});
 try{await flush();const before=queries;document.querySelector('#inbox-toggle').click();await flush();assert.equal(queries,before+1);c.dispose();document.querySelector('#inbox-toggle').click();document.querySelector('#inbox-toggle').click();await flush();assert.equal(queries,before+1);}
 finally{c.dispose();setInboxRenderer(null);clearNotifications();}
});
