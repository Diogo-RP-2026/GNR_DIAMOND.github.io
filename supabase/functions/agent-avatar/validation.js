export const MAX_BYTES=5*1024*1024;
export function validateImage(bytes,mime) {
 if(!bytes.length||bytes.length>MAX_BYTES)throw new Error('A fotografia pode ter no máximo 5 MB.');
 const matches=(offset,values)=>values.every((v,i)=>bytes[offset+i]===v);
 const ascii=(offset,text)=>matches(offset,[...text].map(c=>c.charCodeAt(0)));
 let detected='';
 if(bytes.length>=33&&matches(0,[137,80,78,71,13,10,26,10])&&ascii(12,'IHDR')&&ascii(bytes.length-8,'IEND'))detected='image/png';
 else if(bytes.length>=12&&matches(0,[255,216,255])&&matches(bytes.length-2,[255,217]))detected='image/jpeg';
 else if(bytes.length>=20&&ascii(0,'RIFF')&&ascii(8,'WEBP')&&['VP8 ','VP8L','VP8X'].some(t=>ascii(12,t))&&new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)===bytes.length-8)detected='image/webp';
 if(!detected||detected!==mime)throw new Error('Ficheiro inválido. Usa uma fotografia JPEG, PNG ou WebP.');
 return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[detected];
}
export async function readLimitedBody(req,max=MAX_BYTES+65536) {
 const reader=req.body?.getReader();if(!reader)throw new Error('Seleciona uma fotografia.');
 const chunks=[];let total=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new Error('A fotografia pode ter no máximo 5 MB.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
