const isDatabaseUnavailable = require('../../src/utils/isDatabaseUnavailable');

describe('isDatabaseUnavailable', () => {
  it('recognizes Sequelize connection failures', () => {
    expect(isDatabaseUnavailable({ name: 'SequelizeConnectionRefusedError' })).toBe(true);
  });

  it('recognizes wrapped socket errors', () => {
    expect(isDatabaseUnavailable({
      name: 'SequelizeConnectionError',
      parent: { code: 'ECONNREFUSED' },
    })).toBe(true);
  });

  it('does not treat validation or query errors as an outage', () => {
    expect(isDatabaseUnavailable({ name: 'SequelizeValidationError' })).toBe(false);
    expect(isDatabaseUnavailable({ name: 'SequelizeDatabaseError', parent: { code: '42703' } })).toBe(false);
  });
});
