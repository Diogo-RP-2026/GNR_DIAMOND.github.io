import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/database.mjs';
test('notification retention: read-only purge, owner permissions, server read time and permanent logs',async t=>{
 const {db,as,uid,rpc}=await database();t.after(()=>db.close());
 const ids=Object.fromEntries(['recentRead','oldRead','otherRead','oldUnread','otherUnread'].map(name=>[name,crypto.randomUUID()]));
 await as('postgres');
 for(const [name,id] of Object.entries(ids)){
  const owner=name.startsWith('other')?uid.b:uid.a,read=name.endsWith('Read');
  await db.query(`insert into public.notifications(id,recipient_id,title,message,type,target_kind,target_id,dedupe_key,created_at,read_at)
   values($1::uuid,$2,$3,'Teste','access','access',$2,($1::uuid)::text,clock_timestamp()-interval '90 days',case when $4 then clock_timestamp() else null end)`,[id,owner,name,read]);
 }
 const audit=(await db.query("insert into private.admin_audit_log(actor_id,actor_name,action,target_id,target_name,result) values($1,'Comando','notification.test',$2,'Membro','succeeded') returning *",[uid.command,uid.a])).rows[0];
 const log=(await db.query("insert into public.event_logs(event_type,starts_at,ends_at,location,summary) values('Teste de histórico',now(),now()+interval '1 hour','QA','Preservar') returning *")).rows[0];
 await t.test('even Comando cannot read/mark notifications belonging to a different account',async()=>{
  for(const who of ['b','command']){
   await as(who);assert.equal((await db.query('select id from public.notifications where id=$1',[ids.oldUnread])).rows.length,0);
   await rpc('mark_notifications_read',{p_ids:[ids.oldUnread]});
  }
  await as('postgres');assert.equal((await db.query('select read_at from public.notifications where id=$1',[ids.oldUnread])).rows[0].read_at,null);
 });
 await t.test('browser/anonymous/service roles cannot invoke the global purge; browser cannot DELETE',async()=>{
  await as('a');await assert.rejects(db.exec('select private.purge_read_notifications()'),/permission denied/);
  await assert.rejects(db.exec('delete from public.notifications'),/permission denied/);
  await as('postgres');
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.purge_read_notifications()','EXECUTE') as allowed",[role])).rows[0].allowed,false);
 });
 await t.test('a sweep deletes reads immediately, preserves old unread messages and does not alter any logs',async()=>{
  const before=await db.query('select * from public.notifications where id=any($1::uuid[]) order by id',[[ids.oldUnread,ids.otherUnread]]);
  const purged=(await db.query('select private.purge_read_notifications() as n')).rows[0].n;assert.equal(Number(purged),3);
  assert.deepEqual((await db.query('select * from public.notifications where id=any($1::uuid[]) order by id',[[ids.oldUnread,ids.otherUnread]])).rows,before.rows);
  assert.deepEqual((await db.query('select * from private.admin_audit_log where id=$1',[audit.id])).rows[0],audit);
  assert.deepEqual((await db.query('select * from public.event_logs where id=$1',[log.id])).rows[0],log);
  assert.equal(Number((await db.query('select private.purge_read_notifications() as n')).rows[0].n),0);
 });
 await t.test('read time is stamped by the server and a just-read notification can be removed on the next run',async()=>{
  await as('a');await db.query("update public.notifications set read_at='2099-01-01' where id=$1",[ids.oldUnread]);
  await as('postgres');const timestamp=(await db.query('select read_at from public.notifications where id=$1',[ids.oldUnread])).rows[0].read_at;assert.ok(new Date(timestamp).getFullYear()<2099);
  await db.query('select private.purge_read_notifications()');assert.equal((await db.query('select id from public.notifications where id=$1',[ids.oldUnread])).rows.length,0);
  assert.equal((await db.query('select read_at from public.notifications where id=$1',[ids.otherUnread])).rows[0].read_at,null);
 });
 await t.test('mark all applies to the current owner beyond one page and keeps newer arrivals unread',async()=>{
  await db.query(`insert into public.notifications(recipient_id,title,message,type,target_kind,target_id,dedupe_key,created_at)
   select $1,'Notificação '||n,'Teste','access','access',$1,'cleanup-bulk:'||n,clock_timestamp()-interval '1 day' from generate_series(1,1107)n`,[uid.a]);
  await as('a');const page=await rpc('inbox_page');assert.equal(page.items.length,20);
  await as('postgres');const fresh=(await db.query("insert into public.notifications(recipient_id,title,message,type,target_kind,target_id,dedupe_key,created_at) values($1,'Chegou depois','Teste','access','access',$1,'cleanup-after-snapshot',clock_timestamp()+interval '1 second') returning id",[uid.a])).rows[0].id;
  await as('a');await rpc('mark_notifications_read',{p_before:page.snapshot});const after=await rpc('inbox_page');assert.equal(Number(after.unread),1);
  await as('postgres');await db.query('select private.purge_read_notifications()');
  assert.equal((await db.query("select count(*) n from public.notifications where dedupe_key like 'cleanup-bulk:%'")).rows[0].n,0);
  assert.equal((await db.query('select read_at from public.notifications where id=$1',[fresh])).rows[0].read_at,null);
  assert.equal((await db.query('select read_at from public.notifications where id=$1',[ids.otherUnread])).rows[0].read_at,null);
 });
});
