/** Parse payment amounts without binary floating-point rounding or silent truncation. */
export function parseAmount(value: string | number, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid token decimals');
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new Error('Send amount as a decimal string');
  const text = String(value);
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) throw new Error('Amount must be a positive decimal string');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n || units >= 2n ** 256n) throw new Error('Amount is outside the valid token range');
  return units;
}
export function formatAmount(units: bigint, decimals: number): string {
  const text = units.toString().padStart(decimals + 1, '0');
  if (!decimals) return text;
  return `${text.slice(0, -decimals)}.${text.slice(-decimals)}`.replace(/\.?0+$/, '');
}
