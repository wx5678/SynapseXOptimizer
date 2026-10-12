// Dev-only UI fixture. Never connects to official endpoints or local account files.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'framer-motion';
import {CommunitySigninPanel} from '../src/components/CommunitySigninPanel';
import {GlobalSigninReminder} from '../src/components/GlobalSigninReminder';
import {CommunitySigninSummary} from '../src/components/CommunitySigninSummary';
import '../src/index.css'; import '../src/workspace.css'; import '../src/skins.css'; import '../src/optimization-layout.css'; import '../src/graphite.css'; import '../src/home.css'; import '../src/readability.css';
const key=(g:string,id:string,n:string)=>JSON.stringify([g,id,n]);
const catalog:CommunityCatalog={groups:[{id:'270',name:'江湖九区'},{id:'1',name:'电信一区'}],servers:[{id:'7',groupId:'270',name:'月明沧海',active:true,optionKey:key('270','7','月明沧海')},{id:'7',groupId:'270',name:'霜晨月',active:true,optionKey:key('270','7','霜晨月')},{id:'7',groupId:'270',name:'龙行天下',active:false,optionKey:key('270','7','龙行天下')},{id:'2',groupId:'1',name:'龙门客栈',active:true,optionKey:key('1','2','龙门客栈')}]};
const make=(id:string,name:string,status:CommunityAccount['status'],days:number):CommunityAccount=>({id,name,accountName:`example_${id}`,enabled:true,status,error:status==='login'?'登录已失效，请完成官方验证。':'',receipt:null,state:{loggedIn:status!=='login',message:'测试会话',checkedAt:new Date().toISOString(),choice:{serverId:'7',groupId:'270',optionKey:catalog.servers[0].optionKey},records:[{serverId:'7',days}],storageError:'',windowError:'',loginOpen:false,lastResult:null}});
let model:CommunityAccounts={date:'2026-09-14',autoSign:false,busy:false,progress:null,storageError:'',accounts:[make('demo1','主号 · 云间', 'signed',14),make('demo2','日常号 · 清风','pending',9),make('demo3','备用号 · 长安','login',3)]};
if(new URLSearchParams(location.search).has('missingIdentity')) {model.accounts=[make('demo1','','signed',14)];model.accounts[0].accountName='';}
if(new URLSearchParams(location.search).has('refreshResult')) {
 model.accounts=[make('demo1','','signed',14)];model.accounts[0].accountName='';
 model.accounts[0].state!.windowError='登录结果未能确认，请关闭窗口并在软件中刷新状态。';
 model.accounts[0].state!.lastResult={success:false,message:'您今日已经签到过了',code:'duplicate',at:'2026-09-14T08:00:00Z',serverId:'7'};
}
const copy=()=>structuredClone(model), get=(id:string)=>model.accounts.find(a=>a.id===id)!;
const community:NonNullable<Window['synapsexDesktop']>['community']={
  accounts:async()=>copy(),catalog:async()=>catalog,
  refreshAccounts:async()=>{for(const a of model.accounts)if(a.state?.loggedIn)a.state.windowError='';return copy();},
  addAccount:async({name})=>{const a=make(crypto.randomUUID(),name,'configure',0);a.state=null;model.accounts.push(a);return {...copy(),accountId:a.id};},
  updateAccount:async({accountId,name,enabled})=>{if(name!==undefined)get(accountId).name=name;if(enabled!==undefined)get(accountId).enabled=enabled;return copy();},
  settings:async({autoSign})=>{model.autoSign=autoSign;return copy();},
  openLogin:async({accountId})=>{const a=get(accountId);a.state=make(a.id,a.name,'pending',0).state;a.status='pending';a.error='';return copy();},
  selectServer:async({accountId,...choice})=>{const a=get(accountId);a.state??=make(a.id,a.name,'pending',0).state;a.state!.choice=choice;return copy();},
  batch:async({accountIds})=>{model.busy=true;model.progress={total:accountIds.length,completed:0,current:'',automatic:false};for(const id of accountIds){const a=get(id);model.progress.current=a.name;await new Promise(r=>setTimeout(r,1000));if(a.status==='pending'){a.status='signed';a.state!.records[0].days++;}model.progress.completed++;}model.busy=false;model.progress.current='';return copy();},
  forget:async()=>copy(), removeAccount:async({accountId})=>{model.accounts=model.accounts.filter(a=>a.id!==accountId);return copy();}
};
window.synapsexDesktop={community} as NonNullable<Window['synapsexDesktop']>;
function Fixture(){return <MotionConfig reducedMotion="always"><div className="desktop-workspace" style={{maxWidth:1200,margin:'0 auto',padding:28}}><div style={{display:'flex',gap:12,alignItems:'center',marginBottom:22}}><strong>隔离测试 · 示例账号 · 不提交真实签到</strong><button className="workbench-secondary" onClick={()=>document.documentElement.dataset.skin='light'}>银白测试</button><button className="workbench-secondary" onClick={()=>document.documentElement.dataset.skin='dark'}>深色测试</button></div><div style={{width:240}}><GlobalSigninReminder onOpen={()=>document.getElementById('signin-fixture')?.scrollIntoView()}/></div><CommunitySigninSummary onOpen={()=>document.getElementById('signin-fixture')?.scrollIntoView()}/><div id="signin-fixture"><CommunitySigninPanel/></div></div></MotionConfig>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
