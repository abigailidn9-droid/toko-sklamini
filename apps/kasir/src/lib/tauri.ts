type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

type TauriWindow = Window & {
  isTauri?: boolean;
  __TAURI__?: { core?: { invoke: Invoke } };
  __TAURI_INTERNALS__?: { invoke?: Invoke };
};

function tauriWindow() {
  return window as TauriWindow;
}

export function isTauriRuntime() {
  const w = tauriWindow();
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}

export function tauriInvoke(): Invoke | null {
  const w = tauriWindow();
  if (w.__TAURI__?.core?.invoke) {
    return (cmd, args) => w.__TAURI__!.core!.invoke(cmd, args);
  }
  if (w.__TAURI_INTERNALS__?.invoke) {
    return (cmd, args) => w.__TAURI_INTERNALS__!.invoke!(cmd, args ?? {});
  }
  return null;
}
