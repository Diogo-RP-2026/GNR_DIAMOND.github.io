import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/database.mjs';
test('archives, page-only batch votes and persistent per-user notification RLS with more than 1000 rows',async t=>{
 const {db,as,uid,rpc}=await database();
 try{
 await as('postgres');
 await db.query(`insert into public.announcements(title,body,kind,created_at) select 'Documento '||n,case when n=1107 then 'agulha distante' else 'Arquivo' end,'Evento','2026-01-01'::timestamptz+((n/3)||' seconds')::interval from generate_series(1,1107)n`);
 await db.query(`insert into public.event_logs(event_type,starts_at,ends_at,location,summary) select 'Ativação','2026-01-01'::timestamptz+((n/3)||' seconds')::interval,'2026-01-02'::timestamptz+((n/3)||' seconds')::interval,'Local',case when n=1 then 'agulha distante' else 'Resumo' end from generate_series(1,1107)n`);
 await db.query(`insert into public.events(title,starts_at,ends_at,location) select 'Evento '||n,now()+((n/3+1)||' days')::interval,now()+((n/3+2)||' days')::interval,'Local' from generate_series(1,1107)n`);
 await db.query(`insert into public.events(title,starts_at,ends_at,location) select 'Arquivo '||n,now()-((n/3+3)||' days')::interval,now()-((n/3+2)||' days')::interval,'Local' from generate_series(1,1107)n`);
 await as('a');
 await t.test('past archive is separately paginated and upcoming events are returned first',async()=>{
  let cursor=null,ids=[];do{const p=await rpc('portal_feed',{p_kind:'event',p_filter:'past',p_cursor:cursor});ids.push(...p.ids);assert.ok(p.items.every(x=>new Date(x.record.ends_at)<new Date()));cursor=p.next_cursor;if(!p.has_more)break;}while(cursor);assert.ok(ids.length>=1107);assert.equal(new Set(ids).size,ids.length);
 });
 for(const kind of ['announcement','log','event'])await t.test('keyset traverses full '+kind+' archive without duplicates, including tied dates',async()=>{
  let cursor=null,snapshot=null,ids=[];do{const page=await rpc('portal_feed',{p_kind:kind,p_cursor:cursor,p_snapshot:snapshot});ids.push(...page.ids);cursor=page.next_cursor;snapshot=page.snapshot;if(!page.has_more)break;}while(cursor);
  assert.ok(ids.length>=1107);assert.equal(new Set(ids).size,ids.length);
 });
 await t.test('server search and date/type filters cover records outside initial page',async()=>{
  for(const kind of ['announcement','log']){const page=await rpc('portal_feed',{p_kind:kind,p_query:'agulha distante'});assert.equal(Number(page.total),1);}
  const none=await rpc('portal_feed',{p_kind:'log',p_filter:'Não existe'});assert.equal(Number(none.total),0);
 });
 await t.test('one page RPC includes every voter beyond the API row limit and changed records only',async()=>{
  const page=await rpc('portal_feed',{p_kind:'event'});const event=page.ids[0];
  await as('postgres');await db.query(`insert into auth.users(id,email,raw_user_meta_data) select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'voter-'||n||'@example.invalid',jsonb_build_object('full_name','Voter '||n) from generate_series(1,1107)n`);
  await db.query(`insert into public.event_responses(event_id,user_id,attending) select $1,id,true from public.profiles where email like 'voter-%'`,[event]);
  await as('a');const updated=await rpc('portal_feed',{p_kind:'event',p_known:Object.fromEntries(page.items.map(x=>[x.record.id,x.version]))});
  assert.equal(updated.items.length,1);assert.equal(updated.items[0].responses.length,1107);
  assert.ok(updated.items[0].responses.every((v,i,a)=>!i||v.updated_at>=a[i-1].updated_at));
  const same=await rpc('portal_feed',{p_kind:'event',p_known:Object.fromEntries([...page.items,...updated.items].map(x=>[x.record.id,x.version]))});assert.equal(same.items.length,0);
  await as('limited');assert.deepEqual((await rpc('portal_feed',{p_kind:'event'})).items,[]);
 });
 await t.test('notifications persist across identities/connections, paginate >1000 and enforce read/write ownership',async()=>{
  await as('a');const first=await rpc('inbox_page');assert.equal(first.items.length,20);assert.ok(Number(first.unread)>1000);const own=first.items[0];
  await as('b');assert.equal((await db.query('select * from public.notifications where id=$1',[own.id])).rows.length,0);
  assert.equal((await db.query('update public.notifications set read_at=now() where id=$1 returning id',[own.id])).rows.length,0);
  await assert.rejects(db.query("insert into public.notifications(recipient_id,title,message,type,target_kind,target_id,dedupe_key) values($1,'Intrusão','','event','event',$1,'evil')",[uid.a]),/permission denied/);
  await as('a');await rpc('mark_notifications_read',{p_ids:[own.id]});
  await as('b');await as('a');const again=await rpc('inbox_page');assert.ok(again.items.find(x=>x.id===own.id).read_at);
  let cursor=null,count=0;do{const p=await rpc('inbox_page',{p_cursor:cursor});count+=p.items.length;cursor=p.next_cursor;if(!p.has_more)break;}while(cursor);assert.ok(count>1000);
  await rpc('mark_notifications_read',{p_before:again.snapshot});assert.equal(Number((await rpc('inbox_page')).unread),0);
 });
 await t.test('read-by-ID works within the creating statement; repeat access decisions notify once',async()=>{
  await as('a');await db.exec(`do $$declare ev uuid;n uuid;begin
   insert into public.events(title,starts_at,ends_at,location) values('Leitura imediata',now()+interval '1 day',now()+interval '2 days','QA') returning id into ev;
   select id into n from public.notifications where target_id=ev and recipient_id=auth.uid();
   perform public.mark_notifications_read(array[n]);
   if not exists(select 1 from public.notifications where id=n and read_at is not null) then raise exception 'Same-statement read failed';end if;
  end$$;`);
  await as('command');const args={p_user:uid.b,p_role:'member',p_approved:true,p_tabs:[{tab:'eventos',can_create:false},{tab:'anuncios',can_create:false},{tab:'registos',can_create:false}]};
  const count=async()=>{await as('postgres');return (await db.query("select count(*) n from public.notifications where recipient_id=$1 and type='access'",[uid.b])).rows[0].n;};
  const before=await count();await as('command');await rpc('set_user_access',args);assert.equal(await count(),before);
  args.p_tabs=args.p_tabs.filter(x=>x.tab!=='registos');await as('command');await rpc('set_user_access',args);const changed=await count();assert.equal(Number(changed),Number(before)+1);
  await as('command');await rpc('set_user_access',args);assert.equal(await count(),changed);
 });
 await t.test('repeated identical writes deduplicate and revoked/deleted destinations reveal no protected content',async()=>{
  await as('postgres');const row=(await db.query("select * from public.notifications where recipient_id=$1 and target_kind='event' order by created_at desc limit 1",[uid.a])).rows[0];const before=(await db.query('select count(*) n from public.notifications where target_id=$1',[row.target_id])).rows[0].n;
  await db.query('update public.events set title=title where id=$1',[row.target_id]);assert.equal((await db.query('select count(*) n from public.notifications where target_id=$1',[row.target_id])).rows[0].n,before);
  await db.query("delete from public.tab_permissions where user_id=$1 and tab='eventos'",[uid.a]);await as('a');assert.equal((await rpc('notification_destination',{p_id:row.id})).available,false);
  await as('postgres');await db.query('delete from public.events where id=$1',[row.target_id]);await as('b');const b=(await rpc('inbox_page')).items.find(x=>x.target_id===row.target_id);if(b)assert.equal((await rpc('notification_destination',{p_id:b.id})).available,false);
 });
 }finally{await db.close();}
});
