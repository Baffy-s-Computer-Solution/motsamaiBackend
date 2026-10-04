const path = require('path');
const dotenv = require('dotenv');

const nodeEnv = process.env.NODE_ENV || 'production';
dotenv.config({ path: path.resolve(__dirname, `../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { admin, isFirebaseEnabled } = require('../src/config/firebase');

async function testFirebaseAdc() {
  try {
    if (!isFirebaseEnabled) {
      console.error('Firebase is not initialized. Check FIREBASE_USE_ADC and auth setup.');
      process.exit(1);
    }

    await admin.auth().listUsers(1);
    console.log('Firebase ADC auth check passed.');
    process.exit(0);
  } catch (error) {
    console.error(`Firebase ADC auth check failed: ${error.message}`);
    process.exit(1);
  }
}

testFirebaseAdc();
