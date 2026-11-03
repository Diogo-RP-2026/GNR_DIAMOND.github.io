import {cp,mkdir,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const path of ['index.html','style.css','script.js','config.js','favicon.ico','robots.txt','.nojekyll','js','fonts','images','vendor'])await cp(new URL(path,root),new URL(path,dist),{recursive:true});
console.log('dist pronto: apenas HTML, CSS, JavaScript e recursos públicos.');
