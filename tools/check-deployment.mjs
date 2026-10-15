// Read-only deployment checks. No credentials, wallet creation, or transfers.
import { writeFile } from 'node:fs/promises';
const base = new URL(process.env.NEXUSPAY_URL || 'https://nexuspayapp-ten.vercel.app');
const results = [];
async function check(name, path, validate) {
  try {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    results.push({ name, passed: response.ok && validate(body, response), status: response.status });
  } catch { results.push({ name, passed: false, error: 'Request failed or timed out' }); }
}
await check('Public website and BOT ecosystem links', '/onboarding', text => text.includes('https://botchain.ai') && text.includes('https://scan.botchain.ai'));
await check('Integration showcase', '/ecosystem', text => text.includes('BOT Chain'));
await check('API and database readiness', '/api/health/ready', text => JSON.parse(text).data?.status === 'ready');
await check('BOT testnet enabled; mainnet disabled', '/api/botchain/networks', text => {
  const networks = JSON.parse(text).data;
  const test = networks.find(n => n.chainId === 968);
  const main = networks.find(n => n.chainId === 677);
  return test?.enabled === true && test.transfers === true && main?.enabled === false && main.transfers === false;
});
const report = { checkedAt: new Date().toISOString(), deployment: base.origin, scope: 'testnet readiness; does not establish funded-payment success or ecosystem eligibility', results };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
