"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenTransferEventsValidation = exports.payMerchantValidation = exports.sendTokenValidation = void 0;
const express_validator_1 = require("express-validator");
const ethers_1 = require("ethers");
/**
 * Validate the send token request
 */
exports.sendTokenValidation = [
    (0, express_validator_1.body)('recipientIdentifier')
        .notEmpty()
        .withMessage('Recipient identifier is required')
        .custom((value) => {
        // Check if it's a valid wallet address or a valid phone number
        const isPhoneNumber = /^\+[1-9]\d{1,14}$/.test(value);
        const isAddress = ethers_1.ethers.utils.isAddress(value);
        if (!isPhoneNumber && !isAddress) {
            throw new Error('Recipient must be a valid wallet address or phone number in E.164 format');
        }
        return true;
    }),
    (0, express_validator_1.body)('amount')
        .notEmpty()
        .withMessage('Amount is required')
        .isNumeric()
        .withMessage('Amount must be a valid number')
        .custom((value) => {
        // Ensure amount is positive
        if (parseFloat(value) <= 0) {
            throw new Error('Amount must be greater than 0');
        }
        return true;
    }),
    (0, express_validator_1.body)('senderAddress')
        .notEmpty()
        .withMessage('Sender address is required')
        .custom((value) => {
        if (!ethers_1.ethers.utils.isAddress(value)) {
            throw new Error('Sender address must be a valid Ethereum address');
        }
        return true;
    }),
    (0, express_validator_1.body)('chain')
        .notEmpty()
        .withMessage('Chain is required')
        .isIn(['arbitrum', 'celo'])
        .withMessage('Chain must be either "arbitrum" or "celo"')
];
/**
 * Validate the merchant payment request
 */
exports.payMerchantValidation = [
    (0, express_validator_1.body)('senderAddress')
        .notEmpty()
        .withMessage('Sender address is required')
        .custom((value) => {
        if (!ethers_1.ethers.utils.isAddress(value)) {
            throw new Error('Sender address must be a valid Ethereum address');
        }
        return true;
    }),
    (0, express_validator_1.body)('businessUniqueCode')
        .notEmpty()
        .withMessage('Business unique code is required'),
    (0, express_validator_1.body)('amount')
        .notEmpty()
        .withMessage('Amount is required')
        .isNumeric()
        .withMessage('Amount must be a valid number')
        .custom((value) => {
        if (parseFloat(value) <= 0) {
            throw new Error('Amount must be greater than 0');
        }
        return true;
    }),
    (0, express_validator_1.body)('chainName')
        .notEmpty()
        .withMessage('Chain name is required')
        .isIn(['arbitrum', 'celo'])
        .withMessage('Chain must be either "arbitrum" or "celo"')
];
/**
 * Validate token transfer events query
 */
exports.tokenTransferEventsValidation = [
    (0, express_validator_1.query)('address')
        .notEmpty()
        .withMessage('Wallet address is required')
        .custom((value) => {
        if (!ethers_1.ethers.utils.isAddress(value)) {
            throw new Error('Address must be a valid Ethereum address');
        }
        return true;
    }),
    (0, express_validator_1.query)('chain')
        .notEmpty()
        .withMessage('Chain is required')
        .isIn(['arbitrum', 'celo'])
        .withMessage('Chain must be either "arbitrum" or "celo"'),
    (0, express_validator_1.query)('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];
