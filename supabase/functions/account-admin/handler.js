// The caller's JWT is checked by Auth and by every database operation.
// Storage uses the server credential only with a database-generated manifest.
export function createAccountAdminHandler({clientForToken,storage,env=()=>undefined}) {
 return async req=>{
  const origins=(env('OTP_ALLOWED_ORIGINS')||'https://diogo-rp-2026.github.io').split(',').map(s=>s.trim()).filter(Boolean);
  const origin=req.headers.get('Origin')||'';
  const cors={'Vary':'Origin','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',...(origins.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  // Non-browser clients still have to pass exactly the same JWT/RLS checks.
  if(origin&&!origins.includes(origin))return reply(403,{ok:false,reason:'origin'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{ok:false,reason:'method'});
  const authorization=req.headers.get('Authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply(401,{ok:false,reason:'session'});
  const client=clientForToken(authorization);
  let operation=null,target=null;
  const run=async(action)=>{
   const {data,error}=await client.rpc('account_admin',{p_action:action,p_target:target,p_operation:operation});
   if(error)throw new Error('database');
   return data;
  };
  try {
   const {data,error}=await client.auth.getUser(authorization.slice(7));
   if(error||!data?.user)return reply(401,{ok:false,reason:'session'});
   // Bound the body even when Content-Length is absent.
   const reader=req.body?.getReader();let size=0;const chunks=[];
   if(!reader)return reply(400,{ok:false,reason:'request'});
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return reply(413,{ok:false,reason:'request'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{ok:false,reason:'request'});}
   if(body?.action!=='delete-member'||typeof body.target_id!=='string'||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.target_id))return reply(400,{ok:false,reason:'request'});
   target=body.target_id;
   const plan=await run('begin');
   if(!plan?.ok)return reply(plan?.reason==='forbidden'?403:409,{ok:false,reason:plan?.reason||'database'});
   operation=plan.operation_id;
   if(plan.status==='completed')return reply(200,{ok:true,status:'completed',operation_id:operation});
   for(const bucket of ['ushe-avatars','ushe-media']) {
    const paths=(plan.files||[]).filter(file=>file.bucket_id===bucket).map(file=>file.name);
    for(let index=0;index<paths.length;index+=100) {
     const {error:removeError}=await storage.from(bucket).remove(paths.slice(index,index+100));
     if(removeError){await run('storage_failure');return reply(503,{ok:false,status:'pending',reason:'storage',operation_id:operation});}
    }
   }
   // Finish checks actual Storage rows, current role/session and target protection.
   const finished=await run('finish');
   if(!finished?.ok)return reply(409,{ok:false,status:'pending',reason:finished?.reason||'database',operation_id:operation});
   return reply(200,{ok:true,status:'completed',operation_id:operation});
  }catch{
   if(operation){try{await run('storage_failure');}catch{}}
   return reply(503,{ok:false,...(operation?{status:'pending',operation_id:operation}:{}),reason:'unavailable'});
  }
 };
}
