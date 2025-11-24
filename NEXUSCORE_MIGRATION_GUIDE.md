# NexusPay → NexusCore SDK Migration Guide

## Overview
This document tracks the migration from Thirdweb SDK to NexusCore SDK in the NexusPay backend.

## Migration Status

### ✅ Completed
- [x] NexusCore SDK installation

### 🔄 In Progress
- [ ] Auth service migration
- [ ] Wallet service migration
- [ ] Platform wallet service migration
- [ ] Token service migration
- [ ] Controller migrations

### ⏳ Pending
- [ ] Configuration updates
- [ ] Testing
- [ ] Documentation updates
- [ ] Remove Thirdweb dependencies

## Key Differences

### Thirdweb → NexusCore Mapping

| Thirdweb | NexusCore | Notes |
|----------|-----------|-------|
| `createThirdwebClient()` | `NexusClient.create()` | Client initialization |
| `privateKeyToAccount()` | `privateKeyToAccount()` | Same concept, different implementation |
| `smartWallet()` | `AccountFactory.createSmartAccount()` | Smart account creation |
| `defineChain()` | Built-in chain support | NexusCore has predefined chains |
| `getContract()` | Contract interaction via NexusClient | Different approach |
| `transfer()` | `transferToken()` | ERC20 transfers |
| `balanceOf()` | `getTokenBalance()` | Balance queries |

## Migration Strategy

1. **Keep both SDKs temporarily** - Gradual migration without breaking existing functionality
2. **Service-by-service approach** - Migrate one service at a time
3. **Test each migration** - Ensure functionality before moving to next service
4. **Document improvements** - Track SDK enhancements needed

## Files to Migrate

### Priority 1: Core Services
- [x] `src/services/auth.ts` - Account creation
- [ ] `src/services/wallet.ts` - Basic wallet operations
- [ ] `src/config/env.ts` - Configuration updates

### Priority 2: Advanced Services
- [ ] `src/services/platformWallet.ts` - Multi-sig operations
- [ ] `src/services/token.ts` - Token operations

### Priority 3: Controllers
- [ ] `src/controllers/tokenController.ts`
- [ ] `src/controllers/mpesaController.ts`
- [ ] `src/controllers/businessController.ts`
- [ ] `src/controllers/enhancedBusinessController.ts`

## Breaking Changes

None expected - NexusCore is designed to be a drop-in replacement with similar APIs.

## Improvements Identified

1. **Gas Sponsorship** - NexusCore has more flexible paymaster integration
2. **Multi-chain Support** - Better chain configuration management
3. **Error Handling** - More detailed error messages
4. **Type Safety** - Improved TypeScript types

## Testing Checklist

- [ ] Account creation works
- [ ] Token transfers work
- [ ] Balance queries work
- [ ] Multi-sig operations work
- [ ] Gas sponsorship works
- [ ] All chains supported
- [ ] Error handling works
- [ ] Performance is acceptable

## Rollback Plan

If issues arise:
1. Git revert to previous commit
2. Keep Thirdweb dependencies
3. Document issues for NexusCore SDK improvement

## Next Steps

1. Migrate auth service (createAccount)
2. Migrate wallet service (transfers, balances)
3. Test basic operations
4. Continue with remaining services

