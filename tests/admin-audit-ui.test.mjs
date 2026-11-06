import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

globalThis.window={};
const {adminAuditPage,auditCard,mountAdminAudit}=await import('../js/admin-audit.js');
const {administration}=await import('../js/views.js');
const first={id:'original',action:'equipment.update',entity:'equipment',actor_name:'Comando de teste',target_name:'Equipamento A',
  occurred_at:'2026-11-06T21:00:00Z',result:'succeeded',details:{fields:['notes']}};
const hidden={...first,hidden_by_name:'Comando de teste',hidden_at:'2026-11-06T21:01:00Z'};
const next={at:first.occurred_at,id:first.id};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function mount(options){
  const {document,window}=parseHTML(adminAuditPage().html);
  const root=document.querySelector('[data-admin-audit]');
  const view=mountAdminAudit(root,options);
  const click=selector=>root.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
  const submit=()=>root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  const select=(name,value)=>{
    const element=root.querySelector(`[name="${name}"]`);
    for(const option of element.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);
    element.dispatchEvent(new window.Event('change',{bubbles:true}));
  };
  return {root,view,click,submit,select,items:root.querySelector('[data-audit-items]'),status:root.querySelector('[data-audit-status]')};
}

test('admin Logs tab mounts only audit controls and safely renders public display fields',async()=>{
  const page=await administration('audit');
  assert.match(page.html,/area=audit" aria-current="page">Logs/);
  assert.equal(typeof page.mount,'function');
  const html=auditCard({...hidden,actor_name:'<img src=x onerror=bad>',target_name:'<script>bad</script>',details:{fields:['notes'],password:'DO_NOT_RENDER'}});
  const {document}=parseHTML(html);
  assert.equal(document.querySelectorAll('img,script').length,0);
  assert.ok(document.textContent===null||!document.textContent.includes('DO_NOT_RENDER'));
  assert.ok(!html.includes('DO_NOT_RENDER'));
  assert.match(html,/Ocultado por/);
  assert.equal(document.querySelector('[data-audit-hide]'),null);
});

test('search and filters reset the cursor while paging keeps applied search criteria',async t=>{
  const requests=[];
  const app=mount({list:async args=>{requests.push(args);return args.p_cursor?{items:[{...first,target_name:'Equipamento antigo'}]}:{items:[first],next_cursor:next};}});
  t.after(()=>app.view.dispose());
  await tick();
  assert.equal(requests[0].p_visibility,'visible');
  app.root.querySelector('[name="query"]').value='novo filtro';
  app.click('[data-audit-next]');await tick();
  assert.deepEqual(requests[1].p_cursor,next);
  assert.equal(requests[1].p_query,'');
  assert.equal(app.root.querySelector('[data-audit-page]').textContent,'Página 2');
  app.submit();await tick();
  assert.equal(requests[2].p_query,'novo filtro');
  assert.equal(requests[2].p_cursor,null);
  app.select('visibility','hidden');await tick();
  assert.equal(requests[3].p_visibility,'hidden');
  assert.equal(app.root.querySelector('[data-audit-page]').textContent,'Página 1');
});

test('hide refreshes the current view after server confirmation and leaves the hidden filter available',async t=>{
  let isHidden=false,attempts=0;
  const app=mount({list:async args=>({items:args.p_visibility==='hidden'?(isHidden?[hidden]:[]):(isHidden?[]:[first])}),hide:async id=>{
    assert.equal(id,first.id);
    if(++attempts===1)return {ok:false};
    isHidden=true;return {ok:true};
  }});
  t.after(()=>app.view.dispose());
  await tick();
  app.click('[data-audit-hide]');await tick();
  assert.match(app.status.textContent,/já não está disponível/);
  assert.ok(app.items.querySelector('[data-audit-hide]'));
  app.click('[data-audit-hide]');await tick();
  assert.match(app.status.textContent,/Registo ocultado/);
  assert.equal(app.items.querySelector('[data-audit-hide]'),null);
  app.select('visibility','hidden');await tick();
  assert.match(app.items.textContent,/Ocultado por Comando de teste/);
  assert.equal(app.items.querySelector('[data-audit-hide]'),null);
});

test('a denied refresh clears audit cards instead of leaving privileged data on screen',async t=>{
  let allowed=true;
  const app=mount({list:async()=>{if(!allowed)throw {code:'42501'};return {items:[first]};}});
  t.after(()=>app.view.dispose());
  await tick();assert.match(app.items.textContent,/Equipamento A/);
  allowed=false;await app.view.refresh();
  assert.equal(app.items.textContent,'');
  assert.match(app.status.textContent,/Sem autorização/);
});
