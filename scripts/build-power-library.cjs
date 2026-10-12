const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const report=JSON.parse(fs.readFileSync(path.join(root,'state/power-audit-20260916/report.json'),'utf8'));
const out=path.join(root,'host/power-library');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const items=report.plans.filter(p=>p.imported).map(p=>{
 const bytes=fs.readFileSync(p.source),id=p.hash.toLowerCase();
 if(hash(bytes)!==id)throw Error('Source hash mismatch: '+p.source);
 const names=[...new Set(p.sources.map(s=>path.basename(s)))];
 const highRisk=p.values.idleDisabled===1 || p.values.autonomousMode===0 || [1,3].includes(p.values.schedulingPolicy) || [1,3].includes(p.values.shortSchedulingPolicy);
 fs.writeFileSync(path.join(out,id+'.pow'),bytes);
 return {id,name:p.name,files:names,highRisk,values:p.values,warnings:p.reasons};
}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
const unavailable=report.plans.filter(p=>!p.imported).map(p=>({name:path.basename(p.source),reason:'文件格式无效，不能导入'}));
unavailable.push({name:'抖音孤单障碍专属电源计划.rar',reason:'独立压缩包加密，未成功读取；未将解压残片入库'});
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schema:1,source:'用户提供的电源配置文件；2026-09-16 参数审计',note:'原始整包计划，包含 AC/DC 和其他设备参数。名称不是 CPU 适配证明；仅在用户明确选择后导入，不自动启用。',items,unavailable},null,2));
console.log('Bundled '+items.length+' original power plans; source hashes verified. No Windows power changes.');
