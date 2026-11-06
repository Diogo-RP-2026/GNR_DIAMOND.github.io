import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/database.mjs';

test('permanent admin audit with private visibility metadata',async t=>{
  const {db,as,uid,rpc}=await database();
  t.after(()=>db.close());
  const root=()=>as('postgres');
  const list=(args={})=>rpc('admin_audit_list',args);
  const hide=id=>rpc('admin_audit_hide',{p_log:id});
  const audit=async(sql,args=[])=> (await db.query(`select * from private.admin_audit_log ${sql} order by occurred_at desc,id desc`,args)).rows;
  const seedName='Coordenação permanente';
  const original=crypto.randomUUID();

  await t.test('anonymous, Members and service credentials cannot list, hide or write logs',async()=>{
    await as('anon');
    await assert.rejects(list(),/permission denied/);
    await assert.rejects(hide(original),/permission denied/);
    await as('a');
    await assert.rejects(list(),/Só o Comando/);
    await assert.rejects(hide(original),/Só o Comando/);
    await as('command');
    await assert.rejects(db.query('select * from private.admin_audit_log'),/permission denied/);
    await assert.rejects(db.query("select private.append_admin_audit('forged','account',null,'Test','succeeded','{}')"),/permission denied/);
    await root();await db.exec('set role service_role');
    await assert.rejects(list(),/permission denied/);
    await assert.rejects(hide(original),/permission denied/);
    await assert.rejects(db.exec('delete from private.admin_audit_log'),/permission denied/);
    await assert.rejects(db.exec('truncate private.admin_audit_log'),/permission denied/);
    await root();
  });

  await t.test('search, result/entity filters and stable cursor pagination are applied in PostgreSQL',async()=>{
    await db.query(`insert into private.admin_audit_log(id,actor_name,action,entity,target_name,result,occurred_at)
      select case when n=1 then $1 else gen_random_uuid() end,$2,'equipment.update','equipment','Material sintético '||n,'succeeded',
      '2026-10-01T12:00:00Z'::timestamptz+(n/2)*interval '1 second' from generate_series(1,25) n`,[original,seedName]);
    const ordered=(await audit('where actor_name=$1',[seedName])).map(row=>row.id);
    await as('command');
    const args={p_query:'COORDENACAO',p_entity:'equipment',p_result:'succeeded'};
    const first=await list(args);
    assert.equal(first.items.length,20);
    assert.deepEqual(first.items.map(row=>row.id),ordered.slice(0,20));
    await root();
    await db.query("insert into private.admin_audit_log(actor_name,action,entity,target_name,result) values($1,'equipment.update','equipment','Novo','succeeded')",[seedName]);
    await as('command');
    const second=await list({...args,p_cursor:first.next_cursor});
    assert.deepEqual(second.items.map(row=>row.id),ordered.slice(20));
    assert.equal(second.next_cursor,null);
    assert.equal((await list({...args,p_entity:'account'})).items.length,0);
    assert.equal((await list({...args,p_result:'failed'})).items.length,0);
    assert.equal((await list({...args,p_query:'%_'})).items.length,0);
    assert.equal((await list({p_query:original})).items[0].id,original);
    await assert.rejects(list({p_cursor:{id:original}}),/Página inválida/);
  });

  await t.test('hide keeps the full original row and records actor and time once, including on retries',async()=>{
    await root();const [before]=await audit('where id=$1',[original]);
    await as('command');
    const first=await hide(original),again=await hide(original);
    assert.equal(first.ok,true);assert.equal(first.already_hidden,false);
    assert.equal(again.already_hidden,true);assert.equal(again.hidden_at,first.hidden_at);
    assert.equal((await list({p_query:original,p_entity:'equipment'})).items.length,0);
    const hidden=(await list({p_visibility:'hidden',p_query:original,p_entity:'equipment'})).items;
    assert.equal(hidden.length,1);assert.equal(hidden[0].hidden_by_name,'Test command');
    assert.equal(hidden[0].hidden_at,first.hidden_at);
    assert.equal((await list({p_visibility:'all',p_query:original,p_entity:'equipment'})).items.length,1);
    assert.deepEqual(await hide(crypto.randomUUID()),{ok:false,reason:'missing'});
    await assert.rejects(db.exec('update private.admin_audit_hidden set hidden_by_name=\'Falsificado\''),/permission denied/);
    await root();
    assert.deepEqual((await audit('where id=$1',[original]))[0],before);
    const [event]=await audit("where action='audit.hide' and target_id=$1",[original]);
    assert.equal(event.actor_id,uid.command);assert.equal(event.result,'succeeded');
    assert.equal((await audit("where action='audit.hide' and target_id=$1",[original])).length,1);
    await assert.rejects(db.query('delete from private.admin_audit_log where id=$1',[original]),/permanentes/);
    await assert.rejects(db.query('delete from private.admin_audit_hidden where log_id=$1',[original]),/permanentes/);
    await assert.rejects(db.exec('truncate private.admin_audit_hidden'),/permanentes/);
  });

  await t.test('real access changes are attributed to Comando and repeated saves add no audit entries',async()=>{
    await as('command');
    const args={p_user:uid.a,p_role:'member',p_approved:false,p_tabs:[{tab:'equipamento',actor_name:'Forged author'},{tab:'registos',can_create:true}]};
    await rpc('set_user_access',args);
    await root();
    const entries=await audit('where target_id=$1 and actor_id=$2',[uid.a,uid.command]);
    assert.ok(entries.some(row=>row.action==='account.access.update'&&row.details.approved_before===true&&row.details.approved_after===false));
    assert.ok(entries.some(row=>row.action==='account.tab.insert'&&row.details.tab==='equipamento'));
    assert.ok(entries.some(row=>row.action==='account.tab.update'&&row.details.can_create_after===true));
    assert.ok(!JSON.stringify(entries).includes('Forged author'));
    await as('command');await rpc('set_user_access',args);
    await root();assert.equal((await audit('where target_id=$1 and actor_id=$2',[uid.a,uid.command])).length,entries.length);
    await db.query('delete from auth.users where id=$1',[uid.a]);
    assert.deepEqual(await audit('where target_id=$1 and actor_id=$2',[uid.a,uid.command]),entries);
  });

  await t.test('official profile, subunit and qualification writes audit only permitted fields',async()=>{
    await root();
    const member=crypto.randomUUID();
    await db.query("insert into public.members(id,name,rank,uniform_number) values($1,'Agente de teste','Operacional',999)",[member]);
    const profile={p_member:member,p_data:{rank:'Oficial',callsign:'A-91'},p_subunits:['Patrulha']};
    await as('command');await rpc('save_agent_official',profile);
    await root();const before=await audit('where target_id=$1',[member]);
    assert.ok(before.some(row=>row.action==='profile.official.update'&&row.actor_id===uid.command&&row.details.rank_after==='Oficial'));
    assert.ok(before.some(row=>row.action==='profile.subunit.create'&&row.details.subunit==='Patrulha'));
    await as('command');await rpc('save_agent_official',profile);
    const qualification=crypto.randomUUID();
    await db.query("insert into public.agent_qualifications(id,member_id,kind,name,completed_on,issuer) values($1,$2,'formacao','Curso de teste',current_date,'SENSITIVE_FIXTURE_CONTENT')",[qualification,member]);
    await root();assert.deepEqual(await audit('where target_id=$1',[member]),before);
    const [entry]=await audit('where target_id=$1',[qualification]);
    assert.equal(entry.actor_id,uid.command);assert.equal(entry.details.member_id,member);
    assert.ok(entry.details.fields.includes('issuer'));assert.ok(!JSON.stringify(entry).includes('SENSITIVE_FIXTURE_CONTENT'));
  });

  await t.test('equipment CRUD and save conflicts are audited with snapshots that survive deletion',async()=>{
    await as('command');
    const id=crypto.randomUUID();
    await db.query("insert into public.equipment(id,name,category) values($1,'Equipamento sintético','Teste')",[id]);
    await db.query("update public.equipment set mandatory=true,notes='SENSITIVE_FIXTURE_NOTE' where id=$1",[id]);
    const conflict=await rpc('equipment_image_save',{p_action:'keep',p_id:id,p_data:{name:'Alteração desatualizada',category:'Teste'},p_expected_revision:0});
    assert.deepEqual(conflict,{ok:false,reason:'conflict'});
    await db.query('delete from public.equipment where id=$1',[id]);
    await root();const entries=await audit('where target_id=$1',[id]);
    assert.deepEqual(entries.map(row=>row.action),['equipment.delete','equipment.save','equipment.update','equipment.create']);
    assert.equal(entries[1].result,'failed');assert.equal(entries[1].details.reason,'conflict');
    assert.ok(entries.every(row=>row.actor_id===uid.command&&row.target_name==='Equipamento sintético'));
    assert.ok(!JSON.stringify(entries).includes('SENSITIVE_FIXTURE_NOTE'));
  });

  await t.test('verification expiry and revoked sessions block the same Comando identity',async()=>{
    await root();await db.exec('update private.otp_settings set enabled=true');
    await db.query("insert into private.user_verifications(user_id,verified_email,last_verified_at) values($1,'command@example.invalid',clock_timestamp()-interval '721 hours')",[uid.command]);
    await as('command');await assert.rejects(list(),/Só o Comando/);await assert.rejects(hide(original),/Só o Comando/);
    await root();await db.query('update private.user_verifications set last_verified_at=clock_timestamp() where user_id=$1',[uid.command]);
    await as('command');assert.ok((await list()).items.length>0);
    await root();await db.query('delete from auth.sessions where user_id=$1',[uid.command]);
    await as('command');await assert.rejects(list(),/Só o Comando/);
  });
});
