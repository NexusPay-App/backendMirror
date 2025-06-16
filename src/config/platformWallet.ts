import { ethers } from 'ethers';
import { TokenSymbol } from './tokens';

// Platform fee collection wallet - this should be a secure multi-sig wallet
export const PLATFORM_FEE_WALLET = {
    ADDRESS: process.env.PLATFORM_FEE_WALLET_ADDRESS!,
    ADMIN_ADDRESSES: (process.env.PLATFORM_FEE_ADMIN_ADDRESSES || '').split(','),
    MIN_SIGNATURES: Number(process.env.PLATFORM_FEE_MIN_SIGNATURES || 2)
};

// Platform wallet types
export enum PlatformWalletAction {
    WITHDRAW = 'WITHDRAW',
    VIEW_BALANCE = 'VIEW_BALANCE',
    TRANSFER = 'TRANSFER'
}

// Platform wallet permissions
export interface IPlatformWalletPermission {
    action: PlatformWalletAction;
    requiredSignatures: number;
}

// Permission requirements for different actions
export const PLATFORM_WALLET_PERMISSIONS: Record<PlatformWalletAction, IPlatformWalletPermission> = {
    [PlatformWalletAction.WITHDRAW]: {
        action: PlatformWalletAction.WITHDRAW,
        requiredSignatures: PLATFORM_FEE_WALLET.MIN_SIGNATURES
    },
    [PlatformWalletAction.VIEW_BALANCE]: {
        action: PlatformWalletAction.VIEW_BALANCE,
        requiredSignatures: 1
    },
    [PlatformWalletAction.TRANSFER]: {
        action: PlatformWalletAction.TRANSFER,
        requiredSignatures: PLATFORM_FEE_WALLET.MIN_SIGNATURES
    }
}; 