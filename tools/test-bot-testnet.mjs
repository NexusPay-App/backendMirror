// Explicitly testnet-only acceptance. Requires credentials for a dedicated QA account.
// Never count these automated fixture transfers as real-user ecosystem activity.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = process.env.NEXUSPAY_URL || 'https://nexuspayapp-ten.vercel.app';
const network = 'botchain-testnet';
if (!process.argv.includes('--execute-testnet')) throw new Error('Pass --execute-testnet to authorize test-asset transfers');
if (!process.env.BOT_TEST_SESSION_FILE || !process.env.BOT_TEST_RECIPIENT || !process.env.BOT_TEST_MERCHANT_ID) throw new Error('Provide dedicated QA session, recipient and merchant configuration');
const session = JSON.parse(await readFile(process.env.BOT_TEST_SESSION_FILE, 'utf8'));
const output = process.env.BOT_TEST_REPORT || 'docs/testnet-acceptance.json';
let report;
try { report = JSON.parse(await readFile(output, 'utf8')); } catch { report = { runId: randomUUID(), startedAt: new Date().toISOString(), scope: 'Automated QA fixtures on chain 968, not organic adoption', payments: [] }; }
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
async function api(path, body, key) {
  const response = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000),
  });
  const json = await response.json();
  return { status: response.status, ...json };
}
const caps = await api('/botchain/networks');
if (!caps.data?.some(n => n.id === network && n.chainId === 968 && n.enabled && n.transfers) || caps.data.some(n => n.chainId === 677 && n.enabled)) throw new Error('Testnet-only guard failed');
const balances = await api(`/botchain/${network}/balances`);
if (!balances.success) throw new Error(`QA authentication or balance check failed: ${balances.status}`);
report.sender = balances.data.address;
report.initialBalances ??= balances.data.balances;
const rejected = await api(`/botchain/${network}/transfers`, { recipientIdentifier: process.env.BOT_TEST_RECIPIENT, tokenSymbol: 'USDT', amount: '0.01', password: `invalid-${randomUUID()}` }, `${report.runId}-auth`);
if (rejected.status !== 401) throw new Error('Wrong password was not rejected');
report.passwordRejection = { status: rejected.status, code: rejected.error?.code };
await save();
for (const test of [
  { name: 'BOT to registered recipient', recipientIdentifier: process.env.BOT_TEST_RECIPIENT, tokenSymbol: 'BOT', amount: '0.01' },
  { name: 'USDT to registered recipient', recipientIdentifier: process.env.BOT_TEST_RECIPIENT, tokenSymbol: 'USDT', amount: '0.01' },
  { name: 'USDT merchant payment', merchantId: process.env.BOT_TEST_MERCHANT_ID, tokenSymbol: 'USDT', amount: '0.01' },
  { name: 'Wrap test BOT into WBOT', keySuffix: 'wrap', recipientIdentifier: '0xD5452816194a3784dBa983426cCe7c122F4abd30', tokenSymbol: 'BOT', amount: '0.01' },
  { name: 'WBOT to registered recipient', recipientIdentifier: process.env.BOT_TEST_RECIPIENT, tokenSymbol: 'WBOT', amount: '0.001' },
]) {
  const key = `${report.runId}-${test.tokenSymbol}-${test.keySuffix || (test.merchantId ? 'merchant' : 'send')}`;
  let entry = report.payments.find(p => p.key === key);
  if (!entry) { entry = { name: test.name, key }; report.payments.push(entry); await save(); }
  if (entry.payment?.status === 'confirmed') { console.log(`${test.name}: previously confirmed`); continue; }
  const body = { ...test, password: session.password }; delete body.name; delete body.keySuffix;
  const response = await api(`/botchain/${network}/transfers`, body, key);
  if (!response.success || !response.data?.id) throw new Error(`${test.name}: ${response.error?.code || response.status}`);
  entry.payment = response.data;
  await save();
  const retry = await api(`/botchain/${network}/transfers`, body, key);
  if (retry.data?.id !== entry.payment.id) throw new Error('Idempotent retry returned a different payment');
  entry.idempotencyVerified = true;
  for (let i = 0; i < 36 && !['confirmed', 'failed'].includes(entry.payment.status); i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const current = await api(`/botchain/${network}/transfers/${entry.payment.id}`);
    if (current.data?.id) entry.payment = current.data;
    await save();
  }
  console.log(`${test.name}: ${entry.payment.status} ${entry.payment.transactionHash || ''}`);
  if (entry.payment.status !== 'confirmed') throw new Error(`${test.name}: ${entry.payment.failureCode || entry.payment.status}; inspect the tracked payment before retrying`);
}
const history = await api(`/botchain/${network}/transfers`);
report.historyVerified = report.payments.every(entry => history.data?.some(p => p.id === entry.payment.id));
report.completedAt = new Date().toISOString();
await save();
if (!report.historyVerified) throw new Error('Confirmed payments missing from history');
console.log('Testnet acceptance passed. Receipt evidence saved without credentials.');
