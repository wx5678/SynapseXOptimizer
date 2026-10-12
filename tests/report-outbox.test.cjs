const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createReportOutbox}=require('../electron/report-outbox.cjs');
test('report journal is durable, idempotent, private-path only and removable after ack',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-report-journal-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const box=createReportOutbox(directory),report={id:'session-20260916-120000-12345678',game:{processName:'fxgame.exe',startedAt:'2026-09-16T12:00:00Z'},samples:3};
 box.put(report);box.put({...report,samples:5});assert.equal(createReportOutbox(directory).list()[0].samples,5);assert.equal(box.list().length,1);
 assert.throws(()=>box.put({...report,id:'../../account'}));assert.throws(()=>box.remove('../file'));box.remove(report.id);assert.equal(box.list().length,0);
});
