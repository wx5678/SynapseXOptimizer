const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const [dir,artifacts]=process.argv.slice(2),url=process.env.SYNAPSEX_POWER_UI_URL;
assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('synapsex-power-ui-'));assert.equal(new URL(url).hostname,'127.0.0.1');app.setPath('userData',dir);
const timeout=setTimeout(()=>app.exit(1),25000);let window;
const wait=async predicate=>{for(let n=0;n<100;n++){if(await predicate())return;await new Promise(r=>setTimeout(r,40));}throw Error('UI timeout');};
app.whenReady().then(async()=>{
 try{
  window=new BrowserWindow({show:false,width:1180,height:990,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const js=code=>window.webContents.executeJavaScript(code,true);
  const choose=index=>js(`(()=>{const s=document.querySelector('select');s.value=s.options[${index}].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for(const skin of ['dark','light']){
   await window.loadURL(url+'?skin='+skin);await wait(()=>js("!!document.querySelector('select')"));
   assert.equal(await js("document.querySelectorAll('option').length"),76);
   assert.equal(await js("document.querySelector('section button').disabled"),true);
   const riskIndex=await js("[...document.querySelector('select').options].findIndex(o=>o.textContent.includes('[高风险]'))");
   await choose(riskIndex);await wait(()=>js("document.querySelectorAll('input[type=checkbox]').length===2"));
   await js("document.querySelector('input[type=checkbox]').click()");await new Promise(r=>setTimeout(r,40));
   assert.equal(await js("document.querySelector('section button').disabled"),true);
   await js("document.querySelectorAll('input[type=checkbox]')[1].click()");await wait(()=>js("!document.querySelector('section button').disabled"));
   await js("document.querySelector('section button').click()");
   assert.equal(JSON.parse(await js("document.body.dataset.applied")).risk,true);
   await new Promise(r=>setTimeout(r,150));
   fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,`library-${skin}.png`),(await window.webContents.capturePage()).toPNG());
   await choose(1);await wait(()=>js("!document.querySelector('input[type=checkbox]').checked"));
   assert.equal(await js("document.querySelector('section button').disabled"),true);
   await js("(()=>{const i=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'not-a-plan-xyz');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await wait(()=>js("document.querySelector('select').options.length===1"));assert.equal(await js("document.querySelector('select').disabled"),true);
   await js("document.querySelectorAll('section button')[1].click()");assert.equal(await js("document.body.dataset.restored"),'yes');
  }
  window.setSize(480,900);await window.loadURL(url+'?skin=light');await wait(()=>js("!!document.querySelector('select')"));await choose(1);await wait(()=>js("!!document.querySelector('dl')"));
  assert.equal(await js("document.documentElement.scrollWidth>document.documentElement.clientWidth"),false);
  fs.writeFileSync(path.join(artifacts,'library-narrow.png'),(await window.webContents.capturePage()).toPNG());
  console.log('PASS: 75 options; search, risk/full-plan gates, selection resets, restore callback, dark/light/narrow screenshots. No host or power changes.');
 }finally{clearTimeout(timeout);window?.destroy();}app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
