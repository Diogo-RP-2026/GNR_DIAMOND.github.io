import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/database.mjs';
test('30-day verification: real PostgreSQL deadline, account-wide access and single-use grants',async t=>{
 const {db,as,uid,rpc}=await database();t.after(()=>db.close());
 const service=async(action,args={})=>{await as('postgres');return (await db.query('select private.otp_service($1,$2) value',[action,args])).rows[0].value;};
 const exp=()=>Math.floor(Date.now()/1000)+3600;
 const issue=async(operation='login',session=uid.a)=>{
  const id=crypto.randomUUID(),args={id,user_id:uid.a,session_id:session,jwt_exp:exp(),operation,code_hash:'correct-code-hmac',proof_hash:'proof-hmac',payload:'authenticated-encrypted-payload',verification_email:'a@example.invalid'};
  assert.equal((await service('issue',args)).ok,true);return {...args,challenge_id:id,verified_email:'a@example.invalid'};
 };
 const finish=async challenge=>{assert.equal((await service('verify',{id:challenge.id,proof_hash:challenge.proof_hash,code_hash:challenge.code_hash})).ok,true);return service('grant',challenge);};
 await as('postgres');await db.exec('update private.otp_settings set enabled=true');
 await t.test('initial verification cannot be replaced by client dates, user metadata or a legacy session row',async()=>{
  await db.query("update auth.users set raw_user_meta_data='{\"last_verified_at\":\"2099-01-01\",\"role\":\"command\"}' where id=$1",[uid.a]);
  await db.query('insert into private.verified_sessions(session_id,user_id) values($1,$1)',[uid.a]);
  await as('a');const s=await rpc('verification_status');assert.equal(s.reason,'initial');assert.equal(s.verified,false);assert.equal((await db.query('select * from public.events')).rows.length,0);
  await assert.rejects(db.exec('select * from private.user_verifications'),/permission denied/);
  await assert.rejects(db.exec("insert into private.user_verifications(user_id,verified_email,last_verified_at) values(auth.uid(),'a@example.invalid',now())"),/permission denied/);
  await assert.rejects(rpc('otp_service',{action:'grant',args:{user_id:uid.a,session_id:uid.a}}),/permission denied/);
 });
 await t.test('cancelled, unverified and wrong-session challenges cannot grant a 30-day period',async()=>{
  const challenge=await issue();assert.equal((await service('grant',challenge)).ok,false);
  await service('cancel',{id:challenge.id,proof_hash:challenge.proof_hash});assert.equal((await service('grant',challenge)).ok,false);
  const next=await issue();await service('verify',{id:next.id,proof_hash:next.proof_hash,code_hash:next.code_hash});assert.equal((await service('grant',{...next,session_id:uid.b})).ok,false);
  assert.equal((await db.query('select count(*) n from private.user_verifications')).rows[0].n,0);
 });
 await t.test('only a successful code grants server time; another native session of that account shares the same deadline',async()=>{
  const challenge=await issue();assert.equal((await finish(challenge)).ok,true);
  await as('a');const before=await rpc('verification_status');assert.equal(before.verified,true);
  assert.equal(new Date(before.verification_expires_at)-new Date(before.last_verified_at),30*24*3600000);
  const sid=crypto.randomUUID();await as('postgres');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid.a]);
  await as('a');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid.a,session_id:sid,exp:exp()})]);
  const second=await rpc('verification_status');assert.equal(second.verified,true);assert.equal(second.last_verified_at,before.last_verified_at);
  assert.ok((await db.query('select * from public.events')).rows.length>0);
  await service('session_status',{user_id:uid.a,session_id:sid,jwt_exp:exp()});
  await as('a');assert.equal((await rpc('verification_status')).last_verified_at,before.last_verified_at);
 });
 await t.test('the same open session loses protected access exactly after 720 hours; refresh/new claims cannot renew it',async()=>{
  await as('postgres');await db.query("update private.user_verifications set last_verified_at=clock_timestamp()-interval '719 hours' where user_id=$1",[uid.a]);
  await as('a');assert.equal((await rpc('verification_status')).verified,true);
  await as('postgres');await db.query("update private.user_verifications set last_verified_at=clock_timestamp()-interval '720 hours' where user_id=$1",[uid.a]);
  await as('a');const s=await rpc('verification_status');assert.equal(s.verified,false);assert.equal(s.reason,'expired');
  assert.equal(await rpc('otp_session_verified'),false);assert.equal((await db.query('select * from public.events')).rows.length,0);
  await assert.rejects(db.query("insert into public.events(title,starts_at,ends_at,location) values('Bloqueado',now(),now()+interval '1 hour','QA')"),/row-level security/);
  assert.equal(await rpc('reserve_portal_upload',{p_tab:null}),false);
 });
 await t.test('renewal verifies the existing session, starts another period and never extends it on replay',async()=>{
  const challenge=await issue('renewal');assert.equal((await finish(challenge)).ok,true);
  await as('a');const before=await rpc('verification_status');assert.equal(before.verified,true);
  const repeated=await service('grant',challenge);assert.equal(repeated.ok,true);assert.equal(repeated.already_granted,true);
  await as('a');assert.equal((await rpc('verification_status')).last_verified_at,before.last_verified_at);
  assert.equal((await service('verify',{id:challenge.id,proof_hash:challenge.proof_hash,code_hash:challenge.code_hash})).error,'used');
 });
 await t.test('email changes and revoked/banned/expired native sessions cannot reuse a fresh verification',async()=>{
  await as('postgres');await db.query("update auth.users set email='changed@example.invalid' where id=$1",[uid.a]);
  await as('a');assert.equal((await rpc('verification_status')).reason,'email_changed');
  await as('postgres');await db.query("update auth.users set email='a@example.invalid',banned_until=clock_timestamp()+interval '1 hour' where id=$1",[uid.a]);
  await as('a');assert.equal((await rpc('verification_status')).authenticated,false);
  await as('postgres');await db.query('update auth.users set banned_until=null where id=$1',[uid.a]);await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[uid.a]);
  await as('a');assert.equal(await rpc('otp_session_verified'),false);
  await as('postgres');await db.query('update auth.sessions set not_after=null where id=$1',[uid.a]);
 });
 await t.test('the period is 720 hours across time zones and the approved five-request/two-minute limit is unchanged',async()=>{
  await as('postgres');await db.exec("set time zone 'Europe/Lisbon'");await db.query("update private.user_verifications set last_verified_at='2026-03-01T00:00Z' where user_id=$1",[uid.a]);
  await as('a');const s=await rpc('verification_status');assert.equal(new Date(s.verification_expires_at)-new Date(s.last_verified_at),30*24*3600000);
  const key='e'.repeat(64);for(let n=1;n<=5;n++){const q=await service('request_limit',{key});assert.equal(q.ok,true);assert.equal(q.retry_after,n===5?120:0);}
  assert.equal((await service('request_limit',{key,client_time:'2099-01-01'})).ok,false);
  await db.query("update private.otp_limits set started_at=clock_timestamp()-interval '121 seconds' where key=$1",['otp-request-v2:'+key]);assert.equal((await service('request_limit',{key})).ok,true);
  await db.exec("set time zone 'UTC'");
 });
 await t.test('Comando administration and upload permission are also blocked by expiry on the same JWT',async()=>{
  await as('postgres');await db.query("insert into private.user_verifications(user_id,verified_email,last_verified_at) values($1,'command@example.invalid',clock_timestamp()-interval '721 hours')",[uid.command]);
  await as('command');assert.equal((await rpc('account_admin',{p_action:'list'})).reason,'forbidden');assert.equal(await rpc('reserve_portal_upload',{p_tab:'equipa'}),false);
  await as('postgres');await db.query('update private.user_verifications set last_verified_at=clock_timestamp() where user_id=$1',[uid.command]);
  await as('command');assert.equal((await rpc('account_admin',{p_action:'list'})).ok,true);assert.equal(await rpc('reserve_portal_upload',{p_tab:'equipa'}),true);
 });
});

test('migration keeps the actual legacy verification time, never account creation or migration time',async t=>{
 const legacy=crypto.randomUUID(),suspicious=crypto.randomUUID();let previousExpiry;
 const {db}=await database({beforeMigration:async(path,db)=>{
  if(!path.endsWith('_email_verification_thirty_days.sql'))return;
  for(const id of [legacy,suspicious])await db.query("insert into auth.users(id,email,raw_user_meta_data,created_at) values($1,$2,'{\"full_name\":\"Legacy test\"}',clock_timestamp()-interval '7 days')",[id,id+'@example.invalid']);
  previousExpiry=(await db.query("insert into private.verified_sessions(session_id,user_id,expires_at) values(gen_random_uuid(),$1,clock_timestamp()+interval '20 hours') returning expires_at",[legacy])).rows[0].expires_at;
  await db.query("insert into private.verified_sessions(session_id,user_id,expires_at) values(gen_random_uuid(),$1,clock_timestamp()+interval '48 hours')",[suspicious]);
 }});t.after(()=>db.close());
 const record=(await db.query('select * from private.user_verifications where user_id=$1',[legacy])).rows[0];assert.equal(record.source,'legacy_session');assert.equal(new Date(previousExpiry)-new Date(record.last_verified_at),24*3600000);
 assert.equal((await db.query('select count(*) n from private.user_verifications where user_id=$1',[suspicious])).rows[0].n,0);
});
