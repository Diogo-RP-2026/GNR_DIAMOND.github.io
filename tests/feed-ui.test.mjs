import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {document,window}=parseHTML('<html><body><main></main><dialog open><form><input name="draft" value="rascunho não guardado"></form></dialog></body></html>');
globalThis.window=window;globalThis.document=document;
const {reconcileFeed,requestGate,mountFeed,feedPage}=await import('../js/feed.js');
const card=(r,v=[])=>`<article><h2>${r.title}</h2><details><summary>Vou</summary><ul>${v.map(x=>`<li>${x}</li>`).join('')}</ul></details><details><summary>Não vou</summary></details><button data-action="vote" data-attending="true">Vou</button></article>`;
const item=(id,version,title,votes=[])=>({record:{id,title},version,responses:votes});
const flush=()=>new Promise(r=>setTimeout(r,0));
test('partial patch preserves unchanged nodes, open lists, dirty form, filter controls and reading anchor; handles delete/create',()=>{
 const root=document.querySelector('main');root.innerHTML='<input type="search" value="pesquisa"><select><option selected>Arquivo</option></select><div class="feed"></div>';
 const feed=root.querySelector('.feed'),records=new Map(),scrolls=[],win={scrollY:500,scrollTo:v=>scrolls.push(v.top)};
 reconcileFeed(feed,{ids:['a','b'],items:[item('a','1','A',['Ana']),item('b','1','B')]},card,records,win);
 const first=feed.children[0],second=feed.children[1];first.querySelector('details').open=true;first.getBoundingClientRect=()=>({top:100,bottom:200});
 reconcileFeed(feed,{ids:['a','b','c'],items:[item('b','2','B alterado'),item('c','1','C')]},card,records,win);
 assert.equal(feed.children[0],first);assert.equal(first.querySelector('details').open,true);assert.notEqual(feed.children[1],second);
 assert.equal(root.querySelector('input').value,'pesquisa');assert.equal(document.querySelector('dialog input').value,'rascunho não guardado');
 reconcileFeed(feed,{ids:['a','c'],items:[item('a','2','A alterado',['Ana','Bruno'])]},card,records,win);
 assert.equal(feed.children.length,2);assert.equal(feed.children[0].querySelector('details').open,true);assert.deepEqual([...feed.children[0].querySelectorAll('li')].map(x=>x.textContent),['Ana','Bruno']);assert.equal(scrolls.at(-1),400);
});
test('one in-flight query, stale result ignored, latest refresh queued and disposal cancels application',async()=>{
 const gate=requestGate(),resolvers=[],applied=[];let running=0,max=0;
 const work=()=>new Promise(resolve=>{running++;max=Math.max(max,running);resolvers.push(x=>{running--;resolve(x);});});
 const first=gate.run(work,x=>applied.push(x));gate.invalidate();const queued=gate.run(work,x=>applied.push(x));resolvers.shift()('old');await flush();assert.deepEqual(applied,[]);assert.equal(resolvers.length,1);resolvers.shift()('new');await first;await queued;assert.deepEqual(applied,['new']);assert.equal(max,1);
 const late=gate.run(work,x=>applied.push(x));gate.stop();resolvers.shift()('logged out');await late;assert.deepEqual(applied,['new']);
});
test('controller debounces global search, resets page, retries after error without clearing content, stops timers',async()=>{
 const main=document.querySelector('main');main.innerHTML=feedPage('event',{heading:'<h1>Eventos</h1>',renderCard:card}).html;
 let calls=[],fail=false;const controller=mountFeed(main,{kind:'event',table:'events',cache:{},renderCard:card,interval:100000,win:{scrollY:0,scrollTo(){}},request:async args=>{calls.push(args);if(fail)throw new Error('Rede indisponível');return {items:[item('a','1','Visível')],ids:['a'],total:60,has_more:true,next_cursor:{at:'2026-01-01',id:'a'},snapshot:'2026-01-01'};}});
 await flush();main.querySelector('[data-feed-next]').click();await flush();assert.ok(calls.at(-1).p_cursor);
 const input=main.querySelector('[data-feed-filter="query"]');for(const v of ['a','ab','arquivo']){input.value=v;input.dispatchEvent(new window.Event('input',{bubbles:true}));}
 await new Promise(r=>setTimeout(r,340));assert.equal(calls.length,3);assert.equal(calls.at(-1).p_query,'arquivo');assert.equal(calls.at(-1).p_cursor,null);
 fail=true;await controller.refresh();assert.match(main.querySelector('.feed').textContent,/Visível/);assert.match(main.querySelector('.feed-status').textContent,/mantidos/);
 const count=calls.length;controller.dispose();main.querySelector('[data-feed-retry]').click();await flush();assert.equal(calls.length,count);
});
test('instrumented request count for 20 events: legacy 21 requests, current page 1 RPC',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');
 const legacy=(await readFile(new URL('fixtures/events-before.js.txt',import.meta.url),'utf8')).replace('export async function events','async function events');
 let before=0,after=0;const rows=Array.from({length:20},(_,id)=>({id:String(id),title:'Evento',starts_at:'2026-01-01',ends_at:'2026-01-02'}));
 const context={rows:async()=>{before++;return rows;},rpc:async()=>{before++;return [];},orderedEvents:x=>x,e:String,normalize:String,date:String,heading:()=>'',create:()=>'',search:()=>'',responseComponent:()=>'',cardActions:()=>'',canManageEvent:()=>false,empty:()=>''};
 await vm.runInNewContext(legacy+';events()',context);assert.equal(before,21);
 const main=document.querySelector('main');main.innerHTML=feedPage('event',{heading:'Eventos',renderCard:card}).html;
 const controller=mountFeed(main,{kind:'event',table:'events',cache:{},renderCard:card,win:{scrollY:0,scrollTo(){}},request:async()=>{after++;return {items:rows.map(r=>({record:r,version:'1',responses:[]})),ids:rows.map(r=>r.id),total:20,has_more:false};}});
 try{await flush();assert.equal(after,1);}finally{controller.dispose();}
});
