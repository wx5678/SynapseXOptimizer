// Read-only local validation. Produces no game resource files.
const fs=require('node:fs');
const {PROFILE,buildCandidate,digest,decode}=require('../electron/jiuyin-fps-unlock.cjs');
const original=fs.readFileSync(process.argv[2]);
if(digest(original)!==PROFILE.original)throw Error('Original hash mismatch');
(async()=>{
  const failures=[];let count=0;
  for(let cap=60;cap<=999;cap+=3){
    try {const b=await buildCandidate(original,PROFILE,cap);if(decode(b).maximum*3!==cap)throw Error('wrong maximum');count++;}
    catch(e){failures.push({cap,message:e.message});}
  }
  const final=await buildCandidate(original,PROFILE,1000);
  console.log(JSON.stringify({verifiedCaps:count,failures,input1000Actual:decode(final).maximum*3,input1000Hash:digest(final)}));
  if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
