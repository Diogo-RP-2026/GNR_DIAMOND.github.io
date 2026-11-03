// Cliente Supabase. Só são aceites chaves públicas; a autorização efetiva é feita por RLS.
const config=window.USHE_CONFIG || {};
function safePublicKey(key) {
  if(key.startsWith('sb_publishable_')) return true;
  if(key.startsWith('sb_secret_')) return false;
  try { const p=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return p.role==='anon'; } catch { return false; }
}
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(config.supabaseUrl || '') && safePublicKey(config.supabasePublishableKey || '') && !!window.supabase;
export const db=configured?window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
}):null;
export const state={user:null,profile:null,permissions:[],publicInfo:null,recovery:false,otp:null,otpEnabled:false};
export const isCommand=()=>state.profile?.approved && state.profile?.role==='command';
export const hasTab=tab=>!!(state.profile?.approved && (isCommand() || state.permissions.some(p=>p.tab===tab)));
export const canLog=()=>isCommand() || (hasTab('registos') && state.permissions.some(p=>p.tab==='registos' && p.can_create));
export async function result(query) {const {data,error}=await query;if(error)throw error;return data;}
export async function loadIdentity() {
  state.profile=null;state.permissions=[];
  if(!db || !state.user || state.otp)return;
  // Uma sessão obtida diretamente no Auth não dispensa a verificação no servidor.
  if(state.otpEnabled && !(await result(db.rpc('otp_session_verified')))) {
    await result(db.auth.signOut({scope:'local'}));state.user=null;return;
  }
  const [profile,permissions]=await Promise.all([
    result(db.from('profiles').select('*').eq('id',state.user.id).maybeSingle()),
    result(db.from('tab_permissions').select('*').eq('user_id',state.user.id)),
  ]);
  state.profile=profile;state.permissions=permissions;
}
// A API limita o tamanho de cada resposta. A paginação evita truncar votos/nomes aos 1000 registos.
export async function allRows(query,batch=500) {
  const output=[];
  for(let offset=0;;offset+=batch) {
    const page=await result(query.range(offset,offset+batch-1));output.push(...page);
    if(page.length<batch)return output;
  }
}
export const rows=(table,select='*',order)=>{
  const q=db.from(table).select(select);
  return allRows(order?q.order(order):q.order(table==='tab_permissions'?'user_id':'id'));
};
export const rpc=(name,args={})=>{
  if(name==='response_names')return allRows(db.rpc(name,args).order('updated_at').order('user_id'));
  return name==='member_options'?allRows(db.rpc(name,args)):result(db.rpc(name,args));
};
export const canManageEvent=event=>!!(hasTab('eventos') && (isCommand() || event?.created_by===state.user?.id));
export async function save(table,id,data) {
  return result(id?db.from(table).update(data).eq('id',id).select().single():db.from(table).insert(data).select().single());
}
// Descarregamento autenticado: as fotografias internas ficam num bucket privado.
export async function hydrateImages(root=document) {
  await Promise.allSettled([...root.querySelectorAll('img[data-path]')].map(async img=>{
    const data=await result(db.storage.from(img.dataset.bucket || 'ushe-media').download(img.dataset.path));
    if(!img.isConnected)return;
    const url=URL.createObjectURL(data);img.src=url;img.dataset.objectUrl=url;img.hidden=false;
    const fallback=img.parentElement.querySelector('.image-placeholder');if(fallback)fallback.hidden=true;
  }));
}
export function releaseImages(root=document) {
  root.querySelectorAll('[data-object-url]').forEach(img=>URL.revokeObjectURL(img.dataset.objectUrl));
}
export async function upload(file,tab) {
  if(!file?.size) return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Escolhe uma imagem JPG, PNG ou WebP.');
  if(file.size>5*1024*1024)throw new Error('A imagem pode ter no máximo 5 MB.');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  const path=`${tab}/${crypto.randomUUID()}.${ext}`;
  await result(db.storage.from('ushe-media').upload(path,file,{contentType:file.type,upsert:false}));
  return path;
}

// Compatibilidade com projetos em que a migração OTP ainda não foi instalada.
export async function loadOtpPolicy() {
  const {data,error}=await db.rpc('otp_policy');
  if(error&&error.code!=='PGRST202')throw error;
  state.otpEnabled=!error&&data?.enabled===true;
  return state.otpEnabled;
}
