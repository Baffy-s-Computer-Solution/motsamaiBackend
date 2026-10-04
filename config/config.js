const path = require('path');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const envSpecificPath = path.join(root, `.env.${nodeEnv}`);
const envDefaultPath = path.join(root, '.env');

if (require('fs').existsSync(envDefaultPath)) {
  dotenv.config({ path: envDefaultPath });
}
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath, override: false });
}

const dialect = process.env.DB_DIALECT || 'postgres';
const isPostgres = dialect === 'postgres';
const dbPassword = process.env.DB_PASSWORD === '' ? undefined : process.env.DB_PASSWORD;
const commonConfig = {
  username: process.env.DB_USER || 'postgres',
  password: dbPassword,
  database: process.env.DB_NAME || (isProduction ? 'postgres' : 'motsamai_dev'),
  host: process.env.DB_HOST || (isProduction ? undefined : '127.0.0.1'),
  port: Number(process.env.DB_PORT || (isPostgres ? 5432 : 3306)),
  dialect,
  pool: {
    max: Number(process.env.DB_POOL_MAX || 20),
    min: Number(process.env.DB_POOL_MIN || 2),
    acquire: 60000,
    idle: 10000,
  },
  ...(process.env.DATABASE_URL ? { use_env_variable: 'DATABASE_URL' } : {}),
  dialectOptions: process.env.DB_SSL === 'true' || (isProduction && process.env.DB_SSL !== 'false')
    ? {
      ssl: {
        require: true,
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      },
    }
    : {},
};

module.exports = {
  development: commonConfig,
  test: {
    ...commonConfig,
    database: process.env.DB_NAME || 'motsamai_test',
  },
  production: commonConfig,
};
