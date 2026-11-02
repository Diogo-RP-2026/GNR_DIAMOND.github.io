// PostgreSQL real em WASM: testa as políticas sem necessitar de um projeto remoto.
// Os esquemas auth/storage abaixo simulam apenas as interfaces do Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('permissões, votos, documentos e fotografias são protegidos por PostgreSQL/RLS',async t=>{
  const db=new PGlite();
  const sql=async(q,p=[])=>db.query(q,p);
  const uid={admin:'10000000-0000-4000-8000-000000000001',member:'10000000-0000-4000-8000-000000000002',pending:'10000000-0000-4000-8000-000000000003',other:'10000000-0000-4000-8000-000000000004'};
  const as=async(role,id='')=>{await db.exec('reset role');await sql("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);};
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/01_schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/02_seed.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/04_estatisticas_publicas.sql',import.meta.url),'utf8'));
  for(const [name,id] of Object.entries(uid))await sql('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${name}@example.test`,JSON.stringify({full_name:name,role:'command',approved:true})]);
  await sql("update public.profiles set role='command',approved=true where id=$1",[uid.admin]);
  const event='e0000000-0000-4000-8000-000000000001';
  await t.test('anon recebe só títulos e contagem; não recebe dados internos',async()=>{
    await as('anon');
    assert.equal((await sql('select * from public.home_announcements()')).rows.length,2);
    assert.equal((await sql('select public.active_member_count() as n')).rows[0].n,22);
    assert.deepEqual((await sql('select public.unit_statistics() as data')).rows[0].data,{member_count:22,rank_count:7,training_count:0});
    assert.equal((await sql('select * from public.contact_info')).rows.length,1);
    await assert.rejects(sql('select * from public.members'),/permission denied/);
    await assert.rejects(sql('select * from public.announcements'),/permission denied/);
    await assert.rejects(sql('select public.member_options()'),/permission denied/);
  });
  await t.test('metadados de registo não atribuem Comando nem aprovação',async()=>{
    await as('authenticated',uid.pending);
    const p=(await sql('select * from public.profiles')).rows;
    assert.equal(p.length,1);assert.equal(p[0].role,'member');assert.equal(p[0].approved,false);
    assert.equal((await sql('select * from public.events')).rows.length,0);
    await assert.rejects(sql("update public.profiles set role='command' where id=$1",[uid.pending]),/permission denied/);
    await assert.rejects(sql('select public.set_user_access($1,$2,$3,$4)',[uid.pending,'command',true,'[]']),/Só o Comando/);
  });
  await t.test('Comando aprova acessos individuais sem permitir auto-promoção',async()=>{
    await as('authenticated',uid.admin);
    await sql('select public.set_user_access($1,$2,$3,$4)',[uid.member,'member',true,JSON.stringify([{tab:'eventos'},{tab:'registos',can_create:true}])]);
    await sql('select public.set_user_access($1,$2,$3,$4)',[uid.other,'member',true,JSON.stringify([{tab:'eventos'},{tab:'anuncios'},{tab:'registos'}])]);
    await assert.rejects(sql('select public.set_user_access($1,$2,$3,$4)',[uid.admin,'member',true,'[]']),/próprio acesso/);
    await as('authenticated',uid.member);
    assert.equal((await sql('select * from public.members')).rows.length,0);
    assert.equal((await sql('select * from public.announcements')).rows.length,0);
    assert.equal((await sql('select * from public.events')).rows.length,1);
    assert.equal((await sql('select * from public.member_options()')).rows.length,22);
    await assert.rejects(sql("insert into public.tab_permissions values($1,'equipa',false)",[uid.member]),/permission denied/);
    await assert.rejects(sql("insert into public.announcements(title,body,kind) values('Teste','Não permitido','Evento')"),/row-level security/);
  });
  await t.test('cada utilizador tem um voto e pode alterá-lo; não altera votos de terceiros',async()=>{
    await sql('insert into public.event_responses(event_id,user_id,attending) values($1,$2,true)',[event,uid.member]);
    await sql('insert into public.event_responses(event_id,user_id,attending) values($1,$2,false) on conflict(event_id,user_id) do update set attending=excluded.attending',[event,uid.member]);
    const rows=(await sql('select * from public.response_names($1,$2)',['event',event])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].attending,false);assert.equal(rows[0].full_name,'member');
    await as('authenticated',uid.other);
    assert.equal((await sql('update public.event_responses set attending=true where user_id=$1 returning *',[uid.member])).rows.length,0);
    await sql('insert into public.event_responses(event_id,user_id,attending) values($1,$2,true)',[event,uid.other]);
    await assert.rejects(sql('insert into public.event_responses(event_id,user_id,attending) values($1,$2,true)',[event,uid.pending]),/row-level security/);
  });
  let logId;
  await t.test('registos exigem autorização de criação e mantêm participantes atomicamente',async()=>{
    await as('authenticated',uid.member);
    const m=(await sql('select * from public.member_options()')).rows[0];
    const data={event_type:'Registo Hospitalar',starts_at:'2026-11-02T10:00:00Z',ends_at:'2026-11-02T11:00:00Z',location:'Hospital',summary:'Registo de teste',observations:''};
    logId=(await sql('select public.save_log(null,$1,$2) as id',[data,[m.id]])).rows[0].id;
    assert.equal((await sql('select * from public.event_log_participants where log_id=$1',[logId])).rows.length,1);
    await assert.rejects(sql('select public.save_log(null,$1,$2)',[{...data,ends_at:data.starts_at},[m.id]]),/check constraint/);
    assert.equal((await sql('select * from public.event_logs')).rows.length,1);
    await as('authenticated',uid.other);
    await assert.rejects(sql('select public.save_log(null,$1,$2)',[data,[m.id]]),/Sem permissão/);
    assert.equal((await sql("update public.event_logs set summary='alterado' where id=$1 returning *",[logId])).rows.length,0);
  });
  await t.test('fotografias privadas obedecem à aba; só Comando carrega',async()=>{
    await as('authenticated',uid.admin);
    await sql("insert into storage.objects(bucket_id,name) values('ushe-media','fardamento/test.png')");
    await as('authenticated',uid.member);
    assert.equal((await sql('select * from storage.objects')).rows.length,0);
    await assert.rejects(sql("insert into storage.objects(bucket_id,name) values('ushe-media','fardamento/mau.png')"),/row-level security/);
    await as('authenticated',uid.admin);
    await sql('select public.set_user_access($1,$2,$3,$4)',[uid.member,'member',true,JSON.stringify([{tab:'eventos'},{tab:'fardamento'}])]);
    await as('authenticated',uid.member);
    assert.equal((await sql('select * from storage.objects')).rows.length,1);
  });
  await t.test('retirar aprovação corta leitura e voto com o mesmo JWT',async()=>{
    await as('authenticated',uid.admin);
    await sql('select public.set_user_access($1,$2,$3,$4)',[uid.member,'member',false,JSON.stringify([{tab:'eventos'}])]);
    await as('authenticated',uid.member);
    assert.equal((await sql('select * from public.events')).rows.length,0);
    assert.equal((await sql('select * from storage.objects')).rows.length,0);
    await assert.rejects(sql('select * from public.response_names($1,$2)',['event',event]),/Acesso não autorizado/);
    await assert.rejects(sql('insert into public.event_responses(event_id,user_id,attending) values($1,$2,true) on conflict(event_id,user_id) do update set attending=true',[event,uid.member]),/row-level security/);
  });
  await t.test('avisos e participantes são gravados em transação',async()=>{
    await as('authenticated',uid.admin);
    const member=(await sql('select * from public.members limit 1')).rows[0];
    const doc={title:'2ª REPREENSÃO ESCRITA',conduct:'a) Teste.',sanction:'2º Aviso',issued_on:'2026-11-02',signature:'Comando'};
    const before=(await sql('select count(*) as n from public.warnings')).rows[0].n;
    await assert.rejects(sql('select public.save_warning(null,$1,$2)',[doc,['99999999-9999-4999-8999-999999999999']]),/foreign key constraint/);
    assert.equal((await sql('select count(*) as n from public.warnings')).rows[0].n,before);
    await sql('select public.save_warning(null,$1,$2)',[doc,[member.id]]);
    assert.equal((await sql('select count(*) as n from public.warnings')).rows[0].n,Number(before)+1);
  });
  await t.test('estatísticas de treinos revelam apenas a contagem e mantêm os documentos privados',async()=>{
    await as('authenticated',uid.admin);
    await sql("insert into public.event_logs(event_type,starts_at,ends_at,location,summary) values('Treino','2026-11-03T10:00Z','2026-11-03T11:00Z','Quartel','Documento reservado')");
    await as('anon');
    const metrics=(await sql('select public.unit_statistics() as data')).rows[0].data;
    assert.equal(metrics.training_count,1);assert.deepEqual(Object.keys(metrics).sort(),['member_count','rank_count','training_count']);
    await assert.rejects(sql('select * from public.event_logs'),/permission denied/);
  });
  await db.close();
});
