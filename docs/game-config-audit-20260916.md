# 游戏配置只读检查（2026-09-16）

安装目录：`D:/game/游戏蜗牛/9yinjh`。未改动游戏配置、包、DLL，未启动或注入游戏。
所有结论是静态证据，不代表已验证写入后效果。

## 覆盖与边界

- 清点373份散装配置类文件，排除日志、指定备份、patch和reverse_analysis目录。角色文件仅按类型统计，不逐项读取账号私有内容。
- 检查bin64/system_set.ini和systeminfo.ini；派生报告仅保留显示、声音、摄像机、操作等相关键，不收录登录字段。
- 扫描ini.package的18566个可解压块、map_ini.package的6887块、skin.package的2256块，前后哈希一致。未解析加密有效索引，恢复块可能含旧版/孤立内容。
- 基于已验证哈希的lua64恢复索引，复查17份系统设置相关脚本；另外检查摄像机和已恢复game_config等引用。没有逐个审阅所有脚本。
- 扫描text.package寻找对应中文提示。大型模型、图像和CFC内容未逐项解读，因此不能称“所有配置全部验证可用”。

## 优先候选

1. **招式特效分组简化**：systeminfo.ini中的self_effect、other_effect、enemy_effect。
   form_system_interface_fight.lua 170–312行范围出现相应alpha复选框读取和保存。
   text.package偏移8730100的中文提示明确为自身、友方、敌方出招特效简化。
   不是动画速度。优先测试友方选项，保留敌方重要技能提示。
2. **战斗飘字精简**：fight_self_*、fight_target_*、fight_flutter_mode，同脚本读取/保存。
   可以区分自己/目标的伤害、恢复与效果信息。不能直接承诺提升帧率。
3. **镜头距离/角度**：max_camera_dis、camera_angle、lock_camera。
   form_system_interface_shot.lua 149–204包含MaxDistance/LockCamera；funcconfig.lua 643–676也写MaxDistance。
   已有软件镜头距离输入，应校准范围与说明，不重复新增。同名旧页面滑条Maximum=30，另有5/35边界常量，不能直接认定统一上限，更不能盲设1000。
4. **镜头旋转灵敏度**：mouse_response_rate当前15，skin.package偏移3323965的滑条Maximum=50。
   form_system_interface_mouse.lua 191–259调用MouseResponseRate；中文提示明确为“调整摄像机镜头旋转速度”。不是USB回报率。
5. **界面缩放**：ui_scale_enable/ui_scale_value出现在两份INI，设置脚本含set_ui_scale。
   skin.package偏移1771793与3231222的滑条均为7–14、默认10；需要核对换算和界面溢出，不能将原值直接当百分比。
6. **状态条与头顶信息**：show_buff_time_bar/fix_buff_time_bar、showself_*/showfriends_*/showenemy_*、head_zoom_value。
   具备设置、刷新调用；适合布局预设。已有名称/血条功能应整合，不重复包装。

## 已有画质设置与高级候选

- 草地半径/密度、水面、阴影、天气、Bloom/景深/SSAO等已存在。ini.package发现low/high/ultra/create_role/simple/middle/supersimple七组预设块；应比较原版预设与当前软件，而非宣称发现新开关。
- map_ini.package偏移1080155的[Screen]块含camera_far_clip、far_clip、clip_radius_near/far、terrain_lod_radius、terrain_range、texture_lod、load_radius_add等。尚未证明有效加载路径，改变可能增加负载、弹出或遮挡异常，先不加入软件。
- movie_animation_effect/open_movie_scene_start/right_motionblur_info对应独立UI设置，但“具体哪些演出/模糊受影响”待实测，不宣传全局关闭镜头震动。
- start_keep_delay/keep_delay_sec/speedattack/fightparry在操作界面有配置与运行时调用，部分设置同步服务端；字段名不足以证明能改变攻速、延迟或服务器判定。
- 技能速度线索trigger_action_speed/PlaySpeed/SetBlendActionSpeed保留单独研究，本轮未测试、更未修改；没有证据可统一使其他玩家实际施放变慢。

复现脚本：scripts/audit-game-configs.cjs、scripts/inspect-config-controls.cjs。
派生清单：state/config-audit-20260916/evidence.json。
