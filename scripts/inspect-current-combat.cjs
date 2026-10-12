// Read-only recovery and reference search. Does not execute recovered game code.
const fs=require('node:fs'),z=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const root='D:/game/游戏蜗牛/9yinjh';
const parserSource=fs.readFileSync(path.join(__dirname,'../state/fps-cap-investigation/inspect-fps-lua.mjs'),'utf8');
const start=parserSource.indexOf('function readLua(input)'),end=parserSource.indexOf('\nconst packagePath=',start);assert(start>=0&&end>start);
const exe=fs.readFileSync(root+'/bin64/fxgame.exe'),k=exe.indexOf(Buffer.from('abcd464fghfgfjhf'));assert(k>=0);
let e=k;while(e<exe.length&&exe[e]>=32&&exe[e]<=126)e++;const key=exe.subarray(k,e);assert(key.length>=128&&key.length<=2048);
// Reuses our existing field parser only; Lua input is data, never evaluated.
const parse=new Function('input','key','decode','assert',parserSource.slice(start,end)+'\nreturn readLua(input);');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const packageName=process.argv[3]||'lua64.package';
assert(['lua.package','lua64.package'].includes(packageName));
const file=root+'/res/'+packageName,b=fs.readFileSync(file),before=hash(b);
const pattern=new RegExp(process.argv[2]||'action.?speed|speed.?action|blend.*speed|trigger_action|CS_em_jdmz02','i');
let blocks=0,parsed=0,parseErrors=0;const hits=[];
function visit(p,found){const matching=p.constants.filter(x=>typeof x==='string'&&pattern.test(x));if(matching.length)found.push({first:p.firstLine,last:p.lastLine,matches:matching,strings:p.constants.filter(x=>typeof x==='string'),locals:p.locals.map(x=>x.name),numbers:p.constants.filter(x=>typeof x==='number')});for(const child of p.children)visit(child,found);}
for(let i=b.readUInt32LE(14);i<b.length-2;){if(b[i]!==120||((b[i]<<8)+b[i+1])%31){i++;continue;}let r;try{r=z.inflateSync(b.subarray(i),{info:true,maxOutputLength:8*1024*1024});}catch{i++;continue;}blocks++;try{const p=parse(r.buffer,key,new TextDecoder('gbk'),assert);parsed++;const found=[];visit(p,found);if(found.length)hits.push({offset:i,source:p.source,found});}catch{parseErrors++;}i+=r.engine.bytesWritten;}
assert.equal(hash(fs.readFileSync(file)),before,'Resource changed while reading');
console.log(JSON.stringify({file,sha256:before,indexFlag:b.readUInt16LE(6),blocks,parsed,parseErrors,hits,activeIndexResolved:false},null,2));
