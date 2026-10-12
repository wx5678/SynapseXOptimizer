const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loginResponse,alreadyToday,createActivityScheduler}=require('../electron/community-status.cjs');
test('only confirmed unauthenticated response marks logout; throttle and unknown are errors',()=>{
 assert.equal(loginResponse({msgcode:1}),true);
 assert.equal(loginResponse({msgcode:4028}),false);
 assert.throws(()=>loginResponse({msgcode:4026}),e=>e.code==='4026'&&!/失效/.test(e.message));
 assert.throws(()=>loginResponse({msgcode:500}));
});
test('today confirmations include signed-before wording without assuming totals or generic success',()=>{
 for(const msg of ['您今天已经签到，请明天再来','您今日已签过到','当天已经签过到']) assert.equal(alreadyToday(msg),true);
 for(const msg of ['昨日已经签到','累计签到15天','今日尚未签到','如果今天已经签到无需重复','签到失败']) assert.equal(alreadyToday(msg),false);
});
test('activity requests across profiles serialize and are spaced, including after a failure',async()=>{
 let now=10000;const starts=[];
 const schedule=createActivityScheduler({interval:2500,now:()=>now,wait:async ms=>{now+=ms;}});
 const tasks=[schedule(async()=>{starts.push(now);throw new Error('offline');}),schedule(async()=>{starts.push(now);return 1;}),schedule(async()=>{starts.push(now);return 2;})];
 const results=await Promise.allSettled(tasks);
 assert.deepEqual(starts,[10000,12500,15000]);assert.equal(results[2].value,2);
});
