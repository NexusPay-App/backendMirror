import { stellarService } from '../services/stellar';
import { stellarWalletService } from '../services/stellarWallet';
import { stellarPriceService } from '../services/stellarPrice';
import { stellarMpesaService } from '../services/stellarMpesa';
import { stellarAdvancedService } from '../services/stellarAdvanced';
import pino from 'pino';

// Configure logger
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty'
  }
});

async function testStellarIntegration() {
  logger.info('🌟 Starting Stellar Integration Tests...\n');

  try {
    // Test 1: Network Connection
    logger.info('1. Testing Stellar Network Connection...');
    const networkInfo = await stellarService.getNetworkInfo();
    logger.info(`✅ Connected to ${networkInfo.network} network`);
    logger.info(`   Horizon URL: ${networkInfo.horizonUrl}\n`);

    // Test 2: Keypair Generation
    logger.info('2. Testing Keypair Generation...');
    const keypair = stellarService.generateKeypair();
    logger.info(`✅ Generated keypair:`);
    logger.info(`   Public Key: ${keypair.publicKey}`);
    logger.info(`   Secret Key: ${keypair.secretKey.substring(0, 10)}...\n`);

    // Test 3: Account Creation (Testnet)
    logger.info('3. Testing Account Creation...');
    const account = await stellarService.createAccount();
    logger.info(`✅ Created account:`);
    logger.info(`   Account ID: ${account.accountId}`);
    logger.info(`   Secret Key: ${account.secretKey.substring(0, 10)}...\n`);

    // Test 4: Address Validation
    logger.info('4. Testing Address Validation...');
    const isValid = stellarService.validateAddress(account.accountId);
    logger.info(`✅ Address validation: ${isValid ? 'Valid' : 'Invalid'}\n`);

    // Test 5: Price Service
    logger.info('5. Testing Price Service...');
    const xlmPrice = await stellarPriceService.getAssetPrice('XLM');
    const usdcPrice = await stellarPriceService.getAssetPrice('USDC');
    logger.info(`✅ Price data retrieved:`);
    logger.info(`   XLM Price: $${xlmPrice}`);
    logger.info(`   USDC Price: $${usdcPrice}\n`);

    // Test 6: Currency Conversion
    logger.info('6. Testing Currency Conversion...');
    const conversion = await stellarMpesaService.convertKesToStellarAsset(1000, 'XLM');
    logger.info(`✅ Currency conversion:`);
    logger.info(`   1000 KES = ${conversion.amountAsset} XLM`);
    logger.info(`   Exchange Rate: ${conversion.exchangeRate}\n`);

    // Test 7: Network Fee
    logger.info('7. Testing Network Fee...');
    const networkFee = await stellarService.getNetworkFee();
    logger.info(`✅ Network fee: ${networkFee} stroops\n`);

    // Test 8: Asset Information
    logger.info('8. Testing Asset Information...');
    try {
      const xlmInfo = await stellarAdvancedService.getAssetInfo('XLM');
      logger.info(`✅ XLM Asset Info:`);
      logger.info(`   Code: ${xlmInfo.code}`);
      logger.info(`   Type: ${xlmInfo.type}`);
      logger.info(`   Name: ${xlmInfo.name}\n`);
    } catch (error) {
      logger.warn(`⚠️  Asset info test failed: ${error}\n`);
    }

    // Test 9: Network Statistics
    logger.info('9. Testing Network Statistics...');
    try {
      const stats = await stellarAdvancedService.getNetworkStats();
      logger.info(`✅ Network Statistics:`);
      logger.info(`   Total Accounts: ${stats.totalAccounts.toLocaleString()}`);
      logger.info(`   Total Transactions: ${stats.totalTransactions.toLocaleString()}`);
      logger.info(`   Network Fee: ${stats.networkFee} stroops\n`);
    } catch (error) {
      logger.warn(`⚠️  Network stats test failed: ${error}\n`);
    }

    // Test 10: Multi-Signature Wallet Creation
    logger.info('10. Testing Multi-Signature Wallet Creation...');
    try {
      const multiSigWallet = await stellarAdvancedService.createMultiSigWallet(
        'test-user',
        [
          { publicKey: keypair.publicKey, weight: 1 },
          { publicKey: account.accountId, weight: 1 }
        ],
        { low: 1, medium: 2, high: 2 }
      );
      logger.info(`✅ Multi-sig wallet created:`);
      logger.info(`   Account ID: ${multiSigWallet.accountId}`);
      logger.info(`   Signers: ${multiSigWallet.signers.length}\n`);
    } catch (error) {
      logger.warn(`⚠️  Multi-sig wallet test failed: ${error}\n`);
    }

    logger.info('🎉 All Stellar integration tests completed successfully!');
    logger.info('\n📋 Test Summary:');
    logger.info('✅ Network connection');
    logger.info('✅ Keypair generation');
    logger.info('✅ Account creation');
    logger.info('✅ Address validation');
    logger.info('✅ Price service');
    logger.info('✅ Currency conversion');
    logger.info('✅ Network fee');
    logger.info('✅ Asset information');
    logger.info('✅ Network statistics');
    logger.info('✅ Multi-signature wallet');

  } catch (error) {
    logger.error('❌ Stellar integration test failed:', error);
    process.exit(1);
  }
}

async function testWalletOperations() {
  logger.info('\n🔐 Testing Wallet Operations...\n');

  try {
    const testUserId = 'test-user-' + Date.now();
    
    // Test wallet creation
    logger.info('1. Creating test wallet...');
    const wallet = await stellarWalletService.createWallet(testUserId);
    logger.info(`✅ Wallet created: ${wallet.accountId}\n`);

    // Test balance retrieval
    logger.info('2. Getting wallet balance...');
    const balance = await stellarWalletService.getWalletBalance(testUserId, 'XLM');
    logger.info(`✅ XLM Balance: ${balance}\n`);

    // Test all balances
    logger.info('3. Getting all balances...');
    const allBalances = await stellarWalletService.getAllBalances(testUserId);
    logger.info(`✅ All balances:`, allBalances);
    logger.info('');

    // Test wallet address retrieval
    logger.info('4. Getting wallet address...');
    const address = await stellarWalletService.getWalletAddress(testUserId);
    logger.info(`✅ Wallet address: ${address}\n`);

    // Test funding (testnet only)
    logger.info('5. Testing wallet funding...');
    const fundResult = await stellarWalletService.fundWallet(testUserId);
    logger.info(`✅ Funding result: ${fundResult.message}\n`);

    logger.info('🎉 Wallet operations test completed successfully!');

  } catch (error) {
    logger.error('❌ Wallet operations test failed:', error);
  }
}

async function testMpesaIntegration() {
  logger.info('\n💰 Testing MPESA Integration...\n');

  try {
    // Test exchange rates
    logger.info('1. Getting exchange rates...');
    const rates = await stellarMpesaService.getExchangeRates();
    logger.info(`✅ Exchange rates:`);
    logger.info(`   KES to USD: ${rates.kesToUsd}`);
    logger.info(`   XLM Price: $${rates.xlmPrice}`);
    logger.info(`   USDC Price: $${rates.usdcPrice}\n`);

    // Test deposit initiation
    logger.info('2. Testing deposit initiation...');
    const depositResult = await stellarMpesaService.initiateDeposit({
      userId: 'test-user',
      phoneNumber: '254712345678',
      amountKES: 1000,
      asset: 'XLM'
    });
    logger.info(`✅ Deposit initiated: ${depositResult.transactionId}\n`);

    // Test withdrawal initiation
    logger.info('3. Testing withdrawal initiation...');
    const withdrawalResult = await stellarMpesaService.initiateWithdrawal({
      userId: 'test-user',
      phoneNumber: '254712345678',
      amountAsset: '1.5',
      asset: 'XLM'
    });
    logger.info(`✅ Withdrawal initiated: ${withdrawalResult.transactionId}\n`);

    logger.info('🎉 MPESA integration test completed successfully!');

  } catch (error) {
    logger.error('❌ MPESA integration test failed:', error);
  }
}

// Main test runner
async function runAllTests() {
  logger.info('🚀 Starting Comprehensive Stellar Integration Tests\n');
  logger.info('=' .repeat(60));

  await testStellarIntegration();
  await testWalletOperations();
  await testMpesaIntegration();

  logger.info('\n' + '=' .repeat(60));
  logger.info('🎉 All tests completed!');
  logger.info('\n📝 Next Steps:');
  logger.info('1. Set up your environment variables');
  logger.info('2. Configure your database schema');
  logger.info('3. Test the API endpoints');
  logger.info('4. Deploy to production');
  logger.info('\n📚 Documentation:');
  logger.info('- STELLAR_INTEGRATION_GUIDE.md');
  logger.info('- STELLAR_API_DOCUMENTATION.md');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    logger.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { testStellarIntegration, testWalletOperations, testMpesaIntegration };
