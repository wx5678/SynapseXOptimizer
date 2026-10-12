# SynapseX 授权后台（内部试运行）

本目录是独立云端服务，不是 Windows 本地优化执行服务。服务端 0.2.1 配套桌面客户端 0.36.0；已实现授权流程，但尚未启用收费限制，不代表已经可以对外收款。

## 已实现

- Flask + Gunicorn，SQLite WAL，Ed25519 签名许可证。
- 随机激活码、管理员明确指定授权功能和有效期、设备数量限制。
- 设备续期令牌仅存 SHA-256；数据库不保存明文激活码。
- 许可证离线窗口最长 7 天且不超过权益到期时间；撤销后停止续签，但已签发许可证到期前仍可离线验证。
- 同设备重新激活会替换续期令牌；客户端可联网解除本机授权并释放名额，管理员也可解绑。
- `/admin/` 管理页面：登录、签发、搜索与分页、查看设备、延期、撤销、解绑、审计、修改密码。与服务一起仅监听本机，不是公网管理入口。
- 管理员密码 scrypt 哈希，服务端会话 8 小时，HttpOnly / SameSite=Strict Cookie、Origin/Host/CSRF 校验和登录限流。HTTPS 配置后使用 Secure Cookie。
- 签发和延期等管理写入支持请求幂等；同一提交重试不会重复创建或延长。签发码明文不持久化，首次响应丢失后重试仅告知原授权编号，需要撤销后重新签发。
- 桌面端主进程验证固定公钥、设备与有效期；Windows DPAPI 保存凭据，页面不接触刷新令牌。每 24 小时尝试续期，失败时保留仍有效的离线凭证。
- systemd 自动启动、故障重启；每日 SQLite 在线备份和完整性检查。

## 当前部署边界

- 仅监听 `127.0.0.1:8787`，不允许将此端口直接开放公网。
- 没有订单、支付回调、终端用户账号注册登录或自动密码找回；管理员账号与九阴游戏账号无关。
- 正式管理员账号尚未初始化，没有默认密码。客户端固定了从已授权服务器终端读取的公钥，但生产 endpoint 留空，待域名/HTTPS 确认后配置。
- 没有域名、HTTPS、异机备份和外部故障告警；这些是公开运营前的必要工作。
- 当前限流为内部测试的单来源 60 次/分钟。上线需要反向代理覆盖可信客户端地址、分层限流、请求超时与容量压测；不能直接信任用户传来的转发头。
- 当前许可证签名公钥必须从可信发布渠道固定到客户端，不能通过未验证的 HTTP 自动下载公钥作为信任根。
- 设备指纹由客户端提交；它不是不可伪造的硬件证明。
- 正式功能 ID 与免费/收费边界尚未确定，不应提前锁定现有功能。

## 部署与验证

运行环境安装使用 Ubuntu 官方仓库：`python3-flask python3-cryptography gunicorn sqlite3`。

将源码包传至服务器，在 `/opt/synapsex-license/releases/<版本>` 解压，运行 `sh install.sh`。
安装会先执行全部 `test_*.py`，并拒绝覆盖已有非软链接 current 目录。升级前自动备份，失败恢复之前的程序软链接与服务定义；数据迁移只增加表，不删除旧数据。
签名密钥只在首次初始化生成；数据库存在但私钥丢失时必须从备份恢复，不能自动重新生成。

服务名：`synapsex-license.service`。
定时备份：`synapsex-license-backup.timer`，服务器当地时间每天 03:20 后随机延迟不超过 15 分钟。

目录：

- `/opt/synapsex-license/current`：当前代码软链接，root 管理。
- `/var/lib/synapsex-license/licenses.sqlite3`：数据库。
- `/etc/synapsex-license/signing.pem`：签名私钥，root 持有，服务组只读。
- `/var/backups/synapsex-license`：本机数据库备份（目前不含签名私钥）。

管理命令需通过 SSH / Workbench 在服务器执行，例如：

```sh
cd /opt/synapsex-license/current
sudo -u synapsex-license python3 manage.py list
sudo -u synapsex-license python3 manage.py issue --days 30 --devices 2 --feature test.pilot --reference manual-test
sudo -u synapsex-license python3 manage.py revoke <license_id>
sudo -u synapsex-license python3 manage.py unbind <device_id>
systemctl start synapsex-license-backup.service
python3 verify_health.py
```

发码命令只显示一次明文激活码，应通过私密渠道交付。不要粘贴到公开日志、工单或代码仓库。

## 首次管理员与客户端配置

由所有者在可信服务器终端执行（密码交互输入，不回显）：

```sh
cd /opt/synapsex-license/current
sudo -u synapsex-license python3 manage.py admin-set admin
```

密码至少 14 个字符。此命令也用于重置密码，会使该管理员所有现有会话失效。请勿把密码粘贴到聊天中。工具同时支持 `--generate-file` 将随机凭据保存到指定独占新建文件；正式环境应由所有者确认后使用。

目前访问需使用可信 SSH 本地转发到服务器 `127.0.0.1:8787`，再打开 `http://127.0.0.1:8787/admin/`；不能通过公网 IP 直接访问，也没有自动配置本地 SSH 凭据。

正式域名确定后，由反向代理终结 TLS，保留真实 Host，设置 `/etc/synapsex-license/service.env` 中的 `SYNAPSEX_ADMIN_ORIGIN=https://实际管理域名`，再重启服务。不要为了方便而开放 8787。公网限流仍需单独完善，当前不能盲目信任 X-Forwarded-For。

桌面发布配置在 `electron/license-config.json`：`endpoint` 必须为 HTTPS 原点，`publicKey` 必须来自可信发布渠道。不得自动信任接口下载的公钥。`enforcement` 当前固定关闭，不根据配置启用付费墙。开发版可用 `SYNAPSEX_LICENSE_DEV_CONFIG` 指定隔离测试配置文件；打包版忽略此覆盖并禁止 HTTP。

本地测试：设置 `SYNAPSEX_TEST_PYTHON` 为安装 Flask / cryptography 的 Python 路径后运行 `node --test tests/licensing.test.cjs`。测试会启动隔离临时 HTTP 服务；Windows 下另启动无窗口 Electron，实际验证机器标识、DPAPI、激活、续期和解绑，不操作用户正在运行的软件。

`smoke_live.py` 专门进行 loopback HTTP 实测，只发放 `test.pilot` 测试权益，结束时自动撤销，保留审计记录。

## 备份、恢复与后续

当前每日备份只防本机数据库误操作，不防整台机器或磁盘丢失。正式营业前需要明确异机备份目标，对数据库与签名私钥进行加密异机备份，配置保留周期及磁盘空间告警，并做恢复演练。

恢复前停止授权服务，在隔离目录校验备份，然后在维护窗口恢复数据库和原签名私钥；保留原数据回滚副本。不得直接用复制正在写入的 SQLite 文件替代在线 backup API。

代码更新保留 releases 目录和安装前 systemd 文件副本。0.2.0 曾因健康检查固定旧版本号而回退；0.2.1 已改为随应用版本检查，并增加回归测试。该回退过程实际验证了旧程序恢复。

开放公网前：域名及所需备案、TLS、可信代理配置、账号系统、支付服务端验签与幂等、条款与隐私说明、故障告警、加密异机备份、桌面端公钥固定与服务端执行入口校验，以及发布前安全检查和压测。
