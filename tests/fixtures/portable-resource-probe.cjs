// Run with ELECTRON_RUN_AS_NODE: no product startup, user sessions, UI or UAC.
const fs=require('node:fs'),path=require('node:path');
const [directory,label]=process.argv.slice(2);
if(!directory||!['first','second'].includes(label))throw Error('Invalid probe arguments');
const resources=path.join(path.dirname(process.execPath),'resources');
fs.writeFileSync(path.join(directory,label+'.json'),JSON.stringify({pid:process.pid,resources,indexPresent:fs.existsSync(path.join(resources,'dist/index.html'))}));
if(label==='first') {
 const timer=setInterval(()=>{
  if(fs.existsSync(path.join(directory,'stop')))clearInterval(timer);
 },100);
 setTimeout(()=>process.exit(2),60000).unref();
}
