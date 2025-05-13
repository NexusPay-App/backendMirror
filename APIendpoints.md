Business API Endpoints
The following endpoints facilitate business-related operations within the application:

1. Request Business Creation (Initiate Upgrade)
Endpoint: POST /api/business/request-upgrade

Description: Initiates the business creation process by sending a One-Time Password (OTP) to the provided phone number for verification.

Request Body:


{
  "userId": "string",        // User's unique identifier
  "businessName": "string",  // Desired business name
  "ownerName": "string",     // Name of the business owner
  "location": "string",      // Business location
  "businessType": "string",  // Type of business
  "phoneNumber": "string"    // Owner's phone number
}
Response:

Success (200):


{
  "message": "OTP sent successfully. Please verify to complete business creation."
}
Error Responses:

400 Bad Request: Missing or invalid fields.


{
  "message": "All fields are required!"
}
404 Not Found: User does not exist.


{
  "message": "User not found. Please create a personal account first."
}
409 Conflict: Business name already exists for the user.


{
  "message": "A business with this name already exists for this user."
}
500 Internal Server Error: Server-side error during the request processing.


{
  "message": "Failed to process business creation request."
}
2. Complete Business Creation (Verify OTP and Create Wallet)
Endpoint: POST /api/business/complete-upgrade

Description: Completes the business creation process by verifying the OTP and setting up a business wallet.

Request Body:


{
  "userId": "string",        // User's unique identifier
  "phoneNumber": "string",   // Owner's phone number
  "otp": "string",           // OTP received for verification
  "businessName": "string",  // Desired business name
  "ownerName": "string",     // Name of the business owner
  "location": "string",      // Business location
  "businessType": "string"   // Type of business
}
Response:

Success (200):


{
  "message": "Business created successfully!",
  "walletAddress": "string",  // Newly created business wallet address
  "merchantId": "string"      // Unique merchant ID (Borderless till number)
}
Error Responses:

400 Bad Request: Missing or invalid fields, or invalid/expired OTP.


{
  "message": "Invalid or expired OTP."
}
404 Not Found: User does not exist.


{
  "message": "User not found. Please create a personal account first."
}
500 Internal Server Error: Server-side error during the business creation process.


{
  "message": "Failed to create business."
}
3. Transfer Funds from Business to Personal Wallet
Endpoint: POST /api/business/transfer-funds

Description: Transfers funds from the business wallet to the user's personal wallet after OTP verification.

Request Body:


{
  "businessId": "string",    // Business's unique identifier
  "amount": "string",        // Amount to transfer
  "otp": "string"            // OTP received for verification
}
Response:

Success (200):


{
  "message": "Funds transferred successfully!",
  "transactionHash": "string"  // Blockchain transaction hash
}
Error Responses:

400 Bad Request: Missing fields or invalid/expired OTP.


{
  "message": "Business ID, amount, and OTP are required!"
}
404 Not Found: Business or user account does not exist.


{
  "message": "Business account not found."
}
500 Internal Server Error: Server-side error during the fund transfer process.


{
  "message": "Failed to transfer funds."
}
Note: Replace placeholder strings (e.g., "string") with actual data types or example values as appropriate. Ensure that all required fields are provided in the request body to prevent errors. Proper error handling and user feedback mechanisms should be implemented in the frontend to handle various response scenarios effectively.





####################################################################

Authentication Endpoints
Login User
URL: http://localhost:8000/api/auth/login
Method: POST
Body:
"
Success Response (200):
}
Initiate User Registration
URL: http://localhost:8000/api/auth/register/initiate
Method: POST
Body:
}
Success Response (200):
}
Complete User Registration
URL: http://localhost:8000/api/auth/register
Method: POST
Body:
}
- Success Response (200):
}
Request Password Reset
URL: http://localhost:8000/api/auth/password-reset/request
Method: POST
Body:
}
- Success Response (200):
}
Complete Password Reset
URL: http://localhost:8000/api/auth/password-reset
Method: POST
Body:
}
- Success Response (200):
}

######################################################################################

Token Operations
Send Token
URL: http://localhost:8000/api/token/sendToken
Method: POST
Headers: Authorization: Bearer your_jwt_token
Body:
}
Get Token Transfer Events
URL: http://localhost:8000/api/token/token-transfer-events
Method: GET
Query Parameters:
address: Wallet address
chain: "celo" or "arbitrum"
USDC Operations
Get USDC Balance
URL: http://localhost:8000/api/usdc/usdc-balance/:chain/:address
Method: GET
Get Conversion Rate
URL: http://localhost:8000/api/usdc/conversionrate
Method: GET