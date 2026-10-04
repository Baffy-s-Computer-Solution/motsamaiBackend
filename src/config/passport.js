const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const bcrypt = require('bcrypt');
const models = require('../models');
const logger = require('./logger');

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
	try {
		const user = await models.User.findOne({ where: { email } });
		if (!user) return done(null, false, { message: 'Invalid credentials' });
		if (!user.password_hash) return done(null, false, { message: 'Account has no password set' });
		const ok = await bcrypt.compare(password, user.password_hash);
		if (!ok) return done(null, false, { message: 'Invalid credentials' });
		return done(null, user);
	} catch (err) {
		logger.error('LocalStrategy error', { err: err.message });
		return done(err);
	}
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
	try {
		const user = await models.User.findByPk(id);
		done(null, user);
	} catch (err) {
		done(err);
	}
});

module.exports = passport;
