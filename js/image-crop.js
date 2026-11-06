import {e,errorMessage} from './core.js';
const maxBytes=5*1024*1024,fields=new WeakMap();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function cropRect({width,height,aspect=4/3,zoom=1,x=0,y=0}){
 if(![width,height,aspect,zoom,x,y].every(Number.isFinite)||width<=0||height<=0||aspect<=0)throw new Error('Dimensões inválidas.');
 const w=Math.min(width,height*aspect)/clamp(zoom,1,4),h=w/aspect;
 const cx=clamp(width/2+x,w/2,width-w/2),cy=clamp(height/2+y,h/2,height-h/2);
 return {x:cx-w/2,y:cy-h/2,width:w,height:h};
}
export function outputSize(width,aspect){
 if(!Number.isFinite(width)||!Number.isFinite(aspect)||aspect<=0)throw new Error('Dimensões inválidas.');
 const limit=Math.floor(Math.min(4096,4096*aspect,Math.sqrt(4000000*aspect)));
 let w=Math.round(clamp(width,Math.min(64,limit),limit)),h=Math.max(1,Math.round(w/aspect));
 while(w*h>4000000){w--;h=Math.max(1,Math.round(w/aspect));}
 return {width:w,height:h};
}
export function drawCrop(canvas,image,crop,size){
 canvas.width=size.width;canvas.height=size.height;
 const context=canvas.getContext('2d');if(!context)throw new Error('O navegador não permite editar esta imagem.');
 context.fillStyle='#ffffff';context.fillRect(0,0,size.width,size.height);
 context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 context.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,size.width,size.height);
}
export function equipmentImageHTML(path,label='Equipamento',extra=''){
 return `<div class="media equipment-media ${extra}"><img class="image-placeholder equipment-default" src="./images/equipamento-default.svg" alt="Imagem por defeito de equipamento">${path?`<img data-path="${e(path)}" alt="${e(label)}" hidden>`:''}</div>`;
}
export function equipmentPhotoField(row){
 return `<fieldset class="equipment-photo"><legend>Imagem do equipamento</legend><div class="equipment-current">${equipmentImageHTML(row.image_path,row.name||'Equipamento')}</div><img class="equipment-adjusted" alt="Pré-visualização da imagem ajustada" hidden><label>Adicionar ou substituir imagem<input name="equipment_photo" type="file" accept="image/jpeg,image/png,image/webp"></label>${row.image_path?'<label class="check-label"><input type="checkbox" name="remove_photo">Remover imagem atual</label>':''}<p class="muted small">JPG, PNG ou WebP · até 5 MB, 4 megapíxeis e 4096 píxeis por lado.</p><p class="equipment-photo-status small" role="status" aria-live="polite">A imagem só é enviada ao guardar as alterações do equipamento.</p><p class="profile-saving notice" role="status" hidden>A guardar o equipamento e a imagem…</p></fieldset>`;
}
async function decodeFile(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file?.type))throw new Error('Usa uma imagem JPG, PNG ou WebP.');
 if(!file.size||file.size>maxBytes)throw new Error('A imagem pode ter no máximo 5 MB.');
 let image;
 try{
  if(globalThis.createImageBitmap)image=await createImageBitmap(file,{imageOrientation:'from-image'});
  else{
   const url=URL.createObjectURL(file);
   try{image=new Image();image.src=url;await image.decode();}finally{URL.revokeObjectURL(url);}
  }
 }catch{throw new Error('Não foi possível abrir a imagem. Confirma que o ficheiro é válido.');}
 const width=image.width,height=image.height;
 if(width>4096||height>4096||width*height>4000000){image.close?.();throw new Error('Usa uma imagem até 4 megapíxeis e 4096 píxeis por lado.');}
 return image;
}
export function mountEquipmentPhoto(form){
 const state={blob:null,url:null,dialog:null,disposed:false,busy:false};fields.set(form,state);
 const input=form.querySelector('[name="equipment_photo"]'),status=form.querySelector('.equipment-photo-status');
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file||state.busy)return;state.busy=true;input.disabled=true;status.textContent='A abrir a imagem…';
  try{const image=await decodeFile(file);if(state.disposed){image.close?.();return;}openCropEditor(form,state,image);status.textContent='Ajusta o recorte na janela de edição.';}
  catch(error){status.textContent=errorMessage(error);}
  finally{state.busy=false;input.disabled=false;input.value='';}
 });
 form.querySelector('[name="remove_photo"]')?.addEventListener('change',event=>{
  if(event.target.checked){state.blob=null;if(state.url)URL.revokeObjectURL(state.url);state.url=null;form.querySelector('.equipment-adjusted').hidden=true;form.querySelector('.equipment-current').hidden=false;status.textContent='A imagem será removida quando guardares as alterações.';}
  else status.textContent='A imagem atual será mantida.';
 });
}
function openCropEditor(form,state,image){
 const dialog=document.createElement('dialog');dialog.className='image-crop-dialog';state.dialog=dialog;
 dialog.setAttribute('aria-labelledby','image-crop-title');
 dialog.innerHTML=`<div class="image-crop-shell"><h2 id="image-crop-title">Editar imagem do equipamento</h2><p class="muted small" id="crop-instructions">Arrasta a imagem para reposicionar. Usa o zoom ou aproxima dois dedos. Com teclado, usa as setas e +/−.</p><div class="image-crop-frame"><canvas tabindex="0" aria-label="Pré-visualização do recorte" aria-describedby="crop-instructions"></canvas><div class="image-crop-grid" aria-hidden="true"></div></div><div class="image-crop-controls"><label>Recorte<select name="crop_ratio"><option value="1.3333333333333333">Horizontal · 4:3</option><option value="1">Quadrado · 1:1</option><option value="1.7777777777777777">Panorâmico · 16:9</option><option value="original">Proporção original</option></select></label><label>Zoom <span class="crop-zoom-label" aria-hidden="true">100%</span><input name="crop_zoom" type="range" min="1" max="4" step="0.01" value="1"></label><label>Largura (px)<input name="crop_width" type="number" min="1" max="4096" step="1"></label><label>Altura (px)<input name="crop_height" type="number" min="1" max="4096" step="1"></label></div><p class="muted small">A proporção é mantida ao alterar as dimensões. Guardar prepara a imagem; o envio acontece ao guardar o equipamento.</p><p class="crop-error form-error" role="alert" hidden></p><div class="form-actions"><button class="button primary" type="button" data-crop="save">Guardar</button><button class="button outline" type="button" data-crop="cancel">Cancelar</button></div></div>`;
 document.body.append(dialog);
 const canvas=dialog.querySelector('canvas'),zoom=dialog.querySelector('[name="crop_zoom"]'),width=dialog.querySelector('[name="crop_width"]'),height=dialog.querySelector('[name="crop_height"]');
 const model={width:image.width,height:image.height,aspect:4/3,zoom:1,x:0,y:0};let size=outputSize(Math.min(1200,cropRect(model).width),model.aspect),closed=false,saving=false;
 const setSize=value=>{size=outputSize(value,model.aspect);width.value=size.width;height.value=size.height;};
 const draw=()=>{
  const crop=cropRect(model);model.x=crop.x+crop.width/2-model.width/2;model.y=crop.y+crop.height/2-model.height/2;
  dialog.querySelector('.image-crop-frame').style.maxWidth=`min(600px,${45*model.aspect}dvh)`;
  drawCrop(canvas,image,crop,outputSize(600,model.aspect));zoom.value=model.zoom;dialog.querySelector('.crop-zoom-label').textContent=`${Math.round(model.zoom*100)}%`;
 };
 const close=()=>{
  if(closed)return;closed=true;state.dialog=null;image.close?.();dialog.close();dialog.remove();
  if(!state.disposed){form.querySelector('.equipment-photo-status').textContent=state.blob?'Imagem ajustada em pré-visualização. Guarda as alterações para a enviar.':'A imagem atual foi mantida.';form.querySelector('[name="equipment_photo"]').focus();}
 };
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!saving)close();});
 dialog.querySelector('[data-crop="cancel"]').addEventListener('click',()=>{if(!saving)close();});
 dialog.querySelector('[name="crop_ratio"]').addEventListener('change',event=>{model.aspect=event.target.value==='original'?model.width/model.height:Number(event.target.value);setSize(size.width);draw();});
 zoom.addEventListener('input',()=>{model.zoom=Number(zoom.value);draw();});
 width.addEventListener('change',()=>{setSize(Number(width.value));});
 height.addEventListener('change',()=>{setSize(Number(height.value)*model.aspect);});
 const points=new Map();let pinch=null;
 const distance=()=>{const [a,b]=[...points.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
 canvas.addEventListener('pointerdown',event=>{event.preventDefault();canvas.focus();canvas.setPointerCapture(event.pointerId);points.set(event.pointerId,{x:event.clientX,y:event.clientY});if(points.size===2)pinch={distance:distance(),zoom:model.zoom};});
 canvas.addEventListener('pointermove',event=>{
  const before=points.get(event.pointerId);if(!before||saving)return;
  points.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(points.size===2&&pinch?.distance){model.zoom=clamp(pinch.zoom*distance()/pinch.distance,1,4);}
  else if(points.size===1){const box=canvas.getBoundingClientRect(),crop=cropRect(model);model.x-=(event.clientX-before.x)/box.width*crop.width;model.y-=(event.clientY-before.y)/box.height*crop.height;}
  draw();
 });
 const end=event=>{points.delete(event.pointerId);pinch=null;};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
 canvas.addEventListener('wheel',event=>{event.preventDefault();if(saving)return;model.zoom=clamp(model.zoom*(event.deltaY<0?1.1:1/1.1),1,4);draw();},{passive:false});
 canvas.addEventListener('keydown',event=>{
  const crop=cropRect(model),step=event.shiftKey?0.1:0.02;
  if(event.key==='ArrowLeft')model.x-=crop.width*step;else if(event.key==='ArrowRight')model.x+=crop.width*step;else if(event.key==='ArrowUp')model.y-=crop.height*step;else if(event.key==='ArrowDown')model.y+=crop.height*step;else if(['+','='].includes(event.key))model.zoom=clamp(model.zoom+0.1,1,4);else if(event.key==='-')model.zoom=clamp(model.zoom-0.1,1,4);else return;
  event.preventDefault();draw();
 });
 dialog.querySelector('[data-crop="save"]').addEventListener('click',async()=>{
  if(saving||closed)return;saving=true;dialog.setAttribute('aria-busy','true');dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  try{
   setSize(Number(width.value));const output=document.createElement('canvas');drawCrop(output,image,cropRect(model),size);
   const blob=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',0.9));
   if(!blob||blob.size>maxBytes)throw new Error('Não foi possível preparar a imagem. Reduz as dimensões e tenta novamente.');
   if(state.disposed||closed)return;if(state.url)URL.revokeObjectURL(state.url);state.url=URL.createObjectURL(blob);state.blob=blob;
   const preview=form.querySelector('.equipment-adjusted');preview.src=state.url;preview.hidden=false;form.querySelector('.equipment-current').hidden=true;
   const remove=form.querySelector('[name="remove_photo"]');if(remove)remove.checked=false;form.dataset.dirty='true';close();
  }catch(error){const feedback=dialog.querySelector('.crop-error');feedback.textContent=errorMessage(error);feedback.hidden=false;}
  finally{saving=false;dialog.setAttribute('aria-busy','false');dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}
 });
 state.close=close;
 try{setSize(size.width);draw();dialog.showModal();canvas.focus();}catch(error){close();throw error;}
}
export function equipmentPhoto(form){
 const state=fields.get(form);if(state?.busy||state?.dialog)throw new Error('Conclui ou cancela a edição da imagem antes de guardar.');
 return state?.blob||null;
}
export function disposeEquipmentPhoto(form){
 const state=fields.get(form);if(!state)return;state.disposed=true;state.close?.();if(state.url)URL.revokeObjectURL(state.url);fields.delete(form);
}
