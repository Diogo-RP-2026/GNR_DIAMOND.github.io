// Optional HTTP test against the configured project. Use disposable, already
// verified accounts with the reserved test address prefix. Supply credentials
// on stdin. The script prints only checks and the synthetic IDs/paths to clean up.
import assert from 'node:assert/strict';
import dns from 'node:dns';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import vm from 'node:vm';
import {createClient} from '@supabase/supabase-js';
import {Image} from 'imagescript';

dns.setDefaultResultOrder('ipv4first');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const lines=createInterface({input:process.stdin,terminal:false})[Symbol.asyncIterator]();
const context={window:{}};
vm.runInNewContext(await readFile(new URL('../config.js',import.meta.url),'utf8'),context);
const config=context.window.USHE_CONFIG;
const origin='https://diogo-rp-2026.github.io';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:origin}}};
const client=()=>createClient(config.supabaseUrl,config.supabasePublishableKey,options);
const checks=[];
const ids={primary:crypto.randomUUID(),shared:crypto.randomUUID()};
const paths=[];
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
function check(name,condition){assert.ok(condition,name);checks.push(name);}
const name='[TESTE IMAGEM] Equipamento descartável';
const fields={name,category:'[TESTE IMAGEM]',mandatory:false,notes:'Fixture descartável',sort_order:0};
function body(id,action,revision,bytes,metadata=fields){
 const form=new FormData();
 form.set('data',JSON.stringify({id,image_action:action,expected_revision:revision,fields:metadata}));
 if(bytes)form.set('photo',new File([bytes],'recorte.jpg',{type:'image/jpeg'}));
 return form;
}
async function invoke(scoped,form){
 const {data,error}=await scoped.functions.invoke('equipment-image',{body:form});
 if(error?.context){try{return {status:error.context.status,body:await error.context.json()};}catch{}}
 return {status:error?503:200,body:data};
}
async function login(account){
 assert.match(account.email,/^ushe-equipment-test-[a-f0-9-]+@example\.invalid$/);
 const scoped=client();
 const {data,error}=await scoped.auth.signInWithPassword({email:account.email,password:account.password});
 assert.ok(!error&&data.session,'Disposable account signed in');
 assert.equal(data.user.id,account.id);
 return scoped;
}
async function download(scoped,path){
 return scoped.storage.from('ushe-media').download(path,{cacheNonce:crypto.randomUUID()},{cache:'no-store'});
}
try{
 emit({phase:'ready',input:'hidden',ids});
 const fixture=JSON.parse((await lines.next()).value);
 const [command,member]=await Promise.all([login(fixture.command),login(fixture.member)]);
 const verified=await Promise.all([command.rpc('verification_status'),member.rpc('verification_status')]);
 check('both disposable sessions verified by backend',verified.every(x=>!x.error&&x.data.verified===true));
 const denied=await invoke(member,body(ids.primary,'keep',null));
 check('member cannot manage equipment via Edge Function',denied.status===403);
 const rpcDenied=await member.rpc('equipment_image_save',{p_action:'keep',p_id:ids.primary,p_data:fields});
 check('member cannot bypass permissions via Data API',!!rpcDenied.error);
 const noIdentity=await fetch(config.supabaseUrl+'/functions/v1/equipment-image',{method:'POST',headers:{Origin:origin},body:body(ids.primary,'keep',null)});
 check('anonymous save denied',noIdentity.status===401);
 const forged=await fetch(config.supabaseUrl+'/functions/v1/equipment-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cleanup',ticket:crypto.randomUUID(),files:['equipamento/other.jpg']})});
 check('forged cleanup ticket rejected',forged.status===401);
 const malformed=await invoke(command,body(ids.primary,'replace',null,new TextEncoder().encode('<svg>bad</svg>')));
 check('server rejects spoofed image content',malformed.status===400);
 const adjusted=await new Image(800,600).fill(0x3079ddff).encodeJPEG(90);
 const direct=await command.storage.from('ushe-media').upload(`equipamento/${ids.primary}.jpg`,adjusted,{contentType:'image/jpeg'});
 check('direct Storage upload denied to frontend',!!direct.error);
 const created=await invoke(command,body(ids.primary,'replace',null,adjusted));
 if(created.body?.equipment?.image_path)paths.push(created.body.equipment.image_path);
 check('Comando creates record with adjusted image',created.status===200&&created.body?.equipment?.id===ids.primary&&paths.length===1);
 const first=created.body.equipment;
 const blob=await download(command,first.image_path);
 check('adjusted image downloadable from private Storage',!blob.error&&blob.data.type==='image/jpeg');
 const saved=await Image.decode(new Uint8Array(await blob.data.arrayBuffer()));
 check('stored JPEG retains 800 x 600 output and blue crop content',saved.width===800&&saved.height===600&&(saved.getPixelAt(0,0)>>>8&255)>200);
 const shared=await command.rpc('equipment_image_save',{p_action:'replace',p_id:ids.shared,p_data:fields,p_path:first.image_path});
 check('existing validated image can be shared by two records',!shared.error&&shared.data.equipment.image_path===first.image_path);
 const replacement=await new Image(640,480).fill(0xe23d3dff).encodeJPEG(90);
 const replaced=await invoke(command,body(ids.primary,'replace',first.revision,replacement));
 if(replaced.body?.equipment?.image_path)paths.push(replaced.body.equipment.image_path);
 check('replacement is attached to correct equipment',replaced.status===200&&replaced.body?.equipment?.id===ids.primary&&paths.length===2&&paths[1]!==paths[0]);
 const other=await command.from('equipment').select('image_path').eq('id',ids.shared).single();
 check('other record retains shared image',!other.error&&other.data.image_path===paths[0]&&!(await download(command,paths[0])).error);
 await command.storage.from('ushe-media').remove([paths[0]]);
 check('direct deletion cannot remove shared image',!(await download(command,paths[0])).error);
 const stale=await invoke(command,body(ids.primary,'keep',first.revision));
 check('stale revision rejected without changing image',stale.status===409);
 const removed=await invoke(command,body(ids.shared,'remove',shared.data.equipment.revision));
 check('last reference removed and original file cleaned',removed.status===200&&removed.body?.equipment?.image_path===null&&!!(await download(command,paths[0])).error);
 const deleted=await command.from('equipment').delete().in('id',Object.values(ids)).eq('name',name).select('id');
 check('disposable equipment deleted and last image queued for Cron',!deleted.error&&deleted.data.length===2);
 emit({phase:'finished',checks,ids,paths});
}catch(error){
 emit({phase:'failed',checks,ids,paths,error:error instanceof assert.AssertionError?error.message:'Integration test failed'});
 process.exitCode=1;
}finally{
 if(process.stdin.isTTY)process.stdin.setRawMode(false);
 process.stdin.destroy();
}
