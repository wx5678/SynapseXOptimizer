# 0.28.0 BoosterX 对照与验证

日期：2026-09-09。读取参考程序：`D:\安装包\BoosterX.exe`，窗口标题 BoosterX。本轮仅导航和浏览，无参考程序设置写入。

## 新实现

1. 高级参数新增 35 项，现共 59 项。18 项 Windows 应用权限分别支持未配置、用户决定、强制允许、强制拒绝；另外 17 项覆盖广告、云语音、位置提供商、全局位置、传感器、应用影响遥测、步骤记录器、WER、隐私设置体验、CEIP、反馈通知、搜索定位、设置同步、云搜索、程序清单、文本学习和手写学习。
2. 每一项均为编译内置的固定键值映射，不执行输入的注册表路径。按照系统版本/版本类别/读取结果显示适用性。保留原值及不存在状态，写后回读，失败尝试回滚；外部修改后不盲目恢复。应用权限保留逐应用例外，策略写成功不等于所有桌面程序都受到限制。
3. 新增缩略图缓存、旧安装日志、Windows 错误报告。缩略图只匹配 Explorer 目录直接子文件 `thumbcache_*.db`；安装日志只匹配 Windows 根目录的已知安装日志名称，不递归 Windows；WER 限定 ReportArchive/ReportQueue 中的报告文件。沿用 7/30 天、逐文件选择、变化与占用检查。删除不可恢复。
4. 未连接设备目录列出系统返回的历史实例；只允许未连接且问题代码 45、符合外设类别的单项移除。精确实例 ID 调用 `pnputil /remove-device`，不传 `/subtree`、`/force`、`/reboot` 或 `/delete-driver`。执行前再次核对指纹，结果回读仍存在则不能显示成功。热插拔与系统操作不能原子化，执行期间不要插拔目标设备。
5. 权限目录搜索、分类、12 项分页；未连接设备搜索、15 项分页、记录展开。新增操作不加入一键推荐，不自动运行。

## 参考程序的已读证据及对应关系

- 隐私页：读取到 50 个项目名。服务遥测与 CEIP/兼容性任务由既有服务/任务目录处理；活动记录、诊断数据已有参数；应用权限、反馈、输入学习等由本轮新增策略处理。
- “网络摄像头遥测”不等于摄像头权限；本轮摄像头权限没有冒充遥测开关。Cortana、Wi-Fi 感知等旧功能在新系统中存在版本差异，未使用一个通用注册表值声称全部控制。
- 清理页读到：临时文件、缩略图缓存、已删除 UWP 应用、设置日志文件、Defender 文件、下载程序文件、Active Setup 临时文件、内容索引器文件、DirectX 着色器缓存、传递优化文件、诊断数据查看器数据库、旧 ChkDsk 文件、系统错误文件、额外高级清理；另有注册表清理、UWP 残留、未连接设备分类。
- 本轮实现的是其中明确范围的缩略图、安装日志、错误报告及历史设备实例。已有临时文件、浏览器缓存、崩溃转储、旧系统日志继续保留。
- 大量 LIGHTSPEED Receiver 是不同历史设备实例，不是不同的优化算法。BoosterX 清理页“189”不作为本软件功能数量目标。
- “所有修复”导航可打开，但当前 ListView 为空；重新进入和等待后未取得具体修复项。本软件已有 10 个修复任务，不据此宣称与其完整等价。

## 仍未实现或无法核实

- PRO 注册表深度清理、已删 UWP 残留和高级清理的内部规则未取得；不能盲删注册表、WindowsApps 或驱动目录。
- 其蓝牙/文档/图片/视频/广泛文件访问、uPnP 同步、摄像头遥测、许可遥测等具体实现尚未逐项核实，不能用相似名称的开关顶替。
- Spectre/Meltdown 缓解没有加入统一覆盖值；需要独立核对 CPU、微码、虚拟化及系统组合。
- HAGS、FSO、Win32PrioritySeparation 等仍是明确标识的 Windows 原生入口，不是软件内直接配置。
- Defender 文件、着色器缓存、传递优化、索引数据库、Windows 更新残留等不采用直接递归删除；现有 Windows 清理入口不能算本软件逐项清理已经完成。
- 用户已经撤销的按键库和进程优先级写入不恢复。

## 验证

- Windows PowerShell 5.1：35 个新增策略与本机 Windows ADMX 的名称、键、类型/选项值逐项核对通过。输入学习使用 ADMX enabledList/disabledList；程序清单开关没有猜测添加 ADMX 未定义的 0 值。
- 59 项高级参数模拟应用/恢复、空值、外部冲突、机器身份、部分失败和系统版本拦截通过。本机只读目录 57 项可读，2 项保留具体不可用原因。
- 未连接设备：本机只读枚举 185 个历史实例。模拟覆盖重新连接、硬件身份变化、系统拒绝、退出码成功但记录仍在、真正消失、重复请求、提前保存记录。真实设备移除次数为 0。
- 7 类清理测试通过。新增分类的目录及名称边界使用一次性测试样本核对；旧维护测试仅删除自己创建的一份测试样本，无个人文件删除。
- Node 源码/逻辑测试 23 项通过。Windows PowerShell 5.1 的 15 组模块测试通过：PrivacyMappings、ExtraCleanup、DisconnectedDevices、MaintenanceManager、CleanupCategories、ExpertSettings、ExpertAdapters、RepairJobs、RepairWorker、DeviceService、DeviceAdapters、AdvancedSystem、BackgroundManager、StartupScopes、SystemTools。
- 浏览器开发预览：搜索只留下匹配项；高级参数翻页显示 20 项第 2/2 页（示例数据）；权限选择后弹窗显示修改前后值；设备弹窗显示精确实例及无撤销说明；均取消，未提交设置。浅色下拉框与弹窗可读。预览数据不进入发行包。
- PowerShell 7 复测 PrivacyMappings、ExpertSettings、ExtraCleanup、DisconnectedDevices 四组通过。
- 发行目录 Windows PowerShell 5.1 服务启动通过；59 项高级参数、10 个修复任务、7 个系统入口、服务/设备目录、三类新增清理和未连接设备接口通过。缺少确认的写请求被拦截，未知设置被拒绝。网络、强制监控扫描、运行状态以及已撤销功能 404 检查通过。HTTP 测试脚本要求 PowerShell 7，被测试的服务明确使用 Windows PowerShell 5.1。
- 深色主题权限下拉框及搜索结果检查通过；完成后恢复原浅色主题。没有 JavaScript 运行错误；开发服务器有一个 favicon.ico 404，不影响发行桌面功能。
- 发行目标仍为 Windows 10/11 x64；不是全部电脑配置经过实机验证。

## 发行包

`release/0.28.0/SynapseX-Game-Optimizer-0.28.0.exe`，104311143 字节，未签名。

SHA256：`11991185C9DD028A1512C7997586E0FE87428D6EB2D77537EF09B9E1F4E572F1`

生产脚本中不含本轮 privacy-preview / disconnected-preview 示例数据；删除的按键库没有打包。构建有单 JS 块大于 500 kB 的体积提示，不是构建错误。

## 依据

固定映射主要核对本机 `C:\Windows\PolicyDefinitions` 中的 AppPrivacy、Globalization、ICM、AppCompat、Sensors、LocationProviderAdm、FeedbackNotifications、Search、SettingSync、UserProfiles、ErrorReporting 和 OOBE ADMX。

- [Microsoft 应用隐私策略说明](https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-privacy)
- [Microsoft PnPUtil 命令语法](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/pnputil-command-syntax)
