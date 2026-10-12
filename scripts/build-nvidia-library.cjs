const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=process.argv[2]||'D:/安装包/显卡配置',out=path.resolve(__dirname,'../host/nvidia-library');
fs.mkdirSync(out,{recursive:true});
const items=fs.readdirSync(source).filter(name=>name.toLowerCase().endsWith('.nip')).map(name=>{
 const bytes=fs.readFileSync(path.join(source,name));const id=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(out,id+'.nip'),bytes);return {id,name};
});
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schema:1,items},null,2));
console.log(`Bundled ${items.length} NIP files only. No EXE/BAT/CMD included or executed.`);
