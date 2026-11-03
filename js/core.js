// Utilitários partilhados. Conteúdo introduzido pelos utilizadores é sempre texto.
export const TABS = Object.freeze([
  ['quem-somos','Quem Somos'], ['equipa','Equipa'], ['anuncios','Anúncios'],
  ['eventos','Eventos'], ['avisos','Avisos'], ['fardamento','Fardamento'],
  ['equipamento','Equipamento'], ['regulamento','Regulamento Interno'], ['registos','Registos'],
]);
export const RANKS = ['Comando','Primeiro Oficial','Oficial','Sargento','Operacional','Estagiário','Quadros Permanentes'];
export const PIECES = ['Máscaras','Lenços e Correntes','Casacos','T-Shirt','Colete','Mãos','Calças','Sapatos','Chapéus'];
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const e = escapeHTML;
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const uniform = n => `Uniform-${String(n).padStart(2,'0')}`;
export const initials = name => name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();
export function date(value, time = true) {
  if(!value) return '—';
  const v = value.length === 10 ? `${value}T12:00:00Z` : value;
  return new Intl.DateTimeFormat('pt-PT',{dateStyle:'medium',...(time?{timeStyle:'short'}:{}),timeZone:'Europe/Lisbon'}).format(new Date(v));
}
export function lisbonInput(value = new Date().toISOString()) {
  const parts = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
  return parts.replace(' ','T');
}
// Conversão explícita: Portugal continental, mesmo num computador noutro fuso.
// Na hora repetida do outono escolhe-se a primeira ocorrência; horas inexistentes são recusadas.
export function lisbonISO(input) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error('Data/hora inválida.');
  const base = Date.parse(`${input}:00Z`);
  for(const offset of [60,0]) {
    const instant = new Date(base-offset*60000).toISOString();
    if(lisbonInput(instant)===input) return instant;
  }
  throw new Error('Esta hora não existe em Portugal continental devido à mudança da hora.');
}
export function dateRange(start,end) {
  const starts_at=lisbonISO(start), ends_at=lisbonISO(end);
  if(new Date(ends_at)<=new Date(starts_at)) throw new Error('A hora de fim tem de ser posterior à hora de início.');
  return {starts_at,ends_at};
}
export function orderedEvents(events,now=Date.now()) {
  return [...events].sort((a,b)=>{
    const ap = Date.parse(a.ends_at)<now, bp = Date.parse(b.ends_at)<now;
    return ap !== bp ? Number(ap)-Number(bp) : ap ? Date.parse(b.starts_at)-Date.parse(a.starts_at) : Date.parse(a.starts_at)-Date.parse(b.starts_at);
  });
}
export function discordURL(value) {
  return /^https:\/\/(discord\.gg\/|discord\.com\/invite\/)[a-zA-Z0-9-]+\/?$/.test(value ?? '') ? value : '';
}
export function errorMessage(error) {
  if(error?.code === '23503') return 'Este elemento tem registos associados. Podes marcá-lo como inativo em vez de o apagar.';
  if(error?.code === '23505') return 'Já existe um registo com este número ou identificador.';
  if(error?.code === '42501') return 'Sem autorização para esta operação. Atualiza a sessão ou contacta o Comando.';
  const message = error?.message || String(error);
  const translations = {'Invalid login credentials':'Email ou palavra-passe incorretos.','Email not confirmed':'Confirma o teu email antes de entrar.','User already registered':'Já existe uma conta com este email.','New password should be different from the old password.':'Escolhe uma palavra-passe diferente da anterior.','Failed to fetch':'Não foi possível ligar ao serviço. Verifica a ligação à Internet.'};
  if(translations[message])return translations[message];
  if(error?.code||error?.status||/^(?:Auth|Postgrest|Storage|Functions)/.test(error?.name||''))return 'Não foi possível concluir a operação. Verifica os dados e as permissões ou tenta mais tarde.';
  // Local validation messages are authored by this application; remote errors never pass through.
  return error instanceof Error?message:'Não foi possível concluir a operação. Tenta novamente.';
}
export function toast(message,error=false) {document.dispatchEvent(new CustomEvent('ushe:notify',{detail:{message,error}}));}
export function empty(text='Ainda não existem registos nesta secção.') {return `<div class="empty"><span>◇</span><p>${e(text)}</p></div>`;}
export function heading(kicker,title,subtitle='',action='') {return `<div class="page-heading"><div><p class="eyebrow">${e(kicker)}</p><h1>${e(title)}</h1>${subtitle?`<p class="muted">${e(subtitle)}</p>`:''}</div>${action}</div>`;}
export const button = (action,label,attributes='')=>`<button type="button" class="button" data-action="${action}" ${attributes}>${e(label)}</button>`;
export function cardActions(table,id,canEdit) {
  return canEdit?`<div class="card-actions">${button('edit','Editar',`data-table="${table}" data-id="${id}"`)}<button class="text-button danger" data-action="delete" data-table="${table}" data-id="${id}">Apagar</button></div>`:'';
}


// Timestamp do servidor, incluindo microssegundos; UUID desempata de forma estável.
export function orderedResponses(responses) {
  const fraction=r=>(r.updated_at?.match(/\.(\d+)/)?.[1] || '').padEnd(6,'0');
  return [...responses].sort((a,b)=>(Date.parse(a.updated_at)||0)-(Date.parse(b.updated_at)||0)
    || fraction(a).localeCompare(fraction(b)) || a.user_id.localeCompare(b.user_id));
}
