import { readFile } from "node:fs/promises";
import { Interface, isAddress } from "ethers";
const filename = process.argv[2];
if (!filename)
  throw new Error(
    "Provide a JSON file containing public wallet addresses, chain IDs, expected owners and RPC environment-variable names.",
  );
const rows = JSON.parse(await readFile(filename, "utf8"));
const abi = new Interface([
  "function owner() view returns (address)",
  "function getAllAdmins() view returns (address[])",
]);
for (const row of rows) {
  if (
    ![677, 42161, 8453].includes(row.chainId) ||
    !isAddress(row.address) ||
    !Array.isArray(row.expectedOwners) ||
    !row.expectedOwners.every(isAddress)
  )
    throw new Error("Invalid public wallet inventory");
  const rpc = process.env[row.rpcVariable];
  if (!rpc) throw new Error(`Missing RPC variable: ${row.rpcVariable}`);
  async function call(method, params) {
    if (!["eth_chainId", "eth_getCode", "eth_call"].includes(method))
      throw new Error("Read-only assessment");
    const response = await fetch(rpc, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error("RPC assessment failed");
    return result.result;
  }
  if (Number(BigInt(await call("eth_chainId", []))) !== row.chainId)
    throw new Error("RPC network mismatch");
  const code = await call("eth_getCode", [row.address, "latest"]);
  let owners = [];
  let authorityRead = "not-deployed";
  if (code !== "0x") {
    const method = row.chainId === 677 ? "owner" : "getAllAdmins";
    try {
      const data = await call("eth_call", [
        { to: row.address, data: abi.encodeFunctionData(method) },
        "latest",
      ]);
      const decoded = abi.decodeFunctionResult(method, data)[0];
      owners = row.chainId === 677 ? [decoded] : Array.from(decoded);
      authorityRead = "verified-current";
    } catch {
      authorityRead = "unsupported-requires-review";
    }
  }
  const expected = row.expectedOwners.map((x) => x.toLowerCase()).sort();
  console.log(
    JSON.stringify({
      address: row.address,
      chainId: row.chainId,
      deployed: code !== "0x",
      owners,
      authorityRead,
      expectedAuthorityMatches:
        authorityRead === "verified-current" &&
        JSON.stringify(owners.map((x) => x.toLowerCase()).sort()) ===
          JSON.stringify(expected),
      migrationStatus:
        "blocked-pending-reviewed-owner-change-or-address-migration",
      transactionsSubmitted: 0,
    }),
  );
}
