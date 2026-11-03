// Partilhado entre Edge Function e testes Node. Sem códigos fixos nem Math.random.
const bytes=text=>new TextEncoder().encode(text);
export const validCode=code=>typeof code==='string'&&/^[0-9]{4}$/.test(code);
export function generateCode(random=crypto.getRandomValues.bind(crypto)) {
  const value=new Uint32Array(1);do{random(value);}while(value[0]>=4294960000);
  return String(value[0]%10000).padStart(4,'0');
}
export const randomProof=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
export async function digest(secret,context,value) {
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(`${context}:${value}`))),n=>n.toString(16).padStart(2,'0')).join('');
}
async function aesKey(secret) {return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes('ushe-session-v1:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(secret,value,id) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(id)},await aesKey(secret),bytes(JSON.stringify(value))));
  return JSON.stringify([Array.from(iv),Array.from(encrypted)]);
}
export async function unseal(secret,value,id) {
  const [iv,encrypted]=JSON.parse(value);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv),additionalData:bytes(id)},await aesKey(secret),new Uint8Array(encrypted))));
}
export const maskEmail=email=>{const [name,domain]=email.split('@');return `${name.slice(0,1)}${'•'.repeat(4)}@${domain}`;};
