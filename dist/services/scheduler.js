"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runImmediateRetry = exports.stopSchedulers = exports.startSchedulers = void 0;
const mpesaRetry_1 = require("./mpesaRetry");
// Track interval IDs so they can be cleared if needed
const intervals = [];
/**
 * Start all scheduled tasks
 */
const startSchedulers = () => {
    console.log('🕒 Starting schedulers...');
    // Schedule MPESA retry every 15 minutes
    const mpesaRetryInterval = setInterval(async () => {
        try {
            await (0, mpesaRetry_1.retryAllFailedTransactions)();
        }
        catch (error) {
            console.error('❌ Error in MPESA retry scheduler:', error);
        }
    }, 15 * 60 * 1000); // 15 minutes
    intervals.push(mpesaRetryInterval);
    console.log('✅ Schedulers started successfully');
};
exports.startSchedulers = startSchedulers;
/**
 * Stop all scheduled tasks
 */
const stopSchedulers = () => {
    console.log('🛑 Stopping schedulers...');
    intervals.forEach(interval => clearInterval(interval));
    intervals.length = 0; // Clear the array
    console.log('✅ All schedulers stopped');
};
exports.stopSchedulers = stopSchedulers;
/**
 * Run an immediate retry of all failed transactions
 * Useful for manual invocation or testing
 */
const runImmediateRetry = async () => {
    console.log('🔄 Running immediate retry of failed transactions');
    try {
        await (0, mpesaRetry_1.retryAllFailedTransactions)();
        console.log('✅ Immediate retry completed');
    }
    catch (error) {
        console.error('❌ Error in immediate retry:', error);
    }
};
exports.runImmediateRetry = runImmediateRetry;
