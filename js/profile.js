import {e,date,initials,heading,empty,button,cardActions} from './core.js';
import {db,state,isCommand,result,allRows,rpc} from './api.js';

export function serviceTime(joined, today=new Date()) {
  if(!joined)return 'Data de ingresso por registar';
  const end=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(today);
  if(joined>end)return 'Data de ingresso por confirmar';
  const [y,m,d]=joined.split('-').map(Number),[ey,em,ed]=end.split('-').map(Number);
  let months=(ey-y)*12+em-m-(ed<d?1:0);
  if(months<1) {
    const days=Math.floor((Date.UTC(ey,em-1,ed)-Date.UTC(y,m-1,d))/86400000);
    return days===0?'Ingressou hoje':`${days} dia${days===1?'':'s'} de serviço`;
  }
  const years=Math.floor(months/12);months%=12;
  return [years?`${years} ano${years===1?'':'s'}`:'',months?`${months} ${months===1?'mês':'meses'}`:''].filter(Boolean).join(' e ')+' de serviço';
}
export function avatar(personal,member,preview=false) {
  const path=personal?.avatar_path || member.image_path;
  return `<div class="agent-avatar${preview?' agent-avatar-preview':''}" aria-label="Fotografia de ${e(member.name)}"><span class="image-placeholder">${e(initials(member.name))}</span>${path?`<img data-bucket="${personal?.avatar_path?'ushe-avatars':'ushe-media'}" data-path="${e(path)}" alt="${e(member.name)}" hidden width="144" height="144">`:''}</div>`;
}
export function profileHTML({member:m,personal={},subunits=[],qualifications=[],distinctions=[],activity=[]}) {
  const own=state.user?.id===m.user_id,admin=isCommand();
  const official=admin?button('official-profile','Gerir dados oficiais',`data-id="${m.id}"`):'';
  const records=(items,none,render)=>items.length?`<ul class="agent-records">${items.map(render).join('')}</ul>`:empty(none);
  const qualification=q=>`<li><div><h3>${e(q.name)}</h3><p class="muted small">${e(date(q.completed_on,false))}${q.issuer?` · ${e(q.issuer)}`:''}</p></div>${cardActions('agent_qualifications',q.id,admin)}</li>`;
  return `<section class="container page agent-page">${heading('Efetivo USHE / GNR','Perfil do Agente')}<article class="panel agent-header">${avatar(personal,m)}<div class="agent-title"><p class="eyebrow">${m.active?'Agente no ativo':'Agente inativo'}</p><h2>${e(m.name)}</h2><p>${e(m.rank)} <span aria-hidden="true">·</span> ${e(m.callsign || 'Indicativo por atribuir')}</p></div><div class="agent-actions">${own?button('personal-profile','Editar perfil',`data-id="${m.id}"`):''}${official}</div></article><div class="agent-columns"><section class="panel agent-official"><p class="eyebrow">Dados oficiais</p><h2>Identificação e serviço</h2><dl class="agent-facts"><div><dt>Patente</dt><dd>${e(m.rank)}</dd></div><div><dt>Indicativo</dt><dd>${e(m.callsign || 'Por atribuir')}</dd></div><div><dt>Número de agente</dt><dd>${e(m.agent_number || 'Por atribuir')}</dd></div><div><dt>Uniforme</dt><dd>${e(String(m.uniform_number).padStart(2,'0'))}</dd></div><div><dt>Data de ingresso</dt><dd>${m.joined_on?e(date(m.joined_on,false)):'Por registar'}</dd></div><div><dt>Tempo de serviço</dt><dd>${e(serviceTime(m.joined_on))}</dd></div><div class="agent-subunits"><dt>Subunidades</dt><dd>${subunits.length?subunits.map(s=>`<span class="badge">${e(s.name)}</span>`).join(' '):'Sem subunidade atribuída'}</dd></div></dl></section><section class="panel agent-biography"><p class="eyebrow">Apresentação pessoal</p><h2>Biografia</h2><p class="prose">${e(personal.biography || 'Este agente ainda não adicionou uma biografia.')}</p></section></div><div class="agent-columns"><section class="panel agent-section"><div class="agent-section-heading"><h2>Especializações</h2>${admin?button('new','Adicionar',`data-table="agent_qualifications" data-kind="especializacao"`):''}</div>${records(qualifications.filter(q=>q.kind==='especializacao'),'Sem especializações registadas',qualification)}</section><section class="panel agent-section"><div class="agent-section-heading"><h2>Formações concluídas</h2>${admin?button('new','Adicionar',`data-table="agent_qualifications" data-kind="formacao"`):''}</div>${records(qualifications.filter(q=>q.kind==='formacao'),'Sem formações registadas',qualification)}</section></div><section class="panel agent-section"><div class="agent-section-heading"><h2>Condecorações e distinções</h2>${admin?button('new','Adicionar',`data-table="agent_distinctions"`):''}</div>${records(distinctions,'Sem distinções atribuídas',v=>`<li><span class="agent-insignia" aria-hidden="true">${e(v.symbol || '◇')}</span><div><h3>${e(v.name)}</h3><p class="prose">${e(v.description)}</p><p class="muted small">${e(date(v.awarded_on,false))}</p></div>${cardActions('agent_distinctions',v.id,admin)}</li>`)}</section><section class="panel agent-section"><h2>Atividade recente</h2><p class="muted small">Últimos 30 registos autorizados. Uma confirmação de disponibilidade não comprova participação.</p>${records(activity,'Sem atividade recente',a=>`<li><div><span class="badge">${e(a.kind==='participation'?'Participação registada':a.attending?'Presença confirmada · Vou':'Disponibilidade · Não vou')}</span><h3>${e(a.title)}</h3><p class="muted small"><time datetime="${e(a.occurred_at)}">${e(date(a.occurred_at))}</time>${a.kind==='response'?` · Evento: ${e(date(a.event_at))}`:''}</p></div></li>`)}</section><a class="text-link" href="#/conta">Voltar à minha conta</a></section>`;
}
export async function agentProfile(id=null) {
  if(!state.user||!state.profile?.approved)return {html:`<section class="container page">${heading('Membros','Perfil do Agente')}${empty('O perfil fica disponível após a aprovação da conta pelo Comando.')}<a class="button" href="#/conta">A minha conta</a></section>`};
  let query=db.from('members').select('*');
  query=id?query.eq('id',id):query.eq('user_id',state.user.id);
  const member=await result(query.maybeSingle());
  if(!member)return {html:`<section class="container page">${heading('Membros','Perfil do Agente')}${empty(id?'Perfil indisponível ou sem autorização para o consultar.':'A tua conta ainda não está associada a um agente. O Comando pode fazer a associação na Equipa, em Gerir dados oficiais.')}<a class="button" href="#/conta">A minha conta</a></section>`};
  const [personal,subunits,qualifications,distinctions,activity]=await Promise.all([
    result(db.from('agent_personal').select('*').eq('member_id',member.id).maybeSingle()),
    allRows(db.from('member_subunits').select('*').eq('member_id',member.id).order('name')),
    allRows(db.from('agent_qualifications').select('*').eq('member_id',member.id).order('completed_on',{ascending:false}).order('id')),
    allRows(db.from('agent_distinctions').select('*').eq('member_id',member.id).order('awarded_on',{ascending:false}).order('id')),
    rpc('agent_activity',{p_member:member.id})
  ]);
  const data={member,personal:personal || {},subunits,qualifications,distinctions,activity};
  return {html:profileHTML(data),cache:{agent:data,members:[member],agent_qualifications:qualifications,agent_distinctions:distinctions}};
}
export function validatePhoto(file) {
  if(!file?.size)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Escolhe uma imagem JPEG, PNG ou WebP.');
  if(file.size>5242880)throw new Error('A fotografia pode ter no máximo 5 MB.');
}
export async function openPersonalProfile(cache) {
  const {member,personal}=cache.agent || {};
  if(!member||member.user_id!==state.user?.id)throw new Error('Só podes editar o teu próprio perfil.');
  document.querySelector('#editor-title').textContent='Editar perfil';
  document.querySelector('#editor-body').innerHTML=`<form id="personal-profile-form" data-id="${member.id}"><p class="muted small">A fotografia e a biografia são pessoais. Os dados oficiais são geridos pelo Comando.</p>${avatar(personal,member,true)}<label>Fotografia<input name="agent_photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted small">JPEG, PNG ou WebP · até 5 MB.</p>${personal.avatar_path?'<label class="check-label"><input name="remove_avatar" type="checkbox">Remover fotografia pessoal e usar a imagem oficial ou as iniciais</label>':''}<label>Biografia pessoal<textarea name="biography" rows="5" maxlength="500" aria-describedby="biography-count">${e(personal.biography || '')}</textarea></label><p id="biography-count" class="muted small" aria-live="polite">${[...(personal.biography || '')].length}/500 caracteres</p><p class="form-error" role="alert" hidden></p><p class="profile-saving" role="status" hidden>A guardar perfil…</p><div class="form-actions"><button class="button" type="submit">Guardar alterações</button><button class="button outline" type="button" data-action="close">Cancelar</button></div></form>`;
  document.querySelector('#editor').showModal();
  const {hydrateImages}=await import('./api.js');await hydrateImages(document.querySelector('#editor'));
}
export async function previewProfilePhoto(input) {
  const form=input.closest('form'),box=form.querySelector('.agent-avatar'),file=input.files[0];
  try {validatePhoto(file);}catch(error){input.value='';throw error;}
  const previous=box.querySelector('img[data-preview-url]');
  if(previous){URL.revokeObjectURL(previous.dataset.objectUrl);previous.remove();}
  box.querySelector('.image-placeholder').hidden=false;
  box.querySelectorAll('img').forEach(img=>img.hidden=true);
  if(!file){box.querySelector('img')?.removeAttribute('hidden');return;}
  const img=document.createElement('img');img.alt='Pré-visualização da nova fotografia';
  img.src=URL.createObjectURL(file);img.dataset.objectUrl=img.src;img.dataset.previewUrl='true';
  img.addEventListener('error',()=>{input.value='';img.remove();URL.revokeObjectURL(img.src);box.querySelector('.image-placeholder').hidden=false;const message=form.querySelector('.form-error');message.textContent='Não foi possível abrir esta imagem. Escolhe outra fotografia.';message.hidden=false;});
  box.append(img);box.querySelector('.image-placeholder').hidden=true;
  form.querySelector('[name="remove_avatar"]')?.removeAttribute('checked');
  const remove=form.querySelector('[name="remove_avatar"]');if(remove)remove.checked=false;
}
export async function submitPersonalProfile(form,cache) {
  const agent=cache.agent;if(!agent||agent.member.user_id!==state.user?.id)throw new Error('Sem autorização para editar este perfil.');
  const fd=new FormData(form),biography=String(fd.get('biography') || '').trim(),file=fd.get('agent_photo');
  if([...biography].length>500)throw new Error('A biografia pode ter no máximo 500 caracteres.');
  validatePhoto(file);let path=fd.has('remove_avatar')?null:(agent.personal.avatar_path || null),newPath=null;
  if(file?.size) {
    const payload=new FormData();payload.set('photo',file);
    const {data,error}=await db.functions.invoke('agent-avatar',{body:payload});
    if(error){let message='Não foi possível guardar a fotografia. Tenta novamente.';try{message=(await error.context.json()).error || message;}catch{}throw new Error(message);}
    if(!data?.path)throw new Error('O serviço não confirmou o carregamento da fotografia.');
    path=newPath=data.path;
  }
  try {await rpc('save_agent_personal',{p_member:agent.member.id,p_biography:biography,p_avatar_path:path});}
  catch(error){if(newPath)await db.storage.from('ushe-avatars').remove([newPath]);throw error;}
  const old=agent.personal.avatar_path;
  if(old&&old!==path)await db.storage.from('ushe-avatars').remove([old]);
}
