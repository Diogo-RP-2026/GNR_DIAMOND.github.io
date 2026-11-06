import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createEquipmentImageHandler} from './handler.js';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
Deno.serve(createEquipmentImageHandler({service,storage:service.storage,env:(key:string)=>Deno.env.get(key),
 clientForToken:(authorization:string)=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{...options,global:{headers:{Authorization:authorization}}})}));
