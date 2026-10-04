/**
 * Mobile Money Helper Utilities
 * @module utils/mobileMoneyHelpers
 */

/**
 * Validate Lesotho phone number
 */
function validateLesothoPhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.toString().replace(/\D/g, '');
  
  // Check for valid Lesotho formats
  const patterns = [
    /^266[568][0-9]{7}$/, // +266 format
    /^[568][0-9]{7}$/     // Local format
  ];
  
  return patterns.some(pattern => pattern.test(cleaned));
}

/**
 * Format amount for display
 */
function formatAmount(amount, currency = 'LSL') {
  return new Intl.NumberFormat('en-LS', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Calculate fees based on amount
 */
function calculateMobileMoneyFee(amount, provider) {
  const feeConfig = {
    MPESA: {
      minFee: 5,
      maxFee: 150,
      rate: 0.01 // 1%
    },
    ECOCASH: {
      minFee: 3,
      maxFee: 100,
      rate: 0.008 // 0.8%
    }
  };
  
  const config = feeConfig[provider];
  let fee = amount * config.rate;
  
  fee = Math.max(fee, config.minFee);
  fee = Math.min(fee, config.maxFee);
  
  return Math.round(fee * 100) / 100;
}

/**
 * Get transaction status badge
 */
function getStatusBadge(status) {
  const badges = {
    PENDING: { color: 'warning', text: 'Pending' },
    COMPLETED: { color: 'success', text: 'Completed' },
    FAILED: { color: 'danger', text: 'Failed' },
    CANCELLED: { color: 'secondary', text: 'Cancelled' },
    REVERSED: { color: 'info', text: 'Reversed' },
    TIMEOUT: { color: 'dark', text: 'Timeout' }
  };
  
  return badges[status] || { color: 'light', text: status };
}

/**
 * Mask sensitive data
 */
function maskSensitiveData(data) {
  if (typeof data !== 'object') return data;
  
  const sensitiveFields = ['password', 'secret', 'key', 'token', 'pin', 'cvv'];
  const masked = { ...data };
  
  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '******';
    }
  }
  
  return masked;
}

module.exports = {
  validateLesothoPhoneNumber,
  formatAmount,
  calculateMobileMoneyFee,
  getStatusBadge,
  maskSensitiveData
};