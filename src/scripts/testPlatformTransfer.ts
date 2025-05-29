import { sendFromPlatformWallet, getPlatformWalletBalance } from '../services/platformWallet';
import dotenv from 'dotenv';
import { Chain } from '../types/token';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Get owner keys and test recipient from environment
    const primaryKey = process.env.OWNER_KEY_1;
    const secondaryKey = process.env.OWNER_KEY_2;
    const testRecipient = process.env.TEST_RECIPIENT_ADDRESS;

    if (!primaryKey || !secondaryKey) {
      throw new Error('Missing owner keys. Please set OWNER_KEY_1 and OWNER_KEY_2 in .env');
    }

    if (!testRecipient) {
      throw new Error('Missing test recipient. Please set TEST_RECIPIENT_ADDRESS in .env');
    }

    // Choose a chain to test on (e.g., Arbitrum)
    const testChain: Chain = 'arbitrum';
    const amount = 1; // Send 1 USDC

    console.log('🔍 Getting current balance...');
    const initialBalance = await getPlatformWalletBalance(testChain);
    console.log(`Current balance on ${testChain}: ${initialBalance} USDC`);

    if (initialBalance < amount) {
      throw new Error(`Insufficient balance. Need ${amount} USDC but only have ${initialBalance} USDC`);
    }

    console.log('\n🚀 Sending tokens...');
    console.log(`- Chain: ${testChain}`);
    console.log(`- Amount: ${amount} USDC`);
    console.log(`- To: ${testRecipient}`);

    const result = await sendFromPlatformWallet(
      amount,
      testRecipient,
      primaryKey,
      secondaryKey,
      testChain
    );

    console.log('\n✅ Transfer successful!');
    console.log(`Transaction hash: ${result.transactionHash}`);

    // Check new balance
    const newBalance = await getPlatformWalletBalance(testChain);
    console.log(`\nNew balance: ${newBalance} USDC`);
    console.log(`Change: ${newBalance - initialBalance} USDC`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main(); 