import test from 'node:test';
import assert from 'node:assert/strict';
import {Image} from 'imagescript';
import {createEquipmentImageHandler} from '../supabase/functions/equipment-image/handler.js';
const png=await new Image(32,24).fill(0x1f3d2bff).encodePNG(),id='d1000000-0000-4000-8000-000000000001',ticket='d1000000-0000-4000-8000-000000000002';
function setup({identity=true,allowed=true,quota=true,uploadError=false,saveError=null,removeError=false,workerError=false}={}){
 const calls=[],uploads=[],removed=[];
 const scoped={auth:{getUser:async()=>({data:{user:identity?{id:'actor'}:null}})},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='reserve_portal_upload')return {data:quota};
  if(args.p_action==='authorize')return allowed?{data:{ok:true}}:{error:{code:'42501'}};
  if(args.p_action==='queue')return {data:{ok:true}};
  if(saveError==='conflict')return {data:{ok:false,reason:'conflict'}};
  return saveError?{error:{code:saveError,message:'Secret database detail'}}:{data:{ok:true,equipment:{id,image_path:args.p_path}}};
 }};
 const service={rpc:async(name,args)=>{calls.push({name,args});if(workerError)return {error:{message:'Private worker detail'}};
  if(args.p_action==='claim')return args.p_run&&args.p_run!==ticket?{data:{ok:false}}:{data:{ok:true,run_id:ticket,files:['equipamento/old.jpg']}};
  return {data:{ok:true,pending:removeError}};
 }};
 const storage={from:bucket=>({upload:async(path,bytes,options)=>{uploads.push({bucket,path,bytes,options});return {error:uploadError?new Error('Private upload detail'):null};},remove:async paths=>{removed.push(paths);return {error:removeError?new Error('Private delete detail'):null};}})};
 return {calls,uploads,removed,handle:createEquipmentImageHandler({clientForToken:()=>scoped,service,storage,uuid:()=>id})};
}
function request({bytes=png,type='image/png',action='replace',auth=true,origin='https://diogo-rp-2026.github.io',data={}}={}){
 const body=new FormData();body.set('data',JSON.stringify({id,expected_revision:0,image_action:action,fields:{name:'Material de teste',category:'Teste',mandatory:true,notes:'',sort_order:0},...data}));
 if(action==='replace')body.set('photo',new File([bytes],'image.png',{type}));
 return new Request('https://example.test/equipment-image',{method:'POST',body,headers:{Origin:origin,...(auth?{Authorization:'Bearer token'}:{})}});
}
test('equipment backend authenticates and checks current Comando permissions before buffering/uploading',async()=>{
 for(const options of [{identity:false},{allowed:false}]){const f=setup(options),r=await f.handle(request());assert.ok([401,403].includes(r.status));assert.equal(f.uploads.length,0);}
 assert.equal((await setup().handle(request({auth:false}))).status,401);
 assert.equal((await setup().handle(request({origin:'https://evil.test'}))).status,403);
});
test('equipment backend validates actual image content, MIME, pixels and size',async()=>{
 for(const input of [{bytes:new TextEncoder().encode('<svg onload=bad>')},{bytes:png,type:'image/jpeg'},{bytes:new Uint8Array(5*1024*1024+1)},{bytes:await new Image(4097,1).encodePNG()}]){
  const f=setup(),response=await f.handle(request(input));assert.equal(response.status,400);assert.equal(f.uploads.length,0);
 }
 const limited=setup({quota:false});assert.equal((await limited.handle(request())).status,429);assert.equal(limited.uploads.length,0);
});
test('adjusted image is normalized and the whole save commits to the chosen equipment only',async()=>{
 const f=setup(),response=await f.handle(request());assert.equal(response.status,200);const result=await response.json();assert.equal(result.equipment.id,id);
 assert.equal(f.uploads[0].path,'equipamento/'+id+'.jpg');assert.equal(f.uploads[0].options.contentType,'image/jpeg');assert.equal(f.uploads[0].options.upsert,false);
 const decoded=await Image.decode(f.uploads[0].bytes);assert.equal(decoded.width,32);assert.equal(decoded.height,24);
 const saved=f.calls.find(c=>c.name==='equipment_image_save'&&c.args.p_action==='replace');assert.equal(saved.args.p_id,id);assert.equal(saved.args.p_expected_revision,0);
 assert.deepEqual(f.removed,[['equipamento/old.jpg']]);
});
test('upload errors never commit metadata or return success/secret diagnostics',async()=>{
 const f=setup({uploadError:true}),response=await f.handle(request());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('Private'));
 assert.equal(f.calls.filter(c=>c.args.p_action==='replace').length,0);
});
test('a stale revision or revoked permission leaves the new object queued for cleanup',async()=>{
 for(const code of ['conflict','42501','23514']){
  const f=setup({saveError:code}),response=await f.handle(request());assert.equal(response.status,{conflict:409,'42501':403,'23514':400}[code]);
  assert.equal(f.calls.find(c=>c.args.p_action==='queue').args.p_path,'equipamento/'+id+'.jpg');assert.ok(!(await response.text()).includes('Secret'));
 }
});
test('old-file removal failure preserves successful equipment save and reports background retry',async()=>{
 const f=setup({removeError:true}),response=await f.handle(request());assert.equal(response.status,200);assert.equal((await response.json()).cleanup_pending,true);
 const finished=f.calls.find(c=>c.name==='equipment_media_worker'&&c.args.p_action==='finish');assert.equal(finished.args.p_success,false);
 const unavailable=setup({workerError:true});assert.equal((await (await unavailable.handle(request())).json()).cleanup_pending,true);
});
test('keep/remove actions require permissions but neither upload nor spend an image quota',async()=>{
 for(const action of ['keep','remove']){const f=setup(),r=await f.handle(request({action}));assert.equal(r.status,200);assert.equal(f.uploads.length,0);assert.ok(!f.calls.some(c=>c.name==='reserve_portal_upload'));}
});
test('Cron can use only a valid single-use ticket and cannot supply its own file paths',async()=>{
 const req=value=>new Request('https://example.test/equipment-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 const f=setup();assert.equal((await f.handle(req({action:'cleanup'}))).status,401);assert.equal(f.removed.length,0);
 assert.equal((await f.handle(req({action:'cleanup',ticket:crypto.randomUUID()}))).status,401);assert.equal(f.removed.length,0);
 const ok=await f.handle(req({action:'cleanup',ticket,files:['equipa/stolen.jpg']}));assert.equal(ok.status,200);assert.deepEqual(f.removed,[['equipamento/old.jpg']]);
});
