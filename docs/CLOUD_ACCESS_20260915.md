# 云端访问部署 · 2026-09-15

> 后续已升级账号版：服务端 0.3.0 / 客户端 0.37.0，公开注册已启用。最新交付与验证见 [账号授权上线记录](ACCOUNT_LICENSING_20260915.md)。下文保留首次 HTTPS 部署记录。

## 入口与版本

- 正式云端后台：**https://39.96.195.192/admin/**。
- 授权 API 根地址：`https://39.96.195.192`，公钥仍为已验证的 `k7tRgyRD34Q_McBXwArq6KJ2wSsbY5RqMuytc9XPuIA`，私钥没有离开服务器。
- ECS：北京 `i-2zeidf61icznscg7oipv`；安全组 `sg-2ze0uw0jyy6v71ycy6pv`。
- 后台 0.2.2，`/opt/synapsex-license/current` 指向 `/opt/synapsex-license/releases/0.2.2-20260915`。
- 客户端 0.36.1：`release/0.36.1-cloud/SynapseX-Game-Optimizer-0.36.1.exe`。SHA-256：`CD63CE4C8B27E17B3A2D50221D2039D012455018AAF85EC46ECD936CE1D6879B`。
- 发布包：`artifacts/license-service-0.2.2-20260915.zip`，SHA-256：`0021548E5C03FFA3503D33C172780DC46301EDA9B19C654EDB6BA62B6B67C602`。
- 客户端已填写正式 HTTPS endpoint；`enforcement=false`，没有启用付费限制或支付。

## 已完成

所有者明确同意开放 TCP 80/443，并接受 Let's Encrypt 条款以申请和自动续期免费 IP 证书。

- 安全组新增 80 和 443 两条入站规则，来源 `0.0.0.0/0`。原有 SSH、RDP、ICMP 规则未更改。
- Nginx 1.28.3：80 仅提供 ACME challenge 与固定 HTTPS 跳转，不提供明文后台；443 反向代理后台和授权接口，其他路径返回 404。
- Gunicorn 仍只监听 `127.0.0.1:8787`；数据库未开放网络端口；签名密钥保持服务专用权限。
- HTTPS 后台使用 Secure、HttpOnly、SameSite=Strict Cookie，保留来源验证、CSRF 和登录尝试限制。
- Nginx 限制请求频率、并发、请求体和超时；覆盖转发 IP 头。应用仅在显式配置且直接对端为 loopback 时信任一层代理，避免所有公网用户共用限流额度。
- `/etc/synapsex-license/service.env` 配置正式后台 origin 和 loopback 代理模式。
- Certbot 5.8.0 安装在独立 `/opt/synapsex-certbot` 虚拟环境，不替换应用 Python 依赖。
- 首张正式 IP 证书已签发，有效期至 2026-09-21；证书文件在 `/etc/letsencrypt/live/39.96.195.192/`。
- `synapsex-cert-renew.timer` 每日 00/12 点加最多一小时随机偏移检查续期，Persistent=true；部署钩子验证 Nginx 配置并重载证书。
- 保留原有每日数据库备份和升级前备份，保留 0.2.1 程序目录。

## 验证

- Python 30 项测试，本机和服务器通过；新增代理 IP 可信边界、独立限流桶、禁止转发 Host 绕过、Secure Cookie 测试。
- Node 111 项回归通过。首次缺少 `SYNAPSEX_TEST_PYTHON` 环境配置导致测试 fixture 无法启动；指定隔离 Python 后全部通过，并非忽略失败。
- TypeScript/Vite 和 Windows portable 打包通过；保留原有 604 kB 前端 bundle 警告。
- Windows 原生证书校验：公网 `/healthz` 200、`/admin/` 200、未登录 `/admin/api/session` 401，公钥与预置值一致。
- 浏览器直接访问正式 HTTPS 后台，登录页面正常，无证书绕过。
- 服务器真实 loopback HTTP 激活、Ed25519 验签、刷新、设备上限和撤销通过；只签发 test.pilot 测试授权并已撤销。
- Certbot `renew --dry-run --run-deploy-hooks` 成功，包含重载钩子；实际续期任务 Result=success。
- 应用 ActiveState=active、NRestarts=0；ss 确认 80/443 对外，8787 仅 loopback。

## 管理员初始化（需要所有者完成）

检查时 `ADMIN_COUNT=0`，没有生成通用密码，也没有将本机演示管理员复制上云。

可信服务器终端执行：

```sh
sudo -u synapsex-license python3 /opt/synapsex-license/current/manage.py admin-set admin
```

所有者亲自输入至少 14 位密码并重复确认；输入时不回显。然后在正式 HTTPS 后台使用 `admin` 登录。不要把密码发送到聊天。正式账号登录与管理操作尚待所有者设置密码后验证。

## 运维与尚未完成项

- 查看续期：`systemctl status synapsex-cert-renew.timer`、`journalctl -u synapsex-cert-renew.service`。
- 手动检查：`systemctl start synapsex-cert-renew.service`。不要反复强制签发证书。
- 证书只有约 6 天有效期，自动续期必须保持运行。未注册联系邮箱，未接入外部到期告警；不能把定时任务已启用当成长期续期必然成功。
- IP 变更时需要重新签发证书、调整 Nginx/origin 和发布客户端配置。
- 尚无异机加密备份、私钥离线备份、备份保留策略或压力测试；现有每日备份在同一台服务器。
- 价格、免费/付费范围、订单支付、退款、用户注册和商业上线所需合规事项仍待确认；此部署完成云端访问，不代表完整商业运营准备完成。

配置依据：[Let's Encrypt IP 证书与 Certbot](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)、[Flask 代理可信边界](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/)。
