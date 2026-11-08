export class StartupFailure extends Error {
  readonly code: 'WINDOW_LOAD_FAILED' | 'INTERFACE_NOT_READY';
  constructor(code: 'WINDOW_LOAD_FAILED' | 'INTERFACE_NOT_READY') { super(code); this.code = code; }
}
export async function awaitInterfaceReady(load: () => Promise<void>, ready: Promise<void>, timeoutMs = 15000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([Promise.resolve().then(load).catch(() => { throw new StartupFailure('WINDOW_LOAD_FAILED'); }), ready]),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new StartupFailure('INTERFACE_NOT_READY')), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
