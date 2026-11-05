import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
globalThis.window={};
const {state}=await import('../js/api.js');
const {startOTP,initOTP,otpScreen}=await import('../js/otp.js');
test('password-only login requires a real session and positive backend confirmation, without creating an OTP screen',async()=>{
 const Original=globalThis.FormData;globalThis.FormData=class{get(key){return {email:'n@example.invalid',password:'password'}[key];}};
 let installed=0,resets=0;
 const form={dataset:{mode:'login'},reset(){resets++;}},session={access_token:'test-token',refresh_token:'test-refresh'};
 try{
  state.otp=null;state.profile={role:'command',approved:true};state.permissions=[{tab:'eventos'}];
  const client={auth:{setSession:async()=>{installed++;return {data:{session,user:{id:'native-user'}}};}},rpc:async()=>({data:true})};
  await startOTP(form,{request:async()=>({verified:true,skip_verification:true,session}),client});assert.equal(installed,1);assert.equal(state.otp,null);assert.equal(state.user.id,'native-user');assert.equal(state.profile,null);assert.deepEqual(state.permissions,[]);assert.equal(resets,1);
  client.rpc=async()=>({data:false});await assert.rejects(startOTP(form,{request:async()=>({verified:true,skip_verification:true,session}),client}),/confirmar/);
  await assert.rejects(startOTP(form,{request:async()=>({verified:true,skip_verification:true}),client}),/sessão/);
 }finally{globalThis.FormData=Original;}
});
test('renewal starts an authenticated challenge without sending a password or changing the 30-day date locally',async()=>{
 const Original=globalThis.FormData;globalThis.FormData=class{get(){return null;}};let body;
 try{
  state.verificationRequired=true;const form={dataset:{mode:'renew'},reset(){}};
  await startOTP(form,{now:()=>1000,request:async value=>{body=value;return {id:'challenge',proof:'proof',email:'n•••@example.invalid',operation:'renewal',retry_after:0,expires_in:300};}});
  assert.deepEqual(body,{action:'renew',verification_version:2});assert.equal(state.otp.operation,'renewal');assert.equal(state.verificationRequired,true);assert.equal(state.otp.expiresAt,301000);
 }finally{state.otp=null;globalThis.FormData=Original;}
});
test('renewal can complete on the existing native session, but never bypasses the backend verification result',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
 let installed=0,home=false,verified=false;const session={user:{id:'native-user'}};
 state.otp={operation:'renewal',status:'success',email:'n•••@example.invalid',retryAt:0,expiresAt:Infinity};document.querySelector('main').innerHTML=otpScreen().html;
 document.querySelector('#otp-continue').focus=()=>{};
 const previous=globalThis.setInterval;globalThis.setInterval=()=>0;
 initOTP({render(){},goHome(){home=true;},request:async()=>({}),client:{auth:{getSession:async()=>({data:{session}}),setSession:async()=>{installed++;return {data:{session}};}},rpc:async()=>({data:verified})}});globalThis.setInterval=previous;
 document.querySelector('#otp-continue').click();await new Promise(r=>setTimeout(r,0));assert.equal(home,false);assert.equal(installed,0);
 verified=true;document.querySelector('#otp-continue').click();await new Promise(r=>setTimeout(r,0));assert.equal(home,true);assert.equal(installed,0);assert.equal(state.otp,null);
});
