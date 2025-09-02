import { Chain, TokenSymbol, TokenConfig } from '../types/token';

// Re-export the types for use in other files
export { Chain, TokenSymbol, TokenConfig };

type ChainTokens = {
    [key in TokenSymbol]?: TokenConfig;
};

type TokenConfigurations = {
    [key in Chain]: ChainTokens;
};

export const tokenConfigs: TokenConfigurations = {
    arbitrum: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', name: 'USD Coin' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', name: 'Tether USD' },
        DAI: { symbol: 'DAI', decimals: 18, address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', name: 'Dai Stablecoin' },
        WBTC: { symbol: 'WBTC', decimals: 8, address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', name: 'Wrapped Bitcoin' },
        WETH: { symbol: 'WETH', decimals: 18, address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', name: 'Wrapped Ether' },
        ARB: { symbol: 'ARB', decimals: 18, address: '0x912CE59144191C1204E64559FE8253a0e49E6548', name: 'Arbitrum' }
    },
    optimism: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', name: 'USD Coin' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', name: 'Tether USD' },
        DAI: { symbol: 'DAI', decimals: 18, address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', name: 'Dai Stablecoin' },
        WBTC: { symbol: 'WBTC', decimals: 8, address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', name: 'Wrapped Bitcoin' },
        WETH: { symbol: 'WETH', decimals: 18, address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether' },
        OP: { symbol: 'OP', decimals: 18, address: '0x4200000000000000000000000000000000000042', name: 'Optimism' }
    },
    polygon: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', name: 'USD Coin' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', name: 'Tether USD' },
        DAI: { symbol: 'DAI', decimals: 18, address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', name: 'Dai Stablecoin' },
        WBTC: { symbol: 'WBTC', decimals: 8, address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', name: 'Wrapped Bitcoin' },
        WETH: { symbol: 'WETH', decimals: 18, address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', name: 'Wrapped Ether' },
        MATIC: { symbol: 'MATIC', decimals: 18, address: '0x0000000000000000000000000000000000001010', name: 'Polygon' }
    },
    base: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin' },
        WETH: { symbol: 'WETH', decimals: 18, address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether' }
    },
    bnb: {
        USDC: { symbol: 'USDC', decimals: 18, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', name: 'USD Coin' },
        USDT: { symbol: 'USDT', decimals: 18, address: '0x55d398326f99059fF775485246999027B3197955', name: 'Tether USD' },
        DAI: { symbol: 'DAI', decimals: 18, address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', name: 'Dai Stablecoin' },
        WBTC: { symbol: 'WBTC', decimals: 18, address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', name: 'Wrapped Bitcoin' },
        WETH: { symbol: 'WETH', decimals: 18, address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', name: 'Wrapped Ether' },
        BNB: { symbol: 'BNB', decimals: 18, address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', name: 'Binance Coin' }
    },
    avalanche: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', name: 'USD Coin' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', name: 'Tether USD' },
        DAI: { symbol: 'DAI', decimals: 18, address: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', name: 'Dai Stablecoin' },
        WBTC: { symbol: 'WBTC', decimals: 8, address: '0x50b7545627a5162F82A992c33b87aDc75187B218', name: 'Wrapped Bitcoin' },
        WETH: { symbol: 'WETH', decimals: 18, address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', name: 'Wrapped Ether' }
    },
    celo: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', name: 'USD Coin' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0x617f3112bf5397D0467D315cC709EF968D9ba546', name: 'Tether USD' }
    },
    // Add minimal token support for other chains
    scroll: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', name: 'USD Coin' }
    },
    gnosis: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', name: 'USD Coin' }
    },
    fantom: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', name: 'USD Coin' }
    },
    somnia: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x1C7312Cb60b40cF586e796FEdD60Cf243286c9E9', name: 'USD Coin' }
    },
    moonbeam: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b', name: 'USD Coin' }
    },
    lisk: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x4e05F8C19EaA61520a94850dC41EAc3c39927696', name: 'USD Coin' }
    },
    fuse: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x620fd5fa44BE6af63715Ef4E65DDFA0387aD13F5', name: 'USD Coin' }
    },
    aurora: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0xB12BFcA5A55806AaF64E99521918A4bf0fC40802', name: 'USD Coin' }
    }
};

export function getTokenConfig(chain: Chain, symbol: TokenSymbol): TokenConfig | undefined {
    return tokenConfigs[chain]?.[symbol];
}

export function getTokenAddress(chain: Chain, symbol: TokenSymbol): string {
    const config = getTokenConfig(chain, symbol);
    if (!config) {
        throw new Error(`Token ${symbol} not supported on chain ${chain}`);
    }
    return config.address;
}

export function getTokenDecimals(chain: Chain, symbol: TokenSymbol): number {
    const config = getTokenConfig(chain, symbol);
    if (!config) {
        throw new Error(`Token ${symbol} not supported on chain ${chain}`);
    }
    return config.decimals;
}

export function getSupportedTokens(chain: Chain): TokenSymbol[] {
    return Object.keys(tokenConfigs[chain]) as TokenSymbol[];
} 