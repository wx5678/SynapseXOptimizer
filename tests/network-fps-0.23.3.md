# 0.23.3 网络页 / FPS 回归

## 修复范围

- DWORD 有符号读回兼容；网络节流状态 -1/4294967295 均显示已设置，不更改注册表。
- PresentMon 1.10.0 改用 stdout 增量接收，PID 过滤、主交换链分组，帧队列上限 4096。
- 每次采集使用 UUID 会话；旧进程 close/error 和异步会话清理不影响新采集。
- 启动失败、权限不足、退出码、10 秒无帧有明确状态；自动调用不反复重启失败会话，手动按钮可重试。
- 主页面、悬浮窗和报告的目标匹配均传递 PID。

## 验证

- Node 回归：5 项采集行为测试，另 3 项外观/文案回归通过。
- Windows PowerShell 5.1：8 个 DWORD 输入及完整 TCP 状态模拟测试通过；未写注册表。
- 本机实际 TCP 状态查询通过；当前 NetworkThrottlingIndex=10，故使用模拟 -1 复现截图条件。
- 本机 8 秒 PresentMon stdout 实时采集：目标 dwm.exe，60 FPS / 16.67 ms，72 个近窗样本，error 为空；随后停止且未遗留 PresentMon 子进程。
- 0.23.3 打包资源的 PowerShell 服务启动通过：网络工具箱 API 返回完整 TCP 项、运行时只读审计通过，6 个已退役接口保持 404；测试服务已关闭。
- 这不是九阴游戏内验证。本轮本机无 fxgame.exe；截图所示另一台机器的权限、驱动/图形 API 状态仍需实际运行新版核验。
- FPS 为应用 Present 间隔指标，不等于屏幕实际显示帧率；短窗 1% Low 不是完整游戏会话的 Low。

## 来源

- 本地随包 PresentMon.exe -help 核验 process_id/output_stdout/session_name/terminate_on_proc_exit 参数。
- https://github.com/GameTechDev/PresentMon/issues/232：1.x stdout flush 行为。

此次未改变系统优化参数、游戏配置、驱动或电源方案。
