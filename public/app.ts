function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing page element: ${selector}`);
  return element;
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') throw new Error('Invalid server response');
  return value;
}

const form = requireElement<HTMLFormElement>('#note-form');
const note = requireElement<HTMLTextAreaElement>('#note');
const status = requireElement<HTMLParagraphElement>('#status');
const buttons = [...document.querySelectorAll('button')];

async function request(path: string, value?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, value === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('Invalid server response');
  const data = payload as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '操作失败，请重新启动程序。');
  return data;
}

async function perform(action: () => Promise<void>): Promise<void> {
  buttons.forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { status.textContent = error instanceof Error ? error.message : 'Unexpected error'; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void perform(async () => {
    await request('/api/probe', { note: note.value });
    status.textContent = '已保存。现在可以关闭程序，再次打开检查文字是否保留。';
  });
});
requireElement<HTMLButtonElement>('#backup').addEventListener('click', () => void perform(async () => {
  const result = await request('/api/backup', {});
  const name = readString(result, 'name');
  status.textContent = `已备份最后一次保存的内容，并通过完整性检查：${name}`;
}));
void perform(async () => {
  const data = await request('/api/probe');
  note.value = readString(data, 'note');
  status.textContent = '本地数据已读取。';
});

export {};
