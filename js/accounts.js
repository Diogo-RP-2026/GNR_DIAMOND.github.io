import {e} from './core.js';
import {db,isCommand} from './api.js';
export function accountDeletionControls(profile,job) {
 if(profile.role==='command')return '<p class="notice small">Conta de Comando protegida. O cargo não pode ser reduzido para permitir a eliminação.</p>';
 return `<div class="account-danger-zone"><h3>Apagar conta</h3><p class="muted small">Remove a conta, o perfil do agente e as fotografias associadas. Os registos históricos são preservados.</p>${job?'<p class="notice" role="status">Eliminação pendente. O acesso já está bloqueado. Retoma a operação para a concluir.</p>':''}<button type="button" class="button danger" data-action="delete-account" data-id="${e(profile.id)}">${job?'Retomar eliminação':'Apagar conta'}</button></div>`;
}
export async function removeMemberAccount(profile,agentName,{client=db,confirmAction=message=>confirm(message)}={}) {
 if(!isCommand())throw new Error('Só o Comando pode apagar contas.');
 if(!profile||profile.role!=='member')throw new Error('As contas de Comando estão protegidas.');
 if(!confirmAction(`Apagar a conta de «${agentName||profile.full_name}»? A conta de autenticação, o perfil e a fotografia serão removidos e as sessões serão terminadas. Os registos históricos são preservados. Esta ação é irreversível.`))return false;
 const {data,error}=await client.functions.invoke('account-admin',{body:{action:'delete-member',target_id:profile.id}});
 let response=data;
 if(error?.context instanceof Response){try{response=await error.context.clone().json();}catch{}}
 if(error||response?.ok!==true||response?.status!=='completed') {
  const failure=new Error(response?.status==='pending'?'A eliminação ficou pendente e o acesso está bloqueado. Usa «Retomar eliminação» para concluir.':response?.reason==='protected'?'Esta conta de Comando está protegida.':'Não foi possível confirmar a eliminação. Atualiza a listagem e tenta novamente.');
  failure.pending=response?.status==='pending';throw failure;
 }
 return true;
}
