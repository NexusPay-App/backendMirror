import { encodeEventTopics, encodeAbiParameters, parseAbi, type Hex } from 'viem';
import { verifyBotExecution, verifyBotExecutionDetails, type RpcLog } from '../src/services/botchainReceipts';
import { BOT_ENTRY_POINT, getBotConfig } from '../src/config/botchain';
const sender = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const userOpHash = ('0x' + 'ab'.repeat(32)) as Hex;
const tokenAddress = getBotConfig('botchain').tokens.USDT.address;
const expected = { sender, recipient, userOpHash, tokenAddress, amountUnits: '1234567' };
const transferAbi = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const userOpAbi = parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
function transfer(value = 1234567n, address = tokenAddress): RpcLog { return { address, logIndex: '0x1', topics: encodeEventTopics({ abi: transferAbi, eventName: 'Transfer', args: { from: sender, to: recipient } }) as Hex[], data: encodeAbiParameters([{type:'uint256'}], [value]) }; }
function operation(success = true, hash = userOpHash): RpcLog { return { address: BOT_ENTRY_POINT, logIndex: '0x2', topics: encodeEventTopics({ abi: userOpAbi, eventName: 'UserOperationEvent', args: { userOpHash: hash, sender, paymaster: '0x0000000000000000000000000000000000000000' } }) as Hex[], data: encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}], [0n,success,123n,123n]) }; }
test('confirms exact transfer inside successful operation', () => expect(verifyBotExecution([transfer(),operation()], expected)).toBe('confirmed'));
test('outer success cannot turn a reverted operation into payment success', () => expect(verifyBotExecution([operation(false)], expected)).toBe('failed'));
test('rejects incorrect amount, token or absent operation', () => {
  expect(() => verifyBotExecution([transfer(1234566n),operation()], expected)).toThrow();
  expect(() => verifyBotExecution([transfer(1234567n, sender),operation()], expected)).toThrow();
  expect(() => verifyBotExecution([transfer()], expected)).toThrow();
});
test('does not credit a transfer from a preceding operation in the same bundle', () => {
  expect(() => verifyBotExecution([transfer(),operation(true, ('0x' + 'cd'.repeat(32)) as Hex),operation()], expected)).toThrow();
});
test('keeps mainnet and testnet disabled until explicitly enabled', () => {
  expect(getBotConfig('botchain').enabled).toBe(false);
  expect(getBotConfig('botchain-testnet').chain.id).toBe(968);
  expect(getBotConfig('botchain').tokens.BOT.address).toBeNull();
  expect(getBotConfig('botchain').tokens.USDT.address).not.toBe(getBotConfig('botchain-testnet').tokens.USDT.address);
});
test('confirms native BOT with no token address', () => {
  expect(verifyBotExecution([operation()], { ...expected, tokenAddress: null })).toBe('confirmed');
});
test('does not crash when decoded args are positional or missing', () => {
  // Named-arg decode failure path: empty topics still hits the catch/continue.
  const empty: RpcLog = { address: BOT_ENTRY_POINT, logIndex: '0x0', topics: [], data: '0x' };
  expect(() => verifyBotExecution([empty], expected)).toThrow('Canonical receipt has no matching UserOperation event');
});

test('extracts the actual operation fee and token log index from canonical events', () => {
  expect(verifyBotExecutionDetails([transfer(), operation()], expected)).toEqual({ status: 'confirmed', actualGasCost: '123', transferLogIndex: '1' });
});
