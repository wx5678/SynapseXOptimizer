const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('two real portable launches have independent resources and second cleanup leaves first UI intact',{timeout:90000,skip:process.platform!=='win32'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-portable-probe-'));
 const config=require('../package.json');
 const exe=path.resolve(__dirname,'..',config.build.directories.output,`SynapseX-Game-Optimizer-${config.version}.exe`);
 const fixture=path.join(__dirname,'fixtures/portable-resource-probe.cjs');
 const children=[];
 const launch=label=>{const child=spawn(exe,[fixture,dir,label],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'ignore'});children.push(child);return child;};
 async function marker(label){for(let n=0;n<300;n++){try{return JSON.parse(fs.readFileSync(path.join(dir,label+'.json'),'utf8'));}catch{}await wait(100);}throw Error('Probe did not start: '+label);}
 async function exited(child){for(let n=0;n<300&&child.exitCode===null;n++)await wait(100);assert.equal(child.exitCode,0);}
 try {
  const first=launch('first'),a=await marker('first');assert.equal(a.indexPresent,true);
  const second=launch('second'),b=await marker('second');assert.equal(b.indexPresent,true);
  assert.notEqual(a.resources.toLowerCase(),b.resources.toLowerCase());await exited(second);
  const html=fs.readFileSync(path.join(a.resources,'dist/index.html'),'utf8');assert.match(html,/id="root"/);
  for(const [,asset]of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g))assert.ok(fs.existsSync(path.join(a.resources,'dist',asset)));
  assert.ok(fs.existsSync(path.join(a.resources,'host/SynapseXHost.ps1')));
  const libraryRoot=path.join(a.resources,'host/power-library');
  const library=JSON.parse(fs.readFileSync(path.join(libraryRoot,'catalog.json'),'utf8'));
  assert.equal(library.items.length,75);
  for(const item of library.items) assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(libraryRoot,item.id+'.pow'))).digest('hex'),item.id);
  const nipRoot=path.join(a.resources,'host/nvidia-library'),nipLibrary=JSON.parse(fs.readFileSync(path.join(nipRoot,'catalog.json'),'utf8'));
  assert.equal(nipLibrary.items.length,8);
  for(const item of nipLibrary.items)assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(nipRoot,item.id+'.nip'))).digest('hex'),item.id);
  assert.ok(fs.existsSync(path.join(a.resources,'host/native/NvidiaNip.cs')));
  fs.writeFileSync(path.join(dir,'stop'),'');await exited(first);
  console.log('PASS: actual portable runs use distinct NSIS directories; second exit preserves first HTML, JS/CSS and host; no product accounts/UI/UAC used');
 }finally{
  fs.writeFileSync(path.join(dir,'stop'),'');
  for(const child of children){for(let n=0;n<50&&child.exitCode===null;n++)await wait(100);}
  // A probe self-exits after 60 seconds; never kill unrelated product processes.
  if(children.every(child=>child.exitCode!==null)&&path.resolve(dir).startsWith(path.join(os.tmpdir(),'synapsex-portable-probe-')))fs.rmSync(dir,{recursive:true,force:true});
 }
});
