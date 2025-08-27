import { OAuth2Client } from 'google-auth-library';
import config from '../config/env';

// Initialize Google OAuth client
const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

export interface GoogleUserInfo {
    id: string;
    email: string;
    name: string;
    picture?: string;
    verified_email: boolean;
}

/**
 * Verify Google ID token and extract user information
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        
        if (!payload) {
            throw new Error('Invalid Google token payload');
        }

        if (!payload.sub || !payload.email) {
            throw new Error('Missing required user information from Google');
        }

        return {
            id: payload.sub,
            email: payload.email,
            name: payload.name || payload.email.split('@')[0],
            picture: payload.picture,
            verified_email: payload.email_verified || false
        };
    } catch (error) {
        console.error('Google token verification failed:', error);
        throw new Error('Invalid Google token');
    }
}

/**
 * Generate Google OAuth URL for frontend redirect
 */
export function generateGoogleAuthUrl(): string {
    const scopes = [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];

    return client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        include_granted_scopes: true
    });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
    try {
        const { tokens } = await client.getToken(code);
        return tokens;
    } catch (error) {
        console.error('Failed to exchange code for tokens:', error);
        throw new Error('Failed to exchange authorization code');
    }
}

export { client as googleClient };