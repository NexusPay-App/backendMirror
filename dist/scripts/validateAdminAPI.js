"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
// Files to validate
const filesToValidate = [
    'src/routes/adminRoutes.ts',
    'src/middleware/roleMiddleware.ts',
    'src/middleware/validators/adminValidators.ts',
    'src/controllers/adminController.ts',
    'src/services/wallet.ts',
    'API_DOCUMENTATION.md'
];
// Expected features to validate
const expectedFeatures = {
    routes: [
        { name: 'User listing endpoint', pattern: /router\.get\(["']\/users["']/ },
        { name: 'User by ID endpoint', pattern: /router\.get\(["']\/users\/:\w+["']/ },
        { name: 'Promote to admin endpoint', pattern: /router\.post\(["']\/users\/promote\/:\w+["']/ },
        { name: 'Transactions listing endpoint', pattern: /router\.get\(["']\/transactions["']/ },
        { name: 'Transaction by ID endpoint', pattern: /router\.get\(["']\/transactions\/:\w+["']/ },
        { name: 'Update transaction status endpoint', pattern: /router\.put\(["']\/transactions\/:\w+\/status["']/ },
        { name: 'Platform wallets endpoint', pattern: /router\.get\(["']\/platform-wallets["']/ },
        { name: 'Fund user wallet endpoint', pattern: /router\.post\(["']\/wallets\/fund["']/ },
        { name: 'Withdraw fees endpoint', pattern: /router\.post\(["']\/wallets\/withdraw-fees["']/ }
    ],
    authentication: [
        { name: 'Admin role middleware', pattern: /isAdmin[\s]*=[\s]*\(req:[\s]*Request,[\s]*res:[\s]*Response,[\s]*next:[\s]*NextFunction\)/ },
        { name: 'Role check implementation', pattern: /if[\s]*\(req\.user\.role[\s]*!==[\s]*['"]admin['"]\)/ }
    ],
    validators: [
        { name: 'Users validation', pattern: /getUsersValidation[\s]*=/ },
        { name: 'User by ID validation', pattern: /getUserByIdValidation[\s]*=/ },
        { name: 'Transaction validation', pattern: /transactionLookupValidation[\s]*=/ },
        { name: 'Wallet funding validation', pattern: /walletFundingValidation[\s]*=/ }
    ],
    controllers: [
        { name: 'Get users implementation', pattern: /export[\s]*const[\s]*getUsers[\s]*=[\s]*async/ },
        { name: 'Get user by ID implementation', pattern: /export[\s]*const[\s]*getUserById[\s]*=[\s]*async/ },
        { name: 'Promote to admin implementation', pattern: /export[\s]*const[\s]*promoteToAdmin[\s]*=[\s]*async/ },
        { name: 'Get transactions implementation', pattern: /export[\s]*const[\s]*getTransactions[\s]*=[\s]*async/ },
        { name: 'Get transaction by ID implementation', pattern: /export[\s]*const[\s]*getTransactionById[\s]*=[\s]*async/ },
        { name: 'Update transaction status implementation', pattern: /export[\s]*const[\s]*updateTransactionStatus[\s]*=[\s]*async/ },
        { name: 'Get platform wallets implementation', pattern: /export[\s]*const[\s]*getPlatformWallets[\s]*=[\s]*async/ },
        { name: 'Fund user wallet implementation', pattern: /export[\s]*const[\s]*fundUserWallet[\s]*=[\s]*async/ },
        { name: 'Withdraw fees implementation', pattern: /export[\s]*const[\s]*withdrawFeesToMainWallet[\s]*=[\s]*async/ }
    ],
    services: [
        { name: 'Get wallet balance', pattern: /getWalletBalance[\s]*\([\s]*walletAddress:[\s]*string/ },
        { name: 'Transfer tokens', pattern: /transferTokens[\s]*\([\s]*sourcePrivateKey:[\s]*string/ }
    ],
    documentation: [
        { name: 'Get users documentation', pattern: /GET[\s]*\/admin\/users/ },
        { name: 'Get user by ID documentation', pattern: /GET[\s]*\/admin\/users\/:id/ },
        { name: 'Promote to admin documentation', pattern: /POST[\s]*\/admin\/users\/promote\/:id/ },
        { name: 'Get transactions documentation', pattern: /GET[\s]*\/admin\/transactions/ },
        { name: 'Get transaction by ID documentation', pattern: /GET[\s]*\/admin\/transactions\/:id/ },
        { name: 'Update transaction status documentation', pattern: /PUT[\s]*\/admin\/transactions\/:id\/status/ },
        { name: 'Get platform wallets documentation', pattern: /GET[\s]*\/admin\/platform-wallets/ },
        { name: 'Fund user wallet documentation', pattern: /POST[\s]*\/admin\/wallets\/fund/ },
        { name: 'Withdraw fees documentation', pattern: /POST[\s]*\/admin\/wallets\/withdraw-fees/ }
    ]
};
// Function to validate a file against expected features
function validateFile(filePath, features) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const results = features.map(feature => ({
            name: feature.name,
            found: feature.pattern.test(content)
        }));
        const valid = results.every(result => result.found);
        return { valid, results };
    }
    catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return { valid: false, results: [] };
    }
}
// Main validation function
function validateAdminAPI() {
    console.log('\n=== NexusPay Admin API Validation ===\n');
    // Check if files exist
    console.log('Checking required files:');
    let allFilesExist = true;
    for (const file of filesToValidate) {
        const exists = fs.existsSync(file);
        console.log(`  ${exists ? '✅' : '❌'} ${file}`);
        if (!exists)
            allFilesExist = false;
    }
    console.log();
    if (!allFilesExist) {
        console.error('Some required files are missing. Cannot proceed with validation.');
        process.exit(1);
    }
    // Validate features
    let allFeaturesValid = true;
    // Routes validation
    console.log('Validating routes:');
    const routesValidation = validateFile('src/routes/adminRoutes.ts', expectedFeatures.routes);
    allFeaturesValid = allFeaturesValid && routesValidation.valid;
    for (const result of routesValidation.results) {
        console.log(`  ${result.found ? '✅' : '❌'} ${result.name}`);
    }
    console.log();
    // Authentication validation
    console.log('Validating authentication middleware:');
    const authValidation = validateFile('src/middleware/roleMiddleware.ts', expectedFeatures.authentication);
    allFeaturesValid = allFeaturesValid && authValidation.valid;
    for (const result of authValidation.results) {
        console.log(`  ${result.found ? '✅' : '❌'} ${result.name}`);
    }
    console.log();
    // Validators validation
    console.log('Validating request validators:');
    const validatorsValidation = validateFile('src/middleware/validators/adminValidators.ts', expectedFeatures.validators);
    allFeaturesValid = allFeaturesValid && validatorsValidation.valid;
    for (const result of validatorsValidation.results) {
        console.log(`  ${result.found ? '✅' : '❌'} ${result.name}`);
    }
    console.log();
    // Controllers validation
    console.log('Validating controllers:');
    const controllersValidation = validateFile('src/controllers/adminController.ts', expectedFeatures.controllers);
    allFeaturesValid = allFeaturesValid && controllersValidation.valid;
    for (const result of controllersValidation.results) {
        console.log(`  ${result.found ? '✅' : '❌'} ${result.name}`);
    }
    console.log();
    // Services validation
    console.log('Validating wallet services:');
    const servicesValidation = validateFile('src/services/wallet.ts', expectedFeatures.services);
    allFeaturesValid = allFeaturesValid && servicesValidation.valid;
    for (const result of servicesValidation.results) {
        console.log(`  ${result.found ? '✅' : '❌'} ${result.name}`);
    }
    console.log();
    // Documentation validation
    console.log('Validating API documentation:');
    const docValidation = validateFile('API_DOCUMENTATION.md', expectedFeatures.documentation);
    allFeaturesValid = allFeaturesValid && docValidation.valid;
    for (const result of docValidation.results) {
        console.log(`  ${result.found ? '✅' : '❌'} ${result.name}`);
    }
    console.log();
    // Overall validation result
    console.log('=== Validation Summary ===');
    console.log(`Routes: ${routesValidation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Authentication: ${authValidation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Validators: ${validatorsValidation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Controllers: ${controllersValidation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Services: ${servicesValidation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Documentation: ${docValidation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log();
    if (allFeaturesValid) {
        console.log('✅ ALL VALIDATION TESTS PASSED');
        console.log('The Admin API implementation appears to be complete and correct.');
    }
    else {
        console.log('❌ SOME VALIDATION TESTS FAILED');
        console.log('Please check the output above for details on missing features.');
    }
}
// Run the validation
validateAdminAPI();
