# 银白外观可读性修复 · 0.31.2

本轮按 Product Design 的截图检查流程，结合实际计算样式与源码，修复浅色文字、图标和背景搭配。保留原布局、功能和两种外观，不修改系统设置、登录凭据或游戏文件。

## 1. 使用帮助：已修复

问题：状态卡的标签和值使用半透明白色；常用入口的文字和图标也是浅白色。银白主题只替换了面板背景，没有覆盖这些独立 CSS 规则，导致几乎不可见。标题文字则已能跟随主题。

修复：状态标签、数值、入口及图标统一使用主题文字/强调色；改为浅色卡片底；小字号提高至 11/12px；鼠标悬停仍保持深色文字。

![修复前](D:/project/SynapseXOptimizer/design-evidence/silver-0312/01-help-before.png)
![修复后](D:/project/SynapseXOptimizer/design-evidence/silver-0312/02-help-after.png)

## 2. 导航、系统和网络页面：已修复已发现问题

侧栏盾牌图标对浅色底的计算对比约 1.42:1；网络状态值使用未映射的 slate-100/200，约 1.1:1。已统一改为深色文字与绿色状态图标；补齐 slate、紫色、玫红、青色等遗漏的主题映射。输入框边界、占位文字、禁用按钮和提示颜色也统一处理。

![网络页面](D:/project/SynapseXOptimizer/design-evidence/silver-0312/03-network-after.png)

## 3. 性能报告详情和图表：隔离示例验证通过

当前预览没有真实报告，所以使用测试专用入口渲染真实报告组件与明确标记的合成数据。去除指标卡、评分圆心和曲线区域的固定深色背景，曲线与图例使用同一组主题色；深色外观仍使用浅色文字。报告保存提示也改为主题背景。

![报告详情示例](D:/project/SynapseXOptimizer/design-evidence/silver-0312/04-report-fixture.png)
![图表示例](D:/project/SynapseXOptimizer/design-evidence/silver-0312/07-chart-fixture.png)

## 4. 普通及危险确认框：隔离示例验证通过

关闭图标、说明文字和取消按钮使用主题颜色；危险按钮使用深红色底与白字。只打开并取消测试弹窗，没有确认任何系统操作。

![普通确认](D:/project/SynapseXOptimizer/design-evidence/silver-0312/05-confirm-fixture.png)
![危险确认](D:/project/SynapseXOptimizer/design-evidence/silver-0312/06-danger-fixture.png)

## 5. 复查范围和边界

- 14 个主导航/更多工具页面的当前渲染状态；系统 8 个分类、网络 7 个分类；银白帮助、报告详情、图表和两种确认框。
- 扫描基于 DOM 文字颜色、背景叠加与尺寸：普通文字参考 4.5:1，大字及功能图标参考 3:1；不是完整无障碍合规认证，不覆盖所有硬件返回值、图像/渐变逐像素背景、每个悬停状态或屏幕阅读器行为。
- 报告详情用独立测试夹具，没有伪造真实会话，也未启动 FPS 采集。夹具不进入正式包。
- 游戏内独立悬浮层不在本次主题覆盖范围，仍保留原有白字和阴影。
- Node 回归测试 50 项通过，TypeScript/Vite 构建通过；Vite 仍有原有的大包体积提醒，不影响构建。
- 截图保存在 design-evidence/silver-0312；contrast-before.json 与 contrast-after.json 保存检查样本。所有交付截图均已回看。
