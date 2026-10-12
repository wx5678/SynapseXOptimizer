import { useEffect, useRef, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import "./license-settings.css";
import { SoftwareAccountCard } from "./SoftwareAccountCard";

const formatDate = (value?: number | null) =>
  value
    ? new Date(value * 1000).toLocaleString("zh-CN", { hour12: false })
    : "—";
const statusNames: Record<string, string> = {
  unconfigured: "尚未开放",
  inactive: "未激活",
  active: "授权有效",
  expired: "需要联网验证",
  invalid: "验证失败",
  clock_error: "请检查系统时间",
};
export function LicenseSettingsCard() {
  const api = window.synapsexDesktop?.license;
  const [state, setState] = useState<LicenseState | null>(null);
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    version = useRef(0),
    confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (!api || lock.current) return;
      const current = ++version.current;
      void api
        .state()
        .then((value) => {
          if (active && current === version.current) setState(value);
        })
        .catch(() => {
          if (active && current === version.current)
            setError("无法读取授权状态，请稍后重试。");
        });
    };
    read();
    window.addEventListener("focus", read);
    return () => {
      active = false;
      window.removeEventListener("focus", read);
    };
  }, [api]);
  async function run(action: () => Promise<LicenseState>) {
    if (lock.current) return;
    lock.current = true;
    version.current++;
    setBusy(true);
    setError("");
    try {
      setState(await action());
      setCode("");
      confirmation.current?.close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(
              /^Error invoking remote method '[^']+': (Error: )?/,
              "",
            )
          : "操作失败，请重试。",
      );
      try {
        if (api) setState(await api.state());
      } catch {
        /* Keep operation failure visible. */
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <SoftwareAccountCard />
      <details className="legacy-license">
        <summary>旧版授权码管理</summary>
        <section className="license-settings" aria-labelledby="license-title">
          <div className="license-heading">
            <span className="license-symbol">
              <ShieldCheck size={21} />
            </span>
            <div>
              <h2 id="license-title">软件授权</h2>
              <p>管理本机授权与有效期。</p>
            </div>
            <span
              className={`license-status ${state?.status === "active" ? "is-active" : ""}`}
            >
              {statusNames[state?.status || "unconfigured"] || "待验证"}
            </span>
          </div>
          <p className="license-notice">
            {state?.message ||
              (api
                ? "正在读取授权配置…"
                : "请在桌面客户端中管理授权。现有功能不受影响。")}
          </p>
          <p className="license-subtle">
            免费功能可直接使用。VIP 权限以服务器签发为准；test.pilot 测试授权不会解锁 VIP。软件授权与九阴游戏账号互不关联。
          </p>
          {state?.licenseId && (
            <dl className="license-details">
              <div>
                <dt>授权编号</dt>
                <dd>{state.licenseId}</dd>
              </div>
              <div>
                <dt>授权到期</dt>
                <dd>{formatDate(state.expiresAt)}</dd>
              </div>
              <div>
                <dt>离线可用至</dt>
                <dd>{formatDate(state.offlineUntil)}</dd>
              </div>
              <div>
                <dt>最近验证成功</dt>
                <dd>{formatDate(state.lastSuccess)}</dd>
              </div>
            </dl>
          )}
          {state?.configured && api && (
            <>
              <form
                className="license-activation"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => api.activate(code.trim().toUpperCase()));
                }}
              >
                <label htmlFor="activation-code">
                  授权码
                  <input
                    id="activation-code"
                    type="password"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="SX-…"
                    maxLength={43}
                    disabled={busy || state.status === "active"}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !code.trim() || state.status === "active"}
                >
                  <KeyRound size={15} />
                  {busy ? "处理中…" : "激活授权"}
                </button>
              </form>
              <div className="license-actions">
                <button
                  type="button"
                  disabled={busy || !state.licenseId}
                  onClick={() => void run(api.refresh)}
                >
                  <RefreshCw size={14} />
                  刷新授权
                </button>
                <button
                  type="button"
                  disabled={busy || !state.licenseId}
                  onClick={() => confirmation.current?.showModal()}
                >
                  解除本机授权
                </button>
              </div>
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
            aria-labelledby="license-confirm-title"
            onCancel={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <h2 id="license-confirm-title">解除本机授权？</h2>
            <p>
              将联网释放当前设备名额，并清除本机授权凭据。其他设备不受影响，现有免费功能仍可使用。
            </p>
            <p className="license-subtle">
              请先保留原授权码，以便后续重新激活。
            </p>
            {error && (
              <p role="alert" className="license-error">
                {error}
              </p>
            )}
            <div className="license-actions">
              <button
                disabled={busy}
                onClick={() => confirmation.current?.close()}
              >
                取消
              </button>
              <button
                disabled={busy}
                onClick={() => api && void run(api.deactivate)}
              >
                {busy ? "正在解除…" : "确认解除"}
              </button>
            </div>
          </dialog>
        </section>
      </details>
    </>
  );
}
