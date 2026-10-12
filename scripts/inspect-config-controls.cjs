const fs=require('node:fs'),z=require('node:zlib');
const b=fs.readFileSync('D:/game/游戏蜗牛/9yinjh/res/skin.package');
for(let i=b.readUInt32LE(14);i<b.length-2;){
 if(b[i]!==120||((b[i]<<8)+b[i+1])%31){i++;continue;}
 try{const r=z.inflateSync(b.subarray(i),{info:true,maxOutputLength:8000000}),s=r.buffer.toString('utf8');
 for(const m of s.matchAll(/<control name="(cbtn_(?:self|other|enemy)_effect_alpha|tbar_flexible|ui_scale_track|tbar_camera_dis|tbar_keepdelay)"[^>]*>[\s\S]*?<\/control>/g))
 console.log(JSON.stringify({offset:i,control:m[1],attributes:[...m[0].matchAll(/\b(?:Text|HintText|Minimum|Maximum|Value)="([^"]*)"/g)].map(x=>x[0])}));
 i+=r.engine.bytesWritten;}catch{i++;}
}
const textPackage=fs.readFileSync('D:/game/游戏蜗牛/9yinjh/res/text.package');
for(let i=textPackage.readUInt32LE(14);i<textPackage.length-2;){
 if(textPackage[i]!==120||((textPackage[i]<<8)+textPackage[i+1])%31){i++;continue;}
 try {const r=z.inflateSync(textPackage.subarray(i),{info:true,maxOutputLength:16000000});
 const utf8=r.buffer.toString('utf8'),s=utf8.includes('\uFFFD')?new TextDecoder('gbk').decode(r.buffer):utf8;
 for(const line of s.split(/\r?\n/))if(/ui_(?:se_alpha_tips|oe_alpha_tips|ee_alpha_tips|system_mouse_sensitive_tip)\b/.test(line))console.log(JSON.stringify({package:'text',offset:i,text:line.slice(0,900)}));
 i+=r.engine.bytesWritten;}catch{i++;}
}
