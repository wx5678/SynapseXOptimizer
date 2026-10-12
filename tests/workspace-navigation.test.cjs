const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
test('all page families use a shared navigation portal, distinct from the sidebar class',()=>{
 assert.match(read('App.tsx'),/<WorkspaceNavigationLayout context=/);
 assert.match(read('components/WorkspaceNavigation.tsx'),/createPortal\(content, target\)/);
 assert.match(read('components/WorkspaceNavigation.tsx'),/InsideNavigation/);
 for(const file of ['OptimizerWorkspace','SystemExtensions','RealtimeMonitor','PerformanceReports','WorkbenchDashboard','CommunitySigninPanel','SchedulerLabPanel'])assert.match(read('components/'+file+'.tsx'),/<WorkspaceNavigation>/,file);
 const css=read('components/workspace-navigation.css');assert.match(css,/position: sticky; top: 48px/);assert.doesNotMatch(css,/\.workspace-navigation(?:\s|\{|:)/);assert.match(css,/var\(--workspace-page-navigation-height/);
});
