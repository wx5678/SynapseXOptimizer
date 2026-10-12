// Isolated renderer interaction test. No real accounts, official requests or sign submissions.
const {app,BrowserWindow}=require('electron');
const {buildSync}=require('node:module').createRequire(require.resolve('vite/package.json'))('esbuild');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-signin-ui-')));
const bundle=buildSync({stdin:{contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import {CommunitySigninPanel} from './src/components/CommunitySigninPanel';
const groups=[{id:'270',name:'江湖九区'},{id:'266',name:'江湖八区'}];
const servers=[['270','7100587','龙行天下',false],['270','7100587','月明沧海',true],['266','7100577','剑啸山河',true]].map(([groupId,id,name,active])=>({groupId,id,name,active,optionKey:JSON.stringify([groupId,id,name])}));
let choice={groupId:'',serverId:''};
const accounts=()=>Promise.resolve({autoSign:false,busy:false,date:'2026-09-14',progress:null,storageError:'',accounts:[{id:'legacy',name:'测试账号',enabled:true,status:'pending',error:'',receipt:null,state:{loggedIn:true,message:'测试登录',choice,records:[],checkedAt:'',loginOpen:false,lastResult:null}}]});
window.synapsexDesktop={community:{accounts,catalog:()=>Promise.resolve({groups,servers}),selectServer:async input=>{choice=input;return accounts();},batch:()=>{throw Error('Test must not sign');}}};
window.testChoice=()=>choice;
const root=createRoot(document.getElementById('root'));
window.mountTest=()=>root.render(React.createElement(CommunitySigninPanel,{key:Math.random()})); window.mountTest();
`,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,write:false,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},jsx:'automatic'}).outputFiles[0].text;
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1360,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
    await win.loadURL('data:text/html,<div id="root"></div>');
    await win.webContents.executeJavaScript(bundle);
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(r=>setTimeout(r,80));
      const select=(index,value)=>{const s=document.querySelectorAll('select')[index];s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}));};
      const click=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click();
      const names=()=>[...document.querySelectorAll('select')[1].options].slice(1).map(o=>o.textContent);
      await wait(); select(0,'270'); await wait(); const ninth=names();
      select(1,JSON.stringify(['270','7100587','月明沧海'])); await wait(); click('保存区服'); await wait();
      window.mountTest(); await wait(); const restored=document.querySelectorAll('select')[1].selectedOptions[0].text;
      select(0,'266'); await wait(); const eighth=names(); const reset=document.querySelectorAll('select')[1].value;
      select(0,'270'); await wait(); document.querySelector('.signin-history input').click(); await wait();
      select(1,JSON.stringify(['270','7100587','龙行天下'])); await wait(); const historical=document.querySelectorAll('select')[1].selectedOptions[0].text;
      select(1,JSON.stringify(['270','7100587','月明沧海'])); await wait(); const alias=document.querySelectorAll('select')[1].selectedOptions[0].text;
      return {ninth,eighth,restored,reset,historical,alias,choice:window.testChoice()};
    })()`);
    assert.deepEqual(result.ninth,['月明沧海']); assert.deepEqual(result.eighth,['剑啸山河']);
    assert.equal(result.reset,''); assert.equal(result.restored,'月明沧海');
    assert.equal(result.historical,'龙行天下（历史列表）'); assert.equal(result.alias,'月明沧海');
    assert.equal(result.choice.serverId,'7100587'); console.log(JSON.stringify({passed:true,...result}));
  } catch(e) {console.error(e.stack);process.exitCode=1;}
  finally {win.destroy();app.exit(process.exitCode||0);}
});
