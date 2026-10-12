import { useEffect, useRef, useState } from "react";
import { hostApi, type SystemToolsCatalog } from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";
import { ExecutablePickerButton } from './ExecutablePickerButton';
const button =
  "rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs text-[var(--prism-text)] disabled:opacity-40";
export function SystemToolsPanel() {
  const [data, setData] = useState<SystemToolsCatalog | null>(null);
  const [path, setPath] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    hostApi
      .systemTools()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function open(item: SystemToolsCatalog["items"][number]) {
    if (lock.current) return;
    if (
      !requestConfirmation(
        item.title,
        `${item.detail}${item.needsExecutable ? `\n${path}` : ""}`,
        {
          confirmLabel: "打开 Windows 窗口",
          note: "这是系统原生入口，不是本软件内的自动优化。打开窗口不会自动修改设置，也不产生本软件的原值备份。",
        },
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setMessage(
        (
          await hostApi.openSystemTool(
            item.id,
            item.needsExecutable ? path : "",
          )
        ).message,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="my-6 text-[var(--prism-text)]">
      <h2 className="text-lg font-semibold">Windows 原生工具</h2>
      <p className="my-3 text-xs leading-6">
        以下设置在 Windows
        自身窗口操作，与本软件内可直接应用的高级参数分开。系统负责判断是否支持对应功能。
      </p>
      {error && (
        <p role="alert" className="my-3 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="my-3 text-sm">
          {message}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.items.map((item) => (
          <article
            className="flex flex-col rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5"
            key={item.id}
          >
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <p className="my-3 text-xs leading-6">{item.detail}</p>
            {item.needsExecutable && (
              <label className="mb-3 text-xs">
                游戏 EXE 路径
                <input
                  className={button + " mt-2 w-full"}
                  placeholder="C:\Games\Game\game.exe"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
                <ExecutablePickerButton className={button+" mt-2"} label="选择游戏 EXE" disabled={busy} onSelect={setPath} onError={setError}/>
              </label>
            )}
            <button
              className={button + " mt-auto self-start"}
              disabled={
                busy ||
                !item.available ||
                (item.needsExecutable && !path.trim())
              }
              onClick={() => void open(item)}
            >
              打开 Windows 窗口
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
