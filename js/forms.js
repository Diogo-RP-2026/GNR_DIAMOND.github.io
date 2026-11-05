import {startOTP} from './otp.js';
import {accountDeletionControls} from './accounts.js';
// Formulários reutilizáveis. Os documentos com participantes usam funções SQL atómicas.
import {e,RANKS,PIECES,TABS,lisbonInput,lisbonISO,dateRange,discordURL,errorMessage,toast,uniform} from './core.js';
import {db,state,loadOtpPolicy,isCommand,canManageEvent,canLog,hasTab,result,rpc,save,upload,releaseImages} from './api.js';

const fields={
  agent_qualifications:[['kind','Tipo','select',true,['formacao','especializacao']],['name','Nome','text',true],['completed_on','Data de conclusão','date',true],['issuer','Entidade ou instrutor responsável','text']],
  agent_distinctions:[['name','Nome','text',true],['description','Descrição','textarea'],['awarded_on','Data de atribuição','date',true],['symbol','Símbolo / insígnia (texto ou emoji)','text']],
  members:[['uniform_number','Número de uniforme','number',true],['name','Nome','text',true],['callsign','Indicativo','text'],['rank','Patente','select',true,RANKS],['active','Elemento no ativo','checkbox']],
  announcements:[['title','Título','text',true],['kind','Tipo','select',true,['Evento','Reunião','Comunicado Oficial']],['body','Texto do anúncio','textarea',true],['author_name','Autor e patente','text',true],['created_at','Data e hora de publicação','datetime-local',true],['published','Publicado (o título aparece no Início)','checkbox'],['allow_responses','Permitir respostas de disponibilidade','checkbox']],
  events:[['title','Título','text',true],['description','Descrição','textarea'],['starts_at','Data e hora de início','datetime-local',true],['ends_at','Data e hora de fim','datetime-local',true],['location','Local','text',true]],
  warnings:[['title','Título do documento','text',true],['conduct','Conduta sancionada (uma alínea por linha)','textarea',true],['sanction','Sanção aplicada','text',true],['issued_on','Data','date',true],['signature','Assinatura','textarea',true]],
  uniforms:[['name','Categoria / patente','text',true],['notes','Nota','textarea'],['pieces_text','Peças e códigos (uma linha por peça: nome = código)','textarea',true],['sort_order','Ordem de apresentação','number',true]],
  equipment:[['name','Equipamento','text',true],['category','Categoria (podes escrever uma nova)','text',true],['mandatory','Obrigatório em qualquer ativação','checkbox'],['notes','Notas / patente mínima','textarea'],['sort_order','Ordem de apresentação','number',true]],
  regulations:[['chapter','Capítulo','text',true],['article_number','Número do artigo','number',true],['title','Título do artigo','text',true],['body','Texto','textarea',true]],
  event_logs:[['event_type','Tipo (Ativação, Evento, Registo Hospitalar…)','text',true],['starts_at','Data e hora de início','datetime-local',true],['ends_at','Data e hora de fim','datetime-local',true],['location','Local','text',true],['summary','Resumo','textarea',true],['observations','Observações','textarea']],
  contact_info:[['hero_title','Título no Início','text',true],['hero_intro','Apresentação no Início','textarea',true],['recruitment','Texto de recrutamento','textarea',true],['contact_text','Texto de contactos','textarea',true],['discord_url','Convite Discord (opcional)','url'],['motto','Lema','text',true]],
  institutional_content:[['title','Título','text',true],['body','Apresentação institucional','textarea',true],['mission','Missão','textarea',true],['values_text','Valores (um por linha)','textarea',true]],
};
const labels={agent_qualifications:'formação ou especialização',agent_distinctions:'distinção',members:'membro',announcements:'anúncio',events:'evento',warnings:'aviso',uniforms:'categoria de fardamento',equipment:'equipamento',regulations:'artigo',event_logs:'registo',contact_info:'Início e Contactos',institutional_content:'Quem Somos'};
const photoTabs={members:'equipa',uniforms:'fardamento',equipment:'equipamento'};
export function isDirty() {const form=document.querySelector('#editor form');return !!form && form.dataset.dirty==='true';}
export function closeEditor(force=false) {
  if(!force&&document.querySelector('#editor form')?.dataset.saving==='true')return false;
  if(!force&&isDirty()&&!confirm('Descartar as alterações por guardar?'))return false;
  releaseImages(document.querySelector('#editor'));document.querySelector('#editor').close();document.querySelector('#editor-body').replaceChildren();return true;
}
function fieldHTML(spec,row) {
  const [key,label,type,required,options]=spec;let value=row[key] ?? '';
  if(type==='datetime-local')value=value?lisbonInput(value):'';
  const limits={symbol:'maxlength="30"',issuer:'maxlength="180"',uniform_number:'min="1" max="999"',article_number:'min="1" max="100000"',sort_order:'min="0" max="100000"',name:'maxlength="150"',title:'maxlength="180"',callsign:'maxlength="30"',location:'maxlength="200"',category:'maxlength="100"',event_type:'maxlength="100"',sanction:'maxlength="180"'};
  const attrs=`name="${key}" ${required?'required':''} ${limits[key] || (type==='text'?'maxlength="200"':'')} ${type==='number'?'step="1"':''}`;
  if(type==='checkbox')return `<label class="check-label"><input type="checkbox" name="${key}" ${value?'checked':''}>${e(label)}</label>`;
  if(type==='textarea')return `<label>${e(label)}<textarea ${attrs} rows="${key==='pieces_text'?10:5}" maxlength="12000">${e(value)}</textarea></label>`;
  if(type==='select')return `<label>${e(label)}<select ${attrs}>${options.map(v=>`<option value="${e(v)}" ${value===v?'selected':''}>${e(({formacao:'Formação',especializacao:'Especialização'})[v] || v)}</option>`).join('')}</select></label>`;
  return `<label>${e(label)}<input type="${type}" ${attrs} value="${e(value)}"></label>`;
}
function defaults(table) {
  const start=lisbonInput(),end=lisbonInput(new Date(Date.now()+3600000).toISOString());
  return {rank:'Operacional',active:true,kind:'Comunicado Oficial',author_name:`${state.profile?.full_name || 'Comando'} · Comando USHE`,created_at:new Date().toISOString(),published:true,allow_responses:false,title:table==='warnings'?'1ª REPREENSÃO ESCRITA':'',sanction:'1º Aviso',signature:'Cumprimentos, Duarte Petinga, Comandante USHE.',issued_on:start.slice(0,10),starts_at:lisbonISO(start),ends_at:lisbonISO(end),sort_order:0,category:'Obrigatório',event_type:location.hash.startsWith('#/treinamentos')?'Treino':'Ativação',notes:table==='uniforms'?'Pode ser completamente modificado':'',pieces_text:PIECES.map(k=>`${k} = `).join('\n')};
}
export async function openEditor(table,id,cache,kind) {
  if(!fields[table])throw new Error('Formulário desconhecido.');
  let record=id?(cache[table] || []).find(r=>String(r.id)===String(id)):null;
  if(id&&!record)throw new Error('Registo indisponível. Atualiza a página.');
  const allowed=isCommand() || (table==='events'&&hasTab('eventos')&&(!id||canManageEvent(record))) || (table==='event_logs'&&canLog()&&!id);
  if(!allowed)throw new Error('Sem autorização para editar este conteúdo.');
  const row=record?{...record}:defaults(table);
  if(table==='agent_qualifications'&&!record)row.kind=kind || 'formacao';
  if(table==='uniforms'&&record)row.pieces_text=Object.entries(row.pieces).map(([k,v])=>`${k} = ${v}`).join('\n');
  let participants='';
  if(['warnings','event_logs'].includes(table)) {
    const members=await rpc('member_options'),selected=(row[table==='warnings'?'warning_members':'event_log_participants']||[]).map(p=>p.member_id);
    const historical=(row[table==='warnings'?'warning_members':'event_log_participants']||[]).filter(p=>!p.member_id);
    participants=`${historical.length?`<p class="notice small">Participantes históricos preservados: ${historical.map(p=>e(p.member_snapshot.name)).join(', ')}.</p>`:''}<fieldset class="participants"><legend>${table==='warnings'?'Operacionais visados':'Participantes'} (obrigatório)</legend><div class="participants-list">${members.map(m=>`<label class="check-label"><input name="participants" type="checkbox" value="${m.id}" ${selected.includes(m.id)?'checked':''}><span>${e(uniform(m.uniform_number))} · ${e(m.name)}<small>${e(m.rank)}</small></span></label>`).join('')}</div>${!members.length?'<p>Adiciona primeiro os membros na Equipa.</p>':''}</fieldset>`;
  }
  const photo=photoTabs[table]?`<fieldset><legend>Fotografia</legend>${row.image_path?'<p class="muted small">Já existe uma fotografia guardada.</p><label class="check-label"><input name="remove_photo" type="checkbox">Remover fotografia atual</label>':''}<label>Escolher imagem do computador<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="muted small">JPG, PNG ou WebP · máximo 5 MB.</p><img id="photo-preview" alt="Pré-visualização da nova fotografia" hidden></fieldset>`:'';
  document.querySelector('#editor-title').textContent=`${id?'Editar':'Criar'} ${labels[table]}`;
  document.querySelector('#editor-body').innerHTML=`<form id="content-form" data-table="${table}" data-id="${id || ''}">${fields[table].map(f=>fieldHTML(f,row)).join('')}${participants}${photo}${['events','event_logs','announcements'].includes(table)?'<p class="muted small">Datas e horas de Portugal continental (Europe/Lisbon). Na hora repetida de outono é usada a primeira ocorrência.</p>':''}<p class="form-error" role="alert" hidden></p><div class="form-actions"><button class="button primary" type="submit">Guardar alterações</button><button class="button outline" type="button" data-action="close">Cancelar</button></div></form>`;
  document.querySelector('#editor').showModal();
}
export function openAccess(id,cache) {
  if(!isCommand())throw new Error('Apenas o Comando gere acessos.');
  const p=cache.profiles.find(v=>v.id===id),perms=cache.tab_permissions.filter(v=>v.user_id===id);
  if(!p)throw new Error('Conta indisponível. Atualiza a listagem.');
  const job=(cache.account_deletions||[]).find(v=>v.target_id===id);
  document.querySelector('#editor-title').textContent=`Gerir/Editar conta · ${p.full_name}`;
  document.querySelector('#editor-body').innerHTML=`<form id="access-form" data-id="${id}"><p class="muted">${e(p.email)}</p><label>Papel da conta<select name="role"><option value="member" ${p.role==='member'?'selected':''}>Membro</option><option value="command" ${p.role==='command'?'selected':''}>Comando (administração completa)</option></select></label><label class="check-label"><input name="approved" type="checkbox" ${p.approved?'checked':''}>Conta aprovada</label><fieldset><legend>Abas autorizadas</legend><p class="muted small">O Comando tem acesso a todas as abas. Para os membros, seleciona cada acesso individualmente.</p>${TABS.map(([key,label])=>`<label class="check-label"><input type="checkbox" name="tabs" value="${key}" ${perms.some(v=>v.tab===key)?'checked':''}>${e(label)}</label>`).join('')}<label class="check-label sub-permission"><input type="checkbox" name="can_create" ${perms.some(v=>v.tab==='registos'&&v.can_create)?'checked':''}>Permitir criar registos de eventos/hospitalares</label></fieldset><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="button primary">Guardar permissões</button><button type="button" class="button outline" data-action="close">Cancelar</button></div></form>`;
  const form=document.querySelector('#access-form');
  if(p.role==='command') {
    form.querySelector('select[name="role"]').disabled=true;
    form.insertAdjacentHTML('beforeend','<input type="hidden" name="role" value="command">');
  }
  form.insertAdjacentHTML('beforeend',accountDeletionControls(p,job));
  if(job){form.querySelectorAll('input,select,[type="submit"]').forEach(input=>input.disabled=true);}
  document.querySelector('#editor').showModal();
}
export async function submitContent(form,cache) {
  const table=form.dataset.table,id=form.dataset.id || null,fd=new FormData(form),data={};
  for(const [key,,type] of fields[table]) {
    if(key==='pieces_text')continue;
    data[key]=type==='checkbox'?fd.has(key):type==='number'?Number(fd.get(key)):String(fd.get(key) ?? '').trim();
    if(type==='datetime-local')data[key]=lisbonISO(data[key]);
  }
  if(['agent_qualifications','agent_distinctions'].includes(table)){if(!cache.agent)throw new Error('Abre primeiro o perfil do agente.');data.member_id=cache.agent.member.id;}
  if(table==='events'||table==='event_logs')Object.assign(data,dateRange(fd.get('starts_at'),fd.get('ends_at')));
  if(table==='contact_info'&&data.discord_url&&!discordURL(data.discord_url))throw new Error('Usa um convite https://discord.gg/... ou https://discord.com/invite/...');
  if(table==='uniforms') {
    data.pieces={};
    for(const line of String(fd.get('pieces_text')).split('\n').filter(l=>l.trim())) {
      const split=line.indexOf('=');
      if(split<1 || !line.slice(split+1).trim())throw new Error('Escreve cada peça no formato: Máscaras = 121. Usa N/A quando não se aplica.');
      const key=line.slice(0,split).trim();
      if(Object.hasOwn(data.pieces,key))throw new Error(`A peça ${key} aparece duas vezes.`);
      Object.defineProperty(data.pieces,key,{value:line.slice(split+1).trim(),enumerable:true,configurable:true});
    }
    if(!Object.keys(data.pieces).length)throw new Error('Adiciona pelo menos uma peça.');
  }
  const members=fd.getAll('participants');
  if(['warnings','event_logs'].includes(table)&&!members.length&&!(cache[table]||[]).find(r=>String(r.id)===String(id))?.[table==='warnings'?'warning_members':'event_log_participants']?.some(p=>!p.member_id))throw new Error('Seleciona pelo menos um membro da equipa.');
  let newPath=null;
  const old=(cache[table] || []).find(r=>String(r.id)===String(id));
  try {
    if(photoTabs[table]) {
      newPath=await upload(fd.get('photo'),photoTabs[table]);
      if(newPath || fd.has('remove_photo'))data.image_path=newPath;
    }
    if(table==='warnings'||table==='event_logs')await rpc(table==='warnings'?'save_warning':'save_log',{p_id:id,p_data:data,p_members:members});
    else await save(table,id,data);
  } catch(err) {
    if(newPath)await db.storage.from('ushe-media').remove([newPath]);
    throw err;
  }
  if(old?.image_path&&(newPath||fd.has('remove_photo')))await db.storage.from('ushe-media').remove([old.image_path]);
}
export async function submitAccess(form) {
  const fd=new FormData(form),tabs=fd.getAll('tabs');
  await rpc('set_user_access',{p_user:form.dataset.id,p_role:fd.get('role'),p_approved:fd.has('approved'),p_tabs:tabs.map(tab=>({tab,can_create:tab==='registos'&&fd.has('can_create')}))});
}
export async function deleteRecord(table,id,cache) {
  if(!fields[table]||['contact_info','institutional_content'].includes(table))throw new Error('Operação indisponível.');
  const row=(cache[table] || []).find(r=>String(r.id)===String(id));
  if(!row)throw new Error('Registo indisponível.');
  if(table==='events'&&!canManageEvent(row))throw new Error('Sem autorização para apagar este evento.');
  if(table!=='events'&&!isCommand())throw new Error('Sem autorização para apagar este conteúdo.');
  if(!confirm(`Apagar ${labels[table]} "${row.title || row.name || row.event_type}"? Esta ação remove também as respostas e ligações deste registo.`))return false;
  const deleted=await result(db.from(table).delete().eq('id',id).select('id'));
  if(!deleted.length)throw new Error('Não foi possível apagar: registo inexistente ou sem autorização.');
  if(row.image_path)await db.storage.from('ushe-media').remove([row.image_path]);
  return true;
}
export async function submitAuth(form) {
  if(!db)throw new Error('A área reservada ainda não foi ativada. Contacta o Comando para mais informações.');
  if(form.dataset.mode!=='password'){await loadOtpPolicy();if(state.otpEnabled){await startOTP(form);return;}}
  const fd=new FormData(form),mode=form.dataset.mode,email=String(fd.get('email')||'').trim(),password=String(fd.get('password')||'');
  const redirect=new URL('./',window.location.href);redirect.hash='/entrar';redirect.search='';
  if(['signup','password'].includes(mode)&&password!==fd.get('confirmation'))throw new Error('As palavras-passe não coincidem.');
  if(mode==='signup') {
    const full_name=String(fd.get('full_name')).trim();
    if(full_name.length<2)throw new Error('Escreve um nome com pelo menos dois caracteres.');
    await result(db.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:redirect.href}}));
    toast('Pedido registado. Confirma o email recebido e aguarda a aprovação do Comando.');
  } else if(mode==='reset') {
    await result(db.auth.resetPasswordForEmail(email,{redirectTo:redirect.href}));
    toast('Se o email estiver registado, receberás uma ligação para recuperar o acesso.');
  } else if(mode==='password') {
    await result(db.auth.updateUser({password}));state.recovery=false;toast('Palavra-passe atualizada.');
  } else {await result(db.auth.signInWithPassword({email,password}));toast('Sessão iniciada.');}
}
export function formError(form,error) {
  const el=form.querySelector('.form-error');el.textContent=errorMessage(error);el.hidden=false;el.scrollIntoView({block:'nearest'});
}

// Associação explícita de conta/agente. Nunca usa email no perfil nem altera o cargo de acesso.
export async function openOfficialProfile(id,cache) {
  if(!isCommand())throw new Error('Só o Comando pode gerir dados oficiais.');
  const m=(cache.members || []).find(v=>v.id===id);
  if(!m)throw new Error('Agente indisponível. Atualiza a página.');
  const [accounts,subunits]=await Promise.all([
    rowsForOfficialAccounts(),
    result(db.from('member_subunits').select('name').eq('member_id',id).order('name'))
  ]);
  document.querySelector('#editor-title').textContent=`Dados oficiais · ${m.name}`;
  document.querySelector('#editor-body').innerHTML=`<form id="official-profile-form" data-id="${id}"><p class="notice small">Confirma a identidade antes de associar uma conta. Uma troca de conta remove a biografia e fotografia pessoais anteriores. Esta operação não altera os acessos ao portal.</p><label>Conta do agente<select name="user_id"><option value="">Sem conta associada</option>${accounts.map(p=>`<option value="${p.id}" ${p.id===m.user_id?'selected':''}>${e(p.full_name)} · ${e(p.email)}</option>`).join('')}</select></label>${fieldHTML(['rank','Patente','select',true,RANKS],m)}${fieldHTML(['callsign','Indicativo','text'],m)}<label>Número de agente<input name="agent_number" maxlength="30" value="${e(m.agent_number || '')}"></label><label>Data de ingresso<input name="joined_on" type="date" value="${e(m.joined_on || '')}"></label><label>Subunidades (uma por linha, até 20)<textarea name="subunits" rows="4" maxlength="2020">${e(subunits.map(v=>v.name).join('\n'))}</textarea></label><p class="form-error" role="alert" hidden></p><div class="form-actions"><button class="button" type="submit">Guardar dados oficiais</button><button class="button outline" type="button" data-action="close">Cancelar</button></div></form>`;
  document.querySelector('#editor').showModal();
}
async function rowsForOfficialAccounts() {
  const {allRows}=await import('./api.js');
  return allRows(db.from('profiles').select('id,full_name,email').order('full_name').order('id'));
}
export async function submitOfficialProfile(form) {
  const fd=new FormData(form),subunits=String(fd.get('subunits')||'').split('\n').map(v=>v.trim()).filter(Boolean);
  if(subunits.length>20||subunits.some(v=>v.length>100))throw new Error('Usa até 20 subunidades, com 100 caracteres por nome.');
  await rpc('save_agent_official',{p_member:form.dataset.id,p_data:Object.fromEntries(['rank','callsign','agent_number','joined_on','user_id'].map(k=>[k,String(fd.get(k)||'').trim()])),p_subunits:subunits});
}
