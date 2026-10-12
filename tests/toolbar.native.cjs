const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',process.argv[2]);const url=process.env.SYNAPSEX_TOOLBAR_UI_URL;assert.equal(new URL(url).hostname,'127.0.0.1');
const timer=setTimeout(()=>app.exit(1),45000);let window;
const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('UI timeout');};
app.whenReady().then(async()=>{try{
 window=new BrowserWindow({show:false,width:1360,height:860,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
 const js=code=>window.webContents.executeJavaScript(code,true);
 const artifacts=path.resolve(__dirname,'../design-evidence/toolbar-0.39.25');fs.mkdirSync(artifacts,{recursive:true});
 for(const [skin,role,width,long,help] of [['dark','admin',1360,false,false],['light','admin',1360,false,false],['dark','vip',980,true,true],['light','free',980,true,true],['dark','guest',980,false,true]]){
  window.setContentSize(width,820);await window.loadURL(`${url}?skin=${skin}&role=${role}&long=${long?'1':''}&help=${help?'1':'0'}`);
  await wait(()=>js(`!!document.querySelector('.toolbar-account-copy ${role==='guest'?'strong':'.toolbar-role'}')`));
  if(help)await wait(()=>js(`!!document.querySelector('#workspace-help-slot .assistant-trigger')`));
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,100));
  const boxes=await js(`(()=>{const selectors=['.workspace-context > span','.toolbar-connection','.workspace-utility-group','.toolbar-account'];return selectors.map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {s,left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth};});})()`);
  for(let i=1;i<boxes.length;i++)assert(boxes[i].left>=boxes[i-1].right-1,JSON.stringify({width,role,boxes}));
  assert(boxes.at(-1).right<=width,JSON.stringify(boxes));assert(!boxes.at(-1).overflow,JSON.stringify(boxes));
  fs.writeFileSync(path.join(artifacts,`${skin}-${role}-${width}.png`),(await window.webContents.capturePage({x:0,y:0,width,height:310})).toPNG());
  await js(`document.querySelector('.toolbar-update').click()`);await wait(()=>js(`document.body.dataset.refreshed==='yes'`));
  await js(`document.querySelector('.toolbar-account').click()`);await wait(()=>js(`!!document.querySelector('.membership-dialog[open]')`));
  await js(`document.querySelector('.membership-dialog').close()`);
  await js(`document.querySelector('.appearance-trigger').click()`);await wait(()=>js(`!!document.querySelector('#appearance-popover')`));
  const pop=await js(`(()=>{const r=document.querySelector('#appearance-popover').getBoundingClientRect();return {left:r.left,right:r.right};})()`);assert(pop.left>=0&&pop.right<=width,JSON.stringify(pop));
  await js(`document.querySelectorAll('.skin-choice')[${skin==='dark'?1:0}].click()`);await wait(()=>js(`document.documentElement.dataset.skin==='${skin==='dark'?'light':'dark'}'`));
  if(help){await js(`document.querySelector('.assistant-trigger').click()`);await wait(()=>js(`!!document.querySelector('.assistant-drawer')`));}
 }
 await window.loadURL(url+'?fps=1');await wait(()=>js(`document.querySelector('.jiuyin-fps-summary')?.textContent.includes('999 FPS') && !document.querySelector('.jiuyin-fps-card header button').disabled`));
 await js(`document.querySelector('.jiuyin-fps-card header button').click()`);
 await wait(()=>js(`document.querySelector('.jiuyin-fps-card header button').textContent.includes('检测中')`));
 assert.equal(await js(`document.querySelector('.jiuyin-fps-card header button').disabled`),true);
 await js(`document.querySelector('.jiuyin-fps-card header button').click();fpsTest.resolve({})`);
 await wait(()=>js(`document.querySelector('.jiuyin-fps-check-notice').textContent.includes('检测完成')`));
 assert.equal(await js(`fpsTest.calls`),2);assert.equal(await js(`document.querySelector('#jiuyin-fps-cap').value`),'300');
 assert.match(await js(`document.querySelector('.jiuyin-fps-check-notice').textContent`),/未找到原版备份/);
 await js(`document.querySelector('.jiuyin-fps-card header button').click()`);await wait(()=>js(`fpsTest.calls===3`));
 await js(`fpsTest.resolve({cap:600,visualRange:250,hasBackup:true})`);await wait(()=>js(`document.querySelector('.jiuyin-fps-check-notice').textContent.includes('600 FPS')`));
 assert.match(await js(`document.querySelector('.jiuyin-fps-summary').textContent`),/600 FPS/);
 await js(`document.querySelector('.jiuyin-fps-card header button').click()`);await wait(()=>js(`fpsTest.calls===4`));
 await js(`fpsTest.reject(new Error("Error invoking remote method 'fps:state': Error: 无法读取资源"))`);await wait(()=>js(`document.querySelector('.jiuyin-fps-check-notice').textContent==='检测失败：无法读取资源'`));
 assert.equal(await js(`document.querySelector('.jiuyin-fps-card header button').disabled`),false);
 await js(`document.querySelector('.jiuyin-fps-card header button').click()`);await wait(()=>js(`fpsTest.calls===5`));
 await js(`fpsTest.resolve({supported:false,cap:null,visualRange:null,message:'资源版本不兼容'})`);await wait(()=>js(`document.querySelector('.jiuyin-fps-check-notice').textContent.includes('未能确认可用资源')`));
 assert.equal(await js(`fpsTest.writes`),0);
 console.log('PASS: toolbar dark/light, admin/VIP/free/guest, long names, 980/1360 widths, update/account/theme/help actions; FPS refresh busy, unchanged/changed values, missing backup, errors, incompatible resources, no writes; screenshots saved');
}finally{clearTimeout(timer);window?.destroy();}app.exit(0);}).catch(e=>{console.error(e);app.exit(1);});
