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

export type Chain = 'arbitrum' | 'celo' | 'optimism' | 'polygon' | 'base' | 'avalanche' | 'bnb' | 'scroll' | 'gnosis' | 'fantom' | 'somnia' | 'moonbeam' | 'fuse' | 'aurora' | 'lisk';

export type TokenSymbol = 'USDC' | 'USDT' | 'DAI' | 'CKES' | 'BNB' | 'WBTC' | 'WETH' | 'MATIC' | 'ARB' | 'TRX' | 'SOL' | 'OP';

export interface TokenConfig {
    symbol: TokenSymbol;
    decimals: number;
    address: string;
}
