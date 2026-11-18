import { chinese } from './zh-CN.ts';

export function t(source: string, ...values: (string | number)[]): string {
  const format = document.documentElement.lang === 'zh-CN' && Object.hasOwn(chinese, source) ? chinese[source]! : source;
  return values.length ? format.replace(/\{(\d+)\}/g, (token, index: string) => String(values[Number(index)] ?? token)) : format;
}
