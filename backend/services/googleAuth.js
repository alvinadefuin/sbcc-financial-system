const { OAuth2Client } = require('google-auth-library');

class GoogleAuthService {
  constructor() {
    // These will be set from environment variables
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (this.clientId) {
      this.client = new OAuth2Client(this.clientId);
    }
  }

  async verifyGoogleToken(token) {
    try {
      if (!this.client) {
        throw new Error('Google OAuth not configured - missing GOOGLE_CLIENT_ID');
      }

      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      
      // Verify the token is from a Gmail account or Google Workspace
      if (!payload.email_verified) {
        throw new Error('Email not verified by Google');
      }

      // Check if it's a Gmail account (ends with @gmail.com) or Google Workspace
      if (!payload.email.includes('@')) {
        throw new Error('Invalid email format');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        profilePicture: payload.picture,
        emailVerified: payload.email_verified,
      };
    } catch (error) {
      console.error('Google token verification failed:', error);
      throw new Error('Invalid Google token');
    }
  }

  // Check if Google OAuth is properly configured
  isConfigured() {
    return !!(this.clientId && this.clientSecret);
  }

  // Get the OAuth client for frontend configuration
  getClientId() {
    return this.clientId;
  }
}

module.exports = new GoogleAuthService();