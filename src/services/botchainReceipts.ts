import { decodeEventLog, parseAbi, type Hex } from 'viem';
import { BOT_ENTRY_POINT, getBotConfig, type BotNetwork, type BotToken } from '../config/botchain';
import { botRpc } from './botchainRpc';
const userOpEvents = parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const transfers = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
export type RpcLog = { address: string; topics: Hex[]; data: Hex; logIndex: Hex };
export function verifyBotExecutionDetails(logs: RpcLog[], expected: { userOpHash: string; sender: string; recipient: string; tokenAddress: string | null; amountUnits: string }): { status: 'confirmed' | 'failed'; actualGasCost: string; transferLogIndex?: string } {
  let operationStart = 0;
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.address.toLowerCase() !== BOT_ENTRY_POINT.toLowerCase()) continue;
    let event;
    try { event = decodeEventLog({ abi: userOpEvents, data: log.data, topics: log.topics as [Hex, ...Hex[]] }); } catch { continue; }
    const args: any = event.args;
    const userOpHash = args?.userOpHash ?? args?.[0];
    const sender = args?.sender ?? args?.[1];
    const success = args?.success ?? args?.[4];
    if (String(userOpHash).toLowerCase() !== expected.userOpHash.toLowerCase()) { operationStart = i + 1; continue; }
    if (String(sender).toLowerCase() !== expected.sender.toLowerCase()) throw new Error('UserOperation sender mismatch');
    const actualGasCost = String(args.actualGasCost ?? args[5]);
    if (!success) return { status: 'failed', actualGasCost };
    if (!expected.tokenAddress) return { status: 'confirmed', actualGasCost };
    const paid = logs.slice(operationStart, i).find(transfer => {
      if (transfer.address.toLowerCase() !== expected.tokenAddress!.toLowerCase()) return false;
      try {
        const event: any = decodeEventLog({ abi: transfers, data: transfer.data, topics: transfer.topics as [Hex, ...Hex[]] });
        const tArgs: any = event.args;
        const from = tArgs?.from ?? tArgs?.[0];
        const to = tArgs?.to ?? tArgs?.[1];
        const value = tArgs?.value ?? tArgs?.[2];
        return String(from).toLowerCase() === expected.sender.toLowerCase() && String(to).toLowerCase() === expected.recipient.toLowerCase() && value === BigInt(expected.amountUnits);
      } catch { return false; }
    });
    if (!paid) throw new Error('Successful operation has no matching token Transfer event');
    return { status: 'confirmed', actualGasCost, transferLogIndex: BigInt(paid.logIndex).toString() };
  }
  throw new Error('Canonical receipt has no matching UserOperation event');
}
export function verifyBotExecution(logs: RpcLog[], expected: Parameters<typeof verifyBotExecutionDetails>[1]) {
  return verifyBotExecutionDetails(logs, expected).status;
}
export async function readBotTransferStatus(transfer: { network: BotNetwork; userOpHash?: string; sender: string; recipient: string; token: BotToken; amountUnits: string }) {
  if (!transfer.userOpHash) return { status: 'preparing' };
  const n = getBotConfig(transfer.network);
  const op = await botRpc<{ success: boolean; sender: string; entryPoint?: string; receipt: { transactionHash: Hex } } | null>(n.bundler, 'eth_getUserOperationReceipt', [transfer.userOpHash]);
  if (!op) return { status: 'pending' };
  // Some bundlers omit entryPoint on the receipt; only enforce the check when present.
  if (op.sender.toLowerCase() !== transfer.sender.toLowerCase() || (op.entryPoint && op.entryPoint.toLowerCase() !== BOT_ENTRY_POINT.toLowerCase())) throw new Error('Bundler receipt identity mismatch');
  const receipt = await botRpc<{ status: Hex; blockNumber: Hex; blockHash: Hex; logs: RpcLog[] } | null>(n.rpc, 'eth_getTransactionReceipt', [op.receipt.transactionHash]);
  if (!receipt) return { status: 'pending' };
  const [head, block] = await Promise.all([botRpc<Hex>(n.rpc, 'eth_blockNumber'), botRpc<{ hash: Hex } | null>(n.rpc, 'eth_getBlockByNumber', [receipt.blockNumber, false])]);
  const confirmations = Math.max(3, Number(process.env.BOTCHAIN_CONFIRMATIONS) || 3);
  if (!block || block.hash !== receipt.blockHash || BigInt(head) - BigInt(receipt.blockNumber) + 1n < BigInt(confirmations)) return { status: 'pending' };
  const details = receipt.status === '0x1' ? verifyBotExecutionDetails(receipt.logs, {
    userOpHash: transfer.userOpHash,
    sender: transfer.sender,
    recipient: transfer.recipient,
    tokenAddress: n.tokens[transfer.token]?.address ?? null,
    amountUnits: transfer.amountUnits,
  }) : { status: 'failed' };
  const status = details.status;
  if ((status === 'confirmed') !== (op.success === true)) throw new Error('Bundler and canonical receipt disagree');
  return { ...details, actualFeeUnits: 'actualGasCost' in details ? details.actualGasCost : undefined, transactionHash: op.receipt.transactionHash, blockNumber: BigInt(receipt.blockNumber).toString() };
}
