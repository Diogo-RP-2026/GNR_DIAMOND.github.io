import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHTML,normalize,lisbonISO,lisbonInput,dateRange,orderedEvents,discordURL} from '../js/core.js';
test('texto introduzido por utilizadores não é interpretado como HTML',()=>{
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHTML("' &"),'&#39; &amp;');
  assert.equal(normalize('João · SANÇÕES'),'joao · sancoes');
});
test('datas usam Portugal continental em verão e inverno',()=>{
  assert.equal(lisbonISO('2026-07-10T21:00'),'2026-07-10T20:00:00.000Z');
  assert.equal(lisbonISO('2026-11-10T21:00'),'2026-11-10T21:00:00.000Z');
  assert.equal(lisbonInput('2026-07-10T20:00:00.000Z'),'2026-07-10T21:00');
});
test('mudança da hora: recusa hora inexistente e usa primeira ocorrência da repetida',()=>{
  assert.throws(()=>lisbonISO('2026-03-29T01:30'),/não existe/);
  assert.equal(lisbonISO('2026-10-25T01:30'),'2026-10-25T00:30:00.000Z');
});
test('duração válida, inclusive depois da meia-noite',()=>{
  assert.throws(()=>dateRange('2026-11-02T21:00','2026-11-02T20:00'),/posterior/);
  const r=dateRange('2026-11-02T23:00','2026-11-03T01:00');assert.ok(r.ends_at>r.starts_at);
});
test('eventos próximos/em curso primeiro; arquivo mais recente primeiro',()=>{
  const rows=[['old','2026-01-01'],['next2','2026-12-02'],['past','2026-10-01'],['next1','2026-12-01']].map(([id,d])=>({id,starts_at:d+'T10:00:00Z',ends_at:d+'T12:00:00Z'}));
  assert.deepEqual(orderedEvents(rows,Date.parse('2026-11-02')).map(v=>v.id),['next1','next2','past','old']);
});
test('convites aceitam apenas os domínios e caminhos do Discord',()=>{
  assert.equal(discordURL('javascript:alert(1)'), '');
  assert.equal(discordURL('https://discord.gg.evil.test/test'),'');
  assert.equal(discordURL('https://discord.gg/diamond'),'https://discord.gg/diamond');
});
test('listas de votos são paginadas e não truncam nos primeiros 1000 nomes',async()=>{
  globalThis.window={};
  const {allRows}=await import('../js/api.js');
  const data=Array.from({length:1207},(_,id)=>({id}));let calls=0;
  const query={range(start,end){calls++;return Promise.resolve({data:data.slice(start,end+1),error:null});}};
  const output=await allRows(query);assert.equal(output.length,1207);assert.equal(calls,3);assert.equal(output[1206].id,1206);
});


test('votos verticais ordenados pelo instante e UUID, escapando nomes',async()=>{
  globalThis.window ||= {};
  const {responseComponent}=await import('../js/views.js');
  const {orderedResponses}=await import('../js/core.js');
  const input=[
    {user_id:'c',full_name:'Último',attending:true,updated_at:'2026-11-03T10:00:00.000003+00:00'},
    {user_id:'b',full_name:'Segundo',attending:true,updated_at:'2026-11-03T10:00:00.000002+00:00'},
    {user_id:'a',full_name:'<Primeiro>',attending:true,updated_at:'2026-11-03T10:00:00.000002+00:00'},
    {user_id:'d',full_name:'Ausente',attending:false,updated_at:'2026-11-03T09:00:00Z'},
  ];
  assert.deepEqual(orderedResponses(input).map(r=>r.user_id),['d','a','b','c']);
  const html=responseComponent('event','123',input);
  assert.ok(html.includes('<li>&lt;Primeiro&gt;</li><li>Segundo</li><li>Último</li>'));
  assert.ok(html.includes('<ul class="vote-names"><li>Ausente</li></ul>'));
  assert.ok(html.includes('<strong>3</strong>'));assert.ok(html.includes('<strong>1</strong>'));
  assert.equal(input[0].user_id,'c');
});
