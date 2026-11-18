import { createContext } from 'react';
import type { InterfaceSettings } from '../../src/shared/interface.ts';

export const InterfaceContext = createContext<{
  settings: InterfaceSettings;
  save(value: InterfaceSettings): Promise<void>;
  reload(): Promise<InterfaceSettings>;
  readError: boolean;
} | null>(null);
