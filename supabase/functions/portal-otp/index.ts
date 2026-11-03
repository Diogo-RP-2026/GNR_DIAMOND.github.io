import {createClient} from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import {createOtpHandler} from './handler.js';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
const sendSmtp=async(settings:Record<string,unknown>,message:Record<string,unknown>)=>{
 const transport=nodemailer.createTransport(settings);
 try{return await transport.sendMail(message);}finally{transport.close();}
};
// Um cliente Auth por pedido evita partilhar sessões entre utilizadores concorrentes.
Deno.serve(req=>createOtpHandler({env:key=>Deno.env.get(key),admin,auth:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,options),sendSmtp})(req));
