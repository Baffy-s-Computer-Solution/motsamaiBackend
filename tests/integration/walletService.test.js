const walletService = require('../../../src/services/walletService');
const { User, Wallet, Transaction } = require('../../../src/models');

describe('WalletService ACID Transaction Rollback', () => {
  let testUser;

  beforeAll(async () => {
    testUser = await User.create({
      name: 'Rollback Tester',
      email: 'rollback@motsamai.test',
      phone: '26659123456',
      password_hash: 'hashed'
    });
  });

  it('should rollback balance update if the subsequent transaction log fails', async () => {
    const initialBalance = 100.00;
    
    // Setup initial state
    await Wallet.create({
      user_id: testUser.id,
      balance: initialBalance
    });

    try {
      /**
       * We attempt to update balance by adding 50.00, but we pass an invalid 'type' 
       * (e.g., null or a non-existent ENUM value) to force the Transaction.create 
       * to throw a database error.
       */
      await walletService.updateBalance(
        testUser.id, 
        50.00, 
        null, // This violates the 'NOT NULL' constraint on the Transaction model
        'Test rollback description'
      );
    } catch (error) {
      // Error is expected due to the invalid data provided above
    }

    // Check Wallet Balance - it must still be 100.00 if the transaction rolled back
    const wallet = await Wallet.findOne({ where: { user_id: testUser.id } });
    expect(parseFloat(wallet.balance)).toBe(initialBalance);

    // Ensure no transaction record was actually persisted
    const transaction = await Transaction.findOne({
      where: { description: 'Test rollback description' }
    });
    expect(transaction).toBeNull();
  });
});