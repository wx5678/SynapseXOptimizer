# NVIDIA 配置导入 · 0.39.33

入口：系统调整 → 基础与显卡 → NVIDIA / AMD 显卡驱动专项 → NVIDIA 配置导入。

## 本次交付

- 内置 `D:\安装包\显卡配置` 中的 8 份原始 `.nip` 文件，以 SHA-256 校验打包内容；没有打包或执行目录里的驱动安装包、BAT、CMD。
- 可选择内置配置或浏览本机 `.nip`，先查看当前值、目标值、差异及跳过原因，再确认导入。
- 本版支持单个 `Base Profile` 全局配置，支持 DWORD、字符串和二进制设置；不支持多配置或游戏专属配置文件。全局配置会影响其他游戏，不能保证提升帧率。
- 跳过不支持的设置、类型不匹配以及来源电脑的显卡绑定标识；兼容这些文件实际 UTF-8 内容与 UTF-16 声明不一致的情况。
- 写入前保存修改项及原有继承状态，导入后重新读取校验；失败时尝试回退，回退失败则保留恢复记录并报告。
- 恢复只涉及该次修改项，遇到之后被其他工具改动的值会拒绝覆盖。备份位于应用状态目录的 `nvidia-nip-backups`。
- 预览有效期 10 分钟、一次性使用；文件或驱动设置发生变化后必须重新预览。实际写入需要 Windows 管理员权限。
- 沿用现有深浅色主题、确认弹窗和窄窗口布局。没有修改会员策略、超频参数或安装驱动。

## 验证边界

- 最终 Node 自动测试：280 项通过。
- 解析测试覆盖全部 8 份配置、6 类非法 XML、2 类编码输入。
- 模拟驱动测试覆盖 8 类事务场景，模块测试覆盖 11 类权限、令牌、文件变化和恢复边界。
- 隔离 Electron 界面测试通过文件选择、预览、勾选确认、取消、模拟导入/恢复、错误提示及深浅色/窄窗口显示。
- 真实 NVIDIA 驱动仅进行了只读预览和已知设置交叉核对，没有调用真实写入。真实导入和恢复仍需要后续实机验证，不应将模拟测试视为真实驱动写入验证。
- 实际便携版双开资源测试通过，检查了 75 份电源配置和 8 份 NVIDIA 配置的打包完整性。

驱动接口实现参考 [NVIDIA DRS API](https://docs.nvidia.com/nvapi/group__drsapi.html) 与 [NVIDIA Driver Settings Programming Guide](https://developer.download.nvidia.com/NVAPI/NVIDIA_Driver_Settings_PG-12072-001_v01.pdf)，文件格式参考 [NVIDIA Profile Inspector](https://github.com/Orbmu2k/nvidiaProfileInspector)。

## 安装包

`release/0.39.33-nvidia-nip/SynapseX-Game-Optimizer-0.39.33.exe`

SHA-256：`0F5AE11630087FC8C8D7FC15591FA719D911C36C69F7BEB0EE63559CB98CA4FB`

本次仅生成本地便携版，没有发布云端更新，也没有改变本机显卡配置。
