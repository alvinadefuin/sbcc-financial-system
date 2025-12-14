/**
 * SBCC Financial System - Expense Form Integration (via n8n)
 * Google Apps Script for processing expense form submissions through n8n
 *
 * Instructions:
 * 1. Create a Google Form for expenses
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Update the N8N_WEBHOOK_URL to your n8n webhook URL
 * 5. Save and set up form submit trigger
 */

// Configure your n8n webhook endpoint
const N8N_WEBHOOK_URL = 'https://your-n8n-domain.railway.app/webhook/google-form-expense';

function onFormSubmit(e) {
    try {
      console.log('Expense form submitted, processing via n8n...');

      if (!e || !e.response) {
        console.error('Invalid event object');
        return;
      }

      const itemResponses = e.response.getItemResponses();
      const expenseData = extractExpenseData(itemResponses);
      console.log('Extracted expense data:', expenseData);

      const result = sendToN8N(expenseData);
      console.log('n8n webhook result:', result);

      if (result.success) {
        console.log('✅ Expense processed successfully via n8n');
      } else {
        console.error('❌ n8n webhook failed:', result.error);
        sendErrorEmail(expenseData.submitter_email, result.error);
      }

    } catch (error) {
      console.error('Expense form processing error:', error);
    }
}

function extractExpenseData(itemResponses) {
  const data = {
    submitter_email: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    pbcm_share_pdot: 0,
    pastoral_team: 0,
    operational_fund_1: '',
    operational_fund_1_amount: 0,
    operational_fund_2: '',
    operational_fund_2_amount: 0,
    operational_fund_3: '',
    operational_fund_3_amount: 0,
    total_amount: 0
  };

  itemResponses.forEach(function(itemResponse) {
    const title = itemResponse.getItem().getTitle().toLowerCase();
    const response = itemResponse.getResponse();

    if (title.includes('email')) {
      data.submitter_email = response;
    } else if (title.includes('date')) {
      if (response instanceof Date) {
        data.date = response.toISOString().split('T')[0];
      } else if (typeof response === 'string') {
        data.date = response;
      }
    } else if (title.includes('description') || title.includes('particular')) {
      data.description = response;
    } else if (title.includes('pbcm share') || title.includes('pdot')) {
      data.pbcm_share_pdot = parseFloat(response) || 0;
    } else if (title.includes('pastoral team')) {
      data.pastoral_team = parseFloat(response) || 0;
    } else if (title.includes('1.') && title.includes('operational fund')) {
      data.operational_fund_1 = response;
    } else if (title.includes('1.') && title.includes('amount')) {
      data.operational_fund_1_amount = parseFloat(response) || 0;
    } else if (title.includes('2.') && title.includes('operational fund')) {
      data.operational_fund_2 = response;
    } else if (title.includes('2.') && title.includes('amount')) {
      data.operational_fund_2_amount = parseFloat(response) || 0;
    } else if (title.includes('3.') && title.includes('operational fund')) {
      data.operational_fund_3 = response;
    } else if (title.includes('3.') && title.includes('amount')) {
      data.operational_fund_3_amount = parseFloat(response) || 0;
    } else if (title.includes('total')) {
      data.total_amount = parseFloat(response) || 0;
    }
  });

  // Auto-calculate total
  if (data.total_amount === 0) {
    data.total_amount =
      data.pbcm_share_pdot +
      data.pastoral_team +
      data.operational_fund_1_amount +
      data.operational_fund_2_amount +
      data.operational_fund_3_amount;
  }

  return data;
}

function sendToN8N(formData) {
  try {
    const response = UrlFetchApp.fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(formData),
      muteHttpExceptions: true,
      timeout: 30000
    });

    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());

    if (responseCode === 200 || responseCode === 201) {
      return { success: true, ...result };
    } else {
      return {
        success: false,
        error: result.error || `HTTP ${responseCode}`
      };
    }

  } catch (error) {
    return {
      success: false,
      error: 'Failed to connect to n8n: ' + error.toString()
    };
  }
}

function sendErrorEmail(email, errorMessage) {
  try {
    const subject = 'Expense Submission Error - SBCC Financial System';
    const body = `
Dear User,

There was an issue processing your expense form submission:

Error: ${errorMessage}

Please contact the church administrator or try submitting again.

SBCC Financial System
    `;

    GmailApp.sendEmail(email, subject, body);
  } catch (error) {
    console.error('Error sending error email:', error);
  }
}

function setupTrigger() {
    try {
      const form = FormApp.getActiveForm();
      const allTriggers = ScriptApp.getProjectTriggers();

      allTriggers.forEach(trigger => {
        if (trigger.getTriggerSource() === ScriptApp.TriggerSource.FORMS) {
          ScriptApp.deleteTrigger(trigger);
        }
      });

      ScriptApp.newTrigger('onFormSubmit')
        .forForm(form)
        .onFormSubmit()
        .create();

      console.log('Expense form trigger created successfully');
    } catch (error) {
      console.error('Error setting up trigger:', error);
    }
}

function testFormSubmission() {
  const testData = {
    submitter_email: 'adefuin29@gmail.com',
    date: '2025-12-14',
    description: 'Test expense via n8n',
    pbcm_share_pdot: 500,
    pastoral_team: 1000,
    operational_fund_1: 'Supplies',
    operational_fund_1_amount: 300,
    operational_fund_2: 'Utilities',
    operational_fund_2_amount: 800,
    operational_fund_3: '',
    operational_fund_3_amount: 0,
    total_amount: 2600
  };

  console.log('Testing n8n webhook with data:', testData);
  const result = sendToN8N(testData);
  console.log('Test result:', result);
}
