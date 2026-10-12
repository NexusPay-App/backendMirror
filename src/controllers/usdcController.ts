import { Request, Response } from 'express';
import { Contract, JsonRpcProvider, formatUnits, isAddress } from 'ethers';
import { chains } from '../config/chains';
import { tokenConfigs } from '../config/tokens';
import { getRateQuote } from '../services/rates';
import type { Chain } from '../types/token';

export async function conversionController(req: Request, res: Response) {
  try {
    const quote = await getRateQuote('USDC', req.path.endsWith('/refresh'));
    res.json({ ...quote, currency: 'KES', baseCurrency: 'USDC', timestamp: quote.quotedAt });
  } catch {
    res.status(503).json({ success: false, message: 'A current conversion rate is unavailable' });
  }
}

export const getUsdcBalance = async (req: Request, res: Response) => {
  const chain = (typeof req.query.chain === 'string' ? req.query.chain : 'arbitrum') as Chain;
  const token = tokenConfigs[chain]?.USDC;
  const address = String(req.params.address);
  if (!chains[chain] || !token || !isAddress(token.address) || !isAddress(address)) {
    return res.status(400).json({ success: false, message: 'Invalid address or unavailable USDC network' });
  }
  try {
    const contract = new Contract(token.address, ['function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)'], new JsonRpcProvider(chains[chain].rpc));
    const [units, decimals] = await Promise.all([contract.balanceOf(address), contract.decimals()]);
    if (Number(decimals) !== token.decimals) throw new Error('Token metadata mismatch');
    const balanceInUSDC = formatUnits(units, token.decimals);
    // Fiat values are display quotes only; signing uses integer token base units.
    const quote = await getRateQuote('USDC').catch(() => null);
    return res.json({ balanceInUSDC, balanceInKES: quote ? (Number(balanceInUSDC) * quote.rate).toFixed(2) : null, rate: quote?.rate ?? null, quotedAt: quote?.quotedAt ?? null, chain });
  } catch {
    return res.status(503).json({ success: false, message: 'Unable to read this token balance' });
  }
};
