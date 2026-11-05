// Native HTTP checks on an isolated @example.invalid account, supplied on stdin.
// No SMTP request is made: the dated verification fixture is seeded by an admin.
// Credentials and JWTs stay in memory. Phase changes never print them.
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import dns from 'node:dns';
import vm from 'node:vm';
import assert from 'node:assert/strict';
dns.setDefaultResultOrder('ipv4first');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const lines=createInterface({input:process.stdin,terminal:false})[Symbol.asyncIterator]();
const ctx={window:{}};vm.runInNewContext(await readFile(new URL('../config.js',import.meta.url),'utf8'),ctx);
const cfg=ctx.window.USHE_CONFIG,opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:'https://diogo-rp-2026.github.io'}}};
const client=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,opts),anon=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,opts),checks=[];
const emit=x=>process.stdout.write(JSON.stringify(x)+'\n');
const check=(name,yes)=>{assert.ok(yes,name);checks.push(name);};
try{
 emit({phase:'ready',input:'hidden'});const fixture=JSON.parse((await lines.next()).value);
 assert.ok(fixture.email.startsWith('ushe-verification-test-')&&fixture.email.endsWith('@example.invalid'));
 const login=await anon.functions.invoke('portal-otp',{body:{action:'start',verification_version:2,operation:'login',email:fixture.email,password:fixture.password}});
 check('deployed login skips OTP inside the valid period',!login.error&&login.data?.verified===true&&login.data.skip_verification===true&&!!login.data.session);
 check('password-only response contains no OTP challenge or code',!login.data.id&&!login.data.code);
 const install=await client.auth.setSession(login.data.session);check('native Auth session established',!install.error&&install.data.user?.id===fixture.user_id);
 const original=login.data.session.access_token,claims=JSON.parse(Buffer.from(original.split('.')[1],'base64url'));
 const [status,member,quota,profile]=await Promise.all([client.rpc('verification_status'),client.from('members').select('id').eq('id',fixture.member_id),client.rpc('reserve_portal_upload',{p_tab:null}),client.from('profiles').select('role').eq('id',fixture.user_id)]);
 check('backend timestamp is preserved by password login',!status.error&&status.data.verified===true&&new Date(status.data.last_verified_at).getTime()===new Date(fixture.last_verified_at).getTime());
 check('period is exactly 720 hours',new Date(status.data.verification_expires_at)-new Date(status.data.last_verified_at)===30*24*3600000);
 check('fresh account can access its protected agent and upload quota',!member.error&&member.data.length===1&&quota.data===true);
 check('forged user metadata does not grant Comando',!profile.error&&profile.data[0].role==='member');
 emit({phase:'fresh_login_passed',checks,user_id:fixture.user_id,session_id:claims.session_id,jwt_exp:claims.exp});
 assert.equal(JSON.parse((await lines.next()).value).action,'expired');
 const [expired,hidden,denied,grant]=await Promise.all([client.rpc('verification_status'),client.from('members').select('id').eq('id',fixture.member_id),client.rpc('reserve_portal_upload',{p_tab:null}),client.rpc('otp_service',{action:'grant',args:{user_id:fixture.user_id,session_id:claims.session_id,last_verified_at:'2099-01-01'}})]);
 check('same native session now requires renewal',!expired.error&&expired.data.authenticated===true&&expired.data.verified===false&&expired.data.reason==='expired');
 check('expired account cannot read its protected agent or upload',!hidden.error&&hidden.data.length===0&&denied.data===false);
 check('client cannot grant verification or supply a fake date',!!grant.error);
 const noIdentity=await anon.functions.invoke('portal-otp',{body:{action:'renew',verification_version:2}});check('renewal without a native identity is denied',!!noIdentity.error);
 emit({phase:'expired_session_blocked',checks,user_id:fixture.user_id,session_id:claims.session_id,jwt_exp:claims.exp});
 assert.equal(JSON.parse((await lines.next()).value).action,'renewed');
 const [renewed,visible,current]=await Promise.all([client.rpc('verification_status'),client.from('members').select('id').eq('id',fixture.member_id),client.auth.getSession()]);
 check('successful backend code grant starts another period',!renewed.error&&renewed.data.verified===true&&new Date(renewed.data.last_verified_at)>new Date(fixture.last_verified_at));
 check('same JWT regains authorized access after renewal',!visible.error&&visible.data.length===1&&current.data.session?.access_token===original);
 const repeat=await anon.functions.invoke('portal-otp',{body:{action:'start',verification_version:2,operation:'login',email:fixture.email,password:fixture.password}});
 check('next login needs no additional email and does not extend the period',!repeat.error&&repeat.data.skip_verification===true&&new Date(repeat.data.verification_expires_at).getTime()===new Date(renewed.data.verification_expires_at).getTime());
 emit({phase:'finished',checks,user_id:fixture.user_id,session_id:claims.session_id,jwt_exp:claims.exp});
}catch(error){emit({phase:'failed',checks,error:error instanceof assert.AssertionError?error.message:'Integration test failed'});process.exitCode=1;}
finally{if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.destroy();}
