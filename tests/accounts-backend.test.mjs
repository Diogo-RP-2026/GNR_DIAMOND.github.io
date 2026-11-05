import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAdminHandler} from '../supabase/functions/account-admin/handler.js';
const target='12345678-1234-4234-8234-123456789012';
const request=(body={action:'delete-member',target_id:target},headers={})=>new Request('https://example.invalid/account-admin',{method:'POST',headers:{Authorization:'Bearer test-user-token',Origin:'https://diogo-rp-2026.github.io',...headers},body:JSON.stringify(body)});
function fixture({allowed=true,user=true,storageError=false,finishError=false}={}){
 const calls=[],removed=[];let finished=false;
 const handler=createAccountAdminHandler({clientForToken:()=>({auth:{getUser:async()=>({data:{user:user?{id:'actor'}:null}})},rpc:async(name,args)=>{
  calls.push(args);if(!allowed)return {data:{ok:false,reason:'forbidden'}};
  if(args.p_action==='begin')return {data:{ok:true,status:finished?'completed':'pending',operation_id:'operation',files:[{bucket_id:'ushe-avatars',name:target+'/photo.jpg'}]}};
  if(args.p_action==='finish'){if(finishError)return {data:{ok:false,reason:'database'}};finished=true;return {data:{ok:true,status:'completed'}};}
  return {data:{ok:true}};
 }}),storage:{from:bucket=>({remove:async paths=>{removed.push({bucket,paths});return {error:storageError?new Error('Secret backend diagnostic'):null};}})}});
 return {handler,calls,removed};
}
test('backend checks real identity and database permission before touching any Storage file',async()=>{
 for(const options of [{user:false},{allowed:false}]){const f=fixture(options),r=await f.handler(request());assert.ok([401,403].includes(r.status));assert.equal(f.removed.length,0);}
 const f=fixture();const r=await f.handler(request({}, {Origin:'https://evil.example'}));assert.equal(r.status,403);assert.equal(f.calls.length,0);
 const missing=request();missing.headers.delete('Authorization');assert.equal((await f.handler(missing)).status,401);
});
test('successful deletion follows server manifest, finalizes, then makes retries idempotent',async()=>{
 const f=fixture();assert.equal((await f.handler(request())).status,200);assert.deepEqual(f.removed,[{bucket:'ushe-avatars',paths:[target+'/photo.jpg']}]);assert.deepEqual(f.calls.map(c=>c.p_action),['begin','finish']);
 assert.equal((await f.handler(request())).status,200);assert.equal(f.removed.length,1);
});
test('Storage or finalization failure stays pending and cannot return success or backend details',async()=>{
 for(const options of [{storageError:true},{finishError:true}]){
  const f=fixture(options),response=await f.handler(request()),body=await response.json();assert.equal(body.ok,false);assert.equal(body.status,'pending');assert.ok(response.status>=400);assert.ok(!JSON.stringify(body).includes('Secret'));
  if(options.storageError)assert.deepEqual(f.calls.map(c=>c.p_action),['begin','storage_failure']);
 }
});
test('backend rejects invalid IDs, client-chosen files and oversized bodies',async()=>{
 const f=fixture();assert.equal((await f.handler(request({action:'delete-member',target_id:'arbitrary'}))).status,400);
 assert.equal((await f.handler(request({action:'delete-member',target_id:target,ignored:'x'.repeat(3000)}))).status,413);
 await f.handler(request({action:'delete-member',target_id:target,files:[{bucket_id:'ushe-media',name:'someone-else.jpg'}]}));assert.equal(f.removed[0].bucket,'ushe-avatars');
});
