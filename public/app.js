const form = document.querySelector('#note-form');
const note = document.querySelector('#note');
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];

async function request(path, value) {
  const response = await fetch(path, value === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败，请重新启动程序。');
  return data;
}

async function perform(action) {
  buttons.forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { status.textContent = error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void perform(async () => {
    await request('/api/probe', { note: note.value });
    status.textContent = '已保存。现在可以关闭程序，再次打开检查文字是否保留。';
  });
});
document.querySelector('#backup').addEventListener('click', () => void perform(async () => {
  const result = await request('/api/backup', {});
  status.textContent = `已备份最后一次保存的内容，并通过完整性检查：${result.name}`;
}));
void perform(async () => {
  const data = await request('/api/probe');
  note.value = data.note;
  status.textContent = '本地数据已读取。';
});
