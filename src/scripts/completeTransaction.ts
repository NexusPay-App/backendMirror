import { Escrow } from '../models/escrowModel';
import { User } from '../models/models';
import { connect } from '../services/database';
import { sendTokenToUser } from '../services/platformWallet';
import { TokenSymbol } from '../types/token';
import mongoose from 'mongoose';

const transactionId = 'c18fe69c-bdfe-4818-932a-74aa27d7253d';

async function completeTransaction() {
  try {
    // Connect to database
    await connect();
    console.log('Connected to database');

    // Find the escrow record without populating userId
    const escrow = await Escrow.findOne({ transactionId });
    
    if (!escrow) {
      console.error(`No escrow found with transaction ID: ${transactionId}`);
      process.exit(1);
    }

    console.log('Found escrow record:', {
      transactionId: escrow.transactionId,
      userId: escrow.userId,
      status: escrow.status,
      amount: escrow.amount,
      cryptoAmount: escrow.cryptoAmount,
      type: escrow.type,
      metadata: escrow.metadata
    });

    if (escrow.status === 'completed') {
      console.log('Transaction is already completed');
      process.exit(0);
    }

    // Find the user manually
    const user = await User.findById(escrow.userId);
    if (!user) {
      console.error(`User not found with ID: ${escrow.userId}`);
      process.exit(1);
    }

    const userWalletAddress = user.walletAddress;
    if (!userWalletAddress) {
      console.error('User does not have a wallet address');
      process.exit(1);
    }

    console.log(`User wallet address: ${userWalletAddress}`);

    // Extract crypto amount, chain and token type
    const cryptoAmount = escrow.cryptoAmount;
    const chain = escrow.metadata?.chain || 'celo';
    const tokenType = escrow.metadata?.tokenType || 'USDC';

    console.log(`Attempting to send ${cryptoAmount} ${tokenType} on ${chain} to ${userWalletAddress}`);

    // Send token to user
    const result = await sendTokenToUser(
      userWalletAddress,
      cryptoAmount,
      chain,
      tokenType as TokenSymbol
    );

    console.log('Token transfer successful:', result);

    // Update escrow record
    escrow.status = 'completed';
    escrow.completedAt = new Date();
    escrow.cryptoTransactionHash = result.transactionHash;
    await escrow.save();

    console.log('Escrow record updated successfully');
    console.log(`Transaction ${transactionId} completed successfully`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error completing transaction:', error);
    process.exit(1);
  }
}

// Run the function
completeTransaction(); 