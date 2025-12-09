import { ethers } from 'ethers'
import { createWalletFromPrivateKey } from '../utils/nexusHelper'

export interface UserOperationInput {
  sender: string
  to: string
  value: string
  data: string
  chainId: number
  entryPoint: string
  factoryAddress?: string
  nonce?: bigint
  usePaymaster?: boolean
}

export interface PackedUserOperation {
  sender: string
  nonce: string
  initCode: string
  callData: string
  accountGasLimits: string
  preVerificationGas: string
  gasFees: string
  paymasterAndData: string
  signature: string
}

/**
 * Build a UserOperation for ERC-4337
 */
export async function buildUserOperation(
  input: UserOperationInput,
  ownerPrivateKey: string,
  provider: ethers.Provider
): Promise<PackedUserOperation> {
  const { sender, to, value, data, chainId, entryPoint, factoryAddress, usePaymaster } = input

  // Get nonce from EntryPoint
  const nonce = input.nonce !== undefined ? input.nonce : await getNonce(sender, entryPoint, provider)

  // Check if account is deployed
  const code = await provider.getCode(sender)
  const isDeployed = code !== '0x'

  // Build initCode if account is not deployed
  let initCode = '0x'
  if (!isDeployed && factoryAddress) {
    // Factory address + createAccount calldata
    const factoryInterface = new ethers.Interface([
      'function createAccount(address owner, uint256 salt) returns (address)'
    ])
    const owner = createWalletFromPrivateKey(ownerPrivateKey).address
    const salt = Date.now() // Use timestamp as salt
    const createAccountData = factoryInterface.encodeFunctionData('createAccount', [owner, salt])
    initCode = ethers.concat([factoryAddress, createAccountData])
  }

  // Build callData - call to account's execute() function
  const accountInterface = new ethers.Interface([
    'function execute(address dest, uint256 value, bytes calldata func)'
  ])
  const callData = accountInterface.encodeFunctionData('execute', [to, value, data])

  // Get gas prices
  const feeData = await provider.getFeeData()
  const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('2', 'gwei')
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei')

  // Gas limits
  const verificationGasLimit = 150000n
  const callGasLimit = 200000n
  const preVerificationGas = 50000n

  // Pack accountGasLimits
  const accountGasLimits = ethers.concat([
    ethers.toBeHex(verificationGasLimit, 16),
    ethers.toBeHex(callGasLimit, 16)
  ])

  // Pack gasFees
  const gasFees = ethers.concat([
    ethers.toBeHex(maxPriorityFeePerGas, 16),
    ethers.toBeHex(maxFeePerGas, 16)
  ])

  // Build paymasterAndData (empty for now, will be filled by paymaster service)
  let paymasterAndData = '0x'
  if (usePaymaster) {
    // This should be filled by calling the paymaster service
    // For now, we'll mark it to be filled by the bundler
    paymasterAndData = '0x'
  }

  // Create unsigned UserOperation
  const userOp: PackedUserOperation = {
    sender,
    nonce: ethers.toBeHex(nonce),
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas: ethers.toBeHex(preVerificationGas),
    gasFees,
    paymasterAndData,
    signature: '0x' // Will be filled after signing
  }

  // Sign the UserOperation
  const signature = await signUserOperation(userOp, ownerPrivateKey, entryPoint, chainId)
  userOp.signature = signature

  return userOp
}

/**
 * Get nonce for account from EntryPoint
 */
async function getNonce(
  sender: string,
  entryPoint: string,
  provider: ethers.Provider
): Promise<bigint> {
  try {
    const entryPointContract = new ethers.Contract(
      entryPoint,
      ['function getNonce(address sender, uint192 key) external view returns (uint256)'],
      provider
    )
    return await entryPointContract.getNonce(sender, 0)
  } catch (error) {
    console.warn('Failed to get nonce from EntryPoint, using 0')
    return 0n
  }
}

/**
 * Sign a UserOperation
 */
async function signUserOperation(
  userOp: PackedUserOperation,
  ownerPrivateKey: string,
  entryPoint: string,
  chainId: number
): Promise<string> {
  const wallet = new ethers.Wallet(ownerPrivateKey)

  // Calculate userOpHash
  const userOpHash = getUserOpHash(userOp, entryPoint, chainId)

  // Sign the hash
  const signature = await wallet.signMessage(ethers.getBytes(userOpHash))

  return signature
}

/**
 * Calculate UserOperation hash (matches EntryPoint.getUserOpHash)
 */
function getUserOpHash(
  userOp: PackedUserOperation,
  entryPoint: string,
  chainId: number
): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder()

  const userOpHash = ethers.keccak256(
    abiCoder.encode(
      [
        'address',
        'uint256',
        'bytes32',
        'bytes32',
        'bytes32',
        'uint256',
        'bytes32',
        'bytes32'
      ],
      [
        userOp.sender,
        userOp.nonce,
        ethers.keccak256(userOp.initCode),
        ethers.keccak256(userOp.callData),
        userOp.accountGasLimits,
        userOp.preVerificationGas,
        userOp.gasFees,
        ethers.keccak256(userOp.paymasterAndData)
      ]
    )
  )

  return ethers.keccak256(
    abiCoder.encode(
      ['bytes32', 'address', 'uint256'],
      [userOpHash, entryPoint, chainId]
    )
  )
}

/**
 * Submit UserOperation to bundler
 */
export async function submitUserOperation(
  userOp: PackedUserOperation,
  entryPoint: string,
  bundlerUrl: string = 'http://localhost:4337'
): Promise<string> {
  const response = await fetch(`${bundlerUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [userOp, entryPoint]
    })
  })

  const result = await response.json()

  if (result.error) {
    throw new Error(`Bundler error: ${result.error.message}`)
  }

  return result.result // userOpHash
}

