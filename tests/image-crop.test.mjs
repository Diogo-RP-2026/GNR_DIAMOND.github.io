import test from 'node:test';
import assert from 'node:assert/strict';
import {Image} from 'imagescript';
import {cropRect,outputSize,drawCrop,equipmentImageHTML,equipmentPhotoField} from '../js/image-crop.js';
test('crop stays within source bounds through zoom, panning and every supported aspect ratio',()=>{
 for(const aspect of [1,4/3,16/9,0.25,4])for(const zoom of [1,2,4])for(const x of [-1e6,0,1e6]){
  const rect=cropRect({width:1200,height:900,aspect,zoom,x,y:-x});
  assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=1200.00001&&rect.y+rect.height<=900.00001);
  assert.ok(Math.abs(rect.width/rect.height-aspect)<1e-8);
 }
 assert.deepEqual(cropRect({width:1200,height:900,aspect:4/3,zoom:2}),{x:300,y:225,width:600,height:450});
 assert.throws(()=>cropRect({width:0,height:2}),/Dimensões/);
});
test('output dimensions preserve aspect and stay within actual server pixel and side limits',()=>{
 for(const aspect of [0.25,0.7,1,4/3,16/9,3.456,4])for(const width of [32,800,4096,100000]){
  const size=outputSize(width,aspect);assert.ok(size.width<=4096&&size.height<=4096&&size.width*size.height<=4000000);
  assert.ok(Math.abs(size.height-size.width/aspect)<=0.5);
 }
 assert.deepEqual(outputSize(800,4/3),{width:800,height:600});
 assert.throws(()=>outputSize(NaN,1),/Dimensões/);
});
test('the actual export draw uses the selected source crop and requested output dimensions',async()=>{
 const image=await new Image(4,2).fill(0xff0000ff);image.setPixelAt(3,1,0x0000ffff);
 let args;const context={fillRect(){},drawImage(...values){args=values;}},canvas={getContext:()=>context};
 const rect=cropRect({width:4,height:2,aspect:1,zoom:2,x:99,y:-99});drawCrop(canvas,image,rect,{width:64,height:64});
 assert.equal(canvas.width,64);assert.equal(canvas.height,64);assert.deepEqual(args,[image,3,0,1,1,0,0,64,64]);
});
test('equipment preview has a real default image and escapes labels/paths',()=>{
 assert.match(equipmentImageHTML(null),/equipamento-default.svg/);
 assert.ok(!equipmentImageHTML(null).includes('data-path'));
 const html=equipmentPhotoField({name:'<script>bad</script>',image_path:'equipamento/" onerror="bad'});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes(' onerror="bad'));assert.match(html,/equipment_photo/);assert.match(html,/só é enviada/);
});
