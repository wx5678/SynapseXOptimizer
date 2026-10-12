# Compiled policy mappings, independently checked against Windows ADMX.
# This file only declares settings; importing it never changes Windows.
function Get-PrivacyDefinitions {
    $access=@(@{value='default';label='未配置'},@{value='0';label='用户自行决定'},@{value='1';label='强制允许'},@{value='2';label='强制拒绝'})
    $permissions=@(
        @('account','AccountInfo','账户信息','会影响通过此权限读取用户姓名和账户资料的应用。'),
        @('calendar','Calendar','日历','会影响应用读取和更新日历。'),
        @('calls','CallHistory','通话记录','会影响通话记录同步及相关应用。'),
        @('camera','Camera','摄像头','拒绝后相关应用无法进行视频会议或拍照；不等于关闭摄像头遥测。'),
        @('contacts','Contacts','联系人','会影响通讯录读取和同步。'),
        @('email','Email','电子邮件','会影响应用通过 Windows 邮件权限读取和发送邮件。'),
        @('location','Location','位置','会影响地图、天气及依赖定位的应用；不会关闭 GPS 硬件。'),
        @('messages','Messaging','消息','会影响短信或彩信相关功能，不是阻止所有聊天软件通信。'),
        @('microphone','Microphone','麦克风','拒绝后相关应用无法语音聊天或录音；请保留游戏语音所需权限。'),
        @('motion','Motion','运动数据','会影响使用设备运动信息的应用；没有对应传感器时不会产生硬件收益。'),
        @('phone','Phone','电话','会影响通过 Windows 电话权限发起通话的应用。'),
        @('radios','Radios','无线电控制','限制应用对无线电功能的控制，不直接禁用 Wi-Fi 或蓝牙网卡。'),
        @('tasks','Tasks','用户任务','控制待办任务数据访问，不是系统计划任务的启停。'),
        @('trusted-devices','TrustedDevices','受信任设备','会影响通过此权限访问已配对受信任设备的应用。')
    )
    foreach($row in $permissions){
        @{id=('privacy-app-'+$row[0]);title=('应用访问：'+$row[2]);category='应用权限';kind='registry';policy=$true;path='HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy';name=('LetAppsAccess'+$row[1]);options=$access;effect=($row[3]+' 管理受此 Windows 策略约束的应用，不覆盖任意桌面程序。保留已有逐应用例外；例外优先于此默认策略。强制允许会取消用户对这类应用的选择，修改后重启相关应用。')}
    }
    foreach($row in @(
        @('sync','LetAppsSyncWithDevices','应用与未配对设备同步','拒绝会影响支持此权限的跨设备同步。'),
        @('diagnostics','LetAppsGetDiagnosticInfo','应用访问其他应用诊断信息','拒绝会限制相关诊断工具读取其他应用的信息。'),
        @('voice','LetAppsActivateWithVoice','应用语音激活','控制支持此权限的语音唤醒，不是普通麦克风输入开关。'),
        @('voice-lock','LetAppsActivateWithVoiceAboveLock','锁屏时应用语音激活','拒绝后支持此策略的应用不能在锁屏界面通过语音激活。')
    )){
        @{id=('privacy-app-'+$row[0]);title=$row[2];category='应用权限';kind='registry';policy=$true;path='HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy';name=$row[1];options=$access;effect=($row[3]+' 只修改该项默认策略，保留逐应用例外；重启相关应用后验证，不保证影响所有桌面程序。')}
    }
    # Value pairs explicitly describe the capability, not the sometimes inverted policy name.
    $rows=@(
        @('ceip','Windows 客户体验改善计划','ICM','CEIPEnable','Software\Policies\Microsoft\SQMClient\Windows','CEIPEnable','0','不参加 CEIP','1','允许参加 CEIP','只管理旧版 CEIP/SQM 策略，不等于关闭全部 Windows 诊断数据；系统未使用 CEIP 时没有额外效果。'),
        @('feedback','Windows 反馈通知','FeedbackNotifications','DoNotShowFeedbackNotifications','Software\Policies\Microsoft\Windows\DataCollection','DoNotShowFeedbackNotifications','1','不显示反馈请求','0','允许反馈请求','不再主动邀请提交使用反馈；不关闭安全通知或清空反馈数据。'),
        @('search-location','Windows 搜索使用位置','Search','AllowSearchToUseLocation','SOFTWARE\Policies\Microsoft\Windows\Windows Search','AllowSearchToUseLocation','0','不允许使用位置','1','允许使用位置','控制系统搜索的位置权限，不阻止本地文件搜索，也不清空搜索历史。'),
        @('advertising','广告标识符','UserProfiles','DisableAdvertisingId','Software\Policies\Microsoft\Windows\AdvertisingInfo','DisabledByGroupPolicy','1','禁止使用广告 ID','0','由用户设置决定','不拦截广告内容或第三方广告追踪，只限制 Windows 广告标识符。'),
        @('speech','在线语音识别','Globalization','AllowInputPersonalization','Software\Policies\Microsoft\InputPersonalization','AllowInputPersonalization','0','禁止在线语音服务','1','由用户设置决定','会影响使用 Microsoft 在线语音识别的听写功能，不关闭本地麦克风。'),
        @('location-provider','Windows 位置提供程序','LocationProviderAdm','DisableWindowsLocationProvider_1','Software\Policies\Microsoft\Windows\LocationAndSensors','DisableWindowsLocationProvider','1','禁用提供程序','0','不禁用提供程序','影响使用此提供程序的定位；其他定位来源并不因此全部关闭。'),
        @('sensors','Windows 传感器访问','Sensors','DisableSensors_2','Software\Policies\Microsoft\Windows\LocationAndSensors','DisableSensors','1','限制传感器访问','0','不限制传感器访问','会影响依赖 Windows 传感器平台的应用和设备功能；不卸载驱动。'),
        @('location-system','Windows 定位功能','Sensors','DisableLocation_2','Software\Policies\Microsoft\Windows\LocationAndSensors','DisableLocation','1','关闭定位','0','不强制关闭定位','地图、天气等功能会失去系统位置来源；不影响 IP 地址本身暴露的地域信息。'),
        @('ait','应用程序影响遥测','AppCompat','AppCompatTurnOffApplicationImpactTelemetry','Software\Policies\Microsoft\Windows\AppCompat','AITEnable','0','关闭 AIT','1','开启 AIT','管理应用兼容性影响遥测策略，不关闭全部诊断数据或遥测服务。'),
        @('steps','步骤记录器','AppCompat','AppCompatTurnOffUserActionRecord','Software\Policies\Microsoft\Windows\AppCompat','DisableUAR','1','禁用步骤记录器','0','不禁用步骤记录器','限制 Windows 步骤记录器；系统未包含此功能时不会恢复它。'),
        @('wer','Windows 错误报告','ErrorReporting','WerDisable_2','SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting','Disabled','1','关闭错误报告','0','不强制关闭错误报告','关闭会影响崩溃报告和在线解决方案，不清理已有日志或崩溃文件。'),
        @('privacy-setup','登录时隐私设置向导','OOBE','DisablePrivacyExperience','Software\Policies\Microsoft\Windows\OOBE','DisablePrivacyExperience','1','不显示向导','0','允许显示向导','只控制新账户或升级后的隐私向导，不等于拒绝各项隐私授权。')
    )
    foreach($row in $rows){
        @{id=('privacy-'+$row[0]);title=$row[1];category='隐私';kind='registry';policy=$true;admx=$row[2];policyName=$row[3];path=('HKLM:\'+$row[4]);name=$row[5];options=@(@{value='default';label='未配置'},@{value=$row[6];label=$row[7]},@{value=$row[8];label=$row[9]});effect=($row[10]+' 此处管理本地策略；组织策略可能覆盖，需重新登录或重启相关功能后验证。')}
    }
    @{id='privacy-setting-sync';title='Windows 设置同步';category='隐私';kind='registry';policy=$true;admx='SettingSync';policyName='DisableSettingSync';path='HKLM:\Software\Policies\Microsoft\Windows\SettingSync';name='DisableSettingSync';options=@(@{value='default';label='未配置'},@{value='2';label='默认关闭设置同步'},@{value='0';label='不限制设置同步'});effect='管理 Windows 设置同步，不删除 OneDrive 文件或云端资料。保留已有用户覆盖策略，因此用户是否可重新开启取决于原设置；不声称完全封锁云通信。'}
    @{id='privacy-cloud-search';title='Windows 云内容搜索';category='隐私';kind='registry';policy=$true;admx='Search';policyName='AllowCloudSearch';path='HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search';name='AllowCloudSearch';options=@(@{value='default';label='未配置'},@{value='0';label='关闭云搜索'},@{value='1';label='开启云搜索'},@{value='2';label='用户自行决定'});effect='控制 Windows 搜索中的云内容来源，不等于禁止浏览器搜索或全部网络请求；不删除本地搜索索引。'}
    @{id='privacy-inventory';title='程序清单收集';category='隐私';kind='registry';policy=$true;admx='AppCompat';policyName='AppCompatTurnOffProgramInventory';path='HKLM:\Software\Policies\Microsoft\Windows\AppCompat';name='DisableInventory';options=@(@{value='default';label='未配置'},@{value='1';label='关闭清单收集'});effect='管理 Windows 应用兼容性程序清单收集策略，可能减少升级兼容性评估信息；不卸载应用，不停止所有遥测任务。'}
    foreach($row in @(@('text','RestrictImplicitTextCollection','文本输入个性化学习'),@('ink','RestrictImplicitInkCollection','手写输入个性化学习'))){
        @{id=('privacy-input-'+$row[0]);title=$row[2];category='隐私';kind='registry';policy=$true;path='HKLM:\SOFTWARE\Policies\Microsoft\InputPersonalization';name=$row[1];options=@(@{value='default';label='未配置'},@{value='1';label='限制收集'},@{value='0';label='不限制收集'});effect='仅调整这一类隐式输入学习，可能降低个性化输入建议准确度；不删除已有词典，不影响普通打字或手写输入。'}
    }
}
