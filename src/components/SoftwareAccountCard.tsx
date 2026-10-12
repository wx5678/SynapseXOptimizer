import { useEffect, useRef, useState } from "react";
import { UserRound, RefreshCw } from "lucide-react";
import "./license-settings.css";

const names: Record<string, string> = {
  logged_out: "未登录",
  unconfigured: "未配置",
  unlicensed: "待开通",
  active: "授权有效",
  expired: "已到期",
  revoked: "已撤销",
  device_limit: "设备已满",
  invalid: "请重新登录",
};
const date = (v?: number | null) =>
  v ? new Date(v * 1000).toLocaleString("zh-CN") : "—";
export function SoftwareAccountCard({initialMode='login'}:{initialMode?:'login'|'register'}) {
  const api = window.synapsexDesktop?.softwareAccount;
  const [state, setState] = useState<SoftwareAccountState | null>(null),
    [mode, setMode] = useState<"login" | "register">(initialMode);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    alive = useRef(true),
    version = useRef(0),
    confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    alive.current = true;
    const read = () => {
      if (!api || lock.current) return;
      const id = ++version.current;
      void api
        .state()
        .then((s) => {
          if (alive.current && id === version.current) setState(s);
        })
        .catch(() => {if(alive.current)setError('无法读取账号状态，请重新打开账号入口。');});
    };
    read();
    window.addEventListener("focus", read);
    const timer = window.setInterval(read, 30000);
    return () => {
      alive.current = false;
      version.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", read);
    };
  }, [api]);
  async function run(fn: () => Promise<SoftwareAccountState>) {
    if (lock.current) return;
    lock.current = true;
    version.current++;
    setBusy(true);
    setError("");
    try {
      const s = await fn();
      if (alive.current) {
        setState(s);
        window.dispatchEvent(new Event('synapsex:account-changed'));
        setCode("");
        confirmation.current?.close();
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message.replace(
                /^Error invoking remote method '[^']+': (Error: )?/,
                "",
              )
            : "操作失败。",
        );
      try {
        if (api) { const current = await api.state(); if (alive.current) setState(current); }
      } catch { /* Keep the operation error visible. */ }
    } finally {
      if (alive.current) {
        setPassword("");
        setRepeat("");
        setBusy(false);
      }
      lock.current = false;
    }
  }
  return (
    <section
      className="license-settings"
      aria-labelledby="software-account-title"
    >
      <div className="license-heading">
        <span className="license-symbol">
          <UserRound size={21} />
        </span>
        <div>
          <h2 id="software-account-title">软件账号</h2>
          <p>登录后，授权跟随账号管理。</p>
        </div>
        <span
          className={`license-status ${state?.status === "active" ? "is-active" : ""}`}
        >
          {state?.user ? (state.administrator ? '软件管理员' : state.status==='active' ? 'VIP 会员' : state.status==='unlicensed' ? '免费用户' : names[state.status] || '免费用户') : '未登录'}
        </span>
      </div>
      <p className="license-notice" role="status">
        {state?.message ||
          (api ? "正在读取账号状态…" : "请在桌面客户端中注册或登录。")}
      </p>
      <p className="license-subtle">
        这是 SynapseX
        软件账号与九阴游戏账号独立。基础优化、监控与报告、单账号自动签到、基础检测和恢复免费；VIP 解锁最佳与最大优化、高级参数应用、TCP / 网卡高级调校、实验室进阶调度与配置，以及 3 个签到账号。九阴超原版帧率与视野上限仅限软件管理员，不包含在 VIP 中。
      </p>
      {!state?.user && (
        <>
          <div className="license-actions" role="group" aria-label="登录方式">
            <button
              aria-pressed={mode === "login"}
              disabled={busy}
              onClick={() => {
                setMode("login");
                setError("");
                setPassword("");
                setRepeat("");
              }}
            >
              登录账号
            </button>
            <button
              aria-pressed={mode === "register"}
              disabled={busy}
              onClick={() => {
                setMode("register");
                setError("");
                setPassword("");
                setRepeat("");
              }}
            >
              注册账号
            </button>
          </div>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "register" && password !== repeat) {
                setError("两次密码不一致。");
                return;
              }
              if(!api||!state?.configured){setError('请使用已连接账号服务器的桌面客户端。');return;}
              void run(() =>
                api[mode]({ username: username.trim(), password }),
              );
            }}
          >
            <label>
              软件账号
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                pattern={mode === "login" ? "(?:1|[A-Za-z][A-Za-z0-9_.\\-]{3,31})" : "[A-Za-z][A-Za-z0-9_.\\-]{3,31}"}
                minLength={mode === "login" ? 1 : 4}
                maxLength={32}
                disabled={busy}
                placeholder={mode === "register" ? "4–32 位，以字母开头" : "输入软件账号"}
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "login" && username.trim() === "1" ? 1 : 12}
                maxLength={128}
                disabled={busy}
                placeholder={mode === "register" ? "至少 12 位" : "输入密码"}
              />
            </label>
            {mode === "register" && (
              <label>
                确认密码
                <input
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </label>
            )}
            <button disabled={busy || !api || !state?.configured} type="submit">
              {busy
                ? "处理中…"
                : mode === "login"
                  ? "登录并同步授权"
                  : "注册并登录"}
            </button>
          </form>
          <p className="license-subtle">
            账号不区分大小写，可使用字母、数字、点、下划线和短横线。登录状态加密保存在本机，最长
            180 天，每次在线同步会续期；不保存密码。普通及 VIP 账号仅绑定一台电脑，软件管理员不限设备。请妥善保管密码，当前未提供自助找回。
          </p>
          {api && state?.status === "invalid" && (
            <button disabled={busy} onClick={() => void run(api.logout)}>
              清除损坏的本机登录
            </button>
          )}
        </>
      )}
      {api && state?.user && (
        <>
          <dl className="license-details">
            <div>
              <dt>当前账号</dt>
              <dd>{state.user.username}</dd>
            </div>
            <div>
              <dt>用户编号</dt>
              <dd>{state.user.id}</dd>
            </div>
            <div>
              <dt>授权到期</dt>
              <dd>{state.administrator ? '管理员角色 · 由后台管理，不限设备' : state.status==='unlicensed'?'免费用户 · 无到期限制':date(state.expiresAt)}</dd>
            </div>
            <div>
              <dt>离线凭证到期</dt>
              <dd>{date(state.offlineUntil)}</dd>
            </div>
          </dl>
          <div className="license-actions">
            <button disabled={busy} onClick={() => void run(api.sync)}>
              <RefreshCw size={14} />
              同步授权
            </button>
            <button
              disabled={busy}
              onClick={() => confirmation.current?.showModal()}
            >
              退出账号
            </button>
          </div>
          <p className="license-subtle">
            登录后约每 2
            分钟检查一次授权，也可手动同步。没有授权时，请联系管理员按软件账号开通。
          </p>
          <details className="account-redeem">
            <summary>兑换授权码</summary>
            <form
              className="license-activation"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api.redeem(code.trim().toUpperCase()));
              }}
            >
              <label>
                授权码
                <input
                  type="password"
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={43}
                  required
                  disabled={busy}
                  placeholder="SX-…"
                />
              </label>
              <button disabled={busy || !code.trim()}>兑换到当前账号</button>
            </form>
            <p className="license-subtle">
              兑换后绑定当前账号，不可转给其他账号。已使用的旧授权码不会自动迁移。
            </p>
          </details>
        </>
      )}
      {error && (
        <p className="license-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={confirmation}
        className="license-confirm"
        aria-labelledby="account-logout-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 id="account-logout-title">退出软件账号？</h2>
        <p>
          清除本机账号登录和账号授权凭据，不影响九阴签到账号。绑定设备仍保留，如需换机请联系管理员解绑。
        </p>
        <div className="license-actions">
          <button disabled={busy} onClick={() => confirmation.current?.close()}>
            取消
          </button>
          <button disabled={busy} onClick={() => api && void run(api.logout)}>
            确认退出
          </button>
        </div>
      </dialog>
    </section>
  );
}
