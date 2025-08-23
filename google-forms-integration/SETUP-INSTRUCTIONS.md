# Google Forms Integration Setup Guide

This guide will help you set up Google Forms integration with the SBCC Financial System so church members can submit collections and expenses directly through Google Forms.

## 🎯 Overview

The integration allows:
- ✅ Church members (with "user" role) to submit records via Google Forms
- ✅ Automatic data validation and submission to your database
- ✅ Email confirmations for successful/failed submissions
- ✅ Mobile-friendly form access
- ✅ Offline form filling capability

## 📋 Prerequisites

- Google account with access to Google Forms
- SBCC Financial System running on your server
- Users with "user" role in your system database

## 🚀 Step-by-Step Setup

### Step 1: Create Google Forms

#### Collection Form
1. Go to [Google Forms](https://forms.google.com)
2. Create a new form titled "SBCC Church Collection Form"
3. Add these questions (Short Answer type):

   **Required Questions:**
   - Email Address* (Short answer)
   - Date* (Date picker)
   
   **Optional Questions:**
   - Description (Short answer)
   - General Tithes & Offering (Short answer)
   - Bank Interest (Short answer)
   - Total Amount (Short answer - leave blank for auto-calculation)

4. Make Email and Date required fields
5. Save the form

#### Expense Form
1. Create another form titled "SBCC Church Expense Form"
2. Add these questions:

   **Required Questions:**
   - Email Address* (Short answer)
   - Date* (Date picker)
   
   **Optional Questions:**
   - Description/Particulars (Short answer)
   - Supplies & Materials (Short answer)
   - Utilities (Short answer)
   - Total Amount (Short answer - leave blank for auto-calculation)

### Step 2: Set Up Google Apps Script

#### For Collection Form:
1. Open your Collection Form
2. Click the three dots (⋮) → "Script editor" or "Extensions" → "Apps Script"
3. Delete the default `myFunction()` code
4. Copy and paste the code from `Apps-Script-Collection-Form.js`
5. **Important**: Update the `API_BASE_URL` variable:
   ```javascript
   const API_BASE_URL = 'http://your-server-url:3001';
   // For example: 'http://192.168.1.100:3001' or 'https://yourdomain.com'
   ```
6. Save the script (Ctrl+S)
7. Run the `setupTrigger` function:
   - Select `setupTrigger` from the dropdown
   - Click "Run"
   - Authorize the script when prompted

#### For Expense Form:
1. Repeat the same process with your Expense Form
2. Use the code from `Apps-Script-Expense-Form.js`
3. Update the `API_BASE_URL` variable
4. Run `setupTrigger`

### Step 3: Configure Server Access

#### If using localhost (development):
Your forms will only work when:
- Your server is running (`npm run dev` in backend folder)
- Forms are accessed from the same network

#### For production deployment:
1. Deploy your server to a cloud service (Heroku, DigitalOcean, etc.)
2. Update `API_BASE_URL` in both Apps Scripts to your production URL
3. Ensure your server allows CORS for Google domains

### Step 4: Test the Integration

#### Test User Setup:
1. Create a test user with "user" role:
   ```bash
   curl -X POST http://localhost:3001/api/auth/users \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d '{"email":"testmember@gmail.com","name":"Test Member","role":"user"}'
   ```

#### Test Form Submission:
1. Open your Google Form
2. Fill in the test user's email
3. Add sample amounts
4. Submit the form
5. Check your database for the new record
6. Verify the test user receives a confirmation email

#### Test Apps Script Directly:
1. In Apps Script editor, run the `testFormSubmission()` function
2. Check the console logs for any errors
3. Verify API connectivity

### Step 5: Share Forms with Church Members

#### Get Form Links:
1. In Google Forms, click "Send"
2. Copy the form link
3. Share with church members

#### QR Codes (Optional):
1. Generate QR codes for each form
2. Print and place in church for easy mobile access

## 📱 Mobile Usage

Church members can:
1. **Scan QR code** or open form link on mobile
2. **Fill form offline** (responses saved locally)
3. **Submit when online** (automatic sync)
4. **Receive email confirmation**

## 🔧 Troubleshooting

### Common Issues:

#### "User not authorized" error:
- Ensure the email matches exactly with database
- Verify user has "user" role (not "admin" or "super_admin")
- Check if user account is active

#### "Failed to connect to server":
- Verify server is running
- Check API_BASE_URL is correct
- For localhost: ensure same network access
- Check firewall settings

#### Script authorization issues:
- Re-run `setupTrigger` function
- Check Google Apps Script permissions
- Verify form is linked to script

#### No email confirmations:
- Check Gmail spam folder
- Verify email addresses are correct
- Check Apps Script execution logs

### Debug Steps:

1. **Check Server Logs**:
   ```bash
   # In backend folder
   npm run dev
   # Watch console for form submissions
   ```

2. **Test API Directly**:
   ```bash
   # Test user validation
   curl http://localhost:3001/api/forms/validate-user/member@gmail.com
   
   # Test form submission
   curl -X POST http://localhost:3001/api/forms/collection \
     -H "Content-Type: application/json" \
     -d '{"submitter_email":"member@gmail.com","date":"2025-08-21","general_tithes_offering":"1000"}'
   ```

3. **Check Apps Script Logs**:
   - Go to Apps Script → Executions
   - View execution logs for errors

## 🔐 Security Notes

- Only users with "user" role can submit forms
- Admin and super_admin users are rejected
- Email validation prevents unauthorized submissions
- All data is validated before database insertion
- HTTPS recommended for production

## 🎉 Success!

Once set up, church members can easily submit financial records using their mobile devices, making data collection much more efficient and accessible!

## 📞 Support

If you encounter issues:
1. Check this troubleshooting guide
2. Review server and Apps Script logs
3. Contact your technical administrator
4. Email: admin@sbcc.church

---

*Built for SBCC Financial Management System*