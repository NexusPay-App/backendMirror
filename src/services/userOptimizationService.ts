import { User } from '../models/user';
import { Business } from '../models/businessModel';
import { createAccount } from '../services/auth';

export interface UserLookupResult {
  found: boolean;
  user?: any;
  message: string;
  shouldCreateNew: boolean;
}

export interface BusinessLookupResult {
  found: boolean;
  businesses?: any[];
  message: string;
}

export class UserOptimizationService {
  
  /**
   * Find or create user by phone number (ensures one wallet per phone)
   */
  static async findOrCreateUserByPhone(phoneNumber: string): Promise<UserLookupResult> {
    try {
      // Check if user exists with this phone number
      const existingUser = await User.findOne({ phoneNumber });
      
      if (existingUser) {
        return {
          found: true,
          user: existingUser,
          message: 'User found with existing phone number',
          shouldCreateNew: false
        };
      }
      
      // Check if phone number is used by any business accounts
      const existingBusinesses = await Business.find({ phoneNumber });
      if (existingBusinesses.length > 0) {
        // Phone number exists in business accounts, but no personal account
        // We should create a personal account for this phone number
        return {
          found: false,
          message: 'Phone number used by business accounts, creating personal account',
          shouldCreateNew: true
        };
      }
      
      // No existing user or business with this phone number
      return {
        found: false,
        message: 'New phone number, creating personal account',
        shouldCreateNew: true
      };
      
    } catch (error) {
      console.error('❌ Error in findOrCreateUserByPhone:', error);
      throw error;
    }
  }
  
  /**
   * Find or create user by Google ID (ensures one wallet per Google account)
   */
  static async findOrCreateUserByGoogle(googleId: string, email: string): Promise<UserLookupResult> {
    try {
      // Check if user exists with this Google ID
      const existingUser = await User.findOne({ googleId });
      
      if (existingUser) {
        return {
          found: true,
          user: existingUser,
          message: 'User found with existing Google ID',
          shouldCreateNew: false
        };
      }
      
      // Check if user exists with this email but no Google ID
      const existingEmailUser = await User.findOne({ email });
      if (existingEmailUser) {
        return {
          found: true,
          user: existingEmailUser,
          message: 'User found with existing email, will link Google ID',
          shouldCreateNew: false
        };
      }
      
      // Check if email is used by any business accounts
      const existingBusinesses = await Business.find({ 
        $or: [
          { phoneNumber: email }, // Some businesses might use email as phone
          { businessName: { $regex: email, $options: 'i' } } // Check business names
        ]
      });
      
      if (existingBusinesses.length > 0) {
        // Email exists in business accounts, but no personal account
        return {
          found: false,
          message: 'Email used by business accounts, creating personal account',
          shouldCreateNew: true
        };
      }
      
      // No existing user or business with this Google account
      return {
        found: false,
        message: 'New Google account, creating personal account',
        shouldCreateNew: true
      };
      
    } catch (error) {
      console.error('❌ Error in findOrCreateUserByGoogle:', error);
      throw error;
    }
  }
  
  /**
   * Create new personal account with wallet
   */
  static async createPersonalAccount(userData: {
    phoneNumber?: string;
    email?: string;
    password?: string;
    googleId?: string;
    authMethods: string[];
  }): Promise<any> {
    try {
      // Create new wallet for personal account
      const { pk, walletAddress } = await createAccount();
      
      const newUser = new User({
        ...userData,
        walletAddress,
        privateKey: pk,
        role: 'user',
        isVerified: userData.authMethods.includes('google') || false,
        isPhoneVerified: false,
        isEmailVerified: userData.authMethods.includes('google') || false,
        lastLogin: new Date()
      });
      
      await newUser.save();
      
      console.log(`✅ Created new personal account for ${userData.phoneNumber || userData.email} with wallet: ${walletAddress}`);
      
      return newUser;
      
    } catch (error) {
      console.error('❌ Error creating personal account:', error);
      throw error;
    }
  }
  
  /**
   * Link Google account to existing user
   */
  static async linkGoogleToExistingUser(userId: string, googleId: string): Promise<any> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      user.googleId = googleId;
      if (!user.authMethods.includes('google')) {
        user.authMethods.push('google');
      }
      user.isEmailVerified = true;
      user.isVerified = true;
      user.lastLogin = new Date();
      
      await user.save();
      
      console.log(`✅ Linked Google account ${googleId} to user ${userId}`);
      
      return user;
      
    } catch (error) {
      console.error('❌ Error linking Google account:', error);
      throw error;
    }
  }
  
  /**
   * Get all business accounts for a user
   */
  static async getUserBusinesses(userId: string): Promise<BusinessLookupResult> {
    try {
      const businesses = await Business.find({ userId });
      
      return {
        found: businesses.length > 0,
        businesses: businesses,
        message: `Found ${businesses.length} business accounts for user`
      };
      
    } catch (error) {
      console.error('❌ Error getting user businesses:', error);
      throw error;
    }
  }
  
  /**
   * Get all business accounts for a phone number
   */
  static async getBusinessesByPhone(phoneNumber: string): Promise<BusinessLookupResult> {
    try {
      const businesses = await Business.find({ phoneNumber });
      
      return {
        found: businesses.length > 0,
        businesses: businesses,
        message: `Found ${businesses.length} business accounts for phone ${phoneNumber}`
      };
      
    } catch (error) {
      console.error('❌ Error getting businesses by phone:', error);
      throw error;
    }
  }
  
  /**
   * Validate user can create business account
   */
  static async validateBusinessCreation(userId: string, phoneNumber: string, businessName?: string): Promise<{
    canCreate: boolean;
    message: string;
    existingBusinesses?: any[];
  }> {
    try {
      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        return {
          canCreate: false,
          message: 'User not found'
        };
      }
      
      // Check if business name already exists
      if (businessName) {
        const existingBusiness = await Business.findOne({ businessName });
        if (existingBusiness) {
          return {
            canCreate: false,
            message: 'Business name already exists'
          };
        }
      }
      
      // Check existing businesses for this user
      const userBusinesses = await Business.find({ userId });
      
      // Check existing businesses for this phone number
      const phoneBusinesses = await Business.find({ phoneNumber });
      
      // User can create multiple business accounts
      return {
        canCreate: true,
        message: 'User can create business account',
        existingBusinesses: [...userBusinesses, ...phoneBusinesses]
      };
      
    } catch (error) {
      console.error('❌ Error validating business creation:', error);
      throw error;
    }
  }
  
  /**
   * Get unified user profile with all business accounts
   */
  static async getUnifiedUserProfile(userId: string): Promise<{
    user: any;
    businessAccounts: any[];
    totalBusinesses: number;
  }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      const businessAccounts = await Business.find({ userId });
      
      return {
        user,
        businessAccounts,
        totalBusinesses: businessAccounts.length
      };
      
    } catch (error) {
      console.error('❌ Error getting unified user profile:', error);
      throw error;
    }
  }
}
