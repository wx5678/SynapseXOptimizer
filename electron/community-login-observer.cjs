// One-way account-name observer for the isolated official login view.
// No bridge is exposed to the page. Never read password/OTP/captcha/form bodies.
const { ipcRenderer } = require('electron');
if (location.origin === 'https://sso.woniu.com' && /^\/login(?:_embedded)?(?:;|\/|$)/.test(location.pathname)) {
  const send = () => {
    const field = document.getElementById('username');
    if (!(field instanceof HTMLInputElement) || field.type !== 'text' || field.name !== 'username') return;
    ipcRenderer.send('community:login-name', field.value.trim().slice(0, 64));
  };
  window.addEventListener('DOMContentLoaded', send, {once:true});
  document.addEventListener('input', e => { if (e.target?.id === 'username') send(); }, true);
  document.addEventListener('change', e => { if (e.target?.id === 'username') send(); }, true);
  document.addEventListener('submit', send, true);
}
