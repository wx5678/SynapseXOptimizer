# 0.39.27：相同资源数据的索引变体兼容

## 已确认原因

本次用户提交的 `skin.package` SHA-256：
`3e1243ff821cd7255875d4d003deceb163c3afc12d2c62c369e3a94c621387b6`。
它与既有基线同为 4,747,607 字节。从偏移 197645 至文件末尾完全一致；
差异全部位于包头保留字段及加密索引区，旧的整包白名单因此拒绝。
不能据此判断索引变化来自哪种工具或机制，也不能宣称文件由官方发布。

## 识别与保护

- 保留原有精确版本白名单，不按电脑增加新的整包哈希条目。
- 额外校验固定包头布局、大小、数据起点、整个数据区 SHA-256、原版设置 XML SHA-256、两个滑条原始值。
- 仅允许已观察到的包头 8–9 字节和索引区域差异。索引是未解码的，不重建、不覆盖，也不保证原包自身没有索引错误。
- 按实际输入计算独立原版哈希；只修改固定设置资源块，压缩前后长度不变，其余字节逐一保持。
- 备份必须与当前文件对应。重启后重新验证备份内容，不信任 JSON 元数据来豁免校验。
- 已修改文件仍需匹配原版备份及完整的块外字节比较；换一份索引不同的备份不可恢复。
- DLL 校验、管理员权限、游戏退出、超过 762 FPS 风险确认、原子替换和到期恢复规则不变。
- 不适配任意新游戏版本。资源正文、DLL、布局真正变化时仍拒绝写入。

## 验证

- 267 项 Node 回归通过，含新增 5 项资源家族测试。
- 用户新文件及原基线文件：在隔离临时游戏目录副本上测试 360/250、600/250、1000/250、300/1000、1000/1000 五组帧率/视距组合。
- 验证仅目标块变化、保存本机完整原版、服务重启识别、手动恢复、到期恢复，以及正文篡改拒绝；两份输入文件和 DLL 均未修改。
- 未启动真实游戏验证游戏内效果，没有修改实际游戏目录。
- `pnpm run package:win` 构建版本 0.39.27；既有 Vite 大块提示不影响构建。
- 实际便携包双启动测试通过：每次启动资源目录独立，第二次退出不删除第一次启动的 HTML、JS/CSS 和本地服务资源。
- 安装包 SHA-256：`b06c118f0119397e7fcd9a443957b50836771cb23295a413baf79c81a66e03af`。

测试命令：

```powershell
$env:SYNAPSEX_TEST_PYTHON='D:/project/.tools/synapsex-license-venv/Scripts/python.exe'
node --test --test-reporter=dot tests/*.test.cjs
node scripts/verify-jiuyin-resource-compat.cjs C:/Users/Administrator/Desktop/skin.package C:/Users/Administrator/Desktop/fxgamelogic.dll
node --test tests/portable-resources.integration.cjs
```
