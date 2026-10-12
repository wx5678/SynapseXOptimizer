import { useEffect, useRef, useState } from "react";
import {
  Gauge,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Crown,
  FolderInput,
} from "lucide-react";
import { requestConfirmation } from "./ConfirmationDialog";
import { requireVip, useVip } from "./VipNotice";
import { userError } from "../lib/userError";
import "./jiuyin-fps.css";

export function JiuYinFpsUnlockCard({ gameRoot }: { gameRoot: string }) {
  const api = window.synapsexDesktop?.jiuyinFps,
    vip = useVip();
  const [state, setState] = useState<JiuYinFpsUnlockState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [checking, setChecking] = useState(false), [checkNotice, setCheckNotice] = useState("");
  const reading = useRef<number | null>(null);
  const [requested, setRequested] = useState("300"),
    [requestedView, setRequestedView] = useState("250"),
    [acknowledged, setAcknowledged] = useState(false);
  const unlocked = vip.features.includes("jiuyin.fps");
  const requestedVisualRange = Number(requestedView);
  const validView = requestedView.trim() !== '' && Number.isInteger(requestedVisualRange) && requestedVisualRange >= 50 && requestedVisualRange <= (unlocked ? 1000 : 250);
  const actualView = validView ? 50 + Math.floor((requestedVisualRange - 50) / 2) * 2 : 0;
  const initialized = useRef(false);
  const requestedCap = Number(requested);
  const validCap =
    requested.trim() !== "" &&
    Number.isInteger(requestedCap) &&
    requestedCap >= 60 &&
    requestedCap <= (vip.features.includes('jiuyin.fps') ? 1000 : 300);
  const actualCap = validCap ? Math.floor(requestedCap / 3) * 3 : 0;
  const experimental = actualCap > 762;
  const changeCap = (value: string) => {
    setRequested(value);
    setAcknowledged(false);
  };
  const sequence = useRef(0),
    lock = useRef(false),
    root = useRef(gameRoot);
  root.current = gameRoot;
  const refresh = async (manual = false) => {
    if (!api || !gameRoot || lock.current || reading.current !== null) return;
    const version = ++sequence.current;
    reading.current = version;
    setChecking(true);
    if (manual) { setCheckNotice(""); setError(""); }
    try {
      const next = await api.state(gameRoot);
      if (version === sequence.current) {
        setState(next);
        if (!initialized.current && next.cap !== null && next.visualRange !== null) {
          setRequested(String(Math.min(next.cap, unlocked ? 1000 : 300)));
          setRequestedView(String(Math.min(next.visualRange, unlocked ? 1000 : 250)));
          initialized.current = true;
        }
        setError("");
        if (manual) {
          const time = new Date().toLocaleTimeString('zh-CN', {hour12:false});
          setCheckNotice(next.supported && next.cap !== null && next.visualRange !== null
            ? `${time} 检测完成：当前文件为 ${next.cap} FPS / 视野 ${next.visualRange}。仅刷新检测结果，不会修改文件或覆盖下方待应用值。${!next.hasBackup && (next.cap !== 300 || next.visualRange !== 250) ? '未找到原版备份；再次修改或恢复前需先导入原版备份。' : ''}`
            : `${time} 未能确认可用资源：${next.message || '请检查游戏目录和资源版本。'}`);
        }
      }
    } catch (e) {
      if (version === sequence.current) { const message = userError(e); setError(message); if (manual) setCheckNotice(`检测失败：${message}`); }
    } finally {
      if (reading.current === version) reading.current = null;
      if (version === sequence.current) setChecking(false);
    }
  };
  useEffect(() => {
    setState(null);
    setError("");
    setAcknowledged(false);
    setCheckNotice("");
    setChecking(false);
    initialized.current = false;
    void refresh();
    const timer=setInterval(()=>void refresh(),15000);
    return () => {
      clearInterval(timer);
      sequence.current++;
      reading.current = null;
    };
  }, [api, gameRoot, unlocked]);
  const run = async (kind: "apply" | "restore" | "importBackup") => {
    if (!api || lock.current) return;
    if (kind === "apply" && (!validCap || !validView || (experimental && !acknowledged))) {
      setError(unlocked ? "请输入帧率 60–1000、视野 50–1000 的整数，并确认高帧率保存风险。" : '请输入帧率 60–300、视野 50–250 的整数。如需调整更高上限，请联系客服。');
      return;
    }
    if (
      kind !== "importBackup" &&
      !requestConfirmation(
        kind === "apply" ? "调整九阴帧率与视野" : "恢复原版帧率与视野资源",
        kind === "apply"
          ? `将帧率上限调整到 ${actualCap} FPS${actualCap !== requestedCap ? `（输入 ${requestedCap}，按 3 FPS 步进换算）` : ""}，视野上限 ${actualView}。视野数值越大通常看得越远，但会增加显卡负载、可能降低帧数，实际距离受地图限制。${experimental ? "高帧率实验档可能造成设置保存溢出、重登回落或配置异常；保存或退出前需调回不超过 300。" : "实际帧率取决于场景和硬件。"}`
          : "恢复完整原版资源：帧率上限 300、视野上限 250。游戏账号已保存的设置不会被直接改写。",
        {
          confirmLabel:
            kind === "apply" ? "备份并应用两项设置" : "恢复原版",
          danger: kind === "apply" && experimental,
          note: "请先在游戏内把帧率调回不超过 300、视野调回原版范围并退出。修改可能被游戏更新覆盖或被完整性检查拒绝。管理员保留高上限；普通账号 VIP 到期后恢复帧率 300、视野 250（需软件运行、联网确认且游戏已退出）。",
        },
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setCheckNotice("");
    setChecking(false);
    sequence.current++;
    const selectedRoot = gameRoot;
    try {
      if (kind === "apply" && (requestedCap > 300 || requestedVisualRange > 250)) await requireVip("jiuyin.fps");
      const next =
        kind === "apply"
          ? await api.apply({
              gameRoot: selectedRoot,
              confirm: "apply-jiuyin-fps",
              cap: requestedCap,
              visualRange: requestedVisualRange,
              acknowledgeSaveRisk: acknowledged,
            })
          : kind === "restore"
            ? await api.restore({
                gameRoot: selectedRoot,
                confirm: "restore-jiuyin-fps",
              })
            : await api.importBackup(selectedRoot);
      if (root.current === selectedRoot && next) {
        setState(next);
        if (kind === 'restore') { setRequested('300'); setRequestedView('250'); setAcknowledged(false); }
      }
    } catch (e) {
      if (root.current === selectedRoot) {
        setError(
          e instanceof Error
            ? e.message.replace(
                /^Error invoking remote method '[^']+': (Error: )?/,
                "",
              )
            : String(e),
        );
        try {
          const latest = await api.state(selectedRoot);
          if (root.current === selectedRoot) setState(latest);
        } catch {
          /* Keep the original operation error visible. */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="jiuyin-fps-card" aria-labelledby="jiuyin-fps-title">
      <header>
        <span className="jiuyin-fps-icon">
          <Gauge size={22} />
        </span>
        <div>
          <h2 id="jiuyin-fps-title">
            九阴帧率与视野{" "}
            {unlocked && <span className="jiuyin-fps-vip">
              <Crown size={13} />
              管理员
            </span>}
          </h2>
          <p>{unlocked ? '帧率最高可填 1000 FPS · 视野最高 1000' : '帧率 60–300 FPS · 视野 50–250'}</p>
        </div>
        <button
          type="button"
          className="jiuyin-fps-button"
          disabled={busy || checking || !api || !gameRoot}
          aria-busy={checking}
          onClick={() => void refresh(true)}
        >
          <RefreshCw size={15} />
          {checking ? "检测中…" : "重新检测"}
        </button>
      </header>
      {(checking || checkNotice) && <p className="jiuyin-fps-check-notice" role="status" aria-live="polite">{checking ? '正在读取游戏资源文件并核对版本、备份…' : checkNotice}</p>}
      <div className="jiuyin-fps-summary">
        <div>
          <span>当前文件帧率上限</span>
          <strong>{state?.cap ? `${state.cap} FPS` : "未确认"}</strong>
        </div>
        <div><span>当前文件视野上限</span><strong>{state?.visualRange ?? '未确认'}</strong></div>
        <div>
          <span>原版备份</span>
          <strong>
            {state?.hasBackup
              ? "已验证"
              : state?.cap === 300 && state?.visualRange === 250
                ? "应用前自动创建"
                : "未导入"}
          </strong>
        </div>
        <div>
          <span>权限</span>
          <strong>{unlocked ? '软件管理员 · 联网核验' : '原版范围内可自行设置'}</strong>
        </div>
      </div>
      <div className="jiuyin-resource-inputs"><div className="jiuyin-fps-custom">
        <label htmlFor="jiuyin-fps-cap">目标上限（FPS）</label>
        <input
          id="jiuyin-fps-cap"
          type="number"
          min="60"
          max={unlocked ? 1000 : 300}
          step="1"
          value={requested}
          disabled={busy}
          onChange={(e) => changeCap(e.target.value)}
          aria-invalid={!validCap}
          aria-describedby="jiuyin-fps-conversion"
        />
        <div className="jiuyin-fps-actions">
          {(unlocked ? [300,360,600,1000] : [60,144,240,300]).map((n) => (
            <button
              type="button"
              key={n}
              className="jiuyin-fps-button"
              disabled={busy}
              aria-pressed={requestedCap === n}
              onClick={() => changeCap(String(n))}
            >
              {n}
            </button>
          ))}
        </div>
        <p id="jiuyin-fps-conversion">
          {validCap
            ? `应用后目标上限：${actualCap} FPS。游戏按 3 FPS 步进换算${unlocked ? '，输入 1000 时实际为 999' : ''}。`
            : unlocked ? '请输入 60–1000 之间的整数。' : "请输入 60–300 之间的整数。如需调整更高上限，请联系客服。"}
        </p>
        {experimental && (
          <label className="jiuyin-fps-risk">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={busy}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              我已了解：超过 762 FPS
              属于实验档，可能造成保存溢出、重登回落或配置异常。保存或退出游戏前，需要将游戏内滑条调回不超过
              300。
            </span>
          </label>
        )}
      </div>
      <div className="jiuyin-fps-custom">
        <label htmlFor="jiuyin-visual-range">视野范围上限</label>
        <input id="jiuyin-visual-range" type="number" min="50" max={unlocked ? 1000 : 250} step="2" value={requestedView} disabled={busy} aria-invalid={!validView} aria-describedby="jiuyin-view-warning" onChange={e=>setRequestedView(e.target.value)}/>
        <div className="jiuyin-fps-actions">{(unlocked ? [250,450,750,1000] : [100,150,200,250]).map(n=><button type="button" key={n} className="jiuyin-fps-button" disabled={busy} aria-pressed={requestedVisualRange===n} onClick={()=>setRequestedView(String(n))}>{n}</button>)}</div>
        <p id="jiuyin-view-warning">视野范围数值越大通常看得越远，但会增加显卡负载，可能降低帧数。实际显示距离受地图和游戏场景限制。</p>
        <p>{validView ? `应用后目标上限：${actualView}（内部数值，非米；按 2 步进向下换算）。` : `请输入 50–${unlocked ? 1000 : 250} 的整数。`} 修改后还需进入游戏视频设置调整视野滑条；不会自动扩大当前视野。高视距档位的实际效果尚未逐档实测。</p>
      </div></div>
      {!unlocked && <p>帧率超过 300 或视野超过 250，仅软件管理员可修改；如有需要请联系客服。<button className="jiuyin-fps-button" onClick={()=>window.dispatchEvent(new CustomEvent('synapsex:open-account',{detail:'contact'}))}>联系客服</button></p>}
      <p className="jiuyin-fps-status" role="status">
        {!api
          ? "请在新版桌面软件中使用此功能。"
          : !gameRoot
            ? "先在上方选择游戏目录。"
            : state?.autoRestoreMessage || state?.message || "正在检测资源版本…"}
      </p>
      <div className="jiuyin-fps-actions">
        <button
          type="button"
          className="jiuyin-fps-button is-primary"
          disabled={
            busy ||
            !state?.canApply ||
            !validCap ||
            !validView ||
            (actualCap === state?.cap && actualView === state?.visualRange) ||
            (experimental && !acknowledged)
          }
          onClick={() => void run("apply")}
        >
          <Gauge size={16} />
          {busy
            ? "处理中…"
            : actualCap === state?.cap && actualView === state?.visualRange
              ? "当前已是这两项上限"
              : unlocked || (requestedCap <= 300 && requestedVisualRange <= 250)
                ? "备份并应用两项设置"
                : "仅管理员可应用"}
        </button>
        <button
          type="button"
          className="jiuyin-fps-button"
          disabled={busy || !state?.canRestore}
          onClick={() => void run("restore")}
        >
          <RotateCcw size={15} />
          恢复原版 · 免费
        </button>
        {(state?.cap !== 300 || state?.visualRange !== 250) && !state?.hasBackup && gameRoot && (
          <button
            type="button"
            className="jiuyin-fps-button"
            disabled={busy}
            onClick={() => void run("importBackup")}
          >
            <FolderInput size={15} />
            导入原版备份
          </button>
        )}
      </div>
      <div className="jiuyin-fps-notes">
        <ShieldCheck size={16} />
        <div>
          <p>
            按已验证的资源数据识别版本，兼容同版本包头与索引差异，并保留本机原版备份；不修改
            DLL，不注入游戏进程。不兼容版本不会强制写入。正式功能要求退出游戏后操作。
          </p>
          <p>
            帧率超过 300 或视野超过 250，仅软件管理员可修改，两项使用条件相同。管理员使用时保留；普通账号 VIP 有效时保留已有高上限，到期后恢复帧率 300、视野 250。软件应用或导入原版备份后纳入恢复管理。自动恢复需软件运行、联网确认到期及游戏已退出；不会因断网或退出账号而误恢复。
          </p>
          <p>
            上限不代表实际帧率。尚未验证所有自定义档位的游戏内表现。{unlocked || (state?.cap || 0) > 762 ? '较高帧率可能增加功耗与温度；超过 762 的档位有额外保存风险，需单独确认。' : ''}
          </p>
        </div>
      </div>
      {state?.backupPath && (
        <p className="jiuyin-fps-path">备份位置：{state.backupPath}</p>
      )}
      {error && (
        <p role="alert" className="jiuyin-fps-error">
          {error}
        </p>
      )}
    </section>
  );
}
