import { createHash } from "node:crypto";
import { Interface, isAddress } from "ethers";
import { securityStore } from "../models/security";
import { auditEvent } from "./securityAudit";
import { PaymentIntent } from "./paymentIntents";
const abi = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
]);
const transfer = abi.getEvent("Transfer")!.topicHash;
const approval = abi.getEvent("Approval")!.topicHash;
const authorityAbi = new Interface([
  "event AdminUpdated(address indexed signer, bool isAdmin)",
  "event Upgraded(address indexed implementation)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event SignerPermissionsUpdated(address indexed authorizingSigner, address indexed targetSigner, (address signer, uint8 isAdmin, address[] approvedTargets, uint256 nativeTokenLimitPerTransaction, uint128 permissionStartTimestamp, uint128 permissionEndTimestamp, uint128 reqValidityStartTimestamp, uint128 reqValidityEndTimestamp, bytes32 uid) permissions)",
]);
export function internalNativeMovements(root: any) {
  const movements: { from: string; to: string; value: string; path: string }[] =
    [];
  let visited = 0;
  function visit(frame: any, path: string, depth: number) {
    if (++visited > 100_000 || depth > 128)
      throw new Error("Trace exceeds supported bounds");
    if (!frame || typeof frame !== "object") throw new Error("Malformed trace");
    if (frame.error) return;
    if (
      depth > 0 &&
      ["CALL", "CREATE", "CREATE2", "SELFDESTRUCT"].includes(frame.type) &&
      BigInt(frame.value || "0x0") > 0n
    ) {
      if (!isAddress(frame.from) || !isAddress(frame.to))
        throw new Error("Malformed native movement");
      movements.push({
        from: frame.from,
        to: frame.to,
        value: BigInt(frame.value).toString(),
        path,
      });
    }
    if (frame.calls !== undefined && !Array.isArray(frame.calls))
      throw new Error("Malformed nested trace");
    for (const [index, child] of (frame.calls || []).entries())
      visit(child, `${path}.${index}`, depth + 1);
  }
  visit(root, "0", 0);
  return movements;
}
export type Rpc = (method: string, params?: unknown[]) => Promise<any>;
export function readOnlyRpc(url: string): Rpc {
  const allowed = new Set([
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_getLogs",
    "eth_getCode",
    "eth_call",
    "eth_getTransactionReceipt",
    "debug_traceBlockByNumber",
  ]);
  return async (method, params = []) => {
    if (!allowed.has(method)) throw new Error("RPC method is not read-only");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("RPC unavailable");
    const result = (await response.json()) as any;
    if (result.error || result.result === undefined)
      throw new Error("RPC failed");
    return result.result;
  };
}
export async function monitorChain(input: {
  chainId: number;
  addresses: string[];
  tokens: string[];
  rpc: Rpc;
  startBlock: number;
  confirmations: number;
  traceInternalNative?: boolean;
  monitorAuthorityEvents?: boolean;
}) {
  if (
    ![677, 8453, 42161].includes(input.chainId) ||
    !Number.isSafeInteger(input.startBlock) ||
    input.startBlock < 0 ||
    !Number.isSafeInteger(input.confirmations) ||
    input.confirmations < 1
  )
    throw new Error("Invalid monitoring configuration");
  const store = await securityStore();
  const id = String(input.chainId);
  const checkpoint = await store.Checkpoint.findById(id).lean();
  if (checkpoint?.status === "reorg-review-required")
    throw new Error("Reorganization requires operator review");
  const head = Number(BigInt(await input.rpc("eth_blockNumber")));
  if (Number(BigInt(await input.rpc("eth_chainId"))) !== input.chainId)
    throw new Error("RPC chain mismatch");
  if (checkpoint) {
    const previous = await input.rpc("eth_getBlockByNumber", [
      `0x${checkpoint.blockNumber.toString(16)}`,
      false,
    ]);
    if (previous?.hash !== checkpoint.blockHash) {
      await auditEvent({
        id: `reorg:${id}:${checkpoint.blockNumber}:${previous?.hash || "missing"}`,
        source: "chain",
        action: "chain.reorganization",
        outcome: "observed",
        severity: "critical",
        chainId: input.chainId,
      });
      await store.Checkpoint.updateOne(
        { _id: id },
        { $set: { status: "reorg-review-required", updatedAt: new Date() } },
      );
      return;
    }
  }
  const from = checkpoint ? checkpoint.blockNumber + 1 : input.startBlock;
  const to = Math.min(from + 99, head - input.confirmations);
  if (from > to) return;
  const watched = new Set(input.addresses.map((a) => a.toLowerCase()));
  if (![...input.addresses, ...input.tokens].every(isAddress))
    throw new Error("Invalid monitoring address");
  if (input.monitorAuthorityEvents && input.addresses.length) {
    const permissions = await input.rpc("eth_getLogs", [
      {
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
        address: input.addresses,
        topics: [
          [
            "AdminUpdated",
            "Upgraded",
            "OwnershipTransferred",
            "SignerPermissionsUpdated",
          ].map((name) => authorityAbi.getEvent(name)!.topicHash),
        ],
      },
    ]);
    for (const log of permissions) {
      if (log.removed) continue;
      const event = authorityAbi.parseLog(log);
      if (!event) throw new Error("Unsupported authority event");
      await auditEvent({
        id: `authority:${id}:${log.blockHash}:${log.transactionHash}:${log.logIndex}`,
        source: "chain",
        action: "wallet.authority.changed",
        outcome: "observed",
        severity: "critical",
        chainId: input.chainId,
        wallet: log.address,
        transactionHash: log.transactionHash,
        detail: event.name,
      });
    }
  }
  const logs = input.tokens.length
    ? await input.rpc("eth_getLogs", [
        {
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          address: input.tokens,
          topics: [[transfer, approval]],
        },
      ])
    : [];
  for (const log of logs) {
    if (log.removed) continue;
    const parsed = abi.parseLog(log);
    if (!parsed) continue;
    const sender = String(parsed.args[0]).toLowerCase();
    const recipient = String(parsed.args[1]).toLowerCase();
    if (
      !watched.has(sender) &&
      !(parsed.name === "Transfer" && watched.has(recipient))
    )
      continue;
    const outgoing = watched.has(sender);
    const matched =
      outgoing &&
      parsed.name === "Transfer" &&
      (await PaymentIntent.exists({
        chainId: input.chainId,
        wallet: { $regex: `^${sender}$`, $options: "i" },
        recipient: { $regex: `^${recipient}$`, $options: "i" },
        token: { $regex: `^${log.address}$`, $options: "i" },
        amount: parsed.args[2].toString(),
        transactionHash: log.transactionHash,
        state: { $in: ["submitted", "confirmed"] },
      }));
    const unexpected = outgoing && !matched;
    await auditEvent({
      id: `chain:${id}:${log.blockHash}:${log.transactionHash}:${log.logIndex}`,
      source: "chain",
      action:
        parsed.name === "Approval"
          ? "wallet.approval.observed"
          : outgoing
            ? unexpected
              ? "wallet.outgoing.unmatched"
              : "wallet.outgoing.matched"
            : "wallet.incoming.observed",
      outcome: "observed",
      severity: unexpected ? "critical" : "info",
      chainId: input.chainId,
      wallet: outgoing ? sender : recipient,
      transactionHash: log.transactionHash,
    });
  }
  // Full blocks cover direct native transfers. Internal execution requires a verified trace/indexer integration.
  for (let block = from; block <= to; block++) {
    const data = await input.rpc("eth_getBlockByNumber", [
      `0x${block.toString(16)}`,
      true,
    ]);
    if (!data?.hash || !Array.isArray(data.transactions))
      throw new Error("Incomplete block");
    if (input.traceInternalNative) {
      const traces = await input.rpc("debug_traceBlockByNumber", [
        `0x${block.toString(16)}`,
        { tracer: "callTracer", timeout: "10s" },
      ]);
      if (!Array.isArray(traces) || traces.length !== data.transactions.length)
        throw new Error("Incomplete native trace coverage");
      for (const [index, trace] of traces.entries()) {
        if (trace.error || !trace.result)
          throw new Error("Trace provider returned incomplete data");
        const hash = data.transactions[index].hash;
        if (trace.txHash && trace.txHash.toLowerCase() !== hash.toLowerCase())
          throw new Error("Trace transaction mismatch");
        for (const movement of internalNativeMovements(trace.result)) {
          const outgoing = watched.has(movement.from.toLowerCase());
          if (!outgoing && !watched.has(movement.to.toLowerCase())) continue;
          await auditEvent({
            id: `internal:${id}:${data.hash}:${hash}:${createHash("sha256").update(movement.path).digest("hex")}`,
            source: "chain",
            action: outgoing
              ? "wallet.native.internal.outgoing.unmatched"
              : "wallet.native.internal.incoming.observed",
            outcome: "observed",
            severity: outgoing ? "critical" : "info",
            chainId: input.chainId,
            wallet: outgoing ? movement.from : movement.to,
            transactionHash: hash,
          });
        }
      }
    }
    for (const tx of data.transactions) {
      if (
        BigInt(tx.value || "0x0") === 0n ||
        (!watched.has(tx.from?.toLowerCase()) &&
          !watched.has(tx.to?.toLowerCase()))
      )
        continue;
      const receipt = await input.rpc("eth_getTransactionReceipt", [tx.hash]);
      if (
        !receipt ||
        !["0x0", "0x1"].includes(receipt.status) ||
        receipt.blockHash !== data.hash ||
        receipt.transactionHash?.toLowerCase() !== tx.hash.toLowerCase()
      )
        throw new Error("Incomplete or inconsistent transaction receipt");
      if (receipt.status === "0x0") continue;
      const outgoing = watched.has(tx.from.toLowerCase());
      await auditEvent({
        id: `native:${id}:${data.hash}:${tx.hash}`,
        source: "chain",
        action: outgoing
          ? "wallet.native.outgoing.unmatched"
          : "wallet.native.incoming.observed",
        outcome: "observed",
        severity: outgoing ? "critical" : "info",
        chainId: input.chainId,
        wallet: outgoing ? tx.from : tx.to,
        transactionHash: tx.hash,
      });
    }
    await store.Checkpoint.updateOne(
      { _id: id },
      {
        $set: {
          chainId: input.chainId,
          blockNumber: block,
          blockHash: data.hash,
          updatedAt: new Date(),
          status:
            input.traceInternalNative && input.monitorAuthorityEvents
              ? "monitoring-configured-sources"
              : "partial-coverage",
          coverage: `erc20-and-direct-native;internal-native:${input.traceInternalNative ? "traced" : "unverified"};authority-events:${input.monitorAuthorityEvents ? "indexed" : "unverified"}`,
        },
      },
      { upsert: true },
    );
  }
}
