import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const PREFIX = 'enc:v1:';
function key(): Buffer | null {
  const raw = process.env.WALLET_KEY_ENCRYPTION_KEY;
  if (!raw) return null;
  if (!/^[a-f\d]{64}$/i.test(raw)) throw new Error('WALLET_KEY_ENCRYPTION_KEY must be 32 bytes encoded as hex');
  return Buffer.from(raw, 'hex');
}
export function protectWalletKey(value: string): string {
  if (!value || value.startsWith(PREFIX)) return value;
  const secret = key();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('Wallet encryption is required for production writes');
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function revealWalletKey(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;
  const secret = key();
  if (!secret) throw new Error('Wallet decryption key is not configured');
  const data = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
export function redactAccount(_document: unknown, value: Record<string, unknown>) {
  for (const field of ['privateKey', 'password', 'tempOtp', 'otpExpires', 'googleId']) delete value[field];
  return value;
}
