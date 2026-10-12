# 0.39.14 — 本地服务中断与报告恢复

## 根因及修复

- 已在 0.39.13 正式包复现：封面下载被取消后，HttpListener 写响应失败；异常分支再次设置已提交响应的 ContentLength64，第二次异常导致整个本地服务退出。
- 响应写入失败仅中止当前连接；错误响应本身失败也不能逃出请求循环。损坏 JSON 仍返回 400，不影响后续请求。
- 新增提权后的服务监督进程。子服务异常退出时在相同端口、相同凭据下最多恢复三次，退避 1/2/4 秒；不重复弹提权窗口、不重放优化操作。正常关闭返回 0，不会重启。应用进程退出时清理自己的服务子进程。
- 外层提权启动器等待监督进程结束并转发退出码；Electron 消费输出流并限制错误缓存大小。
- 原生 API 请求增加完整响应超时：读取类 30 秒，其余 120 秒。连接中断显示中文说明；写操作提示结果尚未确认、先核查状态，绝不自动重发。
- 报告页读取失败后每 5 秒串行重试；已有报告不因失败被清空。报告记录器继续使用持久化待存队列和固定报告 ID。
- 封面失败时显示备用图标；连接状态恢复后重载图片，不再暴露图片替代文字。

## 验证（2026-09-16）

- TypeScript + Vite 生产构建、Windows portable 打包成功。
- 203 项 Node 自动测试通过（权限、账号、退出、记录器、请求超时等）。
- `tests/host-http.integration.cjs` 对源码服务和新版包内服务各执行一次，均通过：完整图片、13 次中断图片、不完整 POST、损坏 JSON、403 会话/VIP 拦截、实际报告写入/读取、强制终止测试子服务后的自动恢复、报告持久性、正常关闭。
- `tests/host-supervisor.integration.cjs`：恢复后正常退出、连续失败的三次上限、应用退出时子服务清理，共 3 项通过。
- `Test-PerformanceReports.ps1`：隔离目录报告存取/覆盖/身份冲突检查通过。
- `Test-MonitorSensors.ps1` 通过；这是模拟传感器测试，不代表 CPU 温度已经实机验证。
- 隔离浏览器页面已验证：封面故障兜底；服务断开/恢复后的首页封面与数据；报告读取恢复后不点击刷新即可显示保存记录、清除错误。

## 范围与限制

- 所有故障注入、报告写入和进程终止均针对本次创建的隔离测试服务；没有终止用户原有软件或游戏，没有应用系统优化，没有安装驱动。
- 没有发布云端更新或改动云端账号/授权。
- 浏览器 UI 验证使用模拟游戏采样；尚未完成真实游戏长时间压力验证，不能宣称全部功能已通过上线验收。
- 应退出旧版本，再运行 `release/0.39.14-host-recovery/SynapseX-Game-Optimizer-0.39.14.exe`。旧进程不会热更新；尚未采集到的历史游戏数据无法补生成。

## 复测

```powershell
node --test tests/host-request.test.cjs
node --test tests/host-supervisor.integration.cjs
$env:SYNAPSEX_TEST_RESOURCES='D:/project/SynapseXOptimizer/release/0.39.14-host-recovery/win-unpacked/resources'
node --test tests/host-http.integration.cjs
```

Windows HTTP 集成测试启动自己的隐藏 PowerShell 服务，读取硬件/进程状态，但不应用系统配置。仅终止它自身的测试子服务以验证恢复；测试目录在结束时清理。
