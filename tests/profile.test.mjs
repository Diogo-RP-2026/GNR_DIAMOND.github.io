import test from 'node:test';
import {Image} from 'imagescript';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {normalizeImage,validateImage,MAX_BYTES,readLimitedBody} from '../supabase/functions/agent-avatar/validation.js';
import {createAvatarHandler} from '../supabase/functions/agent-avatar/handler.js';
const {window}=parseHTML('<html><body></body></html>');globalThis.window=window;
const {state}=await import('../js/api.js');
const {profileHTML,serviceTime,validatePhoto}=await import('../js/profile.js');
const member={id:'a',user_id:'me',name:'Agente <img onerror="alert(1)">',rank:'Operacional',callsign:'A-01',uniform_number:12};
test('perfil: texto escapado, vazios reais, sem emails e edição só no próprio',()=>{
 state.user={id:'me'};state.profile={approved:true,role:'member',email:'never-render@example.test'};
 const html=profileHTML({member,personal:{biography:'<script>alert(1)</script>'}}),{document}=parseHTML(html);
 assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('.agent-biography .prose').textContent,'<script>alert(1)</script>');
 assert.ok(!html.includes('never-render'));assert.ok(document.querySelector('[data-action="personal-profile"]'));
 assert.match(html,/Sem subunidade atribuída/);assert.match(html,/Sem formações registadas/);assert.match(html,/Sem distinções atribuídas/);assert.match(html,/Sem atividade recente/);
 state.user={id:'other'};assert.ok(!profileHTML({member}).includes('data-action="personal-profile"'));
});
test('tempo de serviço: dia, mês, ano, data em falta e futuro',()=>{
 const now=new Date('2026-11-03T12:00Z');
 assert.equal(serviceTime(null,now),'Data de ingresso por registar');
 assert.equal(serviceTime('2026-11-03',now),'Ingressou hoje');
 assert.equal(serviceTime('2026-11-02',now),'1 dia de serviço');
 assert.equal(serviceTime('2026-10-03',now),'1 mês de serviço');
 assert.equal(serviceTime('2025-09-03',now),'1 ano e 2 meses de serviço');
 assert.equal(serviceTime('2027-01-01',now),'Data de ingresso por confirmar');
});
const corruptPng=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6twAAAABJRU5ErkJggg==','base64'));
const png=await new Image(2,2).fill(0xff0000ff).encodePNG();
test('validação no servidor: assinatura, MIME e limite de 5 MB, incluindo MIME falsificado',()=>{
 assert.equal(validateImage(png,'image/png'),'png');
 assert.throws(()=>validateImage(png,'image/jpeg'),/Ficheiro inválido/);
 assert.throws(()=>validateImage(new TextEncoder().encode('<script>alert(1)</script>'),'image/png'),/Ficheiro inválido/);
 assert.throws(()=>validateImage(new Uint8Array(MAX_BYTES+1),'image/png'),/5 MB/);
 assert.throws(()=>validatePhoto({size:MAX_BYTES+1,type:'image/jpeg'}),/5 MB/);
 assert.throws(()=>validatePhoto({size:100,type:'image/svg+xml'}),/JPEG/);
});
function handler({user={id:'owner'},member={id:'agent'},uploadError=null,allowed=true}={}) {
 const uploads=[];
 const scoped={rpc:async()=>({data:!!user&&!!member&&allowed}),auth:{getUser:async()=>({data:{user}})},from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:member})};}};
 return {uploads,handle:createAvatarHandler({clientForToken:()=>scoped,uuid:()=> 'uuid',storage:{from:bucket=>({upload:async(path,bytes,options)=>{uploads.push({bucket,path,bytes,options});return {error:uploadError};}})}})};
}
function request(bytes=png,type='image/png',auth=true) {
 const data=new FormData();data.set('photo',new File([bytes],'photo.png',{type}));
 return new Request('https://example.test/agent-avatar',{method:'POST',headers:auth?{Authorization:'Bearer user-token',Origin:'https://diogo-rp-2026.github.io'}:{Origin:'https://diogo-rp-2026.github.io'},body:data});
}
test('upload: exige autenticação e associação com RLS antes de guardar; nome definido pelo servidor',async()=>{
 const a=handler();assert.equal((await a.handle(request(png,'image/png',false))).status,401);assert.equal(a.uploads.length,0);
 assert.equal((await handler({user:null}).handle(request())).status,401);
 assert.equal((await handler({member:null}).handle(request())).status,429);
 assert.deepEqual(await (await a.handle(request())).json(),{path:'owner/uuid.jpg'});
 assert.equal(a.uploads.length,1);assert.equal(a.uploads[0].bucket,'ushe-avatars');assert.equal(a.uploads[0].options.upsert,false);
});
test('upload: ficheiro falso e erro Storage não produzem sucesso nem expõem detalhes',async()=>{
 const a=handler();assert.equal((await a.handle(request(new TextEncoder().encode('not an image')))).status,400);assert.equal(a.uploads.length,0);
 const b=handler({uploadError:new Error('private backend detail')});const response=await b.handle(request());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private backend'));
});
test('corpo HTTP sem Content-Length também está limitado',async()=>{
 const req=new Request('https://example.test',{method:'POST',body:new Uint8Array(MAX_BYTES+65537)});
 await assert.rejects(readLimitedBody(req),/5 MB/);
});

test('audit: decode/re-encode real JPEG/PNG/WebP; reject corrupt signature, giant dimensions and MIME spoofing',async()=>{
 const image=new Image(2,2).fill(0xff0000ff);
 for(const [mime,input] of [['image/png',png],['image/jpeg',await image.encodeJPEG()],['image/webp',await image.encodeWebP()]]){
  const output=await normalizeImage(input,mime);assert.equal(output.mime,'image/jpeg');
  assert.equal((await Image.decode(output.bytes)).width,2);
 }
 assert.equal(validateImage(corruptPng,'image/png'),'png');
 await assert.rejects(normalizeImage(corruptPng,'image/png'),/Ficheiro inválido/);
 await assert.rejects(normalizeImage(png,'image/webp'),/Ficheiro inválido/);
 await assert.rejects(normalizeImage(await new Image(4097,1).encodePNG(),'image/png'),/Ficheiro inválido/);
 const bomb=new Uint8Array(png);new DataView(bomb.buffer).setUint32(16,100000);
 await assert.rejects(normalizeImage(bomb,'image/png'),/Ficheiro inválido/);
});
test('audit: CORS rejects foreign origins and quota denies before buffering or storage',async()=>{
 const a=handler();const req=request();req.headers.set('Origin','https://evil.example');
 const response=await a.handle(req);assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal(a.uploads.length,0);
 const blocked=handler({allowed:false});assert.equal((await blocked.handle(request())).status,429);assert.equal(blocked.uploads.length,0);
});
