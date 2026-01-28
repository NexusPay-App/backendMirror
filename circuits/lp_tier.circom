pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * LP Tier Proof
 * Proves: User's liquidity position qualifies for a specific tier
 * Tiers: Bronze (<$1000), Silver ($1000-$5000), Gold ($5000-$25000), Platinum (>$25000)
 * 
 * Private inputs:
 * - liquidityAmount: Actual liquidity amount
 * - amountSalt: Random salt
 * 
 * Public inputs:
 * - tierThreshold: Minimum amount for tier
 * - maxTierThreshold: Maximum amount for tier (0 if no max)
 * - amountCommitment: Hash of amount
 * - userId: User identifier
 */

template LPTier() {
    // Private inputs
    signal input liquidityAmount;
    signal input amountSalt;
    
    // Public inputs
    signal input tierThreshold;
    signal input maxTierThreshold;
    signal input amountCommitment;
    signal input userId;
    
    // Output
    signal output valid;
    
    // Verify commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== liquidityAmount;
    hasher.inputs[1] <== amountSalt;
    amountCommitment === hasher.out;
    
    // Check amount >= tierThreshold
    component gte = GreaterEqThan(64);
    gte.in[0] <== liquidityAmount;
    gte.in[1] <== tierThreshold;
    gte.out === 1;
    
    // If maxTierThreshold > 0, check amount < maxTierThreshold
    component hasMax = GreaterThan(64);
    hasMax.in[0] <== maxTierThreshold;
    hasMax.in[1] <== 0;
    
    component lteMax = LessThan(64);
    lteMax.in[0] <== liquidityAmount;
    lteMax.in[1] <== maxTierThreshold;
    
    // If hasMax, must be less than max; otherwise don't care
    signal maxCheck <== hasMax.out * (1 - lteMax.out);
    maxCheck === 0;
    
    // Amount must be positive
    component gtZero = GreaterThan(64);
    gtZero.in[0] <== liquidityAmount;
    gtZero.in[1] <== 0;
    gtZero.out === 1;
    
    valid <== 1;
}

component main {public [tierThreshold, maxTierThreshold, amountCommitment, userId]} = LPTier();
