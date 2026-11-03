import {db,result} from './api.js';
import {e,errorMessage,empty} from './core.js';
const PAGE_SIZE=20;
// A single in-flight request, one queued refresh and a generation guard.
export function requestGate() {
 let version=0,running=false,pending=null,dead=false;
 return {invalidate(){version++;},stop(){dead=true;version++;pending?.waiters.forEach(resolve=>resolve());pending=null;},async run(work,apply,fail){
  if(dead)return;const mine=version;
  if(running)return new Promise(resolve=>{pending={run:()=>this.run(work,apply,fail),waiters:[...(pending?.waiters||[]),resolve]};});
  running=true;
  try{const data=await work();if(!dead&&mine===version)await apply(data);}
  catch(error){if(!dead&&mine===version)fail?.(error);}
  finally{running=false;const next=pending;pending=null;if(!dead&&next){await next.run();next.waiters.forEach(resolve=>resolve());}else next?.waiters.forEach(resolve=>resolve());}
 }};
}
// Keep identical cards, restore details/focus on changed cards and anchor the reading position.
export function reconcileFeed(feed,data,render,records,win=window) {
 const children=[...feed.querySelectorAll('[data-feed-id]')],byId=new Map(children.map(n=>[n.dataset.feedId,n]));
 const scroll=win.scrollY||0,anchor=children.find(n=>(n.getBoundingClientRect?.().bottom||0)>0);
 const anchorTop=anchor?.getBoundingClientRect?.().top;
 for(const item of data.items||[])records.set(item.record.id,item);
 const allowed=new Set(data.ids||[]);for(const id of records.keys())if(!allowed.has(id))records.delete(id);
 let position=0;
 for(const child of [...feed.children])if(!child.dataset.feedId)child.remove();
 for(const id of data.ids||[]) {
  const item=records.get(id);if(!item)continue;
  let node=byId.get(id);
  if(!node||node.dataset.version!==item.version){
   const opens=[...(node?.querySelectorAll('details')||[])].map(n=>n.open);
   const active=node?.contains(feed.ownerDocument.activeElement)?feed.ownerDocument.activeElement:null;
   const focusKey=active?.dataset.action==='vote'?active.dataset.attending:null;
   const template=feed.ownerDocument.createElement('template');template.innerHTML=render(item.record,item.responses||[]);const next=template.content.firstElementChild;
   next.dataset.feedId=id;next.dataset.version=item.version;
   next.querySelectorAll('details').forEach((d,i)=>{d.open=!!opens[i];});
   if(node)node.replaceWith(next);node=next;if(focusKey!==null)node.dataset.restoreVote=focusKey;
  }
  const before=feed.children[position];if(before!==node)feed.insertBefore(node,before||null);position++;
 }
 for(const node of [...feed.children])if(!allowed.has(node.dataset.feedId))node.remove();
 if(!data.ids?.length)feed.innerHTML=empty('Não foram encontrados resultados.');
 for(const n of feed.querySelectorAll('[data-restore-vote]')){n.querySelector(`[data-attending="${n.dataset.restoreVote}"]`)?.focus({preventScroll:true});delete n.dataset.restoreVote;}
 const moved=anchor&&feed.querySelector(`[data-feed-id="${anchor.dataset.feedId}"]`);
 if(moved&&Number.isFinite(anchorTop))win.scrollTo?.({top:scroll+moved.getBoundingClientRect().top-anchorTop,behavior:'instant'});
 else win.scrollTo?.({top:scroll,behavior:'instant'});
}
export function feedPage(kind,{heading,controls='',renderCard,params=new URLSearchParams(),table=kind==='event'?'events':kind==='announcement'?'announcements':'event_logs'}) {
 return {html:`<section class="container page ${kind==='log'?'':'narrow'}" data-server-feed="${kind}">${heading}<div class="filter-bar"><label class="search"><span>⌕</span><input type="search" data-feed-filter="query" maxlength="200" placeholder="Pesquisar em todo o arquivo…" aria-label="Pesquisar em todo o arquivo"></label>${controls}<select data-feed-filter="sort" aria-label="Ordenação"><option value="">${kind==='event'?'Ordem da agenda':'Mais recentes primeiro'}</option><option value="desc">Mais recentes primeiro</option><option value="asc">Mais antigos primeiro</option></select></div>${params.get('id')?'<p class="notice">Conteúdo selecionado pela notificação. <button class="text-button" data-feed-clear-target>Ver todos</button></p>':''}<div class="feed-status" role="status" aria-live="polite">A carregar…</div><div class="feed" aria-busy="true"></div><nav class="pagination" aria-label="Paginação"><button class="button outline" data-feed-prev disabled>← Anterior</button><span data-feed-page>Página 1</span><button class="button outline" data-feed-next disabled>Seguinte →</button><button class="text-button" data-feed-retry>Atualizar</button></nav></section>`,cache:{[table]:[]},mount(root,cache){return mountFeed(root,{kind,table,renderCard,cache,target:params.get('id')});}};
}
export function mountFeed(root,{kind,table,renderCard,cache,target=null,request=args=>result(db.rpc('portal_feed',args)),interval=45000,win=window}) {
 const host=root.querySelector('[data-server-feed]'),feed=host.querySelector('.feed'),status=host.querySelector('.feed-status');
 const gate=requestGate(),records=new Map(),cursors=[null];let page=0,next=null,more=false,snapshot=null,timer,debounce,disposed=false,refreshing=false,outstanding=0;
 const values={query:'',filter:kind==='event'?'next':'',sort:'',from:null,to:null};
 const schedule=()=>{clearTimeout(timer);if(kind==='event'&&!disposed)timer=setTimeout(async()=>{if(!root.ownerDocument.hidden)await refresh();else schedule();},interval);};
 async function refresh({force=false}={}) {
  if(disposed)return;clearTimeout(timer);outstanding++;refreshing=true;feed.setAttribute('aria-busy','true');
  if(!records.size)status.textContent='A carregar…';
  await gate.run(()=>request({p_kind:kind,p_query:values.query,p_filter:values.filter,p_sort:values.sort,p_cursor:cursors[page],p_snapshot:kind==='event'?null:snapshot,p_from:values.from,p_to:values.to,p_target:target,p_known:force?{}:Object.fromEntries([...records].map(([id,v])=>[id,v.version])),p_limit:PAGE_SIZE}),data=>{
   if(disposed)return;snapshot=data.snapshot;next=data.next_cursor;more=data.has_more;
   reconcileFeed(feed,data,renderCard,records,win);cache[table]=(data.ids||[]).map(id=>records.get(id)?.record).filter(Boolean);
   status.textContent=target&&!Number(data.total)?'O conteúdo foi apagado ou já não tens autorização para o consultar.':`${data.total} resultado${Number(data.total)===1?'':'s'}`;
   host.querySelector('[data-feed-page]').textContent=`Página ${page+1}`;
   host.querySelector('[data-feed-prev]').disabled=page===0;host.querySelector('[data-feed-next]').disabled=!more;
   const kinds=host.querySelector('[data-feed-kinds]');if(kinds){const selected=kinds.value,options=[...(data.filters||[])];if(selected&&!options.includes(selected))options.push(selected);kinds.innerHTML='<option value="">Todos os tipos</option>'+options.map(v=>`<option value="${e(v)}">${e(v)}</option>`).join('');kinds.value=selected;}
  },error=>{status.textContent=`${errorMessage(error)} Os dados apresentados foram mantidos. Usa Atualizar para tentar novamente.`;});
  refreshing=--outstanding>0;feed.setAttribute('aria-busy',String(refreshing));host.querySelector('[data-feed-prev]').disabled=refreshing||page===0;host.querySelector('[data-feed-next]').disabled=refreshing||!more;schedule();
 }
 function reset(){gate.invalidate();page=0;cursors.splice(0,cursors.length,null);snapshot=null;refresh({force:true});}
 function filter(event){const key=event.target.dataset.feedFilter;if(!key||event.type==='input'&&key!=='query'||event.type==='change'&&key==='query')return;values[key]=event.target.value||(['from','to'].includes(key)?null:'');clearTimeout(debounce);gate.invalidate();
  if(key==='query')debounce=setTimeout(reset,300);else reset();}
 function click(event){
  if(event.target.closest('[data-feed-next]')&&more&&!refreshing){gate.invalidate();cursors[++page]=next;refresh({force:true});}
  if(event.target.closest('[data-feed-prev]')&&page&&!refreshing){gate.invalidate();page--;refresh({force:true});}
  if(event.target.closest('[data-feed-retry]')){if(kind!=='event')snapshot=null;refresh({force:true});}
  if(event.target.closest('[data-feed-clear-target]')){target=null;reset();}
 }
 const visible=()=>{if(!root.ownerDocument.hidden)refresh();};
 host.addEventListener('input',filter);host.addEventListener('change',filter);host.addEventListener('click',click);root.ownerDocument.addEventListener('visibilitychange',visible);
 refresh();
 return {refresh:()=>{if(kind!=='event')snapshot=null;return refresh({force:true});},invalidate:()=>gate.invalidate(),dispose(){disposed=true;gate.stop();clearTimeout(timer);clearTimeout(debounce);host.removeEventListener('input',filter);host.removeEventListener('change',filter);host.removeEventListener('click',click);root.ownerDocument.removeEventListener('visibilitychange',visible);}};
}
