# CPU 电源方案设计记录（0.8.0）

## 参考软件只读检查

- 正在运行的参考程序位于 `C:\Windows\Tools\XLST-ACE\XLST.exe`，主逻辑位于同目录的 `XLST.dll`。
- 安装目录没有发现独立 `.pow`、JSON 或 XML 电源计划文件。程序集经过混淆，预设更可能内嵌或运行时生成，因此 SynapseX 不复制或分发其资源。
- 本机已安装的参考计划可由 `powercfg /list` 和 `powercfg /qh <GUID>` 只读检查。
- 对比 Windows 平衡方案后，XOS 与 Sapphire 计划分别存在约 69 项和 64 项差异，范围包含处理器、睡眠、磁盘、NVMe、PCIe、USB、无线网络及多媒体。整套复制会引入与游戏无关的系统副作用。
- 另在 GamePP 的 `PowerData` 目录发现 `.pow` 文件，但它们属于第三方产品资源，仅作为文件组织方式参考，不会打包进 SynapseX。

## 产品决策

SynapseX 从 Windows 平衡方案复制一个新 GUID，只修改插电（AC）状态下少量处理器参数，不覆盖原平衡方案。创建前保存原活动 GUID；恢复时先切回原 GUID，再删除且只删除名称以 `SynapseX ` 开头、GUID 与备份完全一致的计划。

通用修改：最小处理器状态 5%、最大状态 100%、EPP 10、积极提升模式、核心停放最少/最多核心 100%。这些设置用于减少性能状态响应和核心停放造成的外部波动，代价是空闲功耗和温度可能增加。

CPU 分类：

- AMD Ryzen：按同构核心处理，不写异构调度项。
- Intel 无混合拓扑或 12 代以前：不写异构调度项。
- Intel P 核 / E 核混合拓扑：普通与短任务使用数值 2“优先高性能处理器”；保留 HETEROPOLICY 给 Windows 管理，不使用“仅高性能处理器”。
- 无法识别的 CPU：仅应用通用参数，不写异构调度项。

## 官方参数依据

- Microsoft SchedulingPolicy：<https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/configuration-for-hetero-power-scheduling-schedulingpolicy>
- Microsoft ShortSchedulingPolicy：<https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/configuration-for-hetero-power-scheduling-shortschedulingpolicy>
- Microsoft 异构电源调度概览：<https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/static-configuration-options-for-heterogeneous-power-scheduling>
- Microsoft 处理器电源管理：<https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/configure-processor-power-management-options>
- Microsoft 核心停放最大核心数：<https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/options-for-core-parking-cpmaxcores>

## 明确不做

- 不修改现有 Windows 平衡方案。
- 不复制第三方完整电源计划或受保护资源。
- 不根据网络图片写入未有微软公开语义依据的 HETEROPOLICY 数值。
- 不把最低处理器状态固定为 100%，避免无负载时长期高功耗。
- 不修改 BIOS、驱动、游戏文件、同屏人数或视野。
