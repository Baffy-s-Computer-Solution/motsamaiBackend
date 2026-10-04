const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

/**
 * EmailService - Handles transactional emails (receipts, welcomes, alerts)
 */
class EmailService {
  constructor() {
    const key = process.env.SENDGRID_API_KEY;
    if (key && key.startsWith('SG.')) {
      try {
        sgMail.setApiKey(key);
      } catch (error) {
        logger.warn('SendGrid disabled: failed to initialize API key', { error: error.message });
      }
    } else if (key) {
      logger.warn('SendGrid disabled: SENDGRID_API_KEY is not a valid SendGrid key');
    }
  }

  /**
   * Sends a ride receipt to a user
   * @param {string} userEmail - Recipient email
   * @param {Object} rideDetails - Data from Ride model
   * @param {Object} paymentDetails - Data from Payment model
   */
  async sendRideReceipt(userEmail, rideDetails, paymentDetails) {
    if (!userEmail || !rideDetails || !paymentDetails) {
      logger.error('Missing parameters for sendRideReceipt');
      return;
    }

    const msg = {
      to: userEmail,
      from: process.env.EMAIL_FROM || '',
      subject: `Your Motsamai Trip Receipt - ${rideDetails.id}`,
      html: `
        <h1>Thanks for riding, ${rideDetails.riderName}!</h1>
        <p><strong>From:</strong> ${rideDetails.pickup_address}</p>
        <p><strong>To:</strong> ${rideDetails.dropoff_address}</p>
        <hr />
        <p><strong>Total Amount:</strong> LSL ${paymentDetails.amount}</p>
        <p><strong>Paid via:</strong> ${paymentDetails.provider}</p>
      `,
    };

    try {
      if (!process.env.SENDGRID_API_KEY) {
        logger.warn('Email skipped: SendGrid not configured');
        if (process.env.NODE_ENV === 'development') {
          logger.info('Simulated Email content:', msg.html);
        }
        return true;
      }
      await sgMail.send(msg);
      logger.info(`Receipt email sent to ${userEmail}`);
      return true;
    } catch (error) {
      logger.error('Email delivery failed:', error);
      return false;
    }
  }

  /**
   * Sends a welcome email to new users
   * @param {Object} user - User model instance
   */
  async sendWelcomeEmail(user) {
    const msg = {
      to: user.email,
      from: process.env.EMAIL_FROM || '',
      subject: 'Welcome to Motsamai!',
      html: `
        <h1>Welcome, ${user.name}!</h1>
        <p>Thank you for joining the Motsamai community. Start your first journey today!</p>
        <a href="${process.env.APP_URL}/login">Login to your account</a>
      `,
    };
    
    try {
      if (!process.env.SENDGRID_API_KEY) return true;
      await sgMail.send(msg);
      return true;
    } catch (error) {
      logger.error('Welcome email failed:', error);
      return false;
    }
  }

  /**
   * Notifies user of sensitive account actions
   * @param {string} userEmail 
   * @param {string} action - Description of action (e.g. "Password Change")
   */
  async sendSecurityAlert(userEmail, action) {
    const msg = {
      to: userEmail,
      from: process.env.EMAIL_FROM || '',
      subject: 'Motsamai Security Alert',
      text: `Important: A security action (${action}) was performed on your account at ${new Date().toISOString()}. If this wasn't you, please reset your password immediately.`,
    };

    try {
      if (!process.env.SENDGRID_API_KEY) return true;
      await sgMail.send(msg);
      return true;
    } catch (error) {
      logger.error('Security email failed:', error);
      return false;
    }
  }
}

module.exports = new EmailService();
