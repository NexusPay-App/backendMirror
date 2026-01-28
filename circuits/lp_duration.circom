pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * LP Duration Proof
 * Proves: User has held liquidity position for >= minDays
 * 
 * Private inputs:
 * - stakeTimestamp: When liquidity was provided (unix timestamp)
 * - durationSalt: Random salt
 * 
 * Public inputs:
 * - currentTimestamp: Current time
 * - minDays: Minimum days staked
 * - durationCommitment: Hash of stake data
 * - userId: User identifier
 */

template LPDuration() {
    // Private inputs
    signal input stakeTimestamp;
    signal input durationSalt;
    
    // Public inputs
    signal input currentTimestamp;
    signal input minDays;
    signal input durationCommitment;
    signal input userId;
    
    // Output
    signal output valid;
    
    // Verify commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== stakeTimestamp;
    hasher.inputs[1] <== durationSalt;
    durationCommitment === hasher.out;
    
    // Calculate days staked (seconds / 86400)
    signal timeStaked <== currentTimestamp - stakeTimestamp;
    signal daysStaked <== timeStaked \ 86400;
    
    // Check daysStaked >= minDays
    component gte = GreaterEqThan(32);
    gte.in[0] <== daysStaked;
    gte.in[1] <== minDays;
    gte.out === 1;
    
    // Sanity check: stakeTimestamp < currentTimestamp
    component validTime = LessThan(64);
    validTime.in[0] <== stakeTimestamp;
    validTime.in[1] <== currentTimestamp;
    validTime.out === 1;
    
    valid <== 1;
}

component main {public [currentTimestamp, minDays, durationCommitment, userId]} = LPDuration();
