const isConfigured = value => Boolean(value && value.trim() && !value.includes('YOUR_'));

const config = {
  country: 'LS',
  provider: 'vodacom-mpesa',
  apiKey: process.env.VODACOM_LS_API_KEY,
  shortCode: process.env.VODACOM_LS_SHORTCODE,
  environment: process.env.VODACOM_LS_ENVIRONMENT || 'sandbox',
  baseURL: process.env.VODACOM_LS_BASE_URL || 'https://openapiportal.m-pesa.com/api/v1',
  callbackURL: process.env.VODACOM_LS_CALLBACK_URL,
  currency: process.env.VODACOM_LS_CURRENCY || 'LSL',
  sessionLifetime: Number.parseInt(process.env.VODACOM_LS_SESSION_LIFETIME || '3600', 10),
  timeout: Number.parseInt(process.env.PAYMENT_TIMEOUT || '30000', 10),
  endpoints: {
    generateSession: '/session/generate',
    initiatePayment: '/payment/initiate',
    queryStatus: '/transaction/status',
    reversal: '/transaction/reverse'
  }
};

config.isConfigured = isConfigured(config.apiKey);
config.requireConfigured = () => {
  const missing = [];
  if (!isConfigured(config.apiKey)) missing.push('VODACOM_LS_API_KEY');
  if (missing.length) throw new Error(`Vodacom Lesotho M-Pesa is not configured: ${missing.join(', ')}`);
};

config.requirePaymentConfigured = () => {
  config.requireConfigured();
  if (!isConfigured(config.shortCode)) throw new Error('VODACOM_LS_SHORTCODE is required to initiate a payment.');
  if (!config.callbackURL) throw new Error('VODACOM_LS_CALLBACK_URL is required to initiate a payment.');
};

module.exports = config;
