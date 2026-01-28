pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * LP Reward Claim Proof
 * Proves: User is eligible to claim reward (has active position with sufficient duration)
 * 
 * Private inputs:
 * - liquidityAmount: Current liquidity
 * - stakeTimestamp: When staked
 * - lastClaimTimestamp: Last reward claim
 * - rewardSalt: Random salt
 * 
 * Public inputs:
 * - currentTimestamp: Current time
 * - minAmount: Minimum liquidity required
 * - minDaysBetweenClaims: Minimum days between claims
 * - rewardCommitment: Hash of reward data
 * - userId: User identifier
 */

template LPRewardClaim() {
    // Private inputs
    signal input liquidityAmount;
    signal input stakeTimestamp;
    signal input lastClaimTimestamp;
    signal input rewardSalt;
    
    // Public inputs
    signal input currentTimestamp;
    signal input minAmount;
    signal input minDaysBetweenClaims;
    signal input rewardCommitment;
    signal input userId;
    
    // Output
    signal output valid;
    
    // Verify commitment
    component hasher = Poseidon(4);
    hasher.inputs[0] <== liquidityAmount;
    hasher.inputs[1] <== stakeTimestamp;
    hasher.inputs[2] <== lastClaimTimestamp;
    hasher.inputs[3] <== rewardSalt;
    rewardCommitment === hasher.out;
    
    // Check liquidityAmount >= minAmount
    component gteAmount = GreaterEqThan(64);
    gteAmount.in[0] <== liquidityAmount;
    gteAmount.in[1] <== minAmount;
    gteAmount.out === 1;
    
    // Check time since last claim
    signal timeSinceClaim <== currentTimestamp - lastClaimTimestamp;
    signal daysSinceClaim <== timeSinceClaim \ 86400;
    
    component gteDays = GreaterEqThan(32);
    gteDays.in[0] <== daysSinceClaim;
    gteDays.in[1] <== minDaysBetweenClaims;
    gteDays.out === 1;
    
    // Sanity checks
    component validStake = LessThan(64);
    validStake.in[0] <== stakeTimestamp;
    validStake.in[1] <== currentTimestamp;
    validStake.out === 1;
    
    component validClaim = LessEqThan(64);
    validClaim.in[0] <== lastClaimTimestamp;
    validClaim.in[1] <== currentTimestamp;
    validClaim.out === 1;
    
    valid <== 1;
}

component main {public [currentTimestamp, minAmount, minDaysBetweenClaims, rewardCommitment, userId]} = LPRewardClaim();
