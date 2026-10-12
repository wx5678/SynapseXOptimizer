import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ConfirmationRequest = {
  title: string;
  detail: string;
  note: string;
  confirmLabel: string;
  danger: boolean;
  trigger: HTMLElement | null;
  items?: string[];
};

let presentConfirmation: ((request: ConfirmationRequest) => void) | null = null;
let bypassNextConfirmation = false;

function isDangerousTitle(title: string) {
  return /(删除|禁用|停用|移除|清空|修复)/.test(title);
}

export function requestConfirmation(title: string, detail: string, options: { note?: string; confirmLabel?: string; danger?: boolean; items?: string[] } = {}) {
  if (bypassNextConfirmation) {
    bypassNextConfirmation = false;
    return true;
  }
  if (!presentConfirmation) return false;
  presentConfirmation({
    title,
    detail,
    note: options.note ?? (isDangerousTitle(title) ? "执行前会保留可恢复记录；删除本地报告或方案除外。" : "确认后会先保存当前原值，再执行修改。"),
    confirmLabel: options.confirmLabel ?? (isDangerousTitle(title) ? "确认执行" : "备份并继续"),
    danger: options.danger ?? isDangerousTitle(title),
    trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    items: options.items ? [...options.items] : undefined,
  });
  return false;
}

export function ConfirmationDialogHost() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    presentConfirmation = setRequest;
    return () => { presentConfirmation = null; };
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setRequest(null); }
      if (event.key === "Tab") {
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex="0"]') ?? []);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      request.trigger?.focus({ preventScroll: true });
    };
  }, [request]);

  const approve = () => {
    if (!request) return;
    const trigger = request.trigger;
    bypassNextConfirmation = true;
    setRequest(null);
    window.setTimeout(() => {
      if (trigger?.isConnected) trigger.click();
      else bypassNextConfirmation = false;
    }, 30);
  };

  return (
    <AnimatePresence>
      {request && (
        <motion.div className="confirm-backdrop desktop-no-drag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setRequest(null); }}>
          <motion.section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="synapsex-confirm-title" aria-describedby="synapsex-confirm-detail" className={`confirm-dialog ${request.danger ? "confirm-danger" : ""}`} initial={{ opacity: 0, scale: 0.98, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 8 }} transition={{ duration: 0.18 }}>
            <button aria-label="关闭确认窗口" className="confirm-close" onClick={() => setRequest(null)}><X size={17} /></button>
            <div className="relative z-10">
              <div className="confirm-icon">{request.danger ? <AlertTriangle size={23} /> : <ShieldCheck size={23} />}</div>
              <p className="mt-5 text-[12px] font-semibold tracking-wider text-[var(--prism-accent-strong)]">操作确认</p>
              <h2 id="synapsex-confirm-title" className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.035em] text-white">{request.title}</h2>
              <p id="synapsex-confirm-detail" className="mt-4 whitespace-pre-line text-[14px] leading-6 text-slate-300">{request.detail}</p>
              {!!request.items?.length && <details className="mt-4 rounded-xl border border-[var(--prism-line)] p-3 text-[var(--prism-text)]"><summary className="cursor-pointer text-sm">查看本次 {request.items.length} 项完整清单</summary><ul className="mt-3 max-h-48 overflow-y-auto space-y-2 text-xs leading-5" aria-label="本次修改清单">{request.items.map((item,index)=><li key={index}>{index+1}. {item}</li>)}</ul></details>}
              <div className="confirm-note mt-5"><Check size={15} /><span>{request.note}</span></div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button autoFocus className="prism-button-secondary px-4 py-3 text-[13px] font-semibold" onClick={() => setRequest(null)}>取消</button>
                <button className={request.danger ? "confirm-danger-button" : "prism-button-primary px-4 py-3 text-[13px] font-bold"} onClick={approve}>{request.confirmLabel}</button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
