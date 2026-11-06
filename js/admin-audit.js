import {rpc} from './api.js';
import {date,e,empty,errorMessage,TABS} from './core.js';
import {requestGate} from './feed.js';

const entities={account:'Conta',profile:'Perfil',equipment:'Equipamento',audit:'Auditoria'};
const results={succeeded:'Concluído',failed:'Falhou',denied:'Recusado',started:'Iniciado',resumed:'Retomado'};
const actions={
  'account.delete':'Apagar conta',
  'account.access.update':'Alterar acesso à conta',
  'account.profile.update':'Alterar nome da conta',
  'account.tab.insert':'Atribuir acesso a uma aba',
  'account.tab.update':'Alterar acesso a uma aba',
  'account.tab.delete':'Retirar acesso a uma aba',
  'equipment.create':'Criar equipamento',
  'equipment.update':'Editar equipamento',
  'equipment.delete':'Apagar equipamento',
  'equipment.save':'Guardar equipamento',
  'equipment.image.add':'Adicionar imagem de equipamento',
  'equipment.image.replace':'Substituir imagem de equipamento',
  'equipment.image.remove':'Remover imagem de equipamento',
  'audit.hide':'Ocultar registo da listagem'
};
const profileActions={official:'perfil oficial',subunit:'subunidade',qualification:'formação ou especialização',distinction:'distinção'};
const operations={create:'Criar',update:'Editar',delete:'Apagar'};
const fields={full_name:'Nome da conta',name:'Nome',rank:'Patente',callsign:'Indicativo',uniform_number:'Uniforme',agent_number:'Número de agente',
  joined_on:'Data de ingresso',active:'Estado',user_id:'Conta associada',image_path:'Fotografia',member_id:'Agente',kind:'Tipo',
  completed_on:'Data de conclusão',issuer:'Entidade responsável',description:'Descrição',awarded_on:'Data de atribuição',symbol:'Insígnia',
  category:'Categoria',mandatory:'Obrigatoriedade',notes:'Notas',sort_order:'Ordem'};
const reasons={forbidden:'Acesso insuficiente',protected:'Conta de Comando protegida',missing:'Registo indisponível',storage:'Falha no Storage',
  photos_remaining:'Fotografias ainda por remover',database:'Falha na base de dados',conflict:'O equipamento foi alterado durante a edição'};
const roles={command:'Comando',member:'Membro'};
const approval=value=>value?'Aprovada':'Por aprovar';

function actionLabel(action){
  if(Object.hasOwn(actions,action))return actions[action];
  const [group,subject,operation]=String(action).split('.');
  if(group==='profile'&&Object.hasOwn(profileActions,subject)&&Object.hasOwn(operations,operation))return `${operations[operation]} ${profileActions[subject]}`;
  return String(action);
}

function detailLines(details={}){
  const lines=[];
  const knownFields=Array.isArray(details.fields)?details.fields.filter(key=>Object.hasOwn(fields,key)).map(key=>fields[key]):[];
  if(knownFields.length)lines.push(['Campos',knownFields.join(', ')]);
  if(Object.hasOwn(reasons,details.reason))lines.push(['Motivo',reasons[details.reason]]);
  if(details.role_before!==details.role_after&&Object.hasOwn(roles,details.role_before)&&Object.hasOwn(roles,details.role_after)){
    lines.push(['Cargo',`${roles[details.role_before]} → ${roles[details.role_after]}`]);
  }
  if(typeof details.approved_before==='boolean'&&typeof details.approved_after==='boolean'&&details.approved_before!==details.approved_after){
    lines.push(['Aprovação',`${approval(details.approved_before)} → ${approval(details.approved_after)}`]);
  }
  if(typeof details.rank_before==='string'&&typeof details.rank_after==='string')lines.push(['Patente',`${details.rank_before} → ${details.rank_after}`]);
  const tab=TABS.find(([key])=>key===details.tab)?.[1];
  if(tab)lines.push(['Aba',tab]);
  if(details.tab==='registos'&&typeof details.can_create_after==='boolean')lines.push(['Criação de registos',details.can_create_after?'Permitida':'Sem permissão']);
  if(typeof details.subunit==='string')lines.push(['Subunidade',details.subunit]);
  if(details.member_id)lines.push(['Referência do agente',details.member_id]);
  if(details.log_action)lines.push(['Ação ocultada',actionLabel(details.log_action)]);
  return lines;
}

export function auditCard(entry){
  const pairs=[['Autor',entry.actor_name],['Entidade',entities[entry.entity]||entry.entity],['Registo',entry.target_name]];
  if(entry.target_id)pairs.push(['Referência',entry.target_id]);
  pairs.push(...detailLines(entry.details));
  return `<article class="panel audit-record">
    <div class="document-meta"><time datetime="${e(entry.occurred_at)}">${e(date(entry.occurred_at))}</time><span class="badge">${e(results[entry.result]||entry.result)}</span></div>
    <h3>${e(actionLabel(entry.action))}</h3>
    <dl class="audit-fields">${pairs.map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>
    ${entry.hidden_at?`<p class="muted small">Ocultado por ${e(entry.hidden_by_name)} em ${e(date(entry.hidden_at))}.</p>`:
      `<button type="button" class="button outline" data-audit-hide="${e(entry.id)}">Ocultar da listagem</button>`}
  </article>`;
}

function options(labels){return Object.entries(labels).map(([value,label])=>`<option value="${e(value)}">${e(label)}</option>`).join('');}
export function adminAuditPage(){
  return {html:`<section data-admin-audit>
    <p class="notice">Os logs são permanentes. Os registos ocultos ficam disponíveis no filtro Ocultos.</p>
    <form class="filter-bar audit-filters">
      <label>Pesquisa<input type="search" name="query" maxlength="160" placeholder="Autor, registo ou referência"></label>
      <label>Listagem<select name="visibility"><option value="visible">Visíveis</option><option value="hidden">Ocultos</option><option value="all">Todos</option></select></label>
      <label>Entidade<select name="entity"><option value="">Todas</option>${options(entities)}</select></label>
      <label>Resultado<select name="result"><option value="">Todos</option>${options(results)}</select></label>
      <button type="submit" class="button">Pesquisar</button>
    </form>
    <p class="feed-status" role="status" aria-live="polite" data-audit-status>A carregar…</p>
    <div class="feed" aria-busy="true" data-audit-items></div>
    <nav class="pagination" aria-label="Paginação dos logs">
      <button type="button" class="button outline" data-audit-prev disabled>← Anterior</button>
      <span data-audit-page>Página 1</span>
      <button type="button" class="button outline" data-audit-next disabled>Seguinte →</button>
      <button type="button" class="text-button" data-audit-refresh>Atualizar</button>
    </nav>
  </section>`,mount(root){return mountAdminAudit(root.querySelector('[data-admin-audit]'));}};
}

export function mountAdminAudit(host,{list=args=>rpc('admin_audit_list',args),hide=id=>rpc('admin_audit_hide',{p_log:id})}={}){
  const filters=host.querySelector('form');
  const items=host.querySelector('[data-audit-items]');
  const status=host.querySelector('[data-audit-status]');
  const previous=host.querySelector('[data-audit-prev]');
  const following=host.querySelector('[data-audit-next]');
  const pageLabel=host.querySelector('[data-audit-page]');
  const cursors=[null];
  const gate=requestGate();
  let page=0,next=null,loading=false,hiding=false,disposed=false;
  let selection=selectedFilters();

  function controls(){
    previous.disabled=loading||hiding||page===0;
    following.disabled=loading||hiding||!next;
    items.querySelectorAll('[data-audit-hide]').forEach(button=>{button.disabled=loading||hiding;});
    items.setAttribute('aria-busy',String(loading||hiding));
  }

  function selectedFilters(){
    return {
      p_query:filters.querySelector('[name="query"]').value.trim(),
      p_visibility:filters.querySelector('[name="visibility"]').value||'visible',
      p_entity:filters.querySelector('[name="entity"]').value||'',
      p_result:filters.querySelector('[name="result"]').value||''
    };
  }

  function unavailable(error){
    items.replaceChildren();
    next=null;
    status.textContent=errorMessage(error);
    loading=false;
    controls();
  }

  async function load(index=page,notice=''){
    if(disposed)return;
    gate.invalidate();
    loading=true;
    status.textContent='A carregar os logs…';
    controls();
    const args={...selection,p_cursor:cursors[index]};
    await gate.run(()=>list(args),data=>{
      if(!Array.isArray(data?.items))throw new Error('Não foi possível confirmar a listagem de logs.');
      items.innerHTML=data.items.length?data.items.map(auditCard).join(''):empty('Sem registos para os filtros selecionados.');
      page=index;
      next=data.next_cursor||null;
      pageLabel.textContent=`Página ${page+1}`;
      status.textContent=`${notice?`${notice} `:''}${data.items.length} ${data.items.length===1?'registo':'registos'} nesta página.`;
      loading=false;
      controls();
    },unavailable);
  }

  function reset(event){
    event?.preventDefault();
    selection=selectedFilters();
    cursors.splice(1);
    page=0;
    next=null;
    pageLabel.textContent='Página 1';
    return load(0);
  }

  async function click(event){
    if(event.target.closest('[data-audit-refresh]')){await reset();return;}
    if(loading||hiding)return;
    if(event.target.closest('[data-audit-prev]')&&page>0){await load(page-1);return;}
    if(event.target.closest('[data-audit-next]')&&next){cursors[page+1]=next;await load(page+1);return;}
    const button=event.target.closest('[data-audit-hide]');
    if(!button||button.disabled)return;
    hiding=true;
    status.textContent='A ocultar o registo…';
    controls();
    try{
      const result=await hide(button.dataset.auditHide);
      if(result?.ok!==true)throw new Error('O registo já não está disponível. Atualiza a listagem.');
      if(!disposed)await load(page,result.already_hidden?'O registo já estava oculto.':'Registo ocultado da listagem.');
    }catch(error){
      if(!disposed){if(error?.code==='42501')unavailable(error);else status.textContent=errorMessage(error);}
    }finally{
      hiding=false;
      if(!disposed)controls();
    }
  }

  filters.addEventListener('submit',reset);
  const filterChange=event=>{if(event.target.matches('select'))reset();};
  filters.addEventListener('change',filterChange);
  host.addEventListener('click',click);
  load();
  return {refresh:()=>reset(),invalidate:()=>gate.invalidate(),dispose(){
    disposed=true;
    gate.stop();
    filters.removeEventListener('submit',reset);
    filters.removeEventListener('change',filterChange);
    host.removeEventListener('click',click);
  }};
}
