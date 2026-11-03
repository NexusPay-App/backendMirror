import { clearSessionCookie, requestLogoutTokens } from '../src/services/sessions';

const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test('production logout reads both secure and legacy session cookies', () => {
  process.env.NODE_ENV = 'production';
  const req = {
    headers: {
      cookie: '__Host-nexuspay_session=current-token; nexuspay_session=legacy-token',
    },
  } as any;

  expect(requestLogoutTokens(req)).toEqual(['current-token', 'legacy-token']);
});

test('development logout reads only its active session cookie', () => {
  process.env.NODE_ENV = 'development';
  const req = {
    headers: { cookie: 'nexuspay_session=active-token' },
  } as any;

  expect(requestLogoutTokens(req)).toEqual(['active-token']);
});

test('production logout clears both current and legacy cookie names', () => {
  process.env.NODE_ENV = 'production';
  const res = { clearCookie: jest.fn() } as any;

  clearSessionCookie(res);

  expect(res.clearCookie).toHaveBeenCalledTimes(2);
  expect(res.clearCookie).toHaveBeenCalledWith('__Host-nexuspay_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
  expect(res.clearCookie).toHaveBeenCalledWith('nexuspay_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
});
