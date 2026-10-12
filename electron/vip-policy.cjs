const features = Object.freeze({ 'quick.optimal':'最佳优化', 'quick.maximum':'最大优化', 'system.expert':'系统高级参数', 'network.tcp':'TCP / QoS', 'network.nic':'网卡高级', 'lab.all':'实验室进阶调度与配置', 'signin.three':'三个签到账号' });
const access = require('../host/feature-access.json');
const freeRoutes = new Set([...access.read,...access.diagnostics,...access.preferences,...access.recovery]);
function createVipPolicy(account, legacy) {
  function state() {
    const user = account?.state?.();
    const values = user?.user ? [user] : [user, legacy?.state?.()];
    const claims = values.filter(x => x?.status === 'active').flatMap(x => x.features || []);
    const vip = claims.includes('vip');
    const administrator = !!user?.user && user.status === 'active' && user.administrator === true;
    return { vip, administrator, features:[...Object.keys(features).filter(id => vip || claims.includes(id)), ...(administrator ? ['jiuyin.fps'] : [])], signinLimit:vip || claims.includes('signin.three') ? 3 : 1 };
  }
  function requireFeature(id) { if(id === 'jiuyin.fps') {if (!state().administrator) throw Error('仅软件管理员可提高九阴帧率或视野上限；VIP 不包含此修改权限。'); return;} if (!Object.hasOwn(features,id) || !state().features.includes(id)) throw Error(`VIP 专属：${features[id] || '此功能'}。请在软件设置登录并同步授权。`); }
  return {state, requireFeature};
}
function routeFeature(route, method = 'GET') {
  const path = new URL(route, 'http://localhost').pathname.toLowerCase();
  if (freeRoutes.has(path)) return null;
  if (Object.hasOwn(access.paid,path)) return access.paid[path];
  for(const [prefix,feature] of Object.entries(access.protectedPrefixes)) if(path.startsWith(prefix))return feature;
  return null;
}
module.exports = {createVipPolicy, routeFeature, features};
