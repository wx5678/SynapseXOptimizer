const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'src/lib/executablePicker.ts');
const unit=new Module(file,module);
unit._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {selectExecutable}=unit.exports;

test('EXE picker fills an absolute Unicode/space path unchanged; cancellation preserves existing value',async()=>{
 let value='C:\\old\\game.exe',updates=0;
 const update=v=>{value=v;updates++};
 assert.equal(await selectExecutable(async()=>'',update),false);assert.equal(value,'C:\\old\\game.exe');assert.equal(updates,0);
 const picked='D:\\游戏 安装目录\\客户端\\fxgame.EXE';
 assert.equal(await selectExecutable(async()=>picked,update),true);assert.equal(value,picked);assert.equal(updates,1);
});

test('missing desktop bridge, rejected dialog and non-EXE selections never update the field',async()=>{
 let writes=0;const update=()=>{writes++};
 await assert.rejects(selectExecutable(undefined,update),/桌面客户端/);
 await assert.rejects(selectExecutable(async()=>{throw Error('dialog unavailable')},update),/dialog unavailable/);
 for(const picked of ['D:\\Games','D:\\game.lnk','D:\\readme.txt'])await assert.rejects(selectExecutable(async()=>picked,update),/\.exe/);
 assert.equal(writes,0);
});

test('native EXE dialog opens a single file chooser with exe filter and returns cancel safely',async()=>{
 const source=fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8'),handlers=new Map();let response,options;
 const owner={id:'workspace'};
 const context=vm.createContext({ipcMain:{on(){},handle:(name,fn)=>handlers.set(name,fn)},
   BrowserWindow:{fromWebContents:()=>owner},mainWindow:owner,
   dialog:{showOpenDialog:async(win,opts)=>{assert.equal(win,owner);options=opts;return response}}});
 vm.runInContext(source.slice(source.indexOf('function registerWindowControls'),source.indexOf('async function createOverlayWindow')),context);
 vm.runInContext('registerWindowControls()',context);
 const pick=handlers.get('dialog:select-game-executable');
 response={canceled:true,filePaths:[]};assert.equal(await pick({sender:{}}),'');
 response={canceled:false,filePaths:['D:\\Games\\game.exe']};assert.equal(await pick({sender:{}}),'D:\\Games\\game.exe');
 assert.deepEqual([...options.properties],['openFile']);assert.ok(options.filters.some(x=>x.extensions.includes('exe')));
});

test('all discovered executable-entry surfaces expose a picker and clear stale target previews',()=>{
 const read=name=>fs.readFileSync(path.join(root,'src/components',name),'utf8');
 const workspace=read('OptimizerWorkspace.tsx');
 const gpu=workspace.slice(workspace.indexOf('指定游戏使用高性能 GPU'),workspace.indexOf('NVIDIA / AMD 显卡驱动专项'));
 const qos=workspace.slice(workspace.indexOf('游戏程序 QoS · DSCP 46'));
 assert.match(gpu,/<ExecutablePickerButton/);assert.match(gpu,/onSelect=\{selectGpuPath\}/);
 assert.match(gpu,/setGpuPreference\(await hostApi.gpuPreference/);
 assert.match(qos,/<ExecutablePickerButton/);
 for(const [name,clear] of [['LabGpuPanel.tsx','setCatalog(null)'],['LabRegistryPanel.tsx','setPreview(null)']]){
   const source=read(name);assert.match(source,/<ExecutablePickerButton/);assert.ok(source.includes(clear));
 }
 const library=read('SessionLabPanel.tsx');
 assert.match(library,/label="浏览游戏 EXE".*onSelect=\{setGamePath\}/);
 assert.match(library,/label="浏览白名单 EXE".*onSelect=\{setWhite\}/);
 assert.match(read('SystemToolsPanel.tsx'),/<ExecutablePickerButton/);
 assert.match(workspace,/selectGameDirectory\(\)/);assert.match(workspace,/选择游戏目录/);
});
