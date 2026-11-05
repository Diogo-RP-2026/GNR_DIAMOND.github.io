// HTTP integration test. Only disposable @example.invalid accounts on stdin.
// Grant OTP to the printed test session IDs, then send {"continue":true}.
// Credentials and tokens remain in memory and are never printed or saved.
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import vm from 'node:vm';
import assert from 'node:assert/strict';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const lines=createInterface({input:process.stdin,terminal:false})[Symbol.asyncIterator]();
const ctx={window:{}};vm.runInNewContext(await readFile(new URL('../config.js',import.meta.url),'utf8'),ctx);
const config=ctx.window.USHE_CONFIG,clients={},identities={},checks=[];
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
try{
 emit({phase:'ready',input:'hidden'});
 const {accounts}=JSON.parse((await lines.next()).value);
 for(const account of accounts){
  assert.ok(account.email.endsWith('@example.invalid'),'Only reserved test addresses are accepted');
  const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error}=await client.auth.signInWithPassword({email:account.email,password:account.password});
  if(error||!data.session)throw new Error('Fixture authentication failed');
  clients[account.name]=client;identities[account.name]={id:data.user.id,session_id:JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url')).session_id};
 }
 emit({phase:'signed_in',identities});assert.equal(JSON.parse((await lines.next()).value).continue,true);
 const a=clients.a,b=clients.b,fixtureA=accounts.find(x=>x.name==='a'),fixtureB=accounts.find(x=>x.name==='b');
 const anon=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 check('anonymous inbox denied',!!(await anon.rpc('inbox_page')).error);
 const own=await a.from('notifications').select('id,recipient_id,read_at').eq('id',fixtureA.first_id);check('own notification readable',!own.error&&own.data.length===1&&own.data[0].recipient_id===fixtureA.id);
 const other=await a.from('notifications').select('id').eq('id',fixtureB.first_id);check('other account notification hidden',!other.error&&other.data.length===0);
 const markOther=await a.rpc('mark_notifications_read',{p_ids:[fixtureB.first_id]});check('foreign mark request cannot change the target',!markOther.error);
 const untouched=await b.from('notifications').select('read_at').eq('id',fixtureB.first_id);check('other account notification remains unread',!untouched.error&&untouched.data[0].read_at===null);
 check('recipient cannot be reassigned',!!(await a.from('notifications').update({recipient_id:fixtureB.id}).eq('id',fixtureA.first_id)).error);
 check('client cannot delete notifications',!!(await a.from('notifications').delete().eq('id',fixtureA.first_id)).error);
 check('global purge is not a public RPC',!!(await a.rpc('purge_read_notifications')).error);
 const markOne=await a.rpc('mark_notifications_read',{p_ids:[fixtureA.first_id]});check('individual read accepted',!markOne.error);
 const read=await a.from('notifications').select('read_at').eq('id',fixtureA.first_id);check('individual read persisted',!read.error&&!!read.data[0].read_at);
 const inbox=await a.rpc('inbox_page');check('unread count reflects individual read',!inbox.error&&Number(inbox.data.unread)>0&&inbox.data.items.some(n=>n.id===fixtureA.first_id&&n.read_at));
 check('mark all accepted',!(await a.rpc('mark_notifications_read',{p_before:inbox.data.snapshot})).error);
 check('mark all counter synchronized',Number((await a.rpc('inbox_page')).data?.unread)===0);
 const bBefore=await b.rpc('inbox_page');check('mark all does not affect another account',Number(bBefore.data?.unread)>0);
 check('second account can mark its own inbox',!(await b.rpc('mark_notifications_read',{p_before:bBefore.data.snapshot})).error);
 emit({phase:'finished',checks,identities,read_ids:[fixtureA.first_id,fixtureA.second_id,fixtureB.first_id,fixtureB.second_id]});
}catch(error){emit({phase:'failed',checks,error:error instanceof assert.AssertionError?error.message:'Integration test failed'});process.exitCode=1;}
finally{if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.destroy();}
