// src/services/ensService.ts
import { ethers } from 'ethers';
import config from '../config/env';

// ENS Contract ABIs
const ENS_REGISTRY_ABI = [
    'function setSubnodeOwner(bytes32 node, string memory label, address owner) external returns (bytes32)',
    'function setResolver(bytes32 node, address resolver) external',
    'function resolver(bytes32 node) external view returns (address)',
    'function owner(bytes32 node) external view returns (address)',
    'function name(bytes32 node) external view returns (string memory)',
    'function setSubnodeRecord(bytes32 node, string memory label, address owner, address resolver, uint64 ttl) external returns (bytes32)'
];

const ENS_RESOLVER_ABI = [
    'function setAddr(bytes32 node, address a) external',
    'function addr(bytes32 node) external view returns (address)',
    'function setText(bytes32 node, string memory key, string memory value) external',
    'function text(bytes32 node, string memory key) external view returns (string memory)',
    'function setContenthash(bytes32 node, bytes memory hash) external',
    'function contenthash(bytes32 node) external view returns (bytes memory)'
];

const ENS_NAME_WRAPPER_ABI = [
    'function setSubnodeOwner(bytes32 parentNode, string memory label, address owner, uint32 fuses, uint64 expiry) external returns (bytes32)',
    'function setSubnodeRecord(bytes32 parentNode, string memory label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry) external returns (bytes32)',
    'function ownerOf(uint256 id) external view returns (address)',
    'function getData(uint256 id) external view returns (address, uint32, uint64)'
];

export interface ENSSubdomainConfig {
    parentDomain: string;
    subdomainLabel: string;
    ownerAddress: string;
    resolverAddress?: string;
    ttl?: number;
    fuses?: number;
    expiry?: number;
}

export interface ENSSubdomainResult {
    success: boolean;
    subdomain?: string;
    transactionHash?: string;
    error?: string;
}

export class ENSService {
    private provider?: ethers.providers.JsonRpcProvider;
    private wallet?: ethers.Wallet;
    private ensRegistry?: ethers.Contract;
    private ensResolver?: ethers.Contract;
    private ensNameWrapper?: ethers.Contract;
    private isInitialized: boolean = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        try {
            // Check if we have the required configuration
            if (!config.PLATFORM_WALLET_PRIVATE_KEY || 
                config.PLATFORM_WALLET_PRIVATE_KEY === 'your_legacy_wallet_key_here' ||
                config.PLATFORM_WALLET_PRIVATE_KEY.length < 64) {
                console.warn('⚠️ ENS Service: PLATFORM_WALLET_PRIVATE_KEY not properly configured. ENS features will be disabled.');
                return;
            }

            // Initialize provider - using Ethereum mainnet for ENS
            this.provider = new ethers.providers.JsonRpcProvider(
                process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/' + config.ALCHEMY_API_KEY
            );

            // Initialize wallet with platform private key
            this.wallet = new ethers.Wallet(config.PLATFORM_WALLET_PRIVATE_KEY, this.provider);

            // Initialize contracts
            const ensRegistryAddress = config.ENS_REGISTRY_ADDRESS || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
            const ensResolverAddress = config.ENS_RESOLVER_ADDRESS || '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63';
            const ensNameWrapperAddress = config.ENS_NAME_WRAPPER_ADDRESS || '0x0635513f179D50A207757E05759CbD106d7dFcE8';

            this.ensRegistry = new ethers.Contract(ensRegistryAddress, ENS_REGISTRY_ABI, this.wallet);
            this.ensResolver = new ethers.Contract(ensResolverAddress, ENS_RESOLVER_ABI, this.wallet);
            this.ensNameWrapper = new ethers.Contract(ensNameWrapperAddress, ENS_NAME_WRAPPER_ABI, this.wallet);

            this.isInitialized = true;
            console.log('✅ ENS Service initialized successfully');

        } catch (error) {
            console.error('❌ ENS Service initialization failed:', error);
            this.isInitialized = false;
        }
    }

    private checkInitialization(): boolean {
        if (!this.isInitialized) {
            console.warn('⚠️ ENS Service not initialized. Please configure PLATFORM_WALLET_PRIVATE_KEY and other ENS settings.');
            return false;
        }
        return true;
    }

    /**
     * Generate a unique subdomain label for a user
     */
    generateSubdomainLabel(userInfo: { email?: string; phoneNumber?: string; userId: string }): string {
        // Extract username from email or use phone number
        let baseLabel = '';
        
        if (userInfo.email) {
            baseLabel = userInfo.email.split('@')[0].toLowerCase();
        } else if (userInfo.phoneNumber) {
            // Remove + and special characters from phone number
            baseLabel = userInfo.phoneNumber.replace(/[^0-9]/g, '');
        } else {
            // Fallback to user ID
            baseLabel = userInfo.userId.slice(-8);
        }

        // Clean the label (remove invalid characters)
        baseLabel = baseLabel.replace(/[^a-z0-9-]/g, '');
        
        // Ensure it starts and ends with alphanumeric character
        baseLabel = baseLabel.replace(/^-+|-+$/g, '');
        
        // Add timestamp to ensure uniqueness
        const timestamp = Date.now().toString().slice(-6);
        return `${baseLabel}${timestamp}`;
    }

    /**
     * Get the namehash of a domain
     */
    getNamehash(domain: string): string {
        return ethers.utils.namehash(domain);
    }

    /**
     * Check if a subdomain is available
     */
    async isSubdomainAvailable(parentDomain: string, subdomainLabel: string): Promise<boolean> {
        if (!this.checkInitialization()) {
            console.warn('ENS Service not initialized, assuming subdomain is available');
            return true;
        }

        try {
            const subdomain = `${subdomainLabel}.${parentDomain}`;
            const namehash = this.getNamehash(subdomain);
            const owner = await this.ensRegistry!.owner(namehash);
            
            // If owner is zero address, subdomain is available
            return owner === ethers.constants.AddressZero;
        } catch (error) {
            console.error('Error checking subdomain availability:', error);
            return false;
        }
    }

    /**
     * Create a subdomain using the standard ENS Registry
     */
    async createSubdomain(config: ENSSubdomainConfig): Promise<ENSSubdomainResult> {
        if (!this.checkInitialization()) {
            return {
                success: false,
                error: 'ENS Service not initialized. Please configure PLATFORM_WALLET_PRIVATE_KEY and other ENS settings.'
            };
        }

        try {
            const { parentDomain, subdomainLabel, ownerAddress, resolverAddress, ttl } = config;
            const subdomain = `${subdomainLabel}.${parentDomain}`;
            
            console.log(`Creating ENS subdomain: ${subdomain} for owner: ${ownerAddress}`);

            // Get parent node namehash
            const parentNode = this.getNamehash(parentDomain);
            
            // Set subdomain owner
            const tx1 = await this.ensRegistry!.setSubnodeOwner(
                parentNode,
                subdomainLabel,
                ownerAddress,
                { gasLimit: 500000 }
            );
            
            console.log(`Subdomain owner set. Transaction: ${tx1.hash}`);
            await tx1.wait();

            // Set resolver if provided
            if (resolverAddress) {
                const subdomainNode = this.getNamehash(subdomain);
                const tx2 = await this.ensRegistry!.setResolver(
                    subdomainNode,
                    resolverAddress,
                    { gasLimit: 200000 }
                );
                
                console.log(`Resolver set. Transaction: ${tx2.hash}`);
                await tx2.wait();
            }

            return {
                success: true,
                subdomain,
                transactionHash: tx1.hash
            };

        } catch (error: any) {
            console.error('Error creating ENS subdomain:', error);
            return {
                success: false,
                error: error.message || 'Failed to create subdomain'
            };
        }
    }

    /**
     * Create a subdomain using the ENS Name Wrapper (for wrapped domains)
     */
    async createSubdomainWithWrapper(config: ENSSubdomainConfig): Promise<ENSSubdomainResult> {
        if (!this.checkInitialization()) {
            return {
                success: false,
                error: 'ENS Service not initialized. Please configure PLATFORM_WALLET_PRIVATE_KEY and other ENS settings.'
            };
        }

        try {
            const { parentDomain, subdomainLabel, ownerAddress, resolverAddress, ttl, fuses, expiry } = config;
            const subdomain = `${subdomainLabel}.${parentDomain}`;
            
            console.log(`Creating ENS subdomain with wrapper: ${subdomain} for owner: ${ownerAddress}`);

            // Get parent node namehash
            const parentNode = this.getNamehash(parentDomain);
            
            // Default values
            const defaultFuses = fuses || 0;
            const defaultExpiry = expiry || 0; // 0 means no expiry
            const defaultTTL = ttl || 0;

            // Create subdomain with wrapper
            const tx = await this.ensNameWrapper!.setSubnodeRecord(
                parentNode,
                subdomainLabel,
                ownerAddress,
                resolverAddress || ethers.constants.AddressZero,
                defaultTTL,
                defaultFuses,
                defaultExpiry,
                { gasLimit: 800000 }
            );
            
            console.log(`Subdomain created with wrapper. Transaction: ${tx.hash}`);
            await tx.wait();

            return {
                success: true,
                subdomain,
                transactionHash: tx.hash
            };

        } catch (error: any) {
            console.error('Error creating ENS subdomain with wrapper:', error);
            return {
                success: false,
                error: error.message || 'Failed to create subdomain with wrapper'
            };
        }
    }

    /**
     * Set resolver records for a subdomain
     */
    async setResolverRecords(subdomain: string, records: {
        address?: string;
        textRecords?: Record<string, string>;
        contentHash?: string;
    }): Promise<boolean> {
        if (!this.checkInitialization()) {
            console.warn('ENS Service not initialized, cannot set resolver records');
            return false;
        }

        try {
            const namehash = this.getNamehash(subdomain);
            
            // Get resolver address
            const resolverAddress = await this.ensRegistry!.resolver(namehash);
            if (resolverAddress === ethers.constants.AddressZero) {
                throw new Error('No resolver set for subdomain');
            }

            const resolver = new ethers.Contract(resolverAddress, ENS_RESOLVER_ABI, this.wallet!);

            // Set address record
            if (records.address) {
                const tx1 = await resolver.setAddr(namehash, records.address, { gasLimit: 100000 });
                await tx1.wait();
                console.log(`Address record set for ${subdomain}: ${records.address}`);
            }

            // Set text records
            if (records.textRecords) {
                for (const [key, value] of Object.entries(records.textRecords)) {
                    const tx = await resolver.setText(namehash, key, value, { gasLimit: 100000 });
                    await tx.wait();
                    console.log(`Text record set for ${subdomain}: ${key} = ${value}`);
                }
            }

            // Set content hash
            if (records.contentHash) {
                const tx = await resolver.setContenthash(namehash, records.contentHash, { gasLimit: 100000 });
                await tx.wait();
                console.log(`Content hash set for ${subdomain}: ${records.contentHash}`);
            }

            return true;

        } catch (error) {
            console.error('Error setting resolver records:', error);
            return false;
        }
    }

    /**
     * Resolve a subdomain to get its records
     */
    async resolveSubdomain(subdomain: string): Promise<{
        address?: string;
        textRecords?: Record<string, string>;
        contentHash?: string;
    }> {
        if (!this.checkInitialization()) {
            console.warn('ENS Service not initialized, cannot resolve subdomain');
            return {};
        }

        try {
            const namehash = this.getNamehash(subdomain);
            
            // Get resolver address
            const resolverAddress = await this.ensRegistry!.resolver(namehash);
            if (resolverAddress === ethers.constants.AddressZero) {
                throw new Error('No resolver set for subdomain');
            }

            const resolver = new ethers.Contract(resolverAddress, ENS_RESOLVER_ABI, this.provider!);

            const result: any = {};

            // Get address record
            try {
                result.address = await resolver.addr(namehash);
            } catch (error) {
                console.log('No address record found');
            }

            // Get text records (common ones)
            const textKeys = ['avatar', 'description', 'url', 'com.twitter', 'com.github'];
            result.textRecords = {};
            
            for (const key of textKeys) {
                try {
                    const value = await resolver.text(namehash, key);
                    if (value && value !== '') {
                        result.textRecords[key] = value;
                    }
                } catch (error) {
                    // Text record doesn't exist, continue
                }
            }

            // Get content hash
            try {
                result.contentHash = await resolver.contenthash(namehash);
            } catch (error) {
                console.log('No content hash found');
            }

            return result;

        } catch (error) {
            console.error('Error resolving subdomain:', error);
            return {};
        }
    }

    /**
     * Create a subdomain for a new user (main method to be called during registration)
     */
    async createUserSubdomain(userInfo: {
        email?: string;
        phoneNumber?: string;
        userId: string;
        walletAddress: string;
    }): Promise<ENSSubdomainResult> {
        try {
            const parentDomain = config.ENS_PARENT_DOMAIN || 'nexuspay.eth';
            
            // Generate unique subdomain label
            let subdomainLabel = this.generateSubdomainLabel(userInfo);
            
            // Check availability and generate new label if needed
            let attempts = 0;
            while (!(await this.isSubdomainAvailable(parentDomain, subdomainLabel)) && attempts < 5) {
                attempts++;
                subdomainLabel = this.generateSubdomainLabel({
                    ...userInfo,
                    userId: userInfo.userId + attempts.toString()
                });
            }

            if (attempts >= 5) {
                return {
                    success: false,
                    error: 'Unable to generate unique subdomain after multiple attempts'
                };
            }

            // Create subdomain configuration
            const subdomainConfig: ENSSubdomainConfig = {
                parentDomain,
                subdomainLabel,
                ownerAddress: userInfo.walletAddress,
                resolverAddress: config.ENS_RESOLVER_ADDRESS,
                ttl: 0 // No TTL
            };

            // Try to create subdomain with wrapper first, fallback to standard registry
            let result: ENSSubdomainResult;
            
            try {
                result = await this.createSubdomainWithWrapper(subdomainConfig);
            } catch (error) {
                console.log('Name wrapper failed, trying standard registry...');
                result = await this.createSubdomain(subdomainConfig);
            }

            if (result.success && result.subdomain) {
                // Set initial resolver records
                await this.setResolverRecords(result.subdomain, {
                    address: userInfo.walletAddress,
                    textRecords: {
                        'description': `NexusPay user subdomain for ${userInfo.email || userInfo.phoneNumber}`,
                        'url': `https://nexuspay.xyz/profile/${userInfo.userId}`
                    }
                });
            }

            return result;

        } catch (error: any) {
            console.error('Error creating user subdomain:', error);
            return {
                success: false,
                error: error.message || 'Failed to create user subdomain'
            };
        }
    }

    /**
     * Check if a domain is wrapped (uses Name Wrapper)
     */
    async isDomainWrapped(domain: string): Promise<boolean> {
        if (!this.checkInitialization()) {
            console.warn('ENS Service not initialized, cannot check if domain is wrapped');
            return false;
        }

        try {
            const namehash = this.getNamehash(domain);
            const owner = await this.ensRegistry!.owner(namehash);
            
            // If owner is the Name Wrapper contract, domain is wrapped
            return owner.toLowerCase() === this.ensNameWrapper!.address.toLowerCase();
        } catch (error) {
            console.error('Error checking if domain is wrapped:', error);
            return false;
        }
    }
}

// Export singleton instance
export const ensService = new ENSService();
