/**
 * SBCC Financial System - Collection Form Integration
 * Google Apps Script for processing collection form submissions
 * 
 * Instructions:
 * 1. Create a Google Form for collections
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
      console.log('Form submitted, processing...');
      console.log('Event object:', e);

      // Check if we have a valid event object
      if (!e || !e.response) {
        console.error('Invalid event object or no response found');
        return;
      }

      // Get form response
      const formResponse = e.response;
      console.log('Form response received:', formResponse);

      // Get all item responses
      const itemResponses = formResponse.getItemResponses();
      console.log('Item responses count:', itemResponses.length);

      // Extract collection data from responses
      const collectionData = extractCollectionData(itemResponses);
      console.log('Extracted collection data:', collectionData);

      // Validate user
      const isValid = validateUser(collectionData.submitter_email);
      console.log('User validation result:', isValid);

      if (isValid) {
        // Submit to API
        const result = submitCollectionData(collectionData);
        console.log('API submission result:', result);

        if (result.success) {
          console.log('✅ Form processed successfully');
          sendSuccessEmail(collectionData.submitter_email, result);
        } else {
          console.error('❌ API submission failed:', result.error);
          sendErrorEmail(collectionData.submitter_email, result.error);
        }
      } else {
        const errorMsg = 'User not authorized to submit forms';
        console.error('❌ User validation failed:', errorMsg);
        sendErrorEmail(collectionData.submitter_email, errorMsg);
      }

    } catch (error) {
      console.error('Form processing error:', error);

      // Try to get submitter email from the error context
      let submitterEmail = 'unknown';
      try {
        if (e && e.response) {
          const itemResponses = e.response.getItemResponses();
          const emailItem = itemResponses.find(item =>
            item.getItem().getTitle().toLowerCase().includes('email')
          );
          if (emailItem) {
            submitterEmail = emailItem.getResponse();
          }
        }
      } catch (emailError) {
        console.error('Could not extract email for error notification:', emailError);
      }

      sendErrorEmail(submitterEmail, `Form processing error: ${error.toString()}`);
    }
}

/**
 * Extract collection data from form responses
 * Customize these field mappings based on your form questions
 */
function extractCollectionData(itemResponses) {
  const data = {
    submitter_email: '',
    date: new Date().toISOString().split('T')[0], // Default to today
    description: '',
    general_tithes_offering: 0,
    sunday_school: 0,
    young_people: 0,
    sisterhood_san_juan: 0,
    sisterhood_labuin: 0,
    brotherhood: 0,
    bank_interest: 0,
    total_amount: 0
  };
  
  // Map form questions to data fields
  // Update these mappings based on your actual form questions
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
    } else if (title.includes('description') || title.includes('note')) {
      data.description = response;
    } else if (title.includes('tithe') && title.includes('offering')) {
      data.general_tithes_offering = parseFloat(response) || 0;
    } else if (title.includes('sunday school')) {
      data.sunday_school = parseFloat(response) || 0;
    } else if (title.includes('young people')) {
      data.young_people = parseFloat(response) || 0;
    } else if (title.includes('sisterhood san juan')) {
      data.sisterhood_san_juan = parseFloat(response) || 0;
    } else if (title.includes('sisterhood labuin')) {
      data.sisterhood_labuin = parseFloat(response) || 0;
    } else if (title.includes('brotherhood')) {
      data.brotherhood = parseFloat(response) || 0;
    } else if (title.includes('bank') || title.includes('interest')) {
      data.bank_interest = parseFloat(response) || 0;
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
 * Submit collection data to API
 */
function submitCollectionData(formData) {
  try {
    const url = `${API_BASE_URL}/api/forms/collection`;
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
    const subject = 'Collection Submitted Successfully - SBCC Financial System';
    const body = `
Dear Church Member,

Your collection record has been successfully submitted to the SBCC Financial System.

Details:
- Record ID: ${result.record_id}
- Control Number: ${result.control_number}
- Total Amount: ₱${result.total_amount.toLocaleString()}
- Submitted: ${new Date().toLocaleString()}

Thank you for your contribution to the church!

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
    const subject = 'Collection Submission Error - SBCC Financial System';
    const body = `
Dear User,

There was an issue processing your collection form submission:

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
    description: 'Test collection from Apps Script',
    general_tithes_offering: 1000,
    sunday_school: 200,
    young_people: 150,
    sisterhood_san_juan: 300,
    sisterhood_labuin: 250,
    brotherhood: 400,
    bank_interest: 50,
    total_amount: 0 // Will be auto-calculated
  };
  
  console.log('Testing form submission with data:', testData);
  
  // Skip validation for testing
  const isValid = true;
  
  if (isValid) {
    // Test API submission
    const result = submitCollectionData(testData);
    console.log('API submission result:', result);
  }
}