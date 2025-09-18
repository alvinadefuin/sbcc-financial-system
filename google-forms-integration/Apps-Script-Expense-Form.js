/**
 * SBCC Financial System - Expense Form Integration
 * Google Apps Script for processing expense form submissions
 * 
 * Instructions:
 * 1. Create a Google Form for expenses
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Update the API_BASE_URL to your server URL
 * 5. Save and set up form submit trigger
 */

// Configure your API endpoint
const API_BASE_URL = 'https://sbcc-financial-system-production.up.railway.app'; // Change to your actual server URL
// For production, use: 'https://your-domain.com'

/**
 * Main function that processes form submissions
 * This function is triggered when the form is submitted
 */
function onFormSubmit(e) {
  try {
    console.log('Expense form submitted, processing...');
    
    // Get form responses
    const formResponse = e.response;
    const itemResponses = formResponse.getItemResponses();
    
    // Extract data from form responses
    const formData = extractExpenseData(itemResponses);
    
    // Validate required fields
    if (!formData.submitter_email || !formData.date) {
      throw new Error('Missing required fields: email and date');
    }
    
    // First, validate if user can submit forms
    const isValidUser = validateUser(formData.submitter_email);
    if (!isValidUser) {
      sendErrorEmail(formData.submitter_email, 'You are not authorized to submit forms. Please contact an administrator.');
      return;
    }
    
    // Submit to our API
    const result = submitExpenseData(formData);
    
    if (result.success) {
      console.log('Expense submitted successfully:', result);

      // Only send email for new submissions, not duplicates
      if (result.message && result.message.includes('duplicate prevention')) {
        console.log('Duplicate submission detected, skipping email notification');
      } else {
        sendSuccessEmail(formData.submitter_email, result);
      }
    } else {
      console.error('Failed to submit expense:', result.error);
      sendErrorEmail(formData.submitter_email, result.error);
    }
    
  } catch (error) {
    console.error('Error processing form submission:', error);
    sendErrorEmail('admin@sbcc.church', 'Form processing error: ' + error.toString());
  }
}

/**
 * Extract expense data from form responses
 * Updated for new Google Form structure with PBCM Share/PDOT, Pastoral Team, and dynamic operational funds
 */
function extractExpenseData(itemResponses) {
  const data = {
    submitter_email: '',
    date: new Date().toISOString().split('T')[0], // Default to today
    description: '',
    // New Google Form fields
    pbcm_share_pdot: 0,
    pastoral_team: 0,
    operational_fund_1: '',
    operational_fund_1_amount: 0,
    operational_fund_2: '',
    operational_fund_2_amount: 0,
    operational_fund_3: '',
    operational_fund_3_amount: 0,
    // Legacy fields (keeping for backward compatibility)
    operational_fund: 0,
    pastoral_workers_support: 0,
    gap_churches_assistance_program: 0,
    honorarium: 0,
    conference_seminar_retreat_assembly: 0,
    fellowship_events: 0,
    anniversary_christmas_events: 0,
    supplies: 0,
    utilities: 0,
    vehicle_maintenance: 0,
    ltg_registration: 0,
    transportation_gas: 0,
    building_maintenance: 0,
    abccop_national: 0,
    cbcc_share: 0,
    associate_share: 0,
    abccop_community_day: 0,
    total_amount: 0
  };
  
  // Map form questions to data fields - UPDATED for new form structure
  itemResponses.forEach(function(itemResponse) {
    const title = itemResponse.getItem().getTitle();
    const titleLower = title.toLowerCase();
    const response = itemResponse.getResponse();
    
    // Check exact field names for new Google Form structure
    if (title === 'Email Address' || titleLower.includes('email')) {
      data.submitter_email = response;
    } else if (title === 'Date' || titleLower.includes('date')) {
      // Handle date response (might be string or Date object)
      if (response instanceof Date) {
        data.date = response.toISOString().split('T')[0];
      } else if (typeof response === 'string') {
        data.date = response;
      }
    } else if (title === 'PBCM Share/PDOT') {
      data.pbcm_share_pdot = parseFloat(response) || 0;
    } else if (title === 'Pastoral Team') {
      data.pastoral_team = parseFloat(response) || 0;
    } else if (title === '1. Operational Fund') {
      data.operational_fund_1 = response;
    } else if (title === '1. Amount') {
      data.operational_fund_1_amount = parseFloat(response) || 0;
    } else if (title === '2. Operational Fund') {
      data.operational_fund_2 = response;
    } else if (title === '2. Amount') {
      data.operational_fund_2_amount = parseFloat(response) || 0;
    } else if (title === '3. Operational Fund') {
      data.operational_fund_3 = response;
    } else if (title === '3. Amount') {
      data.operational_fund_3_amount = parseFloat(response) || 0;
    } else if (titleLower.includes('description') || titleLower.includes('note') || titleLower.includes('particular')) {
      data.description = response;
    } else if (titleLower.includes('total')) {
      data.total_amount = parseFloat(response) || 0;
    }
  });
  
  return data;
}

/**
 * Validate if user can submit forms
 */
function validateUser(email) {
  try {
    const url = `${API_BASE_URL}/api/forms/validate-user/${encodeURIComponent(email)}`;
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    return result.canSubmit === true;
    
  } catch (error) {
    console.error('Error validating user:', error);
    return false;
  }
}

/**
 * Submit expense data to API
 */
function submitExpenseData(formData) {
  try {
    const url = `${API_BASE_URL}/api/forms/expense`;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(formData),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      return result;
    } else {
      return { 
        success: false, 
        error: result.error || 'Unknown error occurred' 
      };
    }
    
  } catch (error) {
    console.error('Error submitting to API:', error);
    return { 
      success: false, 
      error: 'Failed to connect to server: ' + error.toString() 
    };
  }
}

/**
 * Send success email to user
 */
function sendSuccessEmail(email, result) {
  try {
    const subject = 'Expense Submitted Successfully - SBCC Financial System';
    const body = `
Dear Church Member,

Your expense record has been successfully submitted to the SBCC Financial System.

Details:
- Record ID: ${result.record_id}
- Total Amount: ₱${result.total_amount.toLocaleString()}
- Submitted: ${new Date().toLocaleString()}

Your expense has been recorded and will be reviewed by the financial team.

Thank you!

God bless,
SBCC Financial System
    `;
    
    GmailApp.sendEmail(email, subject, body);
    console.log('Success email sent to:', email);
    
  } catch (error) {
    console.error('Error sending success email:', error);
  }
}

/**
 * Send error email to user
 */
function sendErrorEmail(email, errorMessage) {
  try {
    const subject = 'Expense Submission Error - SBCC Financial System';
    const body = `
Dear User,

There was an issue processing your expense form submission:

Error: ${errorMessage}

Please contact the church administrator or try submitting again.

If you continue to experience issues, please contact admin@sbcc.church

SBCC Financial System
    `;
    
    GmailApp.sendEmail(email, subject, body);
    console.log('Error email sent to:', email);
    
  } catch (error) {
    console.error('Error sending error email:', error);
  }
}

/**
 * Setup function - run this once to install the form submit trigger
 * Go to Apps Script > Run > setupTrigger
 */
function setupTrigger() {
    try {
      // Get the form associated with this script
      const form = FormApp.getActiveForm();

      // Delete existing triggers for this form
      const allTriggers = ScriptApp.getProjectTriggers();
      allTriggers.forEach(trigger => {
        if (trigger.getTriggerSource() ===
  ScriptApp.TriggerSource.FORM) {
          ScriptApp.deleteTrigger(trigger);
        }
      });

      // Create new form submit trigger
      ScriptApp.newTrigger('onFormSubmit')
        .forForm(form)
        .onFormSubmit()
        .create();

      console.log('Form submit trigger created successfully');

    } catch (error) {
      console.error('Error setting up trigger:', error);
    }
}

/**
 * Test function - use this to test the script
 */
function testFormSubmission() {
  // Sample test data - Updated for new form structure
  const testData = {
    submitter_email: 'adefuin29@gmail.com',
    date: '2025-09-08',
    description: 'Test expense from Apps Script',
    pbcm_share_pdot: 500,
    pastoral_team: 250,
    operational_fund_1: 'Pastoral & Worker Support',
    operational_fund_1_amount: 250,
    operational_fund_2: 'Conference/Seminar/Retreat/Assembly',
    operational_fund_2_amount: 200,
    operational_fund_3: 'Supplies',
    operational_fund_3_amount: 30,
    total_amount: 0 // Will be auto-calculated (should be 1230)
  };
  
  console.log('Testing form submission with data:', testData);
  
  // Test user validation
  // const isValid = validateUser(testData.submitter_email);
  // console.log('User validation result:', isValid);

  // Skip validation for testing
  const isValid = true;

  if (isValid) {
    // Test API submission
    const result = submitExpenseData(testData);
    console.log('API submission result:', result);
  }
}

  function createTestUser() {
    try {
      const url = `${API_BASE_URL}/api/forms/create-test-user`;
      const response = UrlFetchApp.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          email: 'adefuin29@gmail.com',
          name: 'Alvin Defuin'
        }),
        muteHttpExceptions: true
      });

      const result = JSON.parse(response.getContentText());
      console.log('User creation result:', result);

      if (response.getResponseCode() === 200) {
        console.log('User created successfully!');
        return true;
      } else {
        console.log('Failed to create user:', result);
        return false;
      }

    } catch (error) {
      console.error('Error creating user:', error);
      return false;
    }
  }