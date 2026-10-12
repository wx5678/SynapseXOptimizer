const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('src/readability.css');
function contrast(a,b){const lum=s=>s.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((t,x,i)=>t+x*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('semantic text and status colors remain readable in both themes',()=>{
  const blocks=[...css.matchAll(/html\[data-skin(?:="light")?\]:not\(\[data-overlay="1"\]\)\s*\{([^}]+)\}/g)];
  assert.equal(blocks.length,2);
  blocks.forEach((block,i)=>{for(const [,color]of block[1].matchAll(/--status-[\w-]+:\s*#([\da-f]{6})/g)){for(const bg of i?['ffffff','f5f6f8','eef0f4']:['1b1e23','181b20','242c37'])assert.ok(contrast(color,bg)>=4.5,`${color} on ${bg}`);}});
  assert.ok(contrast('ffffff','345f9f')>=4.5);assert.ok(contrast('ffffff','aa243b')>=4.5);
});
test('help, charts and legacy neutral/status utilities use scoped theme colors',()=>{
  for(const selector of ['.assistant-status small','.assistant-status b','.assistant-nav svg','.sidebar-backup svg:first-child','.confirm-close:hover','.text-slate-100','.text-slate-200','.text-slate-600','.report-score-surface','.report-chart-fps','.report-chart-low'])assert.ok(css.includes(selector),selector);
  assert.doesNotMatch(css,/\.overlay-surface|svg\s*\{[^}]*fill:/);
  assert.match(read('src/main.tsx'),/import "\.\/home.css";\s*import "\.\/readability.css"/);
  assert.doesNotMatch(read('src/components/PerformanceReports.tsx'),/bg-\[#07100d\]/);
  assert.match(read('src/components/GameSessionReporter.tsx'),/className="report-toast /);
});
