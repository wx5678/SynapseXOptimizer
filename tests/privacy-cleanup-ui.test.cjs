const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('expanded expert catalog stays searchable and paginated',()=>{
  const ui=read('src/components/ExpertSettingsPanel.tsx');
  assert.match(ui,/搜索高级参数/);
  assert.match(ui,/下一页/);
  assert.match(ui,/上一页/);
  assert.match(ui,/Math\.min/);
  assert.match(read('host/modules/ExpertSettings.psm1'),/Get-PrivacyDefinitions/);
});
test('disconnected cleanup uses fresh identity checks and exact-instance removal only',()=>{
  const host=read('host/modules/DisconnectedDevices.psm1');
  const ui=read('src/components/DisconnectedDevicesPanel.tsx');
  assert.match(host,/ConfigManagerErrorCode -eq 45/);
  assert.match(host,/fingerprint -cne \$Fingerprint/);
  assert.match(host,/'\/remove-device' \$Target/);
  assert.doesNotMatch(host,/['"]\/(subtree|force|reboot|delete-driver|deviceid)['"]/i);
  assert.match(host,/status='unverified'/);
  assert.match(host,/Save-DisconnectedRecord \$r\s+try/);
  assert.match(ui,/搜索未连接设备/);
  assert.match(ui,/requestConfirmation/);
  assert.match(ui,/不提供一键撤销/);
  assert.match(read('host/SynapseXHost.ps1'),/confirmation -cne 'REMOVE'/);
});
