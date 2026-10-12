// Read-only SDK compatibility check; fixture address has no private key loaded.
import { createThirdwebClient, getContract, encode, readContract } from 'thirdweb';
import { botAccountOverrides } from '../dist/services/botchainWallet.js';
import { getBotConfig, BOT_FACTORY, BOT_ENTRY_POINT } from '../dist/config/botchain.js';
const client = createThirdwebClient({ clientId: '00000000000000000000000000000000' });
const owner = '0x1111111111111111111111111111111111111111';
for (const network of ['botchain-testnet', 'botchain']) {
  const n = getBotConfig(network), adapter = botAccountOverrides(network);
  const factory = getContract({ client, chain: n.chain, address: BOT_FACTORY });
  const implementation = await readContract({ contract: factory, method: 'function accountImplementation() view returns(address)' });
  const boundEntryPoint = await readContract({ contract: getContract({ client, chain: n.chain, address: implementation }), method: 'function entryPoint() view returns(address)' });
  if (boundEntryPoint.toLowerCase() !== BOT_ENTRY_POINT.toLowerCase()) throw new Error('Factory implementation uses a different EntryPoint');
  const address = await adapter.predictAddress(factory, owner);
  const account = getContract({ client, chain: n.chain, address });
  const nonce = await adapter.getAccountNonce(account);
  const directNonce = await readContract({ contract: getContract({ client, chain: n.chain, address: BOT_ENTRY_POINT }), method: 'function getNonce(address sender,uint192 key) view returns(uint256)', params: [address, 0n] });
  if (nonce !== directNonce) throw new Error('Nonce adapter mismatch');
  const callData = await encode(adapter.createAccount(factory, owner));
  if (callData.length !== 138) throw new Error('Factory calldata is not owner + uint256 salt');
  console.log(JSON.stringify({ network, owner, predictedAccount: address, nonce: nonce.toString(), factoryCalldataBytes: (callData.length - 2) / 2, implementation, entryPoint: boundEntryPoint, writes: 0 }));
}
