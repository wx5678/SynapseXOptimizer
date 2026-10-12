// Read-only diagnostic: output cookie metadata only, never values or tickets.
const {app,safeStorage}=require('electron');
const fs=require('node:fs');
app.whenReady().then(()=>{try {
 const file=process.argv[2];
 const list=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
 console.log(JSON.stringify(list.map(c=>({name:c.name,domain:c.domain,expired:!!c.expirationDate&&c.expirationDate<Date.now()/1000})),null,2));
}catch {console.error('Unable to inspect session metadata');process.exitCode=1;}finally{app.exit(process.exitCode||0);}});
