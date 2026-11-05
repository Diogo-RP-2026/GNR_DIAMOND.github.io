import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
globalThis.window={};
const {state}=await import('../js/api.js');
const {accountDeletionControls,removeMemberAccount}=await import('../js/accounts.js');
const {openAccess}=await import('../js/forms.js');
const {logCard,warningCard}=await import('../js/views.js');
const member={id:'member-id',full_name:'Agent <script>bad</script>',email:'test@example.invalid',approved:true,role:'member'};
const command={...member,id:'command-id',role:'command'};
function dom(){const {document}=parseHTML('<html><body><dialog id="editor"><h2 id="editor-title"></h2><div id="editor-body"></div></dialog></body></html>');globalThis.document=document;document.querySelector('#editor').showModal=()=>{};return document;}
test('account dialog preserves access editing, protects command role and escapes agent names',()=>{
 state.profile=command;state.user={id:'current-command'};const document=dom();
 openAccess(member.id,{profiles:[member],tab_permissions:[]});
 assert.ok(document.querySelector('[data-action="delete-account"]'));assert.match(document.querySelector('#editor-title').textContent,/Gerir\/Editar conta/);assert.equal(document.querySelector('script'),null);
 openAccess(command.id,{profiles:[command],tab_permissions:[]});assert.equal(document.querySelector('[data-action="delete-account"]'),null);assert.equal(document.querySelector('select[name="role"]').disabled,true);assert.equal(document.querySelector('input[type="hidden"][name="role"]').value,'command');
 assert.match(accountDeletionControls(member,{status:'failed'}),/Retomar eliminação/);
});
test('cancel or member/command-target denial never invokes the deletion service',async()=>{
 let calls=0,message='';const client={functions:{invoke:async()=>{calls++;return {data:{ok:true,status:'completed'}};}}};state.profile=command;
 assert.equal(await removeMemberAccount(member,'Agent test',{client,confirmAction:text=>{message=text;return false;}}),false);assert.equal(calls,0);assert.match(message,/Agent test/);assert.match(message,/perfil/);
 await assert.rejects(removeMemberAccount(command,null,{client,confirmAction:()=>true}),/protegidas/);state.profile=member;await assert.rejects(removeMemberAccount(member,null,{client,confirmAction:()=>true}),/Comando/);assert.equal(calls,0);
});
test('only confirmed completion returns success; pending/network/unconfirmed responses remain errors',async()=>{
 state.profile=command;const invoke=async response=>removeMemberAccount(member,null,{confirmAction:()=>true,client:{functions:{invoke:async()=>response}}});
 assert.equal(await invoke({data:{ok:true,status:'completed'}}),true);
 await assert.rejects(invoke({data:{ok:true,status:'pending'}}),/pendente/);await assert.rejects(invoke({data:{}}),/confirmar/);
 await assert.rejects(invoke({error:{context:new Response(JSON.stringify({ok:false,status:'pending'}),{status:503})}}),/Retomar/);
});
test('historical agents remain named in logs/warnings and do not link to deleted profiles',()=>{
 state.profile=command;state.permissions=[];
 const snapshot={id:'deleted-agent',name:'Historic <agent>',rank:'Operacional',uniform_number:20};
 const {document}=parseHTML(logCard({id:'log',event_type:'Teste',starts_at:'2026-12-01T10:00Z',ends_at:'2026-12-01T11:00Z',location:'Local',summary:'Summary',event_log_participants:[{member_id:null,name:snapshot.name,uniform_number:20,member_snapshot:snapshot}]}));
 assert.match(document.querySelector('article').textContent,/Historic <agent>/);assert.equal(document.querySelector('a[href*="perfil"]'),null);
 const warning=warningCard({id:'warning',title:'Title',issued_on:'2026-11-01',sanction:'Aviso',warning_members:[{member_id:null,member_snapshot:snapshot}]},[]);assert.match(warning,/Historic &lt;agent&gt;/);
});
