import {createClient} from '@supabase/supabase-js';
import {createOtpHandler} from './handler.js';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
// Um cliente Auth por pedido evita partilhar sessões entre utilizadores concorrentes.
Deno.serve(req=>createOtpHandler({env:key=>Deno.env.get(key),admin,auth:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,options)})(req));
