const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/communityAccounts.ts'),'utf8');
const exportsForTest={};
new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(exportsForTest,()=>({}));
const {accountTitle,accountIdentity,signinLabel}=exportsForTest;
test('missing account name never implies logout for a verified signed-in account',()=>{
 const row={name:'',accountName:'',status:'signed',state:{loggedIn:true}};
 assert.equal(accountTitle(row),'已登录账号');assert.equal(signinLabel(row),'已签到');
 assert.match(accountIdentity(row),/不影响签到/);
 assert.doesNotMatch(accountTitle(row)+accountIdentity(row),/等待登录|重新登录/);
});
test('remark, identity and authentication remain independent',()=>{
 const row={name:'主号',accountName:'example_login',status:'signed',state:{loggedIn:false}};
 assert.equal(accountTitle(row),'主号');assert.equal(accountIdentity(row),'example_login');
 assert.equal(accountTitle({...row,name:''}),'example_login');
 assert.notEqual(accountTitle({...row,name:'',accountName:''}),'已登录账号');
 assert.equal(signinLabel(row),'已签到');
});
