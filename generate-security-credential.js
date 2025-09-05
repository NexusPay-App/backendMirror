const crypto = require('crypto');

// M-Pesa Security Credential Generator
// This script generates a new security credential for M-Pesa B2B transactions

function generateSecurityCredential(password, publicKey) {
    try {
        // Convert the public key from base64 to buffer
        const publicKeyBuffer = Buffer.from(publicKey, 'base64');
        
        // Encrypt the password using RSA with PKCS1 padding
        const encrypted = crypto.publicEncrypt({
            key: publicKeyBuffer,
            padding: crypto.constants.RSA_PKCS1_PADDING
        }, Buffer.from(password));
        
        // Return the encrypted credential as base64
        return encrypted.toString('base64');
    } catch (error) {
        console.error('Error generating security credential:', error.message);
        throw error;
    }
}

// M-Pesa public key for encryption
const MPESA_PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${process.env.MPESA_PUBLIC_KEY || 'your_public_key_here'}`;

// Your M-Pesa password (replace with your actual password)
const MPESA_PASSWORD = process.env.MPESA_PASSWORD || 'your_mpesa_password_here';

if (MPESA_PASSWORD === 'your_mpesa_password_here') {
    console.log('❌ Please set your M-Pesa password in the MPESA_PASSWORD environment variable');
    console.log('Usage: MPESA_PASSWORD=your_password node generate-security-credential.js');
    process.exit(1);
}

try {
    const securityCredential = generateSecurityCredential(MPESA_PASSWORD, MPESA_PUBLIC_KEY);
    console.log('✅ Generated Security Credential:');
    console.log(securityCredential);
    console.log('\n📝 Add this to your .env file:');
    console.log(`MPESA_DEV_SECURITY_CREDENTIAL=${securityCredential}`);
} catch (error) {
    console.error('❌ Failed to generate security credential:', error.message);
    process.exit(1);
}
