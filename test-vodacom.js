require('dotenv').config({ path: '.env.development' });
const service = require('./src/services/vodacomLesotho.service');

const run = async () => {
  console.log('Vodacom Lesotho M-Pesa sandbox check');
  console.log(`Environment: ${service.config.environment}`);
  console.log(`Currency: ${service.config.currency}`);
  console.log(`Configured: ${service.config.isConfigured}`);

  if (!service.config.isConfigured) {
    console.error('Missing VODACOM_LS_API_KEY. Add the API key before testing live sandbox calls.');
    process.exitCode = 1;
    return;
  }

  const health = await service.healthCheck();
  console.log('Health:', health);
  if (health.status !== 'healthy') process.exitCode = 1;
};

run().catch(error => {
  console.error('Vodacom test failed:', error.message);
  process.exitCode = 1;
});
