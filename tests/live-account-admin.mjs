// Optional HTTP integration test. Supply isolated, administrator-created test
// accounts on stdin, never production credentials. No email is sent by this test.
// After signed_in, seed private.user_verifications only for these disposable
// accounts from an administrative SQL connection; never alter real accounts.
// Use their actual emails and server time, then send {"continue":true} on stdin.
import {createClient} from '@supabase/supabase-js';
import {Image} from 'imagescript';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import vm from 'node:vm';
import assert from 'node:assert/strict';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const lines=createInterface({input:process.stdin,terminal:false})[Symbol.asyncIterator]();
const context={window:{}};vm.runInNewContext(await readFile(new URL('../config.js',import.meta.url),'utf8'),context);
const config=context.window.USHE_CONFIG;
const origin='https://diogo-rp-2026.github.io';
const clients={},identities={},checks=[];
const emit=data=>process.stdout.write(JSON.stringify(data)+'\n');
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
const invoke=async(client,name,body)=>{
 const {data,error}=await client.functions.invoke(name,{body});
 if(error?.context){try{return {status:error.context.status,body:await error.context.json()};}catch{}}
 return {status:error?503:200,body:data};
};
try {
 emit({phase:'ready',input:'hidden'});
 const fixtures=JSON.parse((await lines.next()).value);
 for(const fixture of fixtures.accounts){
  assert.ok(fixture.email.endsWith('@example.invalid'),'Only reserved test email addresses are accepted');
  const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:origin}}});
  const {data,error}=await client.auth.signInWithPassword({email:fixture.email,password:fixture.password});
  if(error||!data.session)throw new Error('Fixture authentication failed');
  clients[fixture.name]=client;identities[fixture.name]={id:data.user.id,session_id:JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url')).session_id};
 }
 emit({phase:'signed_in',identities});
 assert.equal(JSON.parse((await lines.next()).value).continue,true);
 const {command,member,protected:protectedCommand}=clients;
 const target=identities.member.id,protectedId=identities.protected.id;
 const noAuth=await fetch(config.supabaseUrl+'/functions/v1/account-admin',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'delete-member',target_id:target})});
 check('anonymous denied',noAuth.status===401);
 const denied=await invoke(member,'account-admin',{action:'delete-member',target_id:protectedId});check('member denied',denied.status===403&&denied.body.reason==='forbidden');
 const protectedResult=await invoke(command,'account-admin',{action:'delete-member',target_id:protectedId});check('Comando protected',protectedResult.status===409&&protectedResult.body.reason==='protected');
 const demote=await command.rpc('set_user_access',{p_user:protectedId,p_role:'member',p_approved:true,p_tabs:[]});check('Comando demotion denied',!!demote.error);
 const png=await new Image(2,2).fill(0x385a3bff).encodePNG();
 const upload=async(client,endpoint)=>{const form=new FormData();form.set('photo',new File([png],'test.png',{type:'image/png'}));const result=await invoke(client,endpoint,form);assert.equal(result.status,200,'Test upload must succeed');assert.ok(result.body?.path);return result.body.path;};
 const avatar=await upload(member,'agent-avatar');
 const {data:members,error:memberError}=await command.from('members').select('id').eq('user_id',target);check('agent fixture available',!memberError&&members.length===1);const agentId=members[0].id;
 const personal=await member.rpc('save_agent_personal',{p_member:agentId,p_biography:'Teste automático temporário',p_avatar_path:avatar});check('personal photo associated',!personal.error);
 const official=await upload(command,'agent-avatar?tab=equipa');
 const officialSave=await command.from('members').update({image_path:official}).eq('id',agentId).select('id');check('official photo associated',!officialSave.error&&officialSave.data.length===1);
 const photoBefore=await member.storage.from('ushe-avatars').download(avatar);check('personal photo accessible before deletion',!photoBefore.error);
 const deletion=await invoke(command,'account-admin',{action:'delete-member',target_id:target});check('real deletion completed',deletion.status===200&&deletion.body?.ok===true&&deletion.body.status==='completed');
 const profileAfter=await command.from('profiles').select('id').eq('id',target),agentAfter=await command.from('members').select('id').eq('id',agentId);check('profile and agent absent',!profileAfter.error&&!agentAfter.error&&profileAfter.data.length===0&&agentAfter.data.length===0);
 const liveness=await member.rpc('otp_session_verified');check('old JWT session denied',liveness.data===false);
 const userAfter=await member.auth.getUser();check('Auth identity deleted',!!userAfter.error||!userAfter.data.user);
 // A previously served CDN response can survive invalidation briefly. Check
 // authorization at the origin with the same nonce/no-store used by the portal.
 const photoAfter=await member.storage.from('ushe-avatars').download(avatar,{cacheNonce:crypto.randomUUID()},{cache:'no-store'});check('deleted account photo access denied at origin',!!photoAfter.error);
 const refresh=await member.auth.refreshSession();check('old refresh token denied',!!refresh.error||!refresh.data.session);
 const replay=await invoke(command,'account-admin',{action:'delete-member',target_id:target});check('deletion replay idempotent',replay.status===200&&replay.body?.status==='completed');
 const protectedAfter=await protectedCommand.from('profiles').select('role').eq('id',protectedId);check('protected Comando remains active',!protectedAfter.error&&protectedAfter.data[0]?.role==='command');
 emit({phase:'finished',checks,operation_id:deletion.body.operation_id,target_id:target,photo_paths:{avatar,official}});
}catch(error){emit({phase:'failed',checks,error:error instanceof assert.AssertionError?error.message:'Integration test failed'});process.exitCode=1;}
finally{if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.destroy();}
