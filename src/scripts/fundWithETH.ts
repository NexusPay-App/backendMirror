import { connect } from '../services/database';
import { privateKeyToAccount } from 'thirdweb/wallets';
import { defineChain, prepareTransaction, sendTransaction } from 'thirdweb';
import { client } from '../services/auth';
import config from '../config/env';

// Target wallet to fund
const TARGET_WALLET = '0x31c41BCa835C0d3c597cbBaFf2e8dBF973645fb4';

// Amount of ETH to send (in normal units, e.g., 0.01 ETH)
const AMOUNT_ETH = 0.01;

// Chain to use
const CHAIN_NAME = 'arbitrum';

/**
 * Fund a wallet with native ETH for gas
 */
async function fundWalletWithETH() {
  try {
    // Connect to database
    await connect();
    console.log('Connected to database');
    
    // Get chain configuration
    const chainConfig = config[CHAIN_NAME];
    if (!chainConfig || !chainConfig.chainId) {
      throw new Error(`Invalid chain configuration for ${CHAIN_NAME}`);
    }
    
    const chain = defineChain(chainConfig.chainId);
    
    // Use an admin/funder wallet that already has ETH
    // In a real scenario, this would be a funded admin wallet
    // For this example, we're using the platform wallet private key
    const funderPrivateKey = config.PLATFORM_WALLET_PRIVATE_KEY;
    
    if (!funderPrivateKey) {
      throw new Error('Funder private key not found in environment variables');
    }
    
    // Create account from private key
    const funderAccount = privateKeyToAccount({
      client,
      privateKey: funderPrivateKey
    });
    
    console.log(`Funding ${TARGET_WALLET} with ${AMOUNT_ETH} ETH from ${funderAccount.address}`);
    
    // Convert ETH amount to wei (1 ETH = 10^18 wei)
    const valueInWei = BigInt(Math.floor(AMOUNT_ETH * 10**18));
    console.log(`Amount in wei: ${valueInWei}`);
    
    // Prepare the transaction
    const transaction = await prepareTransaction({
      chain,
      client,
      to: TARGET_WALLET,
      value: valueInWei, // ETH amount in wei as BigInt
      data: "0x", // Empty data for simple ETH transfer
    });
    
    // Send ETH transaction
    const tx = await sendTransaction({
      transaction,
      account: funderAccount,
    });
    
    console.log(`Transaction submitted: ${tx.transactionHash}`);
    console.log(`Explorer URL: https://arbiscan.io/tx/${tx.transactionHash}`);
    
    // We can't wait for the transaction directly in thirdweb v0.2+
    console.log('Transaction has been submitted. Check explorer for confirmation.');
    console.log(`${TARGET_WALLET} should receive ${AMOUNT_ETH} ETH soon`);
    
    return tx.transactionHash;
  } catch (error) {
    console.error('Error funding wallet with ETH:', error);
    throw error;
  }
}

// Run the function
fundWalletWithETH()
  .then(txHash => {
    console.log('Funding complete, transaction hash:', txHash);
    process.exit(0);
  })
  .catch(error => {
    console.error('Funding failed:', error);
    process.exit(1);
  }); 