import type { MonitorTarget, MonitorTargets } from './api';

export function selectAutoGame(targets: MonitorTargets | null | undefined, preferredId = 0): MonitorTarget | null {
  const games = targets?.candidates.filter(target => target.autoEligible === true && target.processId > 4) ?? [];
  return games.find(target => target.processId === preferredId)
    ?? games.find(target => target.processId === targets?.detected?.processId)
    ?? games[0] ?? null;
}
