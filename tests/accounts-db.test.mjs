import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/database.mjs';
test('account deletion: current permissions, protected command, historical snapshots and resumable failures',async t=>{
 const {db,as,uid,rpc}=await database();t.after(()=>db.close());
 const admin=()=>as('command'),root=()=>as('postgres');
 const createTarget=async()=>{
  await root();const id=crypto.randomUUID(),member=crypto.randomUUID();
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,id+'@example.invalid',{full_name:'Deletion test'}]);
  await db.query('update public.profiles set approved=true where id=$1',[id]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);
  await db.query("insert into public.members(id,user_id,name,rank,uniform_number,image_path) values($1,$2,'Former agent','Operacional',(select max(uniform_number)+1 from public.members),$3)",[member,id,'equipa/'+id+'.jpg']);
  await db.query('insert into storage.objects(bucket_id,name,owner,owner_id) values($1,$2,$3,$4)',['ushe-avatars',id+'/photo.jpg',id,id]);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['ushe-media','equipa/'+id+'.jpg']);
  await db.query('insert into public.agent_personal(member_id,biography,avatar_path) values($1,$2,$3)',[member,'Biography',id+'/photo.jpg']);
  return {id,member};
 };
 await t.test('members cannot start/list/finalize deletion; forged metadata does not grant Comando',async()=>{
  await as('a');assert.deepEqual(await rpc('account_admin',{p_action:'begin',p_target:uid.b}),{ok:false,reason:'forbidden'});
  assert.deepEqual(await rpc('account_admin',{p_action:'list'}),{ok:false,reason:'forbidden'});
  await assert.rejects(db.query('delete from auth.users where id=$1',[uid.b]),/permission denied/);
  await assert.rejects(db.query('delete from public.profiles where id=$1',[uid.b]),/permission denied/);
  await assert.rejects(db.exec('select * from private.account_deletions'),/permission denied/);
 });
 await t.test('another Comando cannot demote or delete Comando, including direct database/Auth paths',async()=>{
  await admin();await rpc('set_user_access',{p_user:uid.b,p_role:'command',p_approved:true,p_tabs:[]});
  assert.equal((await rpc('account_admin',{p_action:'begin',p_target:uid.b})).reason,'protected');
  await assert.rejects(rpc('set_user_access',{p_user:uid.b,p_role:'member',p_approved:true,p_tabs:[]}),/Comando/);
  await root();await assert.rejects(db.query("update public.profiles set role='member' where id=$1",[uid.b]),/Comando/);
  await assert.rejects(db.query('delete from auth.users where id=$1',[uid.b]),/Comando/);
  await assert.rejects(db.query('delete from public.profiles where id=$1',[uid.b]),/Comando/);
 });
 await t.test('current approval and live session override an old Comando JWT',async()=>{
  await root();await db.query('update public.profiles set approved=false where id=$1',[uid.b]);
  await as('b');assert.equal((await rpc('account_admin',{p_action:'begin',p_target:uid.a})).reason,'forbidden');
  await root();await db.query('update public.profiles set approved=true where id=$1',[uid.b]);await db.query('delete from auth.sessions where user_id=$1',[uid.b]);
  await as('b');assert.equal((await rpc('account_admin',{p_action:'begin',p_target:uid.a})).reason,'forbidden');
 });
 await t.test('plan revokes open sessions, freezes relinking/promotion/uploads and will not finish before Storage removal',async()=>{
  const {id,member}=await createTarget();await admin();
  const plan=await rpc('account_admin',{p_action:'begin',p_target:id});assert.equal(plan.ok,true);assert.equal(plan.files.length,2);
  assert.equal((await rpc('account_admin',{p_action:'finish',p_target:id,p_operation:plan.operation_id})).reason,'photos_remaining');
  await assert.rejects(rpc('set_user_access',{p_user:id,p_role:'command',p_approved:true,p_tabs:[]}),/pendente/);
  await root();await assert.rejects(db.query('update public.members set user_id=null where id=$1',[member]),/pendente/);
  await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['ushe-avatars',id+'/late.jpg']),/indisponível/);
  // The actual RLS function sees the same old session_id and blocks the JWT.
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,session_id:id,exp:Math.floor(Date.now()/1000)+3600})]);await db.exec('set role authenticated');
  assert.equal((await db.query('select public.otp_session_verified() as allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select * from public.profiles')).rows.length,0);
  await admin();const again=await rpc('account_admin',{p_action:'begin',p_target:id});assert.equal(again.operation_id,plan.operation_id);
 });
 await t.test('Comando removes Auth, profile, member and photos while logs, warnings and author snapshots survive',async()=>{
  const {id,member}=await createTarget();await root();
  const log=(await db.query("insert into public.event_logs(event_type,starts_at,ends_at,location,summary,created_by) values('Teste','2026-12-01T10:00Z','2026-12-01T11:00Z','Local','Historic record',$1) returning id",[id])).rows[0].id;
  const warning=(await db.query("insert into public.warnings(title,conduct,sanction,issued_on) values('Aviso de teste','Teste','Aviso','2026-11-01') returning id")).rows[0].id;
  await db.query('insert into public.event_log_participants(log_id,member_id) values($1,$2)',[log,member]);await db.query('insert into public.warning_members(warning_id,member_id) values($1,$2)',[warning,member]);
  await admin();const plan=await rpc('account_admin',{p_action:'begin',p_target:id});
  await root();for(const file of plan.files)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[file.bucket_id,file.name]);
  await admin();assert.equal((await rpc('account_admin',{p_action:'finish',p_target:id,p_operation:plan.operation_id})).ok,true);
  assert.equal((await rpc('account_admin',{p_action:'begin',p_target:id})).status,'completed');
  const feed=await rpc('portal_feed',{p_kind:'log',p_target:log});const participant=feed.items[0].record.event_log_participants[0];assert.equal(participant.name,'Former agent');assert.equal(participant.member_id,null);
  // Editing a document retains detached participants even with no live selection.
  await rpc('save_log',{p_id:log,p_data:{event_type:'Teste',starts_at:'2026-12-01T10:00Z',ends_at:'2026-12-01T11:00Z',location:'Local',summary:'Updated historic record'},p_members:[]});
  await rpc('save_warning',{p_id:warning,p_data:{title:'Aviso de teste',conduct:'Teste',sanction:'Aviso',issued_on:'2026-11-01',signature:'Comando'},p_members:[]});
  await root();for(const table of ['auth.users','auth.sessions','public.profiles'])assert.equal((await db.query('select count(*) n from '+table+' where id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('select count(*) n from public.members where id=$1',[member])).rows[0].n,0);
  assert.equal((await db.query('select count(*) n from public.agent_personal where member_id=$1',[member])).rows[0].n,0);
  assert.equal((await db.query('select count(*) n from public.event_logs where id=$1',[log])).rows[0].n,1);
  assert.equal((await db.query('select created_by,created_by_name from public.event_logs where id=$1',[log])).rows[0].created_by_name,'Deletion test');
  for(const [table,key,value] of [['event_log_participants','log_id',log],['warning_members','warning_id',warning]]){const p=(await db.query('select * from public.'+table+' where '+key+'=$1',[value])).rows[0];assert.equal(p.member_id,null);assert.equal(p.member_snapshot.name,'Former agent');}
  const audit=(await db.query("select * from private.admin_audit_log where target_id=$1 and action='account.delete' and result='succeeded'",[id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].actor_id,uid.command);assert.equal(audit[0].target_name,'Former agent');
 });
 await t.test('storage/database failure is resumable and Auth/profile/member deletion is atomic',async()=>{
  const {id,member}=await createTarget();await admin();const plan=await rpc('account_admin',{p_action:'begin',p_target:id});
  await rpc('account_admin',{p_action:'storage_failure',p_target:id,p_operation:plan.operation_id});
  assert.ok((await rpc('account_admin',{p_action:'list'})).jobs.some(j=>j.target_id===id&&j.status==='failed'));
  await root();for(const file of plan.files)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[file.bucket_id,file.name]);
  await db.exec(`create function public.test_delete_failure() returns trigger language plpgsql as $$begin raise exception 'test only';end$$;create trigger test_delete_failure before delete on auth.users for each row execute function public.test_delete_failure();`);
  await admin();assert.equal((await rpc('account_admin',{p_action:'finish',p_target:id,p_operation:plan.operation_id})).reason,'database');
  await root();assert.equal((await db.query('select count(*) n from public.profiles where id=$1',[id])).rows[0].n,1);assert.equal((await db.query('select count(*) n from public.members where id=$1',[member])).rows[0].n,1);
  await db.exec('drop trigger test_delete_failure on auth.users;drop function public.test_delete_failure();');
  await admin();assert.equal((await rpc('account_admin',{p_action:'finish',p_target:id,p_operation:plan.operation_id})).status,'completed');
 });
 await t.test('shared image survives and audit content cannot be edited/deleted/truncated or forged',async()=>{
  const {id}=await createTarget();await root();await db.query("insert into public.members(name,rank,uniform_number,image_path) values('Shared photo agent','Operacional',(select max(uniform_number)+1 from public.members),$1)",['equipa/'+id+'.jpg']);
  await admin();const plan=await rpc('account_admin',{p_action:'begin',p_target:id});assert.equal(plan.files.length,1);
  await root();for(const file of plan.files)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[file.bucket_id,file.name]);
  await admin();assert.equal((await rpc('account_admin',{p_action:'finish',p_target:id,p_operation:plan.operation_id})).ok,true);
  await assert.rejects(db.exec("insert into private.admin_audit_log(actor_name,action,target_name,result) values('Forged','delete','Test','succeeded')"),/permission denied/);
  await assert.rejects(db.exec('delete from private.admin_audit_log'),/permission denied/);
  await root();assert.equal((await db.query('select count(*) n from storage.objects where name=$1',['equipa/'+id+'.jpg'])).rows[0].n,1);
  await assert.rejects(db.exec('delete from private.admin_audit_log'),/permanentes/);await assert.rejects(db.exec('truncate private.admin_audit_log cascade'),/permanentes/);await assert.rejects(db.exec("update private.admin_audit_log set actor_name='Forged'"),/permanentes/);
 });
});
