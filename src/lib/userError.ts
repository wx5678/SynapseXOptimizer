export function userError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  // Electron wraps rejections at each IPC boundary. Keep the useful reason.
  for (let i = 0; i < 4; i++) {
    const next = message.replace(/^Error:\s*/i, '').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, '');
    if (next === message) break;
    message = next;
  }
  if (/^(?:TypeError:\s*)?(?:fetch failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/i.test(message))
    return '本地服务连接中断，请稍后刷新；若持续异常，请重新启动软件。';
  if (/^(?:TimeoutError:|AbortError:)/.test(message)) return '本地服务请求已超时或取消，请检查当前状态后重试。';
  return message || '操作未完成，请重试。';
}
