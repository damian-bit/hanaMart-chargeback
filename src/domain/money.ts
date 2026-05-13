export const toMinor = (usd: number): number => Math.round(usd * 100);
export const toMajor = (minor: number): number => minor / 100;
