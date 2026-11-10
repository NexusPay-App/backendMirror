// EIP-712 signing and verification for BotContracts quotes.
// The type strings, field order and domain here must match the Solidity contracts exactly:
//   bridge/BotBridgeHub.sol  -> BRIDGE_QUOTE_TYPEHASH
//   swap/BotSwapEscrow.sol   -> SWAP_QUOTE_TYPEHASH
// A quote's `quoteId` is the EIP-712 struct hash, so it is reproducible off chain and is the
// primary key for replay protection on chain.

import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  recoverTypedDataAddress,
  stringToHex,
} from 'viem'
import type { Address, Hex, LocalAccount } from 'viem'
import type { BridgeQuote, SwapQuote } from './types'

export const BRIDGE_DOMAIN_NAME = 'NexusPay BotBridge'
export const SWAP_DOMAIN_NAME = 'NexusPay BotSwap'
export const EIP712_VERSION = '1'

const BRIDGE_QUOTE_TYPE =
  'BridgeQuote(address token,uint256 amountIn,address trader,uint256 destChainId,address destToken,address destAccount,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce)'

const SWAP_QUOTE_TYPE =
  'SwapQuote(address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,address trader,address recipient,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce)'

const EIP712_DOMAIN_TYPE =
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'

export const BRIDGE_QUOTE_TYPEHASH: Hex = keccak256(stringToHex(BRIDGE_QUOTE_TYPE))
export const SWAP_QUOTE_TYPEHASH: Hex = keccak256(stringToHex(SWAP_QUOTE_TYPE))

const EIP712_DOMAIN_TYPEHASH: Hex = keccak256(stringToHex(EIP712_DOMAIN_TYPE))

/// Struct encoding params. Kept as strings so they are auditable against the Solidity `abi.encode`.
const BRIDGE_STRUCT_PARAMS = parseAbiParameters(
  'bytes32, address, uint256, address, uint256, address, address, uint256, uint256, uint256, uint256',
)

const SWAP_STRUCT_PARAMS = parseAbiParameters(
  'bytes32, address, uint256, address, uint256, address, address, uint256, uint256, uint256, uint256',
)

export interface Eip712Context {
  chainId: number
  verifyingContract: Address
}

interface TypedDataDomain {
  name: string
  version: string
  chainId: number
  verifyingContract: Address
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export function bridgeDomain(context: Eip712Context): TypedDataDomain {
  return {
    name: BRIDGE_DOMAIN_NAME,
    version: EIP712_VERSION,
    chainId: context.chainId,
    verifyingContract: context.verifyingContract,
  }
}

export function swapDomain(context: Eip712Context): TypedDataDomain {
  return {
    name: SWAP_DOMAIN_NAME,
    version: EIP712_VERSION,
    chainId: context.chainId,
    verifyingContract: context.verifyingContract,
  }
}

/// Must equal `domainSeparator()` on the contract.
export function domainSeparator(domain: TypedDataDomain): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32, bytes32, uint256, address'),
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(stringToHex(domain.name)),
        keccak256(stringToHex(domain.version)),
        BigInt(domain.chainId),
        domain.verifyingContract,
      ],
    ),
  )
}

// ---------------------------------------------------------------------------
// Bridge quotes
// ---------------------------------------------------------------------------

/// EIP-712 struct hash, identical to `BotBridgeHub.quoteIdOf`.
export function bridgeQuoteId(quote: BridgeQuote): Hex {
  return keccak256(
    encodeAbiParameters(BRIDGE_STRUCT_PARAMS, [
      BRIDGE_QUOTE_TYPEHASH,
      quote.token,
      quote.amountIn,
      quote.trader,
      quote.destChainId,
      quote.destToken,
      quote.destAccount,
      quote.minOut,
      quote.feeBps,
      quote.expiresAt,
      quote.nonce,
    ]),
  )
}

/// Digest the broker signs, identical to `BotBridgeHub.quoteDigest`.
export function bridgeQuoteDigest(quote: BridgeQuote, domain: TypedDataDomain): Hex {
  return keccak256(concatHex(['0x1901', domainSeparator(domain), bridgeQuoteId(quote)]))
}

const BRIDGE_TYPES = {
  BridgeQuote: [
    { name: 'token', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'trader', type: 'address' },
    { name: 'destChainId', type: 'uint256' },
    { name: 'destToken', type: 'address' },
    { name: 'destAccount', type: 'address' },
    { name: 'minOut', type: 'uint256' },
    { name: 'feeBps', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

function bridgeMessage(quote: BridgeQuote) {
  return {
    token: quote.token,
    amountIn: quote.amountIn,
    trader: quote.trader,
    destChainId: quote.destChainId,
    destToken: quote.destToken,
    destAccount: quote.destAccount,
    minOut: quote.minOut,
    feeBps: quote.feeBps,
    expiresAt: quote.expiresAt,
    nonce: quote.nonce,
  }
}

export async function signBridgeQuote(
  account: LocalAccount,
  quote: BridgeQuote,
  domain: TypedDataDomain,
): Promise<Hex> {
  return account.signTypedData({
    domain,
    types: BRIDGE_TYPES,
    primaryType: 'BridgeQuote',
    message: bridgeMessage(quote),
  })
}

export async function recoverBridgeQuoteSigner(
  quote: BridgeQuote,
  signature: Hex,
  domain: TypedDataDomain,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain,
    types: BRIDGE_TYPES,
    primaryType: 'BridgeQuote',
    message: bridgeMessage(quote),
    signature,
  })
}

// ---------------------------------------------------------------------------
// Swap quotes
// ---------------------------------------------------------------------------

/// EIP-712 struct hash, identical to `BotSwapEscrow.quoteIdOf`.
export function swapQuoteId(quote: SwapQuote): Hex {
  return keccak256(
    encodeAbiParameters(SWAP_STRUCT_PARAMS, [
      SWAP_QUOTE_TYPEHASH,
      quote.tokenIn,
      quote.amountIn,
      quote.tokenOut,
      quote.amountOut,
      quote.trader,
      quote.recipient,
      quote.minOut,
      quote.feeBps,
      quote.expiresAt,
      quote.nonce,
    ]),
  )
}

/// Digest the broker signs, identical to `BotSwapEscrow.quoteDigest`.
export function swapQuoteDigest(quote: SwapQuote, domain: TypedDataDomain): Hex {
  return keccak256(concatHex(['0x1901', domainSeparator(domain), swapQuoteId(quote)]))
}

const SWAP_TYPES = {
  SwapQuote: [
    { name: 'tokenIn', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amountOut', type: 'uint256' },
    { name: 'trader', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'minOut', type: 'uint256' },
    { name: 'feeBps', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

function swapMessage(quote: SwapQuote) {
  return {
    tokenIn: quote.tokenIn,
    amountIn: quote.amountIn,
    tokenOut: quote.tokenOut,
    amountOut: quote.amountOut,
    trader: quote.trader,
    recipient: quote.recipient,
    minOut: quote.minOut,
    feeBps: quote.feeBps,
    expiresAt: quote.expiresAt,
    nonce: quote.nonce,
  }
}

export async function signSwapQuote(
  account: LocalAccount,
  quote: SwapQuote,
  domain: TypedDataDomain,
): Promise<Hex> {
  return account.signTypedData({
    domain,
    types: SWAP_TYPES,
    primaryType: 'SwapQuote',
    message: swapMessage(quote),
  })
}

export async function recoverSwapQuoteSigner(
  quote: SwapQuote,
  signature: Hex,
  domain: TypedDataDomain,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain,
    types: SWAP_TYPES,
    primaryType: 'SwapQuote',
    message: swapMessage(quote),
    signature,
  })
}
