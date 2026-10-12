// No automatic retries: a disconnected write may already have taken effect.
async function requestHostJson(endpoint, value, vipToken, fetchImpl = fetch, timeoutMs) {
  const readOnly = value.method === 'GET' || /^\/api\/(?:monitor\/sample|reports\/list)$/.test(value.path);
  const signal = AbortSignal.timeout(timeoutMs ?? (readOnly ? 30000 : 120000));
  let response, payload;
  try {
    response = await fetchImpl(`http://127.0.0.1:${endpoint.port}${value.path}`, {
      method: value.method,
      headers: {'Content-Type': 'application/json', 'X-SynapseX-Token': endpoint.token, 'X-SynapseX-Vip': vipToken},
      body: value.method === 'POST' ? value.body : undefined,
      redirect: 'error', signal,
    });
    payload = await response.json();
  } catch (error) {
    const reason = signal.aborted ? '本地服务响应超时' : '本地服务连接中断';
    const advice = readOnly ? '请稍后刷新；若持续异常，请重新启动软件。' : '本次操作结果尚未确认，请恢复连接后先检查当前状态，不要重复提交。';
    throw new Error(`${reason}，${advice}`, {cause: error});
  }
  if (!response.ok) throw new Error(payload?.error || `本地服务请求失败（HTTP ${response.status}）`);
  return payload;
}
module.exports = {requestHostJson};
