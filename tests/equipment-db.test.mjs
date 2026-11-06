import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/database.mjs';
test('equipment images: real database authorization, atomic association and safe cleanup',async t=>{
 const {db,as,uid,rpc}=await database();t.after(()=>db.close());
 const id=crypto.randomUUID(),other=crypto.randomUUID(),image='equipamento/'+crypto.randomUUID()+'.jpg',next='equipamento/'+crypto.randomUUID()+'.jpg';
 const data={name:'Material de teste',category:'Teste',mandatory:true,notes:'Notas',sort_order:0};
 const save=(action,path,revision=0,target=id,fields=data)=>rpc('equipment_image_save',{p_action:action,p_id:target,p_data:fields,p_path:path,p_expected_revision:revision});
 const root=()=>as('postgres');
 const stage=async path=>{await root();await db.query("insert into storage.objects(bucket_id,name) values('ushe-media',$1)",[path]);};
 await t.test('members, anonymous callers and expired Comando cannot save or call the worker',async()=>{
  await as('a');await assert.rejects(save('replace',image,null),/Apenas o Comando/);
  await assert.rejects(rpc('equipment_media_worker',{p_action:'claim'}),/permission denied/);
  await as('anon');await assert.rejects(save('keep',null,null),/permission denied/);
  await root();await db.query('update private.otp_settings set enabled=true');
  await db.query("insert into private.user_verifications(user_id,verified_email,last_verified_at) values($1,$2,clock_timestamp()-interval '721 hours')",[uid.command,'command@example.invalid']);
  await as('command');await assert.rejects(save('keep',null,null),/Apenas o Comando/);
  await root();await db.query("update private.user_verifications set last_verified_at=clock_timestamp() where user_id=$1",[uid.command]);
 });
 await t.test('a nonexistent object cannot become a reference or leave partial equipment metadata',async()=>{
  await as('command');await assert.rejects(save('replace',image,null),/Imagem indisponível/);
  await root();assert.equal((await db.query('select count(*) n from public.equipment where id=$1',[id])).rows[0].n,0);
 });
 await t.test('normalized staged object is associated to the correct record and audited by backend identity',async()=>{
  await stage(image);await as('command');const saved=await save('replace',image,null);
  assert.equal(saved.equipment.id,id);assert.equal(saved.equipment.image_path,image);assert.equal(saved.equipment.revision,0);
  await root();assert.equal((await db.query('select state from private.equipment_media_files where name=$1',[image])).rows[0].state,'active');
  const audit=(await db.query("select * from private.admin_audit_log where target_id=$1 and action='equipment.image.add'",[id])).rows[0];
  assert.equal(audit.actor_id,uid.command);assert.equal(audit.entity,'equipment');assert.equal(audit.result,'succeeded');
 });
 await t.test('stale edits and invalid metadata fail atomically without changing the current photo',async()=>{
  await stage(next);await as('command');assert.deepEqual(await save('replace',next,999),{ok:false,reason:'conflict'});
  await assert.rejects(save('replace',next,0,id,{...data,name:'x'}),/check constraint/);
  await root();const row=(await db.query('select * from public.equipment where id=$1',[id])).rows[0];assert.equal(row.image_path,image);assert.equal(row.revision,0);
 });
 await t.test('shared images survive replacement and direct Storage removal is blocked even for Comando',async()=>{
  await as('command');await save('replace',image,null,other);await save('replace',next,0);
  assert.equal((await db.query("delete from storage.objects where name=$1 returning name",[image])).rows.length,0);
  await root();assert.equal((await db.query('select state from private.equipment_media_files where name=$1',[image])).rows[0].state,'active');
 });
 await t.test('cleanup claims only unreferenced files and prevents relinks during Storage deletion',async()=>{
  await as('command');await save('remove',null,0,other);
  await root();const plan=(await db.query("select private.equipment_media_worker('claim',null,null) value")).rows[0].value;
  assert.deepEqual(plan.files,[image]);
  await as('command');await assert.rejects(save('replace',image,1,other),/Imagem indisponível/);
  await root();await db.query("select private.equipment_media_worker('finish',$1,false)",[plan.run_id]);
  const queued=(await db.query('select state,failures from private.equipment_media_files where name=$1',[image])).rows[0];assert.equal(queued.state,'queued');assert.equal(queued.failures,1);
  const retry=(await db.query("select private.equipment_media_worker('claim',null,null) value")).rows[0].value;assert.deepEqual(retry.files,[image]);
  // Storage API interface simulated only in local tests; production uses .remove().
  await db.query('delete from storage.objects where name=$1',[image]);await db.query("select private.equipment_media_worker('finish',$1,true)",[retry.run_id]);
  assert.equal((await db.query('select state from private.equipment_media_files where name=$1',[image])).rows[0].state,'deleted');
 });
 await t.test('orphan staging is reclaimed after a crash, but fresh uploads and active files are preserved',async()=>{
  const orphan='equipamento/'+crypto.randomUUID()+'.jpg',fresh='equipamento/'+crypto.randomUUID()+'.jpg';await stage(orphan);await stage(fresh);
  await db.query("update private.equipment_media_files set created_at=clock_timestamp()-interval '16 minutes' where name=$1",[orphan]);
  const plan=(await db.query("select private.equipment_media_worker('claim',null,null) value")).rows[0].value;
  assert.deepEqual(plan.files,[orphan]);assert.ok(!plan.files.includes(next));assert.ok(!plan.files.includes(fresh));
 });
 await t.test('maintenance tickets are private, short-lived and single-use; logs survive equipment deletion',async()=>{
  await root();const ticket=(await db.query('insert into private.equipment_media_runs default values returning id')).rows[0].id;
  const claim=async()=> (await db.query("select private.equipment_media_worker('claim',$1,null) v",[ticket])).rows[0].v;
  assert.equal((await claim()).ok,true);assert.equal((await claim()).ok,false);
  const expired=(await db.query("insert into private.equipment_media_runs(expires_at) values(clock_timestamp()-interval '1 second') returning id")).rows[0].id;
  assert.equal((await db.query("select private.equipment_media_worker('claim',$1,null) v",[expired])).rows[0].v.ok,false);
  const before=(await db.query('select count(*) n from private.admin_audit_log where target_id=$1',[id])).rows[0].n;
  await as('command');await db.query('delete from public.equipment where id=$1',[id]);
  await assert.rejects(db.query('select * from private.equipment_media_runs'),/permission denied/);
  await root();assert.ok((await db.query('select count(*) n from private.admin_audit_log where target_id=$1',[id])).rows[0].n>=before);
  await assert.rejects(db.query('delete from private.admin_audit_log'),/permanentes/);
 });
});
