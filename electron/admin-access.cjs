// Every privileged write rechecks the server; stale/offline role claims cannot authorize it.
function createAdminAccess(account, product) {
  return async function requireAdministrator(feature) {
    if (feature !== 'jiuyin.fps') throw Error('不支持的管理员操作。');
    product.requireAccess();
    const fresh = await account.sync();
    if (!fresh.user || fresh.status !== 'active' || fresh.administrator !== true)
      throw Error('仅软件管理员可提高九阴帧率或视野上限；VIP 不包含此修改权限。');
  };
}
module.exports = {createAdminAccess};
