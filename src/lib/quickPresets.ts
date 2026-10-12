import type { SystemTweak, AdvancedSystemItem, ExpertItem } from "./api";

export type QuickTier = "basic" | "optimal" | "maximum";
export function quickTierFeature(tier: QuickTier): string | null {
  return tier === 'basic' ? null : `quick.${tier}`;
}
export const quickTiers = [
  {
    id: "basic" as const,
    name: "基础",
    detail: "游戏模式、后台录制、Game Bar 提示和 MMCSS 游戏任务。",
  },
  {
    id: "optimal" as const,
    name: "最佳",
    detail: "基础 + 后台内容、反馈任务、广告、诊断与输入学习限制。",
  },
  {
    id: "maximum" as const,
    name: "最大",
    detail: "最佳 + 桌面精简、可选服务、更新策略及应用权限限制。",
  },
];
const basic = [
  "game-mode",
  "disable-game-capture",
  "quiet-gamebar",
  "mmcss-game-priority",
];
const optimal = [
  ...basic,
  "disable-map-updates",
  "disable-silent-content",
  "disable-feedback-prompts",
  "disable-tailored-experiences",
  "limit-background-apps",
  "disable-edge-background",
];
const maximum = [
  ...optimal,
  "disable-startup-delay",
  "disable-power-throttling",
  "reduce-taskbar-animations",
  "faster-menu",
  "reduce-transparency",
  "disable-mouse-acceleration",
  "reduce-window-animations",
  "quiet-notifications",
];
const tasks = [
  "task-compatibility",
  "task-program-data",
  "task-disk-diagnostic",
  "task-feedback",
];
const services = [
  "service-search",
  "service-sysmain",
  "service-print",
  "service-error-report",
  "service-maps",
  "service-fax",
  "policy-driver-updates",
  "policy-update-notify",
  "policy-store-updates",
];
const privacyBest: Record<string, string> = {
  "privacy-advertising": "1",
  "privacy-feedback": "1",
  "privacy-ceip": "0",
  "privacy-ait": "0",
  "privacy-inventory": "1",
  "privacy-input-text": "1",
  "privacy-input-ink": "1",
  "activity-feed": "0",
  "activity-publish": "0",
  "activity-upload": "0",
};
const privacyMax: Record<string, string> = {
  ...privacyBest,
  "privacy-search-location": "0",
  "privacy-speech": "0",
  "privacy-location-provider": "1",
  "privacy-sensors": "1",
  "privacy-location-system": "1",
  "privacy-steps": "1",
  "privacy-wer": "1",
  "privacy-privacy-setup": "1",
  "privacy-setting-sync": "2",
  "privacy-cloud-search": "0",
  "clipboard-history": "0",
  "clipboard-sync": "0",
  telemetry: "1",
};
for (const id of [
  "account",
  "calendar",
  "calls",
  "camera",
  "contacts",
  "email",
  "location",
  "messages",
  "microphone",
  "motion",
  "phone",
  "radios",
  "tasks",
  "trusted-devices",
  "sync",
  "diagnostics",
  "voice",
  "voice-lock",
])
  privacyMax[`privacy-app-${id}`] = "2";

export type QuickSources = {
  system: SystemTweak[];
  advanced: AdvancedSystemItem[];
  expert: ExpertItem[];
  errors?: string[];
};
export type QuickRow = {
  key: string;
  id: string;
  kind: "system" | "advanced" | "expert";
  title: string;
  effect: string;
  current: string;
  desired: string;
  choice: string;
  available: boolean;
  applied: boolean;
  reason: string;
  signature: string;
  expert?: ExpertItem;
};
export function quickPlan(tier: QuickTier, sources: QuickSources): QuickRow[] {
  const systemIds =
    tier === "basic" ? basic : tier === "optimal" ? optimal : maximum;
  const advancedIds =
    tier === "basic"
      ? []
      : tier === "optimal"
        ? tasks
        : [...tasks, ...services];
  const expertChoices =
    tier === "basic" ? {} : tier === "optimal" ? privacyBest : privacyMax;
  return [
    ...systemIds.map((id) => {
      const s = sources.system.find((x) => x.id === id);
      return {
        key: `system:${id}`,
        id,
        kind: "system" as const,
        title: s?.title ?? id,
        effect: s ? `${s.impact} ${s.tradeoff}` : "此项目没有返回可用信息。",
        current: s?.applied ? "已是目标设置" : "尚未应用",
        desired: "应用此设置",
        choice: "apply",
        available: !!s,
        applied: !!s?.applied,
        reason: s ? "" : "本机未返回此项目",
        signature: JSON.stringify(s?.states),
      };
    }),
    ...advancedIds.map((id) => {
      const s = sources.advanced.find((x) => x.id === id);
      return {
        key: `advanced:${id}`,
        id,
        kind: "advanced" as const,
        title: s?.title ?? id,
        effect: s ? `${s.impact} ${s.tradeoff}` : "此项目没有返回可用信息。",
        current: s?.currentLabel ?? "未知",
        desired: "应用此设置",
        choice: "apply",
        available: !!s?.available,
        applied: !!s?.applied,
        reason: s?.reason ?? "本机未返回此项目",
        signature: JSON.stringify([s?.target, s?.currentLabel, s?.applied]),
      };
    }),
    ...Object.entries(expertChoices).map(([id, choice]) => {
      const s = sources.expert.find((x) => x.id === id),
        option = s?.options.find((x) => x.value === choice);
      return {
        key: `expert:${id}`,
        id,
        kind: "expert" as const,
        title: s?.title ?? id,
        effect: s?.effect ?? "此项目没有返回可用信息。",
        current:
          s?.options.find((x) => x.value === s.current)?.label ??
          s?.current ??
          "未知",
        desired: option?.label ?? choice,
        choice,
        available: !!s?.available && !!option,
        applied: s?.current === choice,
        reason: !s
          ? "本机未返回此项目"
          : !s.available
            ? s.reason
            : !option
              ? "当前系统不支持这一选项"
              : "",
        signature: s?.fingerprint ?? "",
        expert: s,
      };
    }),
  ];
}

export type QuickResult = {
  key: string;
  title: string;
  status:
    | "pending"
    | "running"
    | "applied"
    | "skipped"
    | "failed"
    | "cancelled"
    | "restoring"
    | "restored";
  message: string;
  backupId?: string;
  beforeSignature?: string;
};
// The caller supplies native APIs. No writes happen during plan construction or tier switching.
export async function executeQuickPlan(
  rows: QuickRow[],
  io: {
    read: (row: QuickRow) => Promise<QuickRow | undefined>;
    apply: (
      row: QuickRow,
    ) => Promise<{ ok: boolean; backupId: string; message?: string }>;
    cancelled: () => boolean;
    publish: (rows: QuickResult[]) => void;
  },
) {
  const results: QuickResult[] = rows.map((r) => ({
    key: r.key,
    title: r.title,
    beforeSignature: r.signature,
    status: "pending",
    message: "等待执行",
  }));
  const publish = () => io.publish(results.map((r) => ({ ...r })));
  publish(); // Journal must be saved before the first write. Storage failures abort.
  let halted = false;
  for (let i = 0; i < rows.length; i++) {
    const result = results[i],
      row = rows[i];
    if (halted || io.cancelled()) {
      result.status = "cancelled";
      result.message = "未执行";
      publish();
      continue;
    }
    try {
      const current = await io.read(row);
      if (io.cancelled()) {
        result.status = "cancelled";
        result.message = "已停止后续执行";
        publish();
        continue;
      }
      if (!current?.available)
        throw new Error(current?.reason || "项目已不可用，请重新检测");
      if (current.applied) {
        result.status = "skipped";
        result.message = "当前已是目标值，没有重复写入";
        publish();
        continue;
      }
      if (current.signature !== row.signature)
        throw new Error("当前值已变化，请重新预览并确认");
      result.status = "running";
      result.message = "正在备份并应用";
      publish();
      const response = await io.apply(current);
      result.backupId = response.backupId;
      if (!response.ok) throw new Error(response.message || "执行未成功");
      const after = await io.read(row);
      if (!after?.available || !after.applied)
        throw new Error("写入后未能确认目标值；请检查备份与项目状态");
      result.status = "applied";
      result.message = response.message || "已写入并回读目标值";
    } catch (e) {
      result.status = "failed";
      result.message = e instanceof Error ? e.message : String(e);
      result.backupId ||= result.message.match(
        /备份[：:]\s*(\d{8}-\d{6}-\d{3}(?:-[a-f0-9]{32})?)/,
      )?.[1];
      halted = true;
    }
    publish();
  }
  return results;
}

export async function restoreQuickResults(
  previous: QuickResult[],
  io: {
    read: (key: string) => Promise<QuickRow | undefined>;
    restore: (
      row: QuickRow,
      backupId: string,
    ) => Promise<{ ok: boolean; message?: string }>;
    cancelled: () => boolean;
    publish: (results: QuickResult[]) => void;
  },
) {
  const results = previous.map((r) => ({ ...r }));
  const publish = () => io.publish(results.map((r) => ({ ...r })));
  for (const result of [...results].reverse()) {
    if (io.cancelled()) break;
    if (!result.backupId || result.status === "restored") continue;
    try {
      if (
        !/^\d{8}-\d{6}-\d{3}(?:-[a-f0-9]{32})?$/.test(result.backupId) ||
        !result.beforeSignature
      )
        throw Error("记录缺少有效原值标识，请在对应设置页核对备份");
      const current = await io.read(result.key);
      if (io.cancelled()) break;
      if (!current?.available)
        throw Error(current?.reason || "当前项目不可读取");
      if (current.signature !== result.beforeSignature) {
        if (!current.applied)
          throw Error("当前值已被其他操作改变，未覆盖；请在对应设置页核对");
        result.status = "restoring";
        result.message = "正在恢复本次备份";
        publish();
        const response = await io.restore(current, result.backupId);
        if (!response.ok) throw Error(response.message || "恢复未成功");
        const after = await io.read(result.key);
        if (!after?.available || after.signature !== result.beforeSignature)
          throw Error("恢复后原值尚未核实");
      }
      result.status = "restored";
      result.message = "已恢复并核对本次应用前的值";
    } catch (e) {
      result.status = "failed";
      result.message = e instanceof Error ? e.message : String(e);
      publish();
      break;
    }
    publish();
  }
  return results;
}
