export type TokenTransferEvent = {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    nonce: string;
    blockHash: string;
    from: string;
    contractAddress: string;
    to: string;
    value: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    transactionIndex: string;
    gas: string;
    gasPrice: string;
    gasUsed: string;
    cumulativeGasUsed: string;
    input: string;
    confirmations: string;
}

export type Chain = 'arbitrum' | 'celo' | 'optimism' | 'polygon' | 'base' | 'avalanche' | 'bnb' | 'scroll' | 'gnosis' | 'fantom' | 'somnia' | 'moonbeam' | 'lisk' | 'fuse' | 'aurora';

export type TokenSymbol = 'USDC' | 'USDT' | 'DAI' | 'BNB' | 'WBTC' | 'WETH' | 'MATIC' | 'ARB' | 'TRX' | 'SOL' | 'OP' | 'cUSD';

export interface TokenConfig {
    address: `0x${string}`;
    decimals: number;
    symbol: TokenSymbol;
    name: string;
}

export interface TokenBalance {
    symbol: TokenSymbol;
    balance: number;
    usdValue: number;
}
