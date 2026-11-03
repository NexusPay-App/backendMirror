import { validateEnvironment } from '../src/config/env';

const keys = [
  'NODE_ENV',
  'JWT_SECRET',
  'THIRDWEB_SECRET_KEY',
  'WALLET_KEY_ENCRYPTION_KEY',
  'SECURITY_STORE_URL',
  'APP_ORIGIN',
  'SECURITY_ORIGIN',
  'WEBAUTHN_RP_ID',
  'SECURITY_RP_ID',
  'RATE_LIMIT_SECRET',
  'PROD_MONGO_URL',
  'MONGODB_URI',
  'DEV_MONGO_URL',
  'ENABLE_MPESA',
  'ENABLE_RECLAIM',
  'ENABLE_SMS',
];
const original = new Map(keys.map((key) => [key, process.env[key]]));

afterAll(() => {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('production accepts the existing MONGODB_URI as its database URL', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'j'.repeat(32);
  process.env.THIRDWEB_SECRET_KEY = 'thirdweb-test-secret';
  process.env.WALLET_KEY_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.SECURITY_STORE_URL = 'mongodb://security.example';
  process.env.APP_ORIGIN = 'https://app.nexuspayapp.xyz';
  process.env.SECURITY_ORIGIN = 'https://security.nexuspayapp.xyz';
  process.env.WEBAUTHN_RP_ID = 'app.nexuspayapp.xyz';
  process.env.SECURITY_RP_ID = 'security.nexuspayapp.xyz';
  process.env.RATE_LIMIT_SECRET = 'r'.repeat(32);
  process.env.MONGODB_URI = 'mongodb://production.example';
  process.env.DEV_MONGO_URL = 'mongodb://development.example';
  delete process.env.PROD_MONGO_URL;
  delete process.env.ENABLE_MPESA;
  delete process.env.ENABLE_RECLAIM;
  delete process.env.ENABLE_SMS;

  expect(validateEnvironment).not.toThrow();
});
