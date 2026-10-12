import { ethers } from 'ethers';
import { chains } from '../config/chains';
import type { Chain } from '../types/token';
function network(name: string) { const config = chains[name as Chain]; if (!config) throw new Error(`Unsupported chain: ${name}`); return config; }
export const getProvider = (chain: string) => new ethers.JsonRpcProvider(network(chain).rpc, network(chain).id);
export const getChainId = (chain: string) => network(chain).id;
export const getWallet = (privateKey: string, chain = 'arbitrum') => new ethers.Wallet(privateKey, getProvider(chain));
export const getSupportedChains = () => Object.keys(chains);
