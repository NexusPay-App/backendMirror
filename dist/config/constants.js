"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenContract = exports.tokenAddress = exports.provider = exports.celo = void 0;
exports.getProvider = getProvider;
exports.getTokenAddress = getTokenAddress;
const ethers_1 = require("ethers");
const abi_1 = require("./abi");
const thirdweb_1 = require("thirdweb");
const env_1 = __importDefault(require("./env"));
exports.celo = (0, thirdweb_1.defineChain)(env_1.default["celo"].chainId);
// export const provider = new providers.JsonRpcProvider("https://rpc.ankr.com/polygon_mumbai")
exports.provider = new ethers_1.providers.JsonRpcProvider("https://arb-mainnet.g.alchemy.com/v2/BsIntFyzOmCo53B6JR2WdYNk-j_4g2TM");
exports.tokenAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
exports.tokenContract = new ethers_1.ethers.Contract(exports.tokenAddress, abi_1.ERC20ABI, exports.provider);
function getProvider(chain) {
    switch (chain) {
        case 'arbitrum':
            return new ethers_1.ethers.providers.JsonRpcProvider('https://arb-mainnet.g.alchemy.com/v2/BsIntFyzOmCo53B6JR2WdYNk-j_4g2TM');
        case 'celo':
            return new ethers_1.ethers.providers.JsonRpcProvider('https://forno.celo.org');
        default:
            throw new Error(`Unsupported chain: ${chain}`);
    }
}
function getTokenAddress(chain) {
    switch (chain) {
        case 'arbitrum':
            return '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC address
        case 'celo':
            return '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'; // Celo USDC address
        default:
            throw new Error(`Unsupported chain: ${chain}`);
    }
}
