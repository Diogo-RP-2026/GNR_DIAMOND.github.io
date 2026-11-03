import {validateImage,readLimitedBody} from './validation.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
export function createAvatarHandler({clientForToken,storage,uuid=()=>crypto.randomUUID()}) {return async req=>{
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
 const authorization=req.headers.get('Authorization') || '';
 if(!/^Bearer \S+$/.test(authorization))return reply(401,{error:'Inicia sessão para carregar uma fotografia.'});
 const scoped=clientForToken(authorization);
 try {
  const {data:{user},error:authError}=await scoped.auth.getUser(authorization.slice(7));
  if(authError||!user)return reply(401,{error:'Sessão inválida. Volta a entrar.'});
  // A consulta conserva OTP, aprovação e RLS: o serviço nunca decide por metadados JWT editáveis.
  const {data:member,error}=await scoped.from('members').select('id').eq('user_id',user.id).maybeSingle();
  if(error||!member)return reply(403,{error:'A conta precisa de estar aprovada, verificada e associada a um agente.'});
  if(!req.headers.get('Content-Type')?.startsWith('multipart/form-data'))return reply(400,{error:'Seleciona uma fotografia.'});
  const bytes=await readLimitedBody(req);
  const form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('Content-Type')}}).formData();
  const file=form.get('photo');if(!(file instanceof File))return reply(400,{error:'Seleciona uma fotografia.'});
  const image=new Uint8Array(await file.arrayBuffer()),extension=validateImage(image,file.type);
  const path=`${user.id}/${uuid()}.${extension}`;
  // Só o serviço escreve neste bucket. JWTs de agentes não podem contornar a validação por upload direto.
  const {error:uploadError}=await storage.from('ushe-avatars').upload(path,image,{contentType:file.type,upsert:false,cacheControl:'0'});
  if(uploadError)return reply(503,{error:'Não foi possível guardar a fotografia. Tenta novamente.'});
  return reply(200,{path});
 }catch(error){return reply(400,{error:error instanceof Error&&/fotografia|Ficheiro|Seleciona/.test(error.message)?error.message:'Não foi possível processar a fotografia.'});}
};}
