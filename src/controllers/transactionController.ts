import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Escrow } from '../models/escrowModel';
import { standardResponse, handleError } from '../services/utils';
import { getConversionRateWithCaching } from '../services/rates';
import { getWalletBalance } from '../services/platformWallet';

/**
 * Enhanced transaction history for authenticated user with comprehensive details
 */
export const getTransactionHistory = async (req: Request, res: Response) => {
  try {
    // Make sure user is authenticated
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'You must be logged in to view your transaction history' }
      ));
    }

    const userId = req.user._id;
    console.log(`Fetching enhanced transaction history for user: ${userId}`);

    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Optional filters
    const { status, type, chain, tokenType, dateFrom, dateTo } = req.query;
    
    // Build query with optional filters
    const query: any = { userId };
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo as string);
      }
    }

    // Get total count for pagination
    const totalTransactions = await Escrow.countDocuments(query);

    // Fetch transactions for user with pagination
    const transactions = await Escrow.find(query)
      .sort({ createdAt: -1 }) // Latest first
      .skip(skip)
      .limit(limit);

    console.log(`Found ${transactions.length} transactions for user ${userId}`);

    // Enhanced formatting for response with comprehensive details
    const enhancedTransactions = await Promise.all(
      transactions.map(async (tx: any) => {
        const metadata = tx.metadata || {};
        const tokenSymbol = metadata.tokenType || 'USDC';
        const chainName = metadata.chain || 'celo';
        const cryptoAmount = typeof tx.cryptoAmount === 'string' ? parseFloat(tx.cryptoAmount) : tx.cryptoAmount;
        
        // Get current conversion rates for real-time valuation
        let currentUsdcRate = 0;
        let currentTokenRate = 0;
        try {
          currentUsdcRate = await getConversionRateWithCaching('USDC');
          if (tokenSymbol !== 'USDC') {
            currentTokenRate = await getConversionRateWithCaching(tokenSymbol);
          } else {
            currentTokenRate = currentUsdcRate;
          }
        } catch (error) {
          console.warn(`Failed to get conversion rates: ${error}`);
          currentUsdcRate = 133.5; // Fallback rate
          currentTokenRate = tokenSymbol === 'USDC' ? 133.5 : 133.5;
        }

        // Calculate USD value (assuming USDC is 1:1 with USD)
        const usdValue = tokenSymbol === 'USDC' ? cryptoAmount : 
                        tokenSymbol === 'USDT' ? cryptoAmount :
                        // For other tokens, use a more sophisticated calculation
                        cryptoAmount * (tokenSymbol === 'BTC' ? 50000 : 
                                      tokenSymbol === 'ETH' ? 3000 : 1);

        // Calculate KES value using current rates
        const kesValue = cryptoAmount * currentTokenRate;

        // Determine portfolio impact
        const portfolioImpact = getPortfolioImpact(tx.type, tx.status);
        
        // Generate block explorer URL
        const explorerUrl = tx.cryptoTransactionHash ? 
          generateExplorerUrl(chainName, tx.cryptoTransactionHash) : null;

        // Calculate transaction age and processing time
        const transactionAge = Math.floor((Date.now() - new Date(tx.createdAt).getTime()) / (1000 * 60)); // minutes
        const processingTime = tx.completedAt ? 
          Math.floor((new Date(tx.completedAt).getTime() - new Date(tx.createdAt).getTime()) / 1000) : null; // seconds

        // Enhanced transaction logging
        if (tx.cryptoTransactionHash) {
          console.log(`Enhanced Transaction ${tx.transactionId}: ${cryptoAmount} ${tokenSymbol} on ${chainName}`);
          console.log(`- USD Value: $${usdValue.toFixed(2)}`);
          console.log(`- KES Value: KES ${kesValue.toFixed(2)}`);
          console.log(`- Status: ${tx.status} - Impact: ${portfolioImpact}`);
          console.log(`- TX Hash: ${tx.cryptoTransactionHash}`);
          console.log(`- Explorer: ${explorerUrl}`);
        }
        
        return {
          // Basic transaction info
          id: tx.transactionId,
          type: tx.type,
          status: tx.status,
          
          // Token and amount details
          token: {
            symbol: tokenSymbol,
            name: getTokenName(tokenSymbol),
            amount: cryptoAmount,
            decimals: getTokenDecimals(tokenSymbol)
          },
          
          // Multi-currency values
          values: {
            fiat: {
              amount: tx.amount,
              currency: 'KES',
              formatted: `KES ${tx.amount?.toLocaleString() || '0'}`
            },
            usd: {
              amount: usdValue,
              formatted: `$${usdValue.toFixed(2)}`,
              rate: usdValue / cryptoAmount // USD per token
            },
            kes: {
              amount: kesValue,
              formatted: `KES ${kesValue.toLocaleString()}`,
              rate: currentTokenRate // KES per token
            }
          },
          
          // Blockchain details
          blockchain: {
            chain: chainName,
            network: getNetworkDisplayName(chainName),
            txHash: tx.cryptoTransactionHash || null,
            explorerUrl: explorerUrl,
            explorerName: getExplorerName(chainName)
          },
          
          // Portfolio impact
          portfolio: {
            impact: portfolioImpact,
            direction: portfolioImpact === 'positive' ? '+' : portfolioImpact === 'negative' ? '-' : '=',
            description: getPortfolioDescription(tx.type, tx.status)
          },
          
          // Timestamps and timing
          timing: {
            createdAt: tx.createdAt,
            completedAt: tx.completedAt || null,
            processingTimeSeconds: processingTime,
            ageMinutes: transactionAge,
            formatted: {
              created: new Date(tx.createdAt).toLocaleString(),
              completed: tx.completedAt ? new Date(tx.completedAt).toLocaleString() : null
            }
          },
          
          // Transaction IDs and references
          references: {
            transactionId: tx.transactionId,
            mpesaTransactionId: tx.mpesaTransactionId || null,
            retryCount: tx.retryCount || 0
          },
          
          // Additional metadata for dashboard
          dashboard: {
            priority: getTransactionPriority(tx.status, transactionAge),
            category: getTransactionCategory(tx.type),
            statusColor: getStatusColor(tx.status),
            icon: getTransactionIcon(tx.type),
            summary: generateTransactionSummary(tx, tokenSymbol, chainName, usdValue, kesValue)
          }
        };
      })
    );

    return res.json(standardResponse(
      true,
      'Enhanced transaction history retrieved successfully',
      {
        transactions: enhancedTransactions,
        summary: {
          total: totalTransactions,
          page,
          limit,
          pages: Math.ceil(totalTransactions / limit),
          filters: {
            status: status || null,
            type: type || null,
            chain: chain || null,
            tokenType: tokenType || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null
          }
        },
        // Additional dashboard insights
        insights: await generatePortfolioInsights(enhancedTransactions, req.user)
      }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve enhanced transaction history');
  }
};

/**
 * Get enhanced transaction details by ID
 */
export const getTransactionById = async (req: Request, res: Response) => {
  try {
    // Make sure user is authenticated
    if (!req.user) {
      return res.status(401).json(standardResponse(
        false,
        'Authentication required',
        null,
        { code: 'AUTH_REQUIRED', message: 'You must be logged in to view transaction details' }
      ));
    }

    const userId = req.user._id;
    const { id } = req.params;

    console.log(`Looking up enhanced transaction ${id} for user ${userId}`);

    // Find transaction that belongs to the user
    const transaction = await Escrow.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: mongoose.isValidObjectId(id) ? id : null },
            { transactionId: id }
          ]
        }
      ]
    });

    if (!transaction) {
      return res.status(404).json(standardResponse(
        false,
        'Transaction not found',
        null,
        { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction with the provided ID does not exist or does not belong to you' }
      ));
    }

    // Enhanced transaction details with comprehensive information
    const metadata = (transaction as any).metadata || {};
    const tokenSymbol = metadata.tokenType || 'USDC';
    const chainName = metadata.chain || 'celo';
    const cryptoAmount = typeof transaction.cryptoAmount === 'string' ? 
      parseFloat(transaction.cryptoAmount) : transaction.cryptoAmount;
    
    // Get current conversion rates
    let currentUsdcRate = 133.5;
    let currentTokenRate = 133.5;
    try {
      currentUsdcRate = await getConversionRateWithCaching('USDC');
      if (tokenSymbol !== 'USDC') {
        currentTokenRate = await getConversionRateWithCaching(tokenSymbol);
      } else {
        currentTokenRate = currentUsdcRate;
      }
    } catch (error) {
      console.warn(`Failed to get conversion rates for transaction details: ${error}`);
    }

    // Calculate values
    const usdValue = tokenSymbol === 'USDC' ? cryptoAmount : 
                    tokenSymbol === 'USDT' ? cryptoAmount :
                    cryptoAmount * (tokenSymbol === 'BTC' ? 50000 : 
                                  tokenSymbol === 'ETH' ? 3000 : 1);
    const kesValue = cryptoAmount * currentTokenRate;

    // Enhanced transaction logging for details view
    console.log(`Enhanced Transaction Details: ${id}`);
    console.log(`- Type: ${transaction.type} | Status: ${transaction.status}`);
    console.log(`- Token: ${cryptoAmount} ${tokenSymbol} on ${chainName}`);
    console.log(`- Values: $${usdValue.toFixed(2)} USD | KES ${kesValue.toFixed(2)}`);
    if (transaction.cryptoTransactionHash) {
      console.log(`- TX Hash: ${transaction.cryptoTransactionHash}`);
      console.log(`- Explorer: ${generateExplorerUrl(chainName, transaction.cryptoTransactionHash)}`);
    }

    const portfolioImpact = getPortfolioImpact(transaction.type, transaction.status);
    const explorerUrl = transaction.cryptoTransactionHash ? 
      generateExplorerUrl(chainName, transaction.cryptoTransactionHash) : null;

    const enhancedTransaction = {
      // Basic information
      id: transaction.transactionId,
      type: transaction.type,
      status: transaction.status,
      
      // Detailed token information
      token: {
        symbol: tokenSymbol,
        name: getTokenName(tokenSymbol),
        amount: cryptoAmount,
        decimals: getTokenDecimals(tokenSymbol),
        contractAddress: getTokenContractAddress(tokenSymbol, chainName)
      },
      
      // Comprehensive value breakdown
      values: {
        fiat: {
          amount: transaction.amount,
          currency: 'KES',
          formatted: `KES ${transaction.amount?.toLocaleString() || '0'}`,
          historicalRate: metadata.conversionRate || null
        },
        usd: {
          amount: usdValue,
          formatted: `$${usdValue.toFixed(2)}`,
          rate: usdValue / cryptoAmount,
          currentRate: tokenSymbol === 'USDC' ? 1 : (usdValue / cryptoAmount)
        },
        kes: {
          amount: kesValue,
          formatted: `KES ${kesValue.toLocaleString()}`,
          rate: currentTokenRate,
          currentRate: currentTokenRate,
          historicalRate: metadata.conversionRate || null
        }
      },
      
      // Complete blockchain details
      blockchain: {
        chain: chainName,
        network: getNetworkDisplayName(chainName),
        txHash: transaction.cryptoTransactionHash || null,
        explorerUrl: explorerUrl,
        explorerName: getExplorerName(chainName),
        blockNumber: metadata.blockNumber || null,
        gasUsed: metadata.gasUsed || null,
        gasFee: metadata.gasFee || null
      },
      
      // Portfolio impact analysis
      portfolio: {
        impact: portfolioImpact,
        direction: portfolioImpact === 'positive' ? '+' : portfolioImpact === 'negative' ? '-' : '=',
        description: getPortfolioDescription(transaction.type, transaction.status),
        category: getTransactionCategory(transaction.type)
      },
      
      // Comprehensive timing information
      timing: {
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt || null,
        processingTimeSeconds: transaction.completedAt ? 
          Math.floor((new Date(transaction.completedAt).getTime() - new Date(transaction.createdAt).getTime()) / 1000) : null,
        ageMinutes: Math.floor((Date.now() - new Date(transaction.createdAt).getTime()) / (1000 * 60)),
        formatted: {
          created: new Date(transaction.createdAt).toLocaleString(),
          completed: transaction.completedAt ? new Date(transaction.completedAt).toLocaleString() : null
        }
      },
      
      // All transaction references
      references: {
        transactionId: transaction.transactionId,
        mpesaTransactionId: transaction.mpesaTransactionId || null,
        cryptoTransactionHash: transaction.cryptoTransactionHash || null,
        retryCount: transaction.retryCount || 0,
        lastRetryAt: transaction.lastRetryAt || null
      },
      
      // Complete metadata
      metadata: {
        ...metadata,
        estimatedValue: `$${usdValue.toFixed(2)} USD`,
        currentEstimatedValue: `$${usdValue.toFixed(2)} USD`,
        kesEstimatedValue: `KES ${kesValue.toFixed(2)}`,
        platformFee: metadata.platformFee || null,
        userBalanceAtTime: metadata.userCryptoBalanceAtTime || null
      },
      
      // Dashboard visualization data
      dashboard: {
        priority: getTransactionPriority(transaction.status, Math.floor((Date.now() - new Date(transaction.createdAt).getTime()) / (1000 * 60))),
        statusColor: getStatusColor(transaction.status),
        icon: getTransactionIcon(transaction.type),
        progressPercentage: getTransactionProgress(transaction.status),
        actionItems: getActionItems(transaction),
        summary: generateTransactionSummary(transaction, tokenSymbol, chainName, usdValue, kesValue)
      }
    };

    return res.json(standardResponse(
      true,
      'Enhanced transaction details retrieved successfully',
      { transaction: enhancedTransaction }
    ));
  } catch (error) {
    return handleError(error, res, 'Failed to retrieve enhanced transaction details');
  }
};

/**
 * Generate blockchain explorer URL based on chain and transaction hash
 */
function generateExplorerUrl(chain: string, txHash: string): string {
  const explorers: {[key: string]: string} = {
    'celo': 'https://explorer.celo.org/mainnet/tx/',
    'polygon': 'https://polygonscan.com/tx/',
    'arbitrum': 'https://arbiscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'optimism': 'https://optimistic.etherscan.io/tx/',
    'ethereum': 'https://etherscan.io/tx/',
    'binance': 'https://bscscan.com/tx/',
    'bnb': 'https://bscscan.com/tx/',
    'avalanche': 'https://snowtrace.io/tx/',
    'fantom': 'https://ftmscan.com/tx/',
    'gnosis': 'https://gnosisscan.io/tx/',
    'scroll': 'https://scrollscan.com/tx/',
    'moonbeam': 'https://moonbeam.moonscan.io/tx/',
    'fuse': 'https://explorer.fuse.io/tx/',
    'aurora': 'https://explorer.aurora.dev/tx/',
    'lisk': 'https://blockscout.lisk.com/tx/',
    'somnia': 'https://somniascan.io/tx/'
  };
  
  const baseUrl = explorers[chain.toLowerCase()] || explorers['celo']; // Default to Celo if chain not found
  return `${baseUrl}${txHash}`;
}

/**
 * Helper functions for enhanced transaction data
 */
function getTokenName(symbol: string): string {
  const tokenNames: {[key: string]: string} = {
    'USDC': 'USD Coin',
    'USDT': 'Tether USD',
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'WETH': 'Wrapped Ethereum',
    'WBTC': 'Wrapped Bitcoin',
    'DAI': 'Dai Stablecoin',
    'CELO': 'Celo'
  };
  return tokenNames[symbol] || symbol;
}

function getTokenDecimals(symbol: string): number {
  const tokenDecimals: {[key: string]: number} = {
    'USDC': 6,
    'USDT': 6,
    'BTC': 8,
    'ETH': 18,
    'WETH': 18,
    'WBTC': 8,
    'DAI': 18,
    'CELO': 18
  };
  return tokenDecimals[symbol] || 18;
}

function getTokenContractAddress(symbol: string, chain: string): string | null {
  // This would typically come from your token configuration
  // Return null for now, but you can implement based on your token config
  return null;
}

function getNetworkDisplayName(chain: string): string {
  const networkNames: {[key: string]: string} = {
    'celo': 'Celo Mainnet',
    'polygon': 'Polygon',
    'arbitrum': 'Arbitrum One',
    'base': 'Base',
    'optimism': 'Optimism',
    'ethereum': 'Ethereum Mainnet',
    'bnb': 'BNB Smart Chain',
    'avalanche': 'Avalanche C-Chain',
    'fantom': 'Fantom Opera',
    'gnosis': 'Gnosis Chain',
    'scroll': 'Scroll',
    'moonbeam': 'Moonbeam',
    'fuse': 'Fuse Network',
    'aurora': 'Aurora',
    'lisk': 'Lisk',
    'somnia': 'Somnia'
  };
  return networkNames[chain] || chain;
}

function getExplorerName(chain: string): string {
  const explorerNames: {[key: string]: string} = {
    'celo': 'Celo Explorer',
    'polygon': 'PolygonScan',
    'arbitrum': 'Arbiscan',
    'base': 'BaseScan',
    'optimism': 'Optimism Explorer',
    'ethereum': 'Etherscan',
    'bnb': 'BscScan',
    'avalanche': 'SnowTrace',
    'fantom': 'FtmScan',
    'gnosis': 'GnosisScan',
    'scroll': 'ScrollScan',
    'moonbeam': 'Moonscan',
    'fuse': 'Fuse Explorer',
    'aurora': 'Aurora Explorer',
    'lisk': 'Lisk Explorer',
    'somnia': 'Somnia Explorer'
  };
  return explorerNames[chain] || 'Block Explorer';
}

function getPortfolioImpact(transactionType: string, status: string): 'positive' | 'negative' | 'neutral' {
  if (status === 'failed' || status === 'error') return 'neutral';
  
  switch (transactionType) {
    case 'fiat_to_crypto':
      return 'positive'; // Adding crypto to portfolio
    case 'crypto_to_fiat':
    case 'crypto_to_paybill':
    case 'crypto_to_till':
      return 'negative'; // Removing crypto from portfolio
    default:
      return 'neutral';
  }
}

function getPortfolioDescription(transactionType: string, status: string): string {
  if (status === 'failed' || status === 'error') return 'No impact on portfolio';
  
  switch (transactionType) {
    case 'fiat_to_crypto':
      return 'Added crypto to your portfolio';
    case 'crypto_to_fiat':
      return 'Converted crypto to cash';
    case 'crypto_to_paybill':
      return 'Used crypto for paybill payment';
    case 'crypto_to_till':
      return 'Used crypto for till payment';
    default:
      return 'Portfolio transaction';
  }
}

function getTransactionCategory(transactionType: string): string {
  const categories: {[key: string]: string} = {
    'fiat_to_crypto': 'Buy Crypto',
    'crypto_to_fiat': 'Sell Crypto',
    'crypto_to_paybill': 'Pay Bills',
    'crypto_to_till': 'Merchant Payment',
    'token_transfer': 'Transfer',
    'deposit': 'Deposit',
    'withdrawal': 'Withdrawal'
  };
  return categories[transactionType] || 'Transaction';
}

function getStatusColor(status: string): string {
  const colors: {[key: string]: string} = {
    'completed': '#10B981', // Green
    'pending': '#F59E0B',   // Amber
    'failed': '#EF4444',    // Red
    'error': '#EF4444',     // Red
    'reserved': '#6B7280'   // Gray
  };
  return colors[status] || '#6B7280';
}

function getTransactionIcon(transactionType: string): string {
  const icons: {[key: string]: string} = {
    'fiat_to_crypto': '💳→🪙',
    'crypto_to_fiat': '🪙→💰',
    'crypto_to_paybill': '🪙→🧾',
    'crypto_to_till': '🪙→🏪',
    'token_transfer': '↔️',
    'deposit': '⬇️',
    'withdrawal': '⬆️'
  };
  return icons[transactionType] || '💫';
}

function getTransactionPriority(status: string, ageMinutes: number): 'high' | 'medium' | 'low' {
  if (status === 'failed' || status === 'error') return 'high';
  if (status === 'pending' && ageMinutes > 10) return 'medium';
  return 'low';
}

function getTransactionProgress(status: string): number {
  const progress: {[key: string]: number} = {
    'pending': 30,
    'reserved': 60,
    'completed': 100,
    'failed': 0,
    'error': 0
  };
  return progress[status] || 0;
}

function getActionItems(transaction: any): string[] {
  const items: string[] = [];
  
  if (transaction.status === 'failed' || transaction.status === 'error') {
    items.push('Contact support for assistance');
  }
  
  if (transaction.status === 'pending' && !transaction.cryptoTransactionHash) {
    items.push('Waiting for blockchain confirmation');
  }
  
  if (transaction.cryptoTransactionHash) {
    items.push('View on blockchain explorer');
  }
  
  return items;
}

function generateTransactionSummary(
  transaction: any, 
  tokenSymbol: string, 
  chainName: string, 
  usdValue: number, 
  kesValue: number
): string {
  const amount = typeof transaction.cryptoAmount === 'string' ? 
    parseFloat(transaction.cryptoAmount) : transaction.cryptoAmount;
  
  const typeDescriptions: {[key: string]: string} = {
    'fiat_to_crypto': `Bought ${amount} ${tokenSymbol} ($${usdValue.toFixed(2)}) on ${chainName}`,
    'crypto_to_fiat': `Sold ${amount} ${tokenSymbol} for KES ${kesValue.toFixed(2)}`,
    'crypto_to_paybill': `Paid ${amount} ${tokenSymbol} to paybill`,
    'crypto_to_till': `Paid ${amount} ${tokenSymbol} to till`
  };
  
  return typeDescriptions[transaction.type] || `${transaction.type} transaction`;
}

async function generatePortfolioInsights(transactions: any[], user: any): Promise<any> {
  const insights = {
    totalTransactions: transactions.length,
    completedTransactions: transactions.filter(tx => tx.status === 'completed').length,
    pendingTransactions: transactions.filter(tx => tx.status === 'pending').length,
    failedTransactions: transactions.filter(tx => tx.status === 'failed' || tx.status === 'error').length,
    totalVolume: {
      usd: 0,
      kes: 0
    },
    mostUsedChain: '',
    mostUsedToken: '',
    averageTransactionSize: 0,
    recentActivity: {
      last24h: 0,
      last7d: 0,
      last30d: 0
    }
  };

  // Calculate volumes and find most used
  const chainCount: {[key: string]: number} = {};
  const tokenCount: {[key: string]: number} = {};
  let totalUsdVolume = 0;
  let totalKesVolume = 0;

  transactions.forEach(tx => {
    if (tx.status === 'completed') {
      totalUsdVolume += tx.values.usd.amount || 0;
      totalKesVolume += tx.values.kes.amount || 0;
      
      const chain = tx.blockchain.chain;
      const token = tx.token.symbol;
      
      chainCount[chain] = (chainCount[chain] || 0) + 1;
      tokenCount[token] = (tokenCount[token] || 0) + 1;
    }

    // Count recent activity
    const ageHours = tx.timing.ageMinutes / 60;
    if (ageHours <= 24) insights.recentActivity.last24h++;
    if (ageHours <= 168) insights.recentActivity.last7d++; // 7 days
    if (ageHours <= 720) insights.recentActivity.last30d++; // 30 days
  });

  insights.totalVolume.usd = totalUsdVolume;
  insights.totalVolume.kes = totalKesVolume;
  insights.mostUsedChain = Object.keys(chainCount).reduce((a, b) => chainCount[a] > chainCount[b] ? a : b, '');
  insights.mostUsedToken = Object.keys(tokenCount).reduce((a, b) => tokenCount[a] > tokenCount[b] ? a : b, '');
  insights.averageTransactionSize = insights.completedTransactions > 0 ? totalUsdVolume / insights.completedTransactions : 0;

  return insights;
} 