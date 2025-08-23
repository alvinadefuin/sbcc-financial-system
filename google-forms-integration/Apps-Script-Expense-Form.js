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
      sendSuccessEmail(formData.submitter_email, result);
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
 * Customize these field mappings based on your form questions
 */
function extractExpenseData(itemResponses) {
  const data = {
    submitter_email: '',
    date: new Date().toISOString().split('T')[0], // Default to today
    description: '',
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
  
  // Map form questions to data fields based on the expense form structure
  itemResponses.forEach(function(itemResponse) {
    const title = itemResponse.getItem().getTitle().toLowerCase();
    const response = itemResponse.getResponse();
    
    if (title.includes('email')) {
      data.submitter_email = response;
    } else if (title.includes('date')) {
      // Handle date response (might be string or Date object)
      if (response instanceof Date) {
        data.date = response.toISOString().split('T')[0];
      } else if (typeof response === 'string') {
        data.date = response;
      }
    } else if (title.includes('description') || title.includes('note') || title.includes('particular')) {
      data.description = response;
    } else if (title.includes('operational fund')) {
      data.operational_fund = parseFloat(response) || 0;
    } else if (title.includes('pastoral') && title.includes('workers') && title.includes('support')) {
      data.pastoral_workers_support = parseFloat(response) || 0;
    } else if (title.includes('gap') && title.includes('churches') && title.includes('assistance')) {
      data.gap_churches_assistance_program = parseFloat(response) || 0;
    } else if (title.includes('honorarium')) {
      data.honorarium = parseFloat(response) || 0;
    } else if (title.includes('conference') || (title.includes('seminar') && title.includes('retreat'))) {
      data.conference_seminar_retreat_assembly = parseFloat(response) || 0;
    } else if (title.includes('fellowship') && title.includes('events')) {
      data.fellowship_events = parseFloat(response) || 0;
    } else if (title.includes('anniversary') || (title.includes('christmas') && title.includes('events'))) {
      data.anniversary_christmas_events = parseFloat(response) || 0;
    } else if (title.includes('supplies') && !title.includes('materials')) {
      data.supplies = parseFloat(response) || 0;
    } else if (title.includes('utilities')) {
      data.utilities = parseFloat(response) || 0;
    } else if (title.includes('vehicle') && title.includes('maintenance')) {
      data.vehicle_maintenance = parseFloat(response) || 0;
    } else if (title.includes('ltg') && title.includes('registration')) {
      data.ltg_registration = parseFloat(response) || 0;
    } else if (title.includes('transportation') || title.includes('gas')) {
      data.transportation_gas = parseFloat(response) || 0;
    } else if (title.includes('building') && title.includes('maintenance')) {
      data.building_maintenance = parseFloat(response) || 0;
    } else if (title.includes('abccop') && title.includes('national')) {
      data.abccop_national = parseFloat(response) || 0;
    } else if (title.includes('cbcc') && title.includes('share')) {
      data.cbcc_share = parseFloat(response) || 0;
    } else if (title.includes('associate') && title.includes('share')) {
      data.associate_share = parseFloat(response) || 0;
    } else if (title.includes('abccop') && title.includes('community') && title.includes('day')) {
      data.abccop_community_day = parseFloat(response) || 0;
    } else if (title.includes('total')) {
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
      ScriptApp.newFormTrigger(form)
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
  // Sample test data
  const testData = {
    submitter_email: 'adefuin29@gmail.com',
    date: '2025-08-21',
    description: 'Test expense from Apps Script',
    operational_fund: 1000,
    pastoral_workers_support: 2000,
    supplies: 500,
    utilities: 300,
    total_amount: 0 // Will be auto-calculated
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