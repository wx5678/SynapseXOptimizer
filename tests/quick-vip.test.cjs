const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const Module=require('node:module');
const {prepareQuickApply}=require('../electron/quick-apply.cjs');
const {createVipPolicy,routeFeature}=require('../electron/vip-policy.cjs');
function loadTs(name){
 const file=path.join(__dirname,'../src/lib',name+'.ts');const unit=new Module(file,module);
 unit._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);return unit.exports;
}
const {userError}=loadTs('userError');const {quickTierFeature}=loadTs('quickPresets');

test('preset metadata gates both optimal and maximum; basic stays free',()=>{
 assert.equal(quickTierFeature('basic'),null);assert.equal(quickTierFeature('optimal'),'quick.optimal');assert.equal(quickTierFeature('maximum'),'quick.maximum');
 let current={user:{id:'fixture'},status:'unlicensed',features:[]};const policy=createVipPolicy({state:()=>current});
 for(const tier of ['optimal','maximum'])assert.throws(()=>prepareQuickApply({tier,kind:'system',id:'disable-silent-content'},policy.requireFeature),/VIP/);
 current={...current,status:'active',features:['vip']};assert.doesNotThrow(()=>prepareQuickApply({tier:'optimal',kind:'system',id:'disable-silent-content'},policy.requireFeature));
 current.status='expired';assert.throws(()=>prepareQuickApply({tier:'optimal',kind:'system',id:'disable-silent-content'},policy.requireFeature),/VIP/);
});

test('free basic cannot relabel a paid preset item, expert row or arbitrary route',()=>{
 let gates=0;const check=()=>{gates++};
 for(const id of ['game-mode','disable-game-capture','quiet-gamebar','mmcss-game-priority']){
  const value=prepareQuickApply({tier:'basic',kind:'system',id,path:'/api/lab/start'},check);
  assert.equal(value.path,'/api/system/apply');assert.deepEqual(JSON.parse(value.body),{ids:[id],confirmation:'APPLY'});
 }
 assert.equal(gates,0);
 for(const value of [{tier:'basic',kind:'system',id:'disable-silent-content'},{tier:'basic',kind:'expert',id:'privacy-feedback'},{tier:'unknown',kind:'system',id:'game-mode'}])assert.throws(()=>prepareQuickApply(value,check));
});

test('quick IPC checks caller and current VIP on every dispatched row; denial writes nothing',async()=>{
 const source=fs.readFileSync(require.resolve('../electron/main.cjs'),'utf8');const handlers=new Map();let writes=0;
 let value={user:{id:'fixture'},status:'unlicensed',features:[]};const policy=createVipPolicy({state:()=>value});
 const context=vm.createContext({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
   requireMain:event=>{if(event.sender!=='main')throw Error('Unsupported sender')},product:{requireAccess(){}},
   hostEndpoint:{port:1,token:'isolated'},vipToken:'fixture',routeFeature,requireVip:policy.requireFeature,prepareQuickApply,URL,
   require:()=>({requestHostJson:async()=>{writes++;return {ok:true,backupId:'fixture'}}})});
 vm.runInContext(source.slice(source.indexOf('    const forwardHostRequest'),source.indexOf('    const getSignin')),context);
 const apply=handlers.get('quick:apply'),row={tier:'optimal',kind:'system',id:'disable-silent-content'};
 await assert.rejects(apply({sender:'foreign'},row),/Unsupported/);await assert.rejects(apply({sender:'main'},row),/VIP/);assert.equal(writes,0);
 value={...value,status:'active',features:['vip']};await apply({sender:'main'},row);assert.equal(writes,1);
 value.status='expired';await assert.rejects(apply({sender:'main'},row),/VIP/);assert.equal(writes,1);
 await apply({sender:'main'},{tier:'basic',kind:'system',id:'game-mode'});assert.equal(writes,2);
});

test('IPC technical wrappers are removed without hiding the actual failure reason',()=>{
 assert.match(userError(new Error("Error invoking remote method 'host:request': TypeError: fetch failed")),/本地服务连接中断/);
 assert.equal(userError(new Error("Error invoking remote method 'vip:require': Error: VIP 专属：最佳优化。")),'VIP 专属：最佳优化。');
 assert.equal(userError("Error: Error invoking remote method 'quick:apply': Error: Access is denied."),'Access is denied.');
 assert.equal(userError(new Error('配置服务暂不可用')),'配置服务暂不可用');
});

test('switching tiers clears previous feedback; stale permission response is ignored',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/components/QuickOptimizationPanel.tsx'),'utf8');
 assert.match(ui,/const request = \+\+tierRequest.current/);assert.match(ui,/setError\(''\);setAccessMessage\(''\)/);
 assert.match(ui,/request === tierRequest.current/);assert.match(ui,/role="status"/);
 assert.match(ui,/quickTierFeature\(t.id\)\?' · VIP'/);assert.doesNotMatch(ui,/setError\(String\(e\)\); return/);
});
