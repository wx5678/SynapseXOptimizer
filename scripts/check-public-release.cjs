const {validateConfig}=require('../electron/licensing.cjs');
const {verifyManifest}=require('../electron/product-client.cjs');
const fs=require('node:fs');
(async()=>{
 const input=require('../electron/license-config.json'),config=validateConfig(input,true);
 const health=await fetch(input.endpoint+'/healthz',{signal:AbortSignal.timeout(10000)});
 const publicSettings=await fetch(input.endpoint+'/v1/product',{signal:AbortSignal.timeout(10000)});
 if(!health.ok||!publicSettings.ok)throw Error('Public endpoints unhealthy');
 const v=verifyManifest((await publicSettings.json()).manifest,config,Math.floor(Date.now()/1000));
 const result={checkedAt:new Date().toISOString(),health:await health.json(),signatureVerified:true,revision:v.revision,prices:{month:v.config.month_fen/100,year:v.config.year_fen/100},wechat:v.config.wechat,qrPresent:!!v.config.qr_data,update:v.config.update};
 fs.writeFileSync(require('node:path').join(__dirname,'../state/public-release-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
