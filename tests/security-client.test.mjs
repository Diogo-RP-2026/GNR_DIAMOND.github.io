import test from 'node:test';
import assert from 'node:assert/strict';
const client={auth:{getUser:async()=>({data:{user:{id:'server-identity'}}}),signOut:async()=>({})},rpc:async()=>({data:false})};
globalThis.window={USHE_CONFIG:{supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_public'},supabase:{createClient:()=>client}};
const {state,loadIdentity,loadOtpPolicy}=await import('../js/api.js');
const {errorMessage}=await import('../js/core.js');
test('server identity and OTP result override manipulated local identity',async()=>{
 state.user={id:'forged-command'};state.profile={role:'command',approved:true};state.otpEnabled=true;
 await loadIdentity();assert.equal(state.user,null);assert.equal(state.profile,null);assert.deepEqual(state.permissions,[]);
});
test('missing OTP policy fails closed instead of enabling legacy password login',async()=>{
 client.rpc=async()=>({error:{code:'PGRST202'}});
 await assert.rejects(loadOtpPolicy());
});
test('database and Auth error details never reach public error messages',()=>{
 for(const error of [{code:'23514',message:'private SQL table detail'},Object.assign(new Error('private Auth detail'),{name:'AuthApiError',status:400})])assert.ok(!errorMessage(error).includes('private'));
 assert.equal(errorMessage(new Error('As palavras-passe não coincidem.')),'As palavras-passe não coincidem.');
});
