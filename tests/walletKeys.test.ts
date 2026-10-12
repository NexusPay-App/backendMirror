import { protectWalletKey, revealWalletKey, redactAccount } from '../src/utils/walletKeys';
afterEach(() => { delete process.env.WALLET_KEY_ENCRYPTION_KEY; });
test('envelopes preserve existing signing keys and detect tampering', () => {
  process.env.WALLET_KEY_ENCRYPTION_KEY = 'a'.repeat(64);
  const original = `0x${'1'.repeat(64)}`;
  const encrypted = protectWalletKey(original);
  expect(encrypted).not.toContain(original); expect(revealWalletKey(encrypted)).toBe(original);
  expect(revealWalletKey(original)).toBe(original);
  const raw = Buffer.from(encrypted.slice(7), 'base64'); raw[30] ^= 1;
  expect(() => revealWalletKey('enc:v1:' + raw.toString('base64'))).toThrow();
  expect(redactAccount(null, { privateKey: original, password: 'hash', tempOtp: '123456', walletAddress: '0xabc' })).toEqual({ walletAddress: '0xabc' });
});
