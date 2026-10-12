# CPU 自适配电源计划 v2 / 0.39.29

## 交付内容

软件按 Windows CPU Sets 拓扑、处理器厂商、缓存域数量和移动设备标记匹配。不是把某台机器的 `.pow` 分发给所有 CPU；6 类平台、9 个参数模板，在目标机器上复制本地基准并仅修改公开且可校验的参数。

- AMD 单缓存域桌面 Ryzen：均衡 / 响应对比。
- Intel 单能效等级、单缓存域桌面 Core：均衡 / 响应对比。
- Intel 多能效等级桌面：均衡 / 性能偏好。
- AMD 单能效等级、多缓存域：均衡，保留调度和停放。
- 移动设备：兼容均衡，复制当前方案保留 OEM 定制。
- 未知、不完整拓扑或其他平台：兼容均衡，复制当前方案；不猜测大小核。

缓存域不是 CCD 的绝对同义词。一个 Windows 能效等级也不保证每个核心性能完全相同。此处采用保守分流，不仅凭型号、代数、超线程比例判断。

## 参数边界

默认档：最小处理器状态 5%、最大 100%、Idle 允许。同类核心 AMD/Intel 桌面另启用自主性能管理；调度、停放、Boost、EPP、性能检查间隔和升降频阈值均继承基准。

同类核心“响应对比”档：在默认档基础上增加 EPP=10，停放最小/最大=100%，SCHEDPOLICY=0、SHORTSCHEDPOLICY=0（所有处理器）。不禁用 Idle，不设最小100%，不固定检查间隔，不保证提高帧率。这一档可能增加待机功耗和温度。

Intel 大小核“性能偏好”档：只额外设置 EPP=20；保留异构调度、停放以及能效类别专属参数，不固定只用 P 核。

只改基准的 AC CPU 参数，其他 AC 与全部 DC 项继承基准；桌面基准为本机 Windows 平衡，可能不同于当前使用的第三方方案。移动/未知基准为当前方案。软件预览和确认弹窗会显示基准与具体改动。任一响应档关键能力不完整就不提供该档，不默默生成残缺档。

写入后回读所有设置：表内目标 AC 必须一致、未列 AC 和全部 DC 必须与基准一致，否则取消并回滚。通过用户确认后才激活；保存旧 GUID，可恢复原计划并删除创建的副本。对已有电源方案和之前的恢复记录不做迁移或删除。

## 原文件复核

来源：`D:\安装包\电源配置`。直属 16 份 `.pow`；压缩包只解压 `.pow`，未执行附带 EXE。对解析所需文件使用随机 GUID 临时导入、读取、删除，从未激活。

去重后 76 份候选文件，75 份能被本机 Windows 解析，1 份 KernelOS“启用空闲”文件格式无效。有效计划中 5 份禁用 Idle，12 份关闭自主性能管理。

单独的“抖音孤单障碍专属电源计划.rar”加密，本次无法成功重读；解压残片已改名为 `.partial`，不计入上述 76 份。另一个“电源计划.rar”内两份 `.pow` 已读取。“Windows高级电源辅助管理工具.zip”没有 `.pow`，未运行其程序。之前 2026-09-01 的分析及解压资料仍保留，本次证据独立存放。

重要发现：

- `catNoIdle.pow`、`catNoIdleAMD.pow`：Idle 禁用=1、自主管理=0、最小状态100%，不适合做通用默认。
- `cat.pow`、`catAMD.pow`、`Dun修改版英特尔.pow`、`NovaOS.pow`：虽允许 Idle，但关闭自主管理，最小100%，本机读取的性能检查间隔5000ms；不能只凭“低延迟”标题判断效果。
- `f1rst_v2.pow`：Idle允许、自主管理启用、EPP10、停放最少100%、检查15ms；长短调度5/2。可以参考部分设计，不能当作全大核0/0方案，也不照搬其固定阈值。
- `FSOS AMD Gaming.pow`：EPP0、检查20ms、停放最少100%、长短调度2/0；Boost=3应标为“高效启用”，旧软件误标“高效积极”已纠正。
- `FSOS Intel Gaming Power Plan.pow`：EPP10、检查15ms、长短调度5/2；不是只用P核的限制方案。
- `Performance for AMD.pow`、`VantageOS Power Plan.pow`、`Yakumo.pow`：长短调度都是0/0，但最小状态、EPP、检查间隔不同，不能把整套计划的性能差异归因于这两项调度。
- `QM.pow`：名称含9800X3D，但自主管理关闭、最小100%；名称不是适配或提帧证明。
- 标为“Intel纯大核专用”的同一哈希文件同时放在 AMD 和 Intel 子目录中；目录标签不能代替参数分析。
- 多个原包还改变 PCIe/USB 节能。新 CPU 模板不复制这些整包设备参数。

完整 AC/DC 参数和 SHA256 在 `state/power-audit-20260916/report.json`。这是本机 powercfg 的解析结果，可能包含系统补充的缺省值，既不是原始注册表字节对比，也不是跨机器性能基准。旧审计脚本里的分数已移除；开启 PCIe 节能不再被无依据地扣“性能分”。

## 验证与限制

- 15 个拓扑/能力测试：包括 AMD 单/多缓存域、Intel同类/混合核心、移动、不完整拓扑、缺失能力；检查保守默认与响应档权限边界。
- 7 个模拟事务测试：成功、写入失败、AC/DC意外变化、激活失败、错误平台ID、当前方案基准；没有实际系统写入。
- 本机 9800X3D 的两档实际创建为临时副本、回读全部 AC/DC、导出、删除；当前活动 GUID 与计划列表均保持不变。导出结果见 `state/adaptive-power-plans-v2/export-verification.json`。
- 269 项现有 Node 测试、PowerShell 网络/运行时只读测试通过；生产编译与 portable 双启动资源隔离测试通过。
- 未激活新计划、未进行游戏帧率 A/B；Intel、双 CCD、笔记本没有实机验证，模拟拓扑通过不代表实机性能通过。尚不应宣称提升帧率或降低输入延迟。

建议后续同场景轮流测当前计划、均衡档、响应档，各至少3轮，同时记录平均帧率、1% Low、帧时间、温度和功耗。一次只比较一个因素，避免混淆。

## 官方参数依据

- [微软 SchedulingPolicy](https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/configuration-for-hetero-power-scheduling-schedulingpolicy)
- [微软 ShortSchedulingPolicy](https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/configuration-for-hetero-power-scheduling-shortschedulingpolicy)
- [微软处理器性能控制与 Boost 模式定义](https://learn.microsoft.com/en-us/windows-server/administration/performance-tuning/hardware/power/power-performance-tuning)：仅引用参数含义，不将服务器调优建议当作游戏收益证据。
