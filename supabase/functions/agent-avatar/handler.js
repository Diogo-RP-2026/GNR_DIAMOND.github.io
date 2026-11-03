import {normalizeImage,readLimitedBody} from './validation.js';
export function createAvatarHandler({clientForToken,storage,env=()=>undefined,uuid=()=>crypto.randomUUID()}) {return async req=>{
 const origins=(env('OTP_ALLOWED_ORIGINS')||'https://diogo-rp-2026.github.io').split(',').map(s=>s.trim()).filter(Boolean);
 const origin=req.headers.get('Origin')||'';
 const cors={'Vary':'Origin','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',...(origins.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!origins.includes(origin))return reply(403,{error:'Origem não autorizada.'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
 const authorization=req.headers.get('Authorization') || '';
 if(!/^Bearer \S+$/.test(authorization))return reply(401,{error:'Inicia sessão para carregar uma fotografia.'});
 const scoped=clientForToken(authorization);
 try {
  const {data:identity,error:authError}=await scoped.auth.getUser(authorization.slice(7));
  const user=identity?.user;
  if(authError||!user)return reply(401,{error:'Sessão inválida. Volta a entrar.'});
  if(!req.headers.get('Content-Type')?.startsWith('multipart/form-data'))return reply(400,{error:'Seleciona uma fotografia.'});
  // Reserve a quota before buffering/decoding; this RPC validates session, OTP, approval and role.
  const tab=new URL(req.url).searchParams.get('tab');
  const {data:allowed,error:quotaError}=await scoped.rpc('reserve_portal_upload',{p_tab:tab});
  if(quotaError||allowed!==true)return reply(429,{error:'Sem autorização ou limite de carregamentos atingido. Tenta mais tarde.'});
  const bytes=await readLimitedBody(req);
  const form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('Content-Type')}}).formData();
  const file=form.get('photo');if(!(file instanceof File))return reply(400,{error:'Seleciona uma fotografia.'});
  const image=await normalizeImage(new Uint8Array(await file.arrayBuffer()),file.type);
  const path=`${tab||user.id}/${uuid()}.${image.extension}`,bucket=tab?'ushe-media':'ushe-avatars';
  const {error:uploadError}=await storage.from(bucket).upload(path,image.bytes,{contentType:image.mime,upsert:false,cacheControl:'0'});
  if(uploadError)return reply(503,{error:'Não foi possível guardar a fotografia. Tenta novamente.'});
  return reply(200,{path});
 }catch(error){return reply(400,{error:error instanceof Error&&/fotografia|Ficheiro|Seleciona/.test(error.message)?error.message:'Não foi possível processar a fotografia.'});}
};}
