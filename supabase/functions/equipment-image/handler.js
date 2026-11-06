import {normalizeImage,readLimitedBody} from '../agent-avatar/validation.js';
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const saveErrors={
 400:'Os dados do equipamento são inválidos. Confirma os campos e a imagem.',
 403:'A sessão já não autoriza esta alteração. Verifica o email e as permissões.',
 409:'O equipamento foi alterado. Atualiza a listagem antes de guardar.',
 503:'Não foi possível guardar o equipamento. Tenta novamente.'
};
export function createEquipmentImageHandler({clientForToken,service,storage,env=()=>undefined,uuid=()=>crypto.randomUUID()}) {
 const worker=async(action,run=null,success=null)=>{
  const {data,error}=await service.rpc('equipment_media_worker',{p_action:action,p_run:run,p_success:success});
  if(error||!data?.ok)throw new Error('worker');return data;
 };
 const cleanup=async ticket=>{
  const plan=await worker('claim',ticket);
  if(!Array.isArray(plan.files)||plan.files.some(p=>!/^equipamento\/[a-zA-Z0-9._-]+$/.test(p)))throw new Error('worker');
  let success=true;
  if(plan.files.length){try{const {error}=await storage.from('ushe-media').remove(plan.files);success=!error;}catch{success=false;}}
  const outcome=await worker('finish',plan.run_id,success);
  return {pending:!!outcome.pending,removed:success?plan.files.length:0};
 };
 return async req=>{
  const origins=(env('OTP_ALLOWED_ORIGINS')||'https://diogo-rp-2026.github.io').split(',').map(v=>v.trim());
  const origin=req.headers.get('Origin')||'',type=req.headers.get('Content-Type')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',
   'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',...(origins.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(req.method==='OPTIONS')return origins.includes(origin)?new Response(null,{status:204,headers}):reply(403,{error:'Origem não autorizada.'});
  if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
  // Cron uses a short-lived, single-use ticket held in private tables. It can
  // trigger only DB-selected cleanup, never choose paths or change equipment.
  if(type.startsWith('application/json')){
   try{
    const body=JSON.parse(new TextDecoder().decode(await readLimitedBody(req,2048)));
    if(body.action!=='cleanup'||!uuidPattern.test(body.ticket||''))return reply(401,{error:'Pedido de manutenção inválido.'});
    const result=await cleanup(body.ticket);return reply(200,{ok:true,...result});
   }catch{return reply(401,{error:'Pedido de manutenção inválido ou expirado.'});}
  }
  if(!origins.includes(origin))return reply(403,{error:'Origem não autorizada.'});
  const authorization=req.headers.get('Authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply(401,{error:'Inicia sessão para gerir equipamento.'});
  const scoped=clientForToken(authorization);let path=null;
  try{
   const {data:identity,error:authError}=await scoped.auth.getUser(authorization.slice(7));
   if(authError||!identity?.user)return reply(401,{error:'Sessão inválida. Volta a entrar.'});
   const {data:permission,error:permissionError}=await scoped.rpc('equipment_image_save',{p_action:'authorize'});
   if(permissionError||permission?.ok!==true)return reply(403,{error:'Sem autorização para gerir equipamento. Confirma a sessão e a verificação do email.'});
   if(!type.startsWith('multipart/form-data'))return reply(400,{error:'Pedido de equipamento inválido.'});
   const bytes=await readLimitedBody(req),form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();
   const raw=form.get('data');if(typeof raw!=='string'||raw.length>16000)return reply(400,{error:'Dados de equipamento inválidos.'});
   const input=JSON.parse(raw);
   if(!input||!uuidPattern.test(input.id||'')||!['keep','replace','remove'].includes(input.image_action)||!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields))return reply(400,{error:'Dados de equipamento inválidos.'});
   if(input.expected_revision!==null&&(!Number.isSafeInteger(input.expected_revision)||input.expected_revision<0))return reply(400,{error:'Versão de equipamento inválida.'});
   if(input.image_action==='replace'){
    const {data:quota,error:quotaError}=await scoped.rpc('reserve_portal_upload',{p_tab:'equipamento'});
    if(quotaError||quota!==true)return reply(429,{error:'Limite de carregamentos atingido ou autorização alterada. Tenta mais tarde.'});
    const file=form.get('photo');if(!(file instanceof File))return reply(400,{error:'Seleciona uma imagem ajustada.'});
    const image=await normalizeImage(new Uint8Array(await file.arrayBuffer()),file.type);
    path=`equipamento/${uuid()}.jpg`;
    const {error}=await storage.from('ushe-media').upload(path,image.bytes,{contentType:image.mime,upsert:false,cacheControl:'0'});
    if(error)throw Object.assign(new Error('upload'),{status:503});
   }
   const {data:saved,error:saveError}=await scoped.rpc('equipment_image_save',{p_action:input.image_action,p_id:input.id,p_data:input.fields,p_path:path,p_expected_revision:input.expected_revision});
   if(saveError||saved?.ok!==true){
    let status=503;
    if(saved?.reason==='conflict')status=409;
    else if(saveError?.code==='42501')status=403;
    else if(/^(22|23)/.test(saveError?.code||''))status=400;
    throw Object.assign(new Error('save'),{status});
   }
   let pending=true;try{pending=(await cleanup(null)).pending;}catch{}
   return reply(200,{ok:true,equipment:saved.equipment,cleanup_pending:pending});
  }catch(error){
   // If authorization/commit fails after upload, the staged file stays tracked.
   // Best-effort queueing accelerates cleanup; Cron recovers after a crash too.
   if(path){try{await scoped.rpc('equipment_image_save',{p_action:'queue',p_path:path});await cleanup(null);}catch{}}
   const message=error?.message;
   let feedback='Não foi possível processar o equipamento. Verifica os campos e tenta novamente.';
   if(message==='save')feedback=saveErrors[error.status];
   else if(message==='upload')feedback='Não foi possível carregar a imagem. As alterações não foram guardadas.';
   else if(/fotografia|Ficheiro|Seleciona/.test(message||''))feedback=message;
   return reply(error?.status||400,{error:feedback});
  }
 };
}
