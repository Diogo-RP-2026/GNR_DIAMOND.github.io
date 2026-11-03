import {otpScreen} from './otp.js';
// Componentes e páginas. Nenhum conteúdo reservado é incluído no JavaScript público.
import {e,date,uniform,initials,normalize,orderedEvents,orderedResponses,discordURL,heading,button,cardActions,empty,RANKS,PIECES} from './core.js';
import {db,state,isCommand,canManageEvent,hasTab,canLog,rows,rpc,result} from './api.js';

const fallback={hero_title:'Unidade de Segurança e Honras do Estado',hero_intro:'Disciplina, lealdade e honra ao serviço do Estado.',motto:'Honra, Disciplina e Excelência',recruitment:'Dúvidas sobre cargos, progressão ou candidaturas.',contact_text:'Diogo Oconner ou Duarte Petinga.',discord_url:''};
const create=(table,label='Novo registo')=>button('new',`+ ${label}`,`data-table="${table}"`);
function image(path,label,extra='') {return `<div class="media ${extra}"><div class="image-placeholder"><span>◇</span><small>${e(label)}</small></div>${path?`<img data-path="${e(path)}" alt="${e(label)}" hidden>`:''}</div>`;}
const search=(placeholder='Pesquisar…',extra='')=>`<div class="filter-bar"><label class="search"><span>⌕</span><input type="search" data-filter="search" placeholder="${e(placeholder)}" aria-label="${e(placeholder)}"></label>${extra}<span class="filter-count" aria-live="polite"></span></div>`;
const option=(values,label,key='kind')=>`<select data-filter="${key}" aria-label="${e(label)}"><option value="">${e(label)}</option>${values.map(v=>`<option value="${e(v)}">${e(v)}</option>`).join('')}</select>`;

export async function publicInfo() {
  if(!db)return fallback;
  try {return {...fallback,...await result(db.from('contact_info').select('*').eq('id',1).maybeSingle())};}
  catch {return fallback;}
}
// As métricas iniciais refletem os 22 elementos e os 7 cargos fornecidos para a unidade.
export async function home() {
  const info=state.publicInfo || fallback;
  let statistics=db?{member_count:'—',rank_count:'—',training_count:'—'}:{member_count:22,rank_count:7,training_count:0};
  if(db) {
    try {statistics=await rpc('unit_statistics');}
    catch {try {statistics.member_count=await rpc('active_member_count');statistics.rank_count=RANKS.length;} catch { /* A ligação não está disponível; as métricas ficam por confirmar. */ }}
  }
  return {html:`<section class="hero-banner"><img class="hero-background" src="./images/ushe-hero.jpg" alt="Guarda de honra da USHE" width="1920" height="912"><div class="hero-fade" aria-hidden="true"></div><div class="container hero-inner"><img class="hero-crest" src="./images/ushe-brasao.png" alt="Brasão da USHE — Aequo Animo" width="256" height="256"><p class="hero-label">USHE</p><h1>${e(info.hero_title)}</h1><p class="hero-description">${e(info.hero_intro)}</p></div></section><section class="container home-statistics" aria-label="Estatísticas da unidade"><div class="stats-grid"><div class="stat-card"><p class="stat-number">${e(statistics.member_count)}</p><p class="stat-label">Efetivo total</p></div><div class="stat-card"><p class="stat-number">${e(statistics.rank_count)}</p><p class="stat-label">Cargos</p></div><a class="stat-card stat-link" href="#/treinamentos"><p class="stat-number">${e(statistics.training_count)}</p><p class="stat-label">Treinamentos</p></a></div></section>`};
}
const ticketIcon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>';
const messageIcon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>';
export async function contacts() {
  const c=state.publicInfo || fallback,url=discordURL(c.discord_url) || 'https://discord.com';
  return {html:`<section class="container page contacts-page">${heading('Fala connosco','Contactos')}<div class="contact-card"><section class="contact-method">${ticketIcon}<h2>Abrir Ticket</h2><p>${e(c.recruitment)}</p><a class="button contact-discord" href="${e(url)}" target="_blank" rel="noopener noreferrer">Ir para o Discord</a></section><section class="contact-method">${messageIcon}<h2>DM ao Comando</h2><p>${e(c.contact_text)}</p></section></div></section>`};
}
export async function about() {
  const c=await result(db.from('institutional_content').select('*').eq('id',1).single());
  return {html:`<section class="container page">${heading('IDENTIDADE E MISSÃO','Quem Somos','Unidade de Segurança e Honras do Estado',isCommand()?button('edit','Editar texto',`data-table="institutional_content" data-id="1"`):'')}<article class="about-intro panel"><img src="./images/ushe-brasao.png" alt="Brasão USHE" width="190" height="220"><div><p class="eyebrow">CIDADE DIAMOND</p><h2>${e(c.title)}</h2><p class="prose">${e(c.body)}</p></div></article><div class="contact-grid"><article class="panel"><p class="eyebrow">A NOSSA MISSÃO</p><h2>Servir e proteger.</h2><p class="prose">${e(c.mission)}</p></article><article class="panel"><p class="eyebrow">OS NOSSOS VALORES</p><h2>O que nos orienta.</h2><p class="prose">${e(c.values_text)}</p></article></div></section>`,cache:{institutional_content:[c]}};
}
export function memberCard(m) {
  return `<article class="member-card filter-item" data-search="${e(normalize(`${m.name} ${m.callsign} ${uniform(m.uniform_number)} ${m.rank}`))}" data-rank="${e(m.rank)}"><div class="member-top"><span class="uniform-code">${e(uniform(m.uniform_number))}</span><span class="status ${m.active?'':'inactive'}">${m.active?'Ativo':'Inativo'}</span></div><div class="member-identity">${m.image_path?image(m.image_path,m.name,'avatar'): `<div class="avatar-initials">${e(initials(m.name))}</div>`}<div><h3>${e(m.name)}</h3><p>${e(m.callsign || 'Indicativo por atribuir')}</p></div></div><span class="rank-badge rank-${RANKS.indexOf(m.rank)}">${e(m.rank)}</span>${cardActions('members',m.id,isCommand())}</article>`;
}
export async function team() {
  const members=await rows('members','*','uniform_number');
  return {html:`<section class="container page">${heading('CADEIA DE COMANDO','Equipa','Estrutura, hierarquia e efetivos da unidade.',isCommand()?create('members','Adicionar membro'):'')}${search('Pesquisar nome, uniforme ou indicativo',option(RANKS,'Todas as patentes','rank'))}<div class="hierarchy">${RANKS.map((rank,i)=>`<section class="rank-section"><div class="rank-heading"><span>0${i+1}</span><h2>${e(rank==='Oficial'?'Oficiais':rank==='Sargento'?'Sargentos':rank==='Operacional'?'Operacionais':rank==='Estagiário'?'Estagiários':rank)}</h2><span class="muted">${members.filter(m=>m.rank===rank).length} elementos</span></div><div class="member-grid">${members.filter(m=>m.rank===rank).sort((a,b)=>rank==='Quadros Permanentes'?b.uniform_number-a.uniform_number:a.uniform_number-b.uniform_number).map(memberCard).join('')}</div></section>`).join('')}</div>${!members.length?empty():''}</section>`,cache:{members}};
}
export function responseComponent(kind,id,responses) {
  responses=orderedResponses(responses);
  const mine=responses.find(r=>r.user_id===state.user?.id);
  return `<div class="responses" data-response="${kind}:${id}"><div class="response-buttons">${[true,false].map(yes=>`<button class="response-button ${mine?.attending===yes?'selected':''}" aria-pressed="${mine?.attending===yes}" data-action="vote" data-kind="${kind}" data-id="${id}" data-attending="${yes}">${yes?'✓ Vou':'× Não vou'} <strong>${responses.filter(r=>r.attending===yes).length}</strong></button>`).join('')}</div><div class="response-names">${[true,false].map(yes=>`<details><summary>${yes?'Disponíveis':'Indisponíveis'} · ${responses.filter(r=>r.attending===yes).length}</summary>${responses.some(r=>r.attending===yes)?`<ul class="vote-names">${responses.filter(r=>r.attending===yes).map(r=>`<li>${e(r.full_name)}</li>`).join('')}</ul>`:'<p>Sem respostas.</p>'}</details>`).join('')}</div></div>`;
}
export function announcementCard(a,responses=[]) {
  return `<article class="announcement-card panel filter-item ${a.kind==='Comunicado Oficial'?'official':''}" data-kind="${e(a.kind)}" data-search="${e(normalize(`${a.title} ${a.body} ${a.author_name}`))}"><div class="document-meta"><span class="badge">${e(a.kind)}</span><time>${e(date(a.created_at))}</time>${!a.published?'<span class="badge">Rascunho</span>':''}</div><h2>${e(a.title)}</h2><p class="mention">@ Unidade de Segurança e Honras do Estado</p><p class="prose">${e(a.body)}</p><div class="signature">${e(a.author_name)}</div>${a.allow_responses && a.published?responseComponent('announcement',a.id,responses):''}${cardActions('announcements',a.id,isCommand())}</article>`;
}
export async function announcements() {
  const data=await result(db.from('announcements').select('*').order('created_at',{ascending:false}));
  const responses=await Promise.all(data.map(a=>a.allow_responses&&a.published?rpc('response_names',{p_kind:'announcement',p_id:a.id}):[]));
  return {html:`<section class="container page narrow">${heading('COMUNICAÇÃO INTERNA','Anúncios','Comunicados e decisões do Comando.',isCommand()?create('announcements','Novo anúncio'):'')}${search('Pesquisar nos anúncios',option(['Evento','Reunião','Comunicado Oficial'],'Todos os tipos'))}<div class="feed">${data.length?data.map((a,i)=>announcementCard(a,responses[i])).join(''):empty()}</div></section>`,cache:{announcements:data}};
}
export async function events() {
  const data=orderedEvents(await rows('events'));
  const responses=await Promise.all(data.map(v=>rpc('response_names',{p_kind:'event',p_id:v.id})));
  return {html:`<section class="container page narrow">${heading('AGENDA OPERACIONAL','Eventos','Consulta os eventos e confirma a tua disponibilidade. Horas de Portugal continental.',create('events','Criar evento'))}${search('Pesquisar evento ou local','<select data-filter="period" aria-label="Período"><option value="">Todos os eventos</option value="next">Próximos e em curso</option><option value="past">Terminados</option></select>')}<div class="feed">${data.length?data.map((v,i)=>`<article class="panel event-card filter-item" data-search="${e(normalize(`${v.title} ${v.description} ${v.location}`))}" data-period="${Date.parse(v.ends_at)<Date.now()?'past':'next'}"><div class="document-meta"><span class="badge">${Date.parse(v.ends_at)<Date.now()?'Terminado':'Agenda USHE'}</span><span>${e(v.location)}</span></div><h2>${e(v.title)}</h2><p class="event-time">${e(date(v.starts_at))} → ${e(date(v.ends_at))}</p><p class="prose">${e(v.description)}</p>${responseComponent('event',v.id,responses[i])}${cardActions('events',v.id,canManageEvent(v))}</article>`).join(''):empty()}</div></section>`,cache:{events:data}};
}
export function warningCard(w,options) {
  const ids=(w.warning_members || []).map(x=>x.member_id);
  return `<article class="panel warning-card filter-item" data-search="${e(normalize(`${w.title} ${w.conduct} ${w.sanction} ${options.filter(m=>ids.includes(m.id)).map(m=>m.name).join(' ')}`))}" data-kind="${e(w.sanction)}" data-members="${ids.join(' ')}"><div class="document-meta"><span class="sanction-seal">${e(w.sanction)}</span><time>${e(date(w.issued_on,false))}</time></div><p class="eyebrow">DOCUMENTO DISCIPLINAR · USHE</p><h2>[${e(w.title)}]</h2><dl class="official-document"><dt>Operacional(is) visado(s)</dt><dd>${options.filter(m=>ids.includes(m.id)).map(m=>`${e(m.rank)} · ${e(m.name)} (${uniform(m.uniform_number)})`).join('<br>')}</dd><dt>Conduta sancionada</dt><dd class="prose">${e(w.conduct)}</dd><dt>Sanção aplicada</dt><dd class="sanction-text">${e(w.sanction)}</dd></dl><p class="signature prose">${e(w.signature)}</p>${cardActions('warnings',w.id,isCommand())}</article>`;
}
export async function warnings() {
  const [data,members]=await Promise.all([result(db.from('warnings').select('*,warning_members(member_id)').order('issued_on',{ascending:false})),rpc('member_options')]);
  const membersSelect=`<select data-filter="member" aria-label="Operacional"><option value="">Todos os membros</option>${members.map(m=>`<option value="${m.id}">${e(m.name)}</option>`).join('')}</select>`;
  return {html:`<section class="container page narrow">${heading('DISCIPLINA E RESPONSABILIDADE','Avisos','Repreensões e sanções escritas da unidade.',isCommand()?create('warnings','Criar aviso'):'')}${search('Pesquisar avisos',membersSelect+option([...new Set(data.map(w=>w.sanction))],'Todas as sanções'))}<div class="feed">${data.length?data.map(w=>warningCard(w,members)).join(''):empty()}</div></section>`,cache:{warnings:data},members};
}
export async function uniforms() {
  const data=await rows('uniforms','*','sort_order');
  return {html:`<section class="container page">${heading('APRESENTAÇÃO E IDENTIDADE','Fardamento','Referências de peças e códigos por patente.',isCommand()?create('uniforms','Nova categoria'):'')}<div class="uniform-grid">${data.length?data.map(v=>`<article class="panel uniform-card">${image(v.image_path,`Fardamento · ${v.name}`)}<div class="uniform-body"><p class="eyebrow">REFERÊNCIA DE FARDAMENTO</p><h2>${e(v.name)}</h2><p class="notice small">${e(v.notes)}</p><table class="pieces-table"><caption class="sr-only">Peças e códigos · ${e(v.name)}</caption><thead><tr><th>Peça</th><th>Código</th><th><span class="sr-only">Copiar</span></th></tr></thead><tbody>${Object.entries(v.pieces).sort(([a],[b])=>(PIECES.includes(a)?PIECES.indexOf(a):999)-(PIECES.includes(b)?PIECES.indexOf(b):999)).map(([label,value])=>`<tr><th scope="row">${e(label)}</th><td><code>${e(value)}</code></td><td><button class="copy-button" data-action="copy" data-value="${e(value)}" aria-label="Copiar código de ${e(label)}">⧉</button></td></tr>`).join('')}</tbody></table>${cardActions('uniforms',v.id,isCommand())}</div></article>`).join(''):empty()}</div></section>`,cache:{uniforms:data}};
}
export async function equipment() {
  const data=await rows('equipment','*','sort_order');
  const categories=[...new Set(data.map(v=>v.category))];
  return {html:`<section class="container page">${heading('PRONTIDÃO OPERACIONAL','Equipamento','Confere o material antes de cada ativação da unidade.',isCommand()?create('equipment','Adicionar equipamento'):'')}${categories.length?categories.map(category=>`<section class="equipment-section"><div class="rank-heading"><span>◇</span><h2>${e(category)}</h2></div><div class="equipment-grid">${data.filter(v=>v.category===category).map(v=>`<article class="equipment-card ${v.mandatory?'mandatory':''}">${v.image_path?image(v.image_path,v.name):'<span class="equipment-icon">◇</span>'}<span class="badge">${v.mandatory?'Obrigatório em qualquer ativação':'Opcional'}</span><h3>${e(v.name)}</h3>${v.notes?`<p class="muted">${e(v.notes)}</p>`:''}${cardActions('equipment',v.id,isCommand())}</article>`).join('')}</div></section>`).join(''):empty()}</section>`,cache:{equipment:data}};
}
export async function regulations() {
  const data=await rows('regulations','*','article_number');
  const chapters=[...new Set(data.map(v=>v.chapter))];
  return {html:`<section class="container page">${heading('NORMAS DA UNIDADE','Regulamento Interno','Consulta os artigos e pesquisa por tema.',isCommand()?create('regulations','Novo artigo'):'')}${search('Pesquisar no regulamento')}<div class="regulation-layout"><aside class="regulation-index"><p class="eyebrow">ÍNDICE</p>${chapters.map((c,i)=>`<button class="index-link" data-action="scroll" data-target="chapter-${i}">${e(c)}</button>`).join('')}</aside><div>${chapters.map((c,i)=>`<section class="chapter-section" id="chapter-${i}"><h2>${e(c)}</h2>${data.filter(v=>v.chapter===c).map(v=>`<article class="regulation-article filter-item" data-search="${e(normalize(`${v.chapter} ${v.title} ${v.body} ${v.article_number}`))}"><p class="eyebrow">ARTIGO ${v.article_number}º</p><h3>${e(v.title)}</h3><p class="prose">${e(v.body)}</p>${cardActions('regulations',v.id,isCommand())}</article>`).join('')}</section>`).join('')}${!data.length?empty():''}</div></div></section>`,cache:{regulations:data}};
}
export async function logs() {
  const [data,members]=await Promise.all([result(db.from('event_logs').select('*,event_log_participants(member_id)').order('starts_at',{ascending:false})),rpc('member_options')]);
  return {html:`<section class="container page">${heading('ARQUIVO OPERACIONAL','Registos de Eventos','Ativações, eventos e registos hospitalares. Horas de Portugal continental.',canLog()?create('event_logs','Criar registo'):'')}${search('Pesquisar local, resumo ou observações',option([...new Set(data.map(v=>v.event_type))],'Todos os tipos')+'<label class="date-filter">Desde<input data-filter="from" type="date"></label><label class="date-filter">Até<input data-filter="to" type="date"></label>')}<div class="feed">${data.length?data.map(v=>`<article class="panel log-card filter-item" data-kind="${e(v.event_type)}" data-search="${e(normalize(`${v.location} ${v.summary} ${v.observations}`))}" data-date="${new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(new Date(v.starts_at))}"><div class="document-meta"><span class="badge">${e(v.event_type)}</span><span>${e(v.location)}</span></div><h2>${e(date(v.starts_at))} → ${e(date(v.ends_at))}</h2><p class="prose">${e(v.summary)}</p><dl class="official-document"><dt>Participantes</dt><dd>${members.filter(m=>(v.event_log_participants || []).some(p=>p.member_id===m.id)).map(m=>`${e(uniform(m.uniform_number))} · ${e(m.name)}`).join('<br>')}</dd>${v.observations?`<dt>Observações</dt><dd class="prose">${e(v.observations)}</dd>`:''}</dl>${cardActions('event_logs',v.id,isCommand())}</article>`).join(''):empty()}</div></section>`,cache:{event_logs:data},members};
}

// O cartão público encaminha para os treinos registados no arquivo operacional.
// Esta página usa a permissão de Registos e nunca contorna a autorização existente.
export async function training() {
  const all=await rows('event_logs','*,event_log_participants(member_id)','starts_at');
  const data=all.filter(r=>normalize(r.event_type).startsWith('trein') || normalize(r.event_type)==='formacao').reverse();
  return {html:`<section class="container page">${heading('Formação da unidade','Treinamentos','Treinos e ações de formação da USHE.',canLog()?create('event_logs','Criar treino'):'')}<div class="feed">${data.length?data.map(v=>`<article class="panel log-card"><div class="document-meta"><span class="badge">${e(v.event_type)}</span><span>${e(v.location)}</span></div><h2>${e(date(v.starts_at))} → ${e(date(v.ends_at))}</h2><p class="prose">${e(v.summary)}</p>${v.observations?`<p class="prose muted">${e(v.observations)}</p>`:''}${cardActions('event_logs',v.id,isCommand())}</article>`).join(''):empty('Ainda não existem treinamentos registados.')}</div></section>`,cache:{event_logs:data}};
}

export const ADMIN_AREAS=[['users','Utilizadores e acessos'],['members','Equipa'],['announcements','Anúncios'],['events','Eventos'],['warnings','Avisos'],['uniforms','Fardamento'],['equipment','Equipamento'],['regulations','Regulamento'],['event_logs','Registos'],['contact_info','Início e Contactos'],['institutional_content','Quem Somos']];
export async function administration(area='users') {
  if(!ADMIN_AREAS.some(a=>a[0]===area))area='users';
  let data,permissions=[],cache={},html;
  if(area==='users') {
    [data,permissions]=await Promise.all([rows('profiles','*','created_at'),rows('tab_permissions')]);
    cache.profiles=data;cache.tab_permissions=permissions;
    html=`<p class="notice">Aprova cada conta e atribui acesso a cada aba. O acesso de Comando inclui todas as secções. Retirar a aprovação bloqueia todas as secções internas. A eliminação de contas está reservada à administração no Supabase.</p>${search('Pesquisar nome ou email')}<div class="admin-list">${data.map(p=>`<article class="admin-row filter-item" data-search="${e(normalize(`${p.full_name} ${p.email}`))}"><div><h3>${e(p.full_name)}</h3><p class="muted">${e(p.email)}</p><span class="badge">${!p.approved?'Aguarda aprovação':p.role==='command'?'Comando':'Membro aprovado'}</span><span class="small muted"> ${permissions.filter(t=>t.user_id===p.id).length} abas atribuídas</span></div>${button('access','Gerir acessos',`data-id="${p.id}"`)}</article>`).join('')}</div>`;
  } else {
    const select=area==='warnings'?'*,warning_members(member_id)':area==='event_logs'?'*,event_log_participants(member_id)':'*';
    data=await rows(area,select);cache[area]=data;
    html=`<div class="admin-toolbar">${['contact_info','institutional_content'].includes(area)?'<p>Textos publicados e identidade da unidade.</p>':create(area,'Adicionar')}</div><div class="admin-list">${data.length?data.map(v=>`<article class="admin-row"><div><h3>${e(v.title || v.name || v.hero_title || `${v.event_type} · ${date(v.starts_at)}`)}</h3><p class="muted small">${e(v.rank || v.category || v.chapter || v.location || '')}</p></div>${cardActions(area,v.id,!['contact_info','institutional_content'].includes(area)) || button('edit','Editar',`data-table="${area}" data-id="${v.id}"`)}</article>`).join(''):empty()}</div>`;
  }
  return {html:`<section class="container page">${heading('ÁREA DE COMANDO','Administração','Conteúdos, utilizadores e permissões da unidade.')}<div class="admin-tabs">${ADMIN_AREAS.map(([key,label])=>`<a class="${key===area?'active':''}" href="#/administracao?area=${key}" ${key===area?'aria-current="page"':''}>${e(label)}</a>`).join('')}</div><h2 class="admin-heading">${e(ADMIN_AREAS.find(a=>a[0]===area)[1])}</h2>${html}</section>`,cache};
}
export function login(mode='login') {
  if(state.otp)return otpScreen();
  const recovering=state.recovery;
  if(state.user && !recovering) return {html:`<section class="container page auth-page"><div class="auth-shell">${heading('Membros','Área reservada')}<div class="panel"><p class="eyebrow">${state.profile?.approved?'Conta aprovada':'Acesso pendente'}</p><h2>${e(state.profile?.full_name || 'Bem-vindo')}</h2><p class="prose">${state.profile?.approved?'As secções autorizadas pelo Comando estão disponíveis no menu.':'A tua conta foi criada. Aguarda a aprovação do Comando e a atribuição das abas a que podes aceder.'}</p><div class="hero-buttons">${button('refresh','Atualizar permissões')}${button('logout','Terminar sessão')}</div></div></div></section>`};
  const signup=mode==='registo',reset=mode==='recuperar',title=recovering?'Definir palavra-passe':signup?'Criar conta':reset?'Recuperar acesso':'Entrar';
  return {html:`<section class="container page auth-page"><div class="auth-shell">${heading('Membros',title)}<form id="auth-form" data-mode="${recovering?'password':signup?'signup':reset?'reset':'login'}">${signup?'<label class="sr-only" for="auth-name">Nome de serviço</label><input id="auth-name" name="full_name" placeholder="Nome de serviço" minlength="2" maxlength="100" required autocomplete="name">':''}${!recovering?'<label class="sr-only" for="auth-email">Email</label><input id="auth-email" name="email" type="email" placeholder="Email" required autocomplete="email" maxlength="254">':''}${!reset?`<label class="sr-only" for="auth-password">Palavra-passe</label><input id="auth-password" name="password" type="password" placeholder="Palavra-passe" required minlength="${signup||recovering?12:1}" maxlength="128" autocomplete="${signup||recovering?'new-password':'current-password'}">`:''}${signup||recovering?'<label class="sr-only" for="auth-confirm">Confirmar palavra-passe</label><input id="auth-confirm" name="confirmation" type="password" placeholder="Confirmar palavra-passe" minlength="12" required autocomplete="new-password"><p class="muted small">Usa pelo menos 12 caracteres.</p>':''}<p class="form-error" role="alert" hidden></p><button class="button primary" type="submit">${recovering?'Guardar palavra-passe':signup?'Criar conta':reset?(state.otpEnabled?'Enviar código':'Enviar ligação'):'Entrar'}</button></form>${!recovering?`<div class="auth-links"><a href="${signup||reset?'#/entrar':'#/entrar?modo=registo'}">${signup||reset?'Já tens conta? Entrar':'Ainda não tens conta? Criar conta'}</a>${!reset?'<a href="#/entrar?modo=recuperar">Recuperar acesso</a>':''}</div>`:''}</div></section>`};
}
export function restricted() {return {html:`<section class="container page auth-page">${heading('ACESSO RESERVADO','Secção não autorizada')}<div class="panel"><p>Esta secção requer autorização do Comando. Entra na tua conta ou pede a atualização das tuas permissões.</p><div class="hero-buttons"><a class="button primary" href="#/entrar">A minha conta ↗</a><a class="button outline" href="#/contactos">Contactos</a></div></div></section>`};}

// Filtros totalmente locais aos dados que a base de dados autorizou a consultar.
export function filterPage(root=document.querySelector('main')) {
  const value=key=>root.querySelector(`[data-filter="${key}"]`)?.value || '';
  const query=normalize(value('search'));let count=0;
  root.querySelectorAll('.filter-item').forEach(el=>{
    const matches=(!query || (el.dataset.search || '').includes(query)) &&
      (!value('rank') || el.dataset.rank===value('rank')) && (!value('kind') || el.dataset.kind===value('kind')) &&
      (!value('member') || (el.dataset.members || '').split(' ').includes(value('member'))) &&
      (!value('period') || el.dataset.period===value('period')) &&
      (!value('from') || el.dataset.date>=value('from')) && (!value('to') || el.dataset.date<=value('to'));
    el.hidden=!matches;if(matches)count++;
  });
  root.querySelectorAll('.rank-section,.chapter-section').forEach(el=>el.hidden=![...el.querySelectorAll('.filter-item')].some(c=>!c.hidden));
  const total=root.querySelector('.filter-count');if(total)total.textContent=`${count} resultado${count===1?'':'s'}`;
}
