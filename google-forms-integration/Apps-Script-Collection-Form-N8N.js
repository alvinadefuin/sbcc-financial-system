/**
 * SBCC Financial System - Collection Form Integration (via n8n)
 * Google Apps Script for processing collection form submissions through n8n
 *
 * Instructions:
 * 1. Create a Google Form for collections
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Update the N8N_WEBHOOK_URL to your n8n webhook URL
 * 5. Save and set up form submit trigger
 */

// Configure your n8n webhook endpoint
const N8N_WEBHOOK_URL = 'https://your-n8n-domain.railway.app/webhook/google-form-collection';
// Alternative: Use webhook test URL from n8n: https://your-n8n.railway.app/webhook-test/...

/**
 * Main function that processes form submissions
 * This function is triggered when the form is submitted
 */
function onFormSubmit(e) {
    try {
      console.log('Form submitted, processing via n8n...');
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

      // Send to n8n webhook (n8n will handle validation and API submission)
      const result = sendToN8N(collectionData);
      console.log('n8n webhook result:', result);

      if (result.success) {
        console.log('✅ Form processed successfully via n8n');
        // n8n will handle sending confirmation email
      } else {
        console.error('❌ n8n webhook failed:', result.error);
        sendErrorEmail(collectionData.submitter_email, result.error);
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

  // Auto-calculate total if not provided
  if (data.total_amount === 0) {
    data.total_amount =
      data.general_tithes_offering +
      data.sunday_school +
      data.young_people +
      data.sisterhood_san_juan +
      data.sisterhood_labuin +
      data.brotherhood +
      data.bank_interest;
  }

  return data;
}

/**
 * Send data to n8n webhook
 * n8n will handle: validation, retry logic, error handling, email notifications
 */
function sendToN8N(formData) {
  try {
    const response = UrlFetchApp.fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(formData),
      muteHttpExceptions: true,
      timeout: 30000 // 30 second timeout
    });

    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());

    console.log('n8n response code:', responseCode);
    console.log('n8n response:', result);

    if (responseCode === 200 || responseCode === 201) {
      return {
        success: true,
        ...result
      };
    } else {
      return {
        success: false,
        error: result.error || `HTTP ${responseCode}: ${response.getContentText()}`
      };
    }

  } catch (error) {
    console.error('Error sending to n8n:', error);
    return {
      success: false,
      error: 'Failed to connect to n8n: ' + error.toString()
    };
  }
}

/**
 * Send error email to user (fallback if n8n fails)
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
        if (trigger.getTriggerSource() === ScriptApp.TriggerSource.FORMS) {
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
  // Sample test data
  const testData = {
    submitter_email: 'adefuin29@gmail.com',
    date: '2025-12-14',
    description: 'Test collection via n8n',
    general_tithes_offering: 1000,
    sunday_school: 200,
    young_people: 150,
    sisterhood_san_juan: 300,
    sisterhood_labuin: 250,
    brotherhood: 400,
    bank_interest: 50,
    total_amount: 2350
  };

  console.log('Testing n8n webhook with data:', testData);

  const result = sendToN8N(testData);
  console.log('Test result:', result);

  if (result.success) {
    console.log('✅ n8n webhook test successful!');
  } else {
    console.error('❌ n8n webhook test failed:', result.error);
  }
}

/**
 * Test n8n connection
 */
function testN8NConnection() {
  const testData = {
    test: true,
    message: 'Testing n8n webhook connection',
    timestamp: new Date().toISOString()
  };

  const result = sendToN8N(testData);
  console.log('Connection test result:', result);

  return result.success;
}
