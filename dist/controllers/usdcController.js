"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsdcBalance = void 0;
exports.conversionController = conversionController;
const ethers_1 = require("ethers");
const constants_1 = require("../config/constants");
const token_1 = require("../services/token");
const abi_1 = require("../config/abi");
async function conversionController(req, res) {
    const rate = await (0, token_1.getConversionRateWithCaching)();
    console.log(rate);
    res.send({ rate });
}
const getUsdcBalance = async (req, res) => {
    try {
        const address = req.params.address;
        console.log(address);
        const usdcContract = new ethers_1.ethers.Contract(constants_1.tokenAddress, abi_1.usdcAbi, constants_1.provider);
        const balanceRaw = await usdcContract.balanceOf(address);
        console.log(balanceRaw.toString()); // Display balance as string for debugging
        const decimals = await usdcContract.decimals();
        console.log(`decimals: ${decimals}`);
        // Convert raw balance to a number in USDC by dividing by 10^decimals
        // const balanceInUSDC = balanceRaw.div(ethers.BigNumber.from(10).pow(decimals)).toNumber();
        const balanceInUSDC = ethers_1.ethers.utils.formatUnits(balanceRaw, decimals);
        console.log(balanceInUSDC);
        const conversionRate = await (0, token_1.getConversionRateWithCaching)();
        const balanceInKES = balanceInUSDC * conversionRate;
        console.log(balanceInKES);
        res.json({
            balanceInUSDC: balanceInUSDC,
            balanceInKES: balanceInKES.toFixed(2),
            rate: conversionRate
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).send('Failed to fetch balance.');
    }
};
exports.getUsdcBalance = getUsdcBalance;
