import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createAvatarHandler} from './handler.js';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const url=Deno.env.get('SUPABASE_URL')!;
const storage=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options).storage;
Deno.serve(createAvatarHandler({storage,clientForToken:(authorization:string)=>
 createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{...options,global:{headers:{Authorization:authorization}}})}));
