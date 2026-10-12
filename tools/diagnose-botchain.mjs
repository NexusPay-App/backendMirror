// Read-only capability probe. Never submits transactions or loads signing keys.
import { writeFile } from 'node:fs/promises';
const networks = [
  { name: 'botchain', id: 677, rpc: process.env.BOTCHAIN_RPC_URL || 'https://rpc.botchain.ai', bundler: process.env.BOTCHAIN_BUNDLER_URL || 'https://bundler.botchain.ai/rpc', usdt: '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C' },
  { name: 'botchain-testnet', id: 968, rpc: process.env.BOTCHAIN_TESTNET_RPC_URL || 'https://rpc.bohr.life', bundler: process.env.BOTCHAIN_TESTNET_BUNDLER_URL || 'https://bundler.bohr.life/rpc', usdt: '0x75edC9335175Fc0552D51D48439F229c10420fe3' },
];
const addresses = {
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  simpleAccountFactory: '0xBC88d6012b3bf8426C2851d3798cEB5257658332',
  thirdwebFactoryV07: '0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb',
  wbot: '0xD5452816194a3784dBa983426cCe7c122F4abd30',
};
async function rpc(url, method, params = []) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const result = await response.json();
    return result.error ? { error: result.error.message, code: result.error.code } : { result: result.result };
  } catch (error) { return { error: error.name === 'TimeoutError' ? 'Timed out' : 'RPC unavailable' }; }
}
const hex = block => `0x${block.toString(16)}`;
// Sequential timing probe: reveals provider latency and per-method failure rates.
async function latencyProbe(url, method, params = [], runs = 5) {
  const timings = []; let failures = 0; const errors = new Set();
  for (let i = 0; i < runs; i++) {
    const started = Date.now();
    const result = await rpc(url, method, params);
    if (result.error) { failures++; errors.add(String(result.error)); }
    timings.push(Date.now() - started);
  }
  return { runs, failures, errors: [...errors], minMs: Math.min(...timings), maxMs: Math.max(...timings), avgMs: Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) };
}
// Concurrent burst probe: detects rate limiting or request-size throttling.
async function burstProbe(url, count = 10) {
  const results = await Promise.all(Array.from({ length: count }, () => rpc(url, 'eth_blockNumber')));
  const errors = results.filter(r => r.error).map(r => String(r.error));
  return { sent: count, failures: errors.length, errors: [...new Set(errors)] };
}
// Historical eth_getLogs retention: a provider that only serves 'latest' cannot
// backfill deposits, so record explicitly how deep logs are readable.
async function historicalLogsProbe(url, address) {
  const head = await rpc(url, 'eth_blockNumber');
  if (head.error) return { supported: false, error: `head unavailable: ${head.error}` };
  const headBlock = Number(head.result);
  const to = Math.max(headBlock - 1000, 0);
  const from = Math.max(headBlock - 2000, 0);
  const result = await rpc(url, 'eth_getLogs', [{ fromBlock: hex(from), toBlock: hex(to), address }]);
  if (result.error) return { supported: false, range: `${from}-${to}`, error: String(result.error) };
  return { supported: true, range: `${from}-${to}`, logs: result.result.length };
}
// WebSocket subscribe + reconnect: verifies live heads and that a dropped socket
// can be re-established (BOT-01 WebSocket reconnect requirement).
function wsHeadProbe(url, timeoutMs = 10000) {
  return new Promise(resolve => {
    let socket; let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); try { socket?.close(); } catch { /* already closed */ } resolve(value); };
    const timer = setTimeout(() => finish({ connected: false, error: 'Timed out waiting for newHeads' }), timeoutMs);
    try { socket = new WebSocket(url); } catch (error) { clearTimeout(timer); return finish({ connected: false, error: String(error.message || error) }); }
    socket.onopen = () => socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] }));
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.id === 1 && message.error) return finish({ connected: false, error: String(message.error.message || message.error) });
      if (message.method === 'eth_subscription' && message.params?.result?.number) return finish({ connected: true, firstHead: Number(message.params.result.number) });
    };
    socket.onerror = () => finish({ connected: false, error: 'WebSocket error' });
    socket.onclose = () => finish({ connected: false, error: 'Socket closed before a head arrived' });
  });
}
async function websocketProbe(network) {
  const url = network.ws || (network.name === 'botchain' ? (process.env.BOTCHAIN_WS_URL || 'wss://ws-rpc.botchain.ai') : process.env.BOTCHAIN_TESTNET_WS_URL);
  if (!url) return { skipped: 'Testnet WebSocket URL is not documented; set BOTCHAIN_TESTNET_WS_URL to probe it' };
  const first = await wsHeadProbe(url);
  if (!first.connected) return { url, initialConnect: first, reconnect: { attempted: false } };
  const reconnect = await wsHeadProbe(url);
  return { url, initialConnect: first, reconnect };
}
const report = { checkedAt: new Date().toISOString(), networks: [] };
for (const network of networks) {
  const probes = {
    chainId: rpc(network.rpc, 'eth_chainId'),
    blockNumber: rpc(network.rpc, 'eth_blockNumber'),
    bundlerChainId: rpc(network.bundler, 'eth_chainId'),
    entryPoints: rpc(network.bundler, 'eth_supportedEntryPoints'),
    gasPrice: rpc(network.bundler, 'skandha_getGasPrice'),
    logs: rpc(network.rpc, 'eth_getLogs', [{ fromBlock: 'latest', toBlock: 'latest', address: addresses.entryPoint }]),
    historicalLogs: historicalLogsProbe(network.rpc, addresses.entryPoint),
    rpcLatency: latencyProbe(network.rpc, 'eth_blockNumber'),
    rpcBurst: burstProbe(network.rpc),
    websocket: websocketProbe(network),
  };
  for (const [label, address] of Object.entries({ ...addresses, usdt: network.usdt })) {
    probes[`${label}Code`] = rpc(network.rpc, 'eth_getCode', [address, 'latest']).then(x => x.result ? { deployed: x.result !== '0x', bytes: (x.result.length - 2) / 2 } : x);
  }
  for (const [label, address] of [['usdt', network.usdt], ['wbot', addresses.wbot]]) {
    probes[`${label}Decimals`] = rpc(network.rpc, 'eth_call', [{ to: address, data: '0x313ce567' }, 'latest']);
    probes[`${label}Symbol`] = rpc(network.rpc, 'eth_call', [{ to: address, data: '0x95d89b41' }, 'latest']);
  }
  report.networks.push({ name: network.name, expectedChainId: network.id, probes: Object.fromEntries(await Promise.all(Object.entries(probes).map(async ([key, promise]) => [key, await promise]))) });
}
const json = JSON.stringify(report, null, 2);
if (process.argv[2]) await writeFile(process.argv[2], json + '\n');
console.log(json);
if (report.networks.some(n => Number(n.probes.chainId.result) !== n.expectedChainId)) process.exitCode = 1;
