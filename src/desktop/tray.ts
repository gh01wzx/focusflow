import { Menu, nativeImage, Notification, Tray } from 'electron';
import type { BrowserWindow } from 'electron';
import { TRAY_ICON, TRAY_TEMPLATE } from './tray-icon.ts';

const labels = {
  en: { open: 'Open FocusFlow', quit: 'Quit FocusFlow', still: 'FocusFlow is still running. Use the tray icon to open or quit it.' },
  'zh-CN': { open: '\u6253\u5f00 FocusFlow', quit: '\u9000\u51fa FocusFlow', still: 'FocusFlow \u4ecd\u5728\u540e\u53f0\u8fd0\u884c\u3002\u53ef\u5728\u6258\u76d8\u56fe\u6807\u4e2d\u6253\u5f00\u6216\u9000\u51fa\u3002' },
};

// Closing the window keeps FocusFlow running in the Windows notification area or the macOS
// menu bar. Quit from the tray menu, or with Cmd+Q on a Mac, ends it.
export function keepInTray(window: BrowserWindow, options: { origin: string; title: string; onQuit(): void }) {
  const data = (process.platform === 'darwin' ? TRAY_TEMPLATE : TRAY_ICON).split(',')[1]!;
  const image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'), { scaleFactor: 2 });
  if (process.platform === 'darwin') image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setToolTip(options.title);
  let text = labels.en;
  let told = false;

  const show = () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  // The menu follows the interface language chosen in Settings.
  const refresh = async () => {
    try {
      const response = await fetch(options.origin + '/api/interface');
      const settings = await response.json() as { language?: unknown };
      text = settings.language === 'zh-CN' ? labels['zh-CN'] : labels.en;
    } catch { /* Keep the current language. */ }
    if (tray.isDestroyed()) return;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: text.open, click: show },
      { type: 'separator' },
      { label: text.quit, click: options.onQuit },
    ]));
  };
  void refresh();

  // On Windows a click opens the window; the right-click menu offers Quit.
  tray.on('click', () => { if (process.platform !== 'darwin') show(); });
  window.on('close', event => {
    event.preventDefault();
    window.hide();
    void refresh();
    if (process.platform === 'win32' && !told) {
      told = true;
      tray.displayBalloon({ title: 'FocusFlow', content: text.still });
    }
  });
  // Reminders: a tray balloon on Windows, which needs no installed shortcut, and a system
  // notification on a Mac. Clicking either opens the window.
  tray.on('balloon-click', show);
  const notify = (title: string, body: string) => {
    if (tray.isDestroyed()) return;
    if (process.platform === 'win32') tray.displayBalloon({ title, content: body });
    else if (Notification.isSupported()) {
      const note = new Notification({ title, body });
      note.on('click', show);
      note.show();
    }
  };
  return { show, notify, destroy: () => { if (!tray.isDestroyed()) tray.destroy(); } };
}
