// Transportes apenas no backend. Nunca registar credenciais, corpos ou códigos.
export function createEmailSender({env,fetcher=fetch,sendSmtp}) {
 const provider=(env('OTP_EMAIL_PROVIDER')||'resend').trim().toLowerCase();
 const gmailUser=(env('OTP_GMAIL_USER')||'').trim().toLowerCase();
 const gmailPassword=(env('OTP_GMAIL_APP_PASSWORD')||'').replace(/\s/g,'');
 const missing=[];
 if(provider==='gmail') {
  if(!/^[^\s<>@]+@(gmail|googlemail)\.com$/.test(gmailUser))missing.push('OTP_GMAIL_USER');
  if(gmailPassword.length!==16)missing.push('OTP_GMAIL_APP_PASSWORD');
  if(typeof sendSmtp!=='function')missing.push('SMTP_TRANSPORT');
 } else if(provider==='resend') {
  if(!env('RESEND_API_KEY'))missing.push('RESEND_API_KEY');
  if(!env('OTP_FROM_EMAIL'))missing.push('OTP_FROM_EMAIL');
 } else missing.push('OTP_EMAIL_PROVIDER');
 const ready=missing.length===0;
 async function send(email,code) {
  if(!ready)throw new Error('delivery');
  const message={subject:'USHE — código de verificação',text:`O teu código de verificação USHE é ${code}. É válido durante 5 minutos e só pode ser utilizado uma vez. Se não fizeste este pedido, ignora esta mensagem.`};
  if(provider==='gmail') {
   // A porta 465 usa TLS desde a ligação; 25/587 estão bloqueadas nas Edge Functions.
   const info=await sendSmtp({host:'smtp.gmail.com',port:465,secure:true,
    auth:{user:gmailUser,pass:gmailPassword},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
    pool:false,logger:false,debug:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    disableFileAccess:true,disableUrlAccess:true},
   {...message,from:{name:'USHE',address:gmailUser},to:[{address:email}]});
   if(!Array.isArray(info?.accepted)||!info.accepted.some(address=>String(address).toLowerCase()===email.toLowerCase()))throw new Error('delivery');
   return;
  }
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({...message,from:env('OTP_FROM_EMAIL'),to:[email]})});
  if(!response.ok)throw new Error('delivery');
 }
 // O diagnóstico expõe só nomes conhecidos, nunca valores recebidos do ambiente.
 return {provider:['gmail','resend'].includes(provider)?provider:'invalid',ready,missing,send};
}
