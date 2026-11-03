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
