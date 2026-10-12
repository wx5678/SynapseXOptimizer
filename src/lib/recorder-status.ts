import { useSyncExternalStore } from 'react';
import { initialRecorderStatus, type RecorderStatus } from './session-recorder';
let current = initialRecorderStatus;
const listeners = new Set<() => void>();
export function setRecorderStatus(status: RecorderStatus) { current = status; for (const listener of listeners) listener(); }
export function useRecorderStatus() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current); }
