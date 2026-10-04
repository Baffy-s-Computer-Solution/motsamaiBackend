const featureFlags = {
  emailVerification: process.env.FEATURE_EMAIL_VERIFICATION === 'true',
  passwordReset: process.env.FEATURE_PASSWORD_RESET === 'true',
  fileUploads: process.env.FEATURE_FILE_UPLOADS === 'true',
  notifications: process.env.FEATURE_NOTIFICATIONS === 'true',
  analytics: process.env.FEATURE_ANALYTICS === 'true',
  socialLogin: process.env.FEATURE_SOCIAL_LOGIN === 'true',
  demoMode: process.env.ENABLE_DEMO_MODE === 'true',
  swagger: process.env.ENABLE_SWAGGER === 'true',
};

module.exports = featureFlags;
