import { isInterface } from '../shared/interface.ts';
import type { InterfaceSettings } from '../shared/interface.ts';
export async function interfaceSettings(value?: InterfaceSettings) {
  const response = await fetch('/api/interface', value ? { method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(value) } : {cache:'no-store'});
  const result: unknown = await response.json();
  if (!response.ok || !isInterface(result)) throw new Error('Could not read or save settings.');
  return result;
}
