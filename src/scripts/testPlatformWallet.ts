import { initializeMultiChainWallet, getPlatformWalletBalance } from '../services/platformWallet';
import dotenv from 'dotenv';
import { Chain } from '../types/token';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Get owner keys from environment
    const ownerKey1 = process.env.OWNER_KEY_1;
    const ownerKey2 = process.env.OWNER_KEY_2;
    const ownerKey3 = process.env.OWNER_KEY_3;

    if (!ownerKey1 || !ownerKey2 || !ownerKey3) {
      throw new Error('Missing owner keys. Please set OWNER_KEY_1, OWNER_KEY_2, and OWNER_KEY_3 in .env');
    }

    const ownerKeys = [ownerKey1, ownerKey2, ownerKey3];

    console.log('🚀 Initializing platform wallets...');

    // Initialize wallets on all chains
    const walletAddresses = await initializeMultiChainWallet(ownerKeys);

    console.log('\n✅ Platform wallets initialized:');
    for (const [chain, address] of Object.entries(walletAddresses)) {
      console.log(`\n${chain.toUpperCase()}:`);
      console.log(`- Address: ${address}`);
      
      try {
        // Get USDC balance
        const balance = await getPlatformWalletBalance(chain as Chain);
        console.log(`- USDC Balance: ${balance}`);
      } catch (error: any) {
        console.log(`- Failed to get balance: ${error.message}`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main(); 