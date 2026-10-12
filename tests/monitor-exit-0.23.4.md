# 0.23.4 验证记录

- 发现旧版关闭主窗口时仍保留悬浮窗，因此 window-all-closed 不触发，且 second-instance 只聚焦已不存在的主窗口。
- 已关闭用户本轮残留的旧版优化器窗口；确认旧 SynapseX 进程退出，未结束 fxgame.exe。
- 清理两个已确认无采集进程持有的 SynapseX UUID ETW 会话，未停止其他软件或系统会话。
- 原完整链路短测无帧；2.4.1 完整链路短测记录 129100 个 ETW 丢失事件。清理残留后使用 2.4.1 精简参数，当前 PID 20164 返回连续原生 D3D9 帧事件。不能据此单独断言是哪一个因素造成旧链路失败。
- 最终代码 6 秒实测：fxgame.exe / PID 20164，299.9 FPS、3.33ms、360 个窗口内样本、error 为空。该数字只证明采集可用，不是优化前后性能比较。
- await collector.shutdown() 后，未检测到 PresentMon 2.4.1 子进程或 SynapseX ETW 会话。
- 10 项 Node 行为测试通过，包含主窗口 closed 导致 app.quit、before-quit 关闭悬浮窗并等待清理、退出重入不提前放行、PID 隔离和采集错误状态。
- Windows PowerShell 5.1 DWORD 回归通过；0.23.4 打包 host 网络 API、强制扫描 API、运行时只读审计通过。
- 预览验证浅色下拉框浅底深字；重新扫描显示完成时间和候选数。
- 实际桌面新版已打开，界面显示 v0.23.4。原生窗口自动点击在后续测试时报告 foreground window did not report a process id；因此完整“UI 打开悬浮窗、关闭主窗口、再开”的实机点击链未验证，退出回归由实际事件回调测试和真实采集器清理测试覆盖。
- 本轮未更改游戏配置、系统优化参数、电源计划、驱动或 BIOS。新版保持用户手动启停采集。

交付 EXE SHA256：7C02E52850C73F49AB46A7806525D4946D9303095021799D7056AEDE33895826
