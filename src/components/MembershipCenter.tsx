import { useEffect, useRef, useState, type ReactNode } from "react";
import { UserRound, ChevronDown, X, Download, RefreshCw, MessageCircle, Copy, Check } from "lucide-react";
import { SoftwareAccountCard } from "./SoftwareAccountCard";
import { memberOffer } from "../lib/member-offer";

export function MembershipCenter({tools}:{tools?:ReactNode} = {}) {
  const [account, setAccount] = useState<SoftwareAccountState | null>(null),
    [product, setProduct] = useState<ProductState | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login"),
    [open, setOpen] = useState(false),
    [updateOpen, setUpdateOpen] = useState(false),
    [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false), [copied, setCopied] = useState(false);
  const memberDialog = useRef<HTMLDialogElement>(null),
    updateDialog = useRef<HTMLDialogElement>(null),
    dismissed = useRef("");
  const api = window.synapsexDesktop;
  const [updateNotice,setUpdateNotice] = useState('');
  useEffect(()=>{
    const receive = (event:Event)=>{
      const p=(event as CustomEvent<ProductState>).detail;
      setProduct(p);
      if(p.available)setUpdateOpen(true);
    };
    const check = async()=>{
      if(!api?.product)return;
      setRefreshing(true);
      try {const p=await api.product.refresh();setProduct(p);setUpdateNotice(p.error || (p.available?'':'检查完成，当前没有已发布的更新。'));if(p.available)setUpdateOpen(true);}
      catch {setUpdateNotice('检查更新失败，请稍后重试。');}
      finally {setRefreshing(false);}
    };
    window.addEventListener('synapsex:product-checked',receive);
    window.addEventListener('synapsex:check-updates',check);
    const unsubscribe=api?.onUpdatePrompt?.(()=>void check());
    return ()=>{window.removeEventListener('synapsex:product-checked',receive);window.removeEventListener('synapsex:check-updates',check);unsubscribe?.();};
  },[api]);
  useEffect(() => {
    let active = true,
      busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const [a, p] = await Promise.all([
          api?.softwareAccount?.state(),
          api?.product?.state(),
        ]);
        if (active) {
          setAccount(a || null);
          setProduct(p || null);
        }
      } catch {
        /* The account form exposes connection errors. */
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(read, 15000);
    window.addEventListener("synapsex:account-changed", read);
    window.addEventListener("focus", read);
    const show = (value: "login" | "register") => {
      setMode(value);
      setOpen(true);
    };
    const unsubscribe = api?.onAccountPrompt?.(show);
    const requested = (event: Event) =>
      show((event as CustomEvent).detail === "register" ? "register" : "login");
    window.addEventListener("synapsex:open-account", requested);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe?.();
      window.removeEventListener("focus", read);
      window.removeEventListener("synapsex:account-changed", read);
      window.removeEventListener("synapsex:open-account", requested);
    };
  }, [api]);
  useEffect(() => {
    if (!updateOpen) return;
    let alive = true;
    const timer = setInterval(
      () =>
        void api?.product?.state().then((p) => {
          if (alive) setProduct(p);
        }).catch(()=>{if(alive)setError('无法读取下载进度，请重试。');}),
      600,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [updateOpen, api]);
  useEffect(() => {
    if (open && !memberDialog.current?.open) memberDialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    if (
      product?.required ||
      (product?.available &&
        dismissed.current !== product.config?.update.version)
    )
      setUpdateOpen(true);
    if (product?.checked && !product.available) {
      setUpdateOpen(false);
      updateDialog.current?.close();
    }
  }, [product]);
  useEffect(() => {
    if (updateOpen && !updateDialog.current?.open) {
      memberDialog.current?.close();
      setOpen(false);
      updateDialog.current?.showModal();
    }
  }, [updateOpen]);
  const config = product?.config,
    progress = product?.progress;
  const offer = memberOffer(config);
  useEffect(() => { setCopied(false); }, [open, offer.wechat]);
  const vip = account?.status === "active" && account.features.includes('vip');
  const expiry = account?.expiresAt
    ? new Date(account.expiresAt * 1000).toLocaleDateString("zh-CN")
    : "";
  const closeUpdate = () => {
    if (product?.required) return;
    dismissed.current = config?.update.version || "";
    setUpdateOpen(false);
    updateDialog.current?.close();
  };
  async function action(fn: (() => Promise<unknown>) | undefined) {
    setError("");
    try {
      await fn?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }
  return (
    <>
      <div className="workspace-utility-group" role="group" aria-label="工作台工具">
        <span id="workspace-help-slot" />
        <button className="membership-entry toolbar-update" aria-label={refreshing?'正在检查更新':'检查更新'} title="检查软件更新" disabled={!api?.product||refreshing} onClick={()=>window.dispatchEvent(new Event('synapsex:check-updates'))}><RefreshCw size={16}/><span>{refreshing?'检查中…':'检查更新'}</span></button>
        {tools}
      </div>
      {updateNotice&&<div role="status" className="update-check-notice"><span>{updateNotice}</span><button aria-label="关闭更新提示" onClick={()=>setUpdateNotice('')}><X size={16}/></button></div>}
      <button
        className="membership-entry toolbar-account"
        onClick={() => {
          setMode("login");
          setOpen(true);
        }}
        aria-label={account?.user ? "打开会员与账号" : "登录或注册软件账号"}
        title={account?.user ? `${account.user.username} · ${account.administrator ? '软件管理员 · 不限设备' : vip ? `VIP · 到期 ${expiry||'待同步'}` : '免费用户'}` : '登录或注册软件账号'}
      >
        <span className="toolbar-avatar" aria-hidden="true"><UserRound size={18} /></span>
        <span className="toolbar-account-copy">
          {account?.user ? (
            <>
              <span className="toolbar-account-line"><strong>{account.user.username}</strong><span className="toolbar-role" data-role={account.administrator?'admin':vip?'vip':'free'}>{account.administrator?'管理员':vip?'VIP':'免费'}</span></span>
              <small>
                {account.administrator ? '不限设备' : vip
                  ? `到期 ${expiry || "待同步"}`
                  : account.status === "expired"
                    ? `VIP 已到期 ${expiry}`
                    : "免费使用"}
              </small>
            </>
          ) : (
            <><strong>登录 / 注册</strong><small>同步账号与授权</small></>
          )}
        </span>
        <ChevronDown className="toolbar-account-chevron" size={14} aria-hidden="true"/>
      </button>
      <dialog
        ref={memberDialog}
        className="membership-dialog"
        aria-labelledby="membership-title"
        onClose={() => setOpen(false)}
      >
        <header>
          <div>
            <small>我的账号</small>
            <h2 id="membership-title">账号与会员</h2>
          </div>
          <button
            aria-label="关闭账号窗口"
            onClick={() => memberDialog.current?.close()}
          >
            <X size={20} />
          </button>
        </header>
        {open && <SoftwareAccountCard key={mode} initialMode={mode} />}
        <section className="membership-offer">
          <div>
            <h3>VIP 会员</h3>
                <div className="membership-prices">
                  <span>
                    <small>月度会员</small><strong>¥{offer.month_fen / 100}</strong> / 月
                  </span>
                  <span>
                    <small>年度会员</small><strong>¥{offer.year_fen / 100}</strong> / 年
                  </span>
                </div>
                <p>
                  最佳与最大优化、高级参数应用、TCP / 网卡高级调校、实验室进阶调度与配置；最多 3 个签到账号。
                </p>
                <p>基础优化、实时监控与悬浮窗、基础性能报告、单账号自动签到及基础检测免费。读取兼容性、停止任务和恢复原值不受会员到期影响。</p>
                <p>九阴超原版帧率与视野上限仅限软件管理员，不属于 VIP 权益。实验功能不保证提升帧率；一对一调校与超频服务另行报价。</p>
                <small>
                  {config ? "价格来自服务器。" : "当前为随软件提供的参考价格，开通前请联系确认。"}
                  当前仅支持联系开通；开通后同步授权。
                </small>
            <div className="membership-contact">
              <MessageCircle size={20} aria-hidden="true" />
              <div>
                <h4>专属调校服务</h4>
                <p>{offer.service_text}</p>
                <button className="membership-wechat" onClick={() => void action(async () => {
                  await navigator.clipboard.writeText(offer.wechat);
                  setCopied(true);
                })} aria-label={`复制微信号 ${offer.wechat}`}>
                  <strong>{offer.wechat}</strong>{copied ? <Check size={15} /> : <Copy size={15} />}
                  <span aria-live="polite">{copied ? "已复制" : "复制微信号"}</span>
                </button>
                <small>咨询会员请提供软件账号；调校服务单独沟通。</small>
              </div>
            </div>
          </div>
          {offer.qr_data && (
            <figure className="membership-qr">
            <img
              src={offer.qr_data}
              alt={`添加微信 ${offer.wechat} 的二维码`}
              width="210"
            />
            <figcaption>微信扫一扫 · 添加好友</figcaption>
            </figure>
          )}
        </section>
        <footer>
          <span>
            当前版本 {product?.version || "—"}
            {product?.available ? " · 有新版本" : ""}
          </span>
          <button
            disabled={refreshing || !api?.product}
            onClick={() =>
              void action(async () => {
                setRefreshing(true);
                try {
                const p = await api?.product?.refresh();
                if (p) {
                  setProduct(p);
                  if (p.available) setUpdateOpen(true);
                }
                } finally { setRefreshing(false); }
              })
            }
          >
            <RefreshCw size={14} />
            {refreshing ? "正在刷新…" : "检查更新与价格"}
          </button>
        </footer>
        {product?.error && (
          <p className="membership-error" role="status">
            {product.error}。{config ? "显示上次已验证的配置。" : "微信联系方式仍可使用，会员权限以账号授权为准。"}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </dialog>
      <dialog
        ref={updateDialog}
        className="membership-dialog update-dialog"
        onCancel={(e) => {
          if (product?.required) e.preventDefault();
          else closeUpdate();
        }}
      >
        <header>
          <div>
            <small>
              {product?.required ? "需要更新后继续使用" : "发现新版本"}
            </small>
            <h2>SynapseX {config?.update.version}</h2>
          </div>
          {!product?.required && (
            <button aria-label="稍后更新" onClick={closeUpdate}>
              <X size={20} />
            </button>
          )}
        </header>
        <p className="update-notes">
          {config?.update.notes || "此版本包含功能改进与问题修复。"}
        </p>
        <div
          className="update-progress"
          role="progressbar"
          aria-label="安装包下载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(
            ((progress?.received || 0) / Math.max(progress?.total || 0, 1)) *
              100,
          )}
        >
          <span
            style={{
              transform: `scaleX(${(progress?.received || 0) / Math.max(progress?.total || 0, 1)})`,
            }}
          />
        </div>
        <p role="status">
          {progress?.message || "从码云下载，完成后验证安装包完整性。"}
          {progress && progress.total > 0 && (
            <small>
              {" "}
              {(progress.received / 1048576).toFixed(1)} /{" "}
              {(progress.total / 1048576).toFixed(1)} MB ·{" "}
              {Math.floor((progress.received / progress.total) * 100)}%
            </small>
          )}
        </p>
        <footer>
          {progress?.phase === "ready" ? (
            <button onClick={() => void action(api?.product?.showDownload)}>
              打开下载文件夹
            </button>
          ) : (
            <button
              disabled={["downloading", "verifying"].includes(
                progress?.phase || "",
              )}
              onClick={() => void action(api?.product?.download)}
            >
              <Download size={16} />
              {progress?.phase === "error" ? "重新下载" : "下载新版本"}
            </button>
          )}
          {!product?.required && (
            <button onClick={closeUpdate}>稍后更新</button>
          )}
          <button onClick={() => void action(api?.product?.refresh)}>
            刷新版本配置
          </button>
          <button onClick={() => void api?.quit?.()}>退出软件</button>
        </footer>
        {product?.required && (
          <p>
            本版本已停止使用。下载完成后，退出旧版并运行新版；账号和本机配置会保留。
          </p>
        )}
        {product?.error && <p role="alert">{product.error}</p>}
        {error && <p role="alert">{error}</p>}
      </dialog>
    </>
  );
}
