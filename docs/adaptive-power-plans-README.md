# SynapseX 按 CPU 适配的电源计划 v2

优先使用 SynapseX 0.39.29 的“系统调整 → CPU 专属电源方案”。软件会检测本机 CPU，只显示匹配的档位，默认选保守均衡档。用户确认后才创建并启用，支持恢复原 GUID。

本包不是“所有电脑导入同一个 pow”。共 6 类、9 个参数模板；未在所有硬件上实测，不保证提帧。根目录 templates.json 的 CPU 名称只是分流示例，不是白名单，也不是测试机器列表。

## 文件

- `templates.json`：完整模板与适用平台，供查看，不直接导入 Windows。
- `tools/Export-AdaptivePowerPlans.ps1`：独立检测本机并导出匹配计划；依赖本包 `host/modules`，不要单独复制脚本。
- `本机9800X3D导出`：开发机基于本机平衡方案导出的两份 pow，仅作为本机验证产物。不要给其他硬件盲目导入。
- `审计说明.md`：原电源文件分析与验证范围。

## 独立导出（可选，推荐使用软件界面）

在本目录打开 PowerShell，执行：

```powershell
.\tools\Export-AdaptivePowerPlans.ps1
```

默认只生成模板和本机建议 JSON，不修改 Windows。需要真正导出 `.pow` 时，以管理员身份打开 PowerShell：

```powershell
.\tools\Export-AdaptivePowerPlans.ps1 -ExportLocalPlans -OutputDirectory .\我的CPU导出
```

此操作会临时创建匹配计划、回读核验、导出后删除临时副本，**不会激活、不会切换当前计划**。若目标 pow 已存在会拒绝覆盖，请选择新目录。若系统策略禁止脚本，改用软件界面，不要求关闭安全保护或修改系统全局执行策略。

## 使用边界

所有计划允许 Idle，最大状态100%。默认档保留调度和停放；只有 AMD/Intel 同类核心桌面“响应对比”档设置长短线程为所有处理器、EPP10、停放100%。Intel大小核可选EPP20，不强制P核。AMD多缓存域、移动和未知平台保持保守。

桌面以本机 Windows 平衡为基准；移动/未知以当前方案为基准。未列 AC 和全部 DC 项继承基准，可能不同于原先正在用的计划。没有改 CPU 电压、BIOS、亲和性、游戏文件，也没有运行第三方包里的工具。
