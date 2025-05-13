# Gmail App Password Setup Guide for NexusPay

## Prerequisites
- You need a Gmail account
- 2-Step Verification must be enabled on your Google Account

## Step 1: Enable 2-Step Verification (if not already enabled)
1. Go to your [Google Account](https://myaccount.google.com/)
2. In the navigation panel, select **Security**
3. Under "Signing in to Google," select **2-Step Verification**
4. Follow the on-screen steps to enable

## Step 2: Create an App Password
1. Go to your [Google Account](https://myaccount.google.com/)
2. Select **Security**
3. Under "Signing in to Google," select **App passwords**
   - Note: This option only appears if 2-Step Verification is enabled
4. At the bottom, select **Select app** and choose **Other (Custom name)**
5. Enter "NexusPay" as the name
6. Click **Generate**
7. The 16-character app password will be shown
8. **Copy this password** - it will only be shown once!

## Step 3: Update Your .env File
1. Open your `.env` file in the project root
2. Add or update these lines:
```
EMAIL_USER=your.email@gmail.com
EMAIL_APP_PASSWORD=your16characterapppassword
```
3. Make sure there are **NO SPACES** in the app password
4. Save the file

## Step 4: Restart Your Server
```
npm run dev
```

## Troubleshooting
If you still experience login issues:

1. Double-check that you've copied the password correctly with no spaces
2. Make sure you're using your full Gmail address
3. Check if your Google Account has any security restrictions
4. Ensure you're not using your regular Gmail password
5. If you have a Google Workspace account, make sure you have permission to use SMTP

## Additional Notes
- App passwords are 16 characters long with no spaces
- This is more secure than enabling "Less secure app access"
- The app password is specific to this application 