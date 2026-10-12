const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function loginStatusPage(kind, text, loginUrl) {
  const heading = kind === 'success' ? '官方登录已完成' : kind === 'loading' ? '正在打开官方登录' : kind === 'pending' ? '登录状态待确认' : '登录页面未能正常打开';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SynapseX 登录状态</title><style>body{margin:0;background:#f3f5f8;color:#202834;font:15px/1.8 "Microsoft YaHei",sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:520px;padding:40px;background:white;border:1px solid #d5dce5;border-radius:16px;margin:24px}small{color:#566171}h1{font-size:25px}a{display:inline-block;padding:10px 20px;border-radius:8px;background:#365f94;color:white;text-decoration:none;margin-top:14px}</style><main><small>SynapseX · 登录状态</small><h1>${heading}</h1><p>${escape(text)}</p>${kind === 'error' ? `<a href="${escape(loginUrl)}">重新加载官方登录</a>` : ''}<p><small>账号密码及安全口令仅在蜗牛官方登录页面填写。</small></p></main></html>`);
}
module.exports = {loginStatusPage};
