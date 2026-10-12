# 0.39.12 监控开关与温度读取

## 行为

- 原五个操作按钮合并为四个开关：当前会话 FPS 采集、游戏悬浮窗、鼠标穿透、进入游戏自动采集。
- 悬浮窗、鼠标穿透、自动采集、识别方式与手动进程名保存到用户数据目录 `monitor-controls-v1.json`，不依赖临时 HTTP 端口或页面是否挂载。
- 主进程每3秒检测目标（单次请求最长12秒），3次成功检测未找到目标后收起悬浮窗。短暂检测失败或切换前台不会直接关闭。
- 自动报告不再负责启动 FPS，避免与监控开关争抢采集器。手动停止暂停本次游戏的自动采集，新游戏恢复自动偏好。
- 游戏退出只收起窗口，保留开关；关闭开关或悬浮窗 × 会保存为关闭。退出软件停止监控循环并销毁窗口。
- 开机仅托盘签到模式保持原有行为，不自动提升权限或启动监控；先打开工作台才会检测游戏。

## CPU 温度根因与实现

原实现仅查询其他已运行软件的 WMI Sensor，未内置 CPU 硬件采集。这台电脑未提供 LibreHardwareMonitor/OpenHardwareMonitor WMI 数据源。

现优先读取既有 WMI 服务，否则调用官方 LibreHardwareMonitor 0.9.6 库，只启用 CPU 硬件组。组件原始 DLL、MPL 许可和上游第三方通知随包分发。缺少 PawnIO、驱动未运行、权限不足、硬件未返回温度与读取错误分别显示原因。不使用主板 ACPI 温度冒充 CPU，不填0°C。

用户明确要求本轮不安装驱动，因此本机没有安装/启动 PawnIO，也没有更改任何系统防护。实际 Windows PowerShell 5.1 读取结果：`driver-missing`、温度null、说明为“未安装 PawnIO 温度读取驱动；当前不会自动安装”。界面可打开固定的官方发布页，不能自动安装。

上游来源与驱动依赖：
https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6
https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/blob/v0.9.6/LibreHardwareMonitorLib/PawnIo/PawnIo.cs
https://github.com/namazso/PawnIO.Setup/releases

## 验证

- TS/Vite构建成功。
- 主进程模拟用例覆盖保存/重启、等待游戏、关闭不复活、单次检测丢失、游戏退出、快速重启、自动采集默认关闭、手动暂停、迟到的异步打开、退出取消检测。
- PowerShell传感器测试覆盖有效数值、包温度优先、主板温度排除、缺少驱动明确报告；本机与打包目录都实际读到相同的driver-missing结果。
- 隔离浏览器界面测试四个switch可切换、正确标识状态；模拟数据不代表实际游戏数据。
- CPU真实温度数值、安装驱动后的硬件兼容性尚未验证。本轮没有安装任何驱动。
