jest.mock('thirdweb/wallets', () => ({
  privateKeyToAccount: jest.fn(() => ({ address: '0xowner' })),
}));

import {
  legacySignerEnabled,
  privateKeyToAccount,
} from '../src/services/signingBoundary';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  LEGACY_SIGNER_ENABLED: process.env.LEGACY_SIGNER_ENABLED,
};

afterAll(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('refuses legacy signing when no activation flag is configured', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.LEGACY_SIGNER_ENABLED;

  expect(legacySignerEnabled()).toBe(false);
  expect(() => privateKeyToAccount({ privateKey: '0xfixture' } as never)).toThrow(
    /Signing is paused/,
  );
  try {
    privateKeyToAccount({ privateKey: '0xfixture' } as never);
  } catch (error) {
    expect(error).toMatchObject({
      code: 'SIGNING_MIGRATION_REQUIRED',
      status: 503,
    });
  }
});

test('signs after the deployment explicitly activates legacy signing', () => {
  process.env.NODE_ENV = 'production';
  process.env.LEGACY_SIGNER_ENABLED = 'true';

  expect(legacySignerEnabled()).toBe(true);
  expect(privateKeyToAccount({ privateKey: '0xfixture' } as never)).toEqual({
    address: '0xowner',
  });
});

test('only the literal value true activates signing', () => {
  process.env.NODE_ENV = 'production';
  process.env.LEGACY_SIGNER_ENABLED = '1';
  expect(legacySignerEnabled()).toBe(false);

  process.env.LEGACY_SIGNER_ENABLED = 'yes';
  expect(legacySignerEnabled()).toBe(false);
});

test('isolated tests remain exempt', () => {
  process.env.NODE_ENV = 'test';
  delete process.env.LEGACY_SIGNER_ENABLED;
  expect(legacySignerEnabled()).toBe(true);
});
