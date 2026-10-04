const jwt = require('jsonwebtoken');
const { User, RefreshToken } = require('../models');
const { AuthenticationError, NotFoundError } = require('../utils/apiError');
const config = require('../config');
const logger = require('../utils/logger');

class AuthService {
  async register(userData) {
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { email: userData.email },
          { phone: userData.phone }
        ]
      }
    });
    
    if (existingUser) {
      throw new ConflictError('User already exists');
    }
    
    const user = await User.create(userData);
    
    const tokens = this.generateTokens(user);
    
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    
    return { user: user.toJSON(), ...tokens };
  }
  
  async login(email, password) {
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }
    
    const isValid = await user.validatePassword(password);
    
    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }
    
    if (!user.is_active) {
      throw new AuthenticationError('Account deactivated');
    }
    
    await user.update({ last_login_at: new Date() });
    
    const tokens = this.generateTokens(user);
    
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    
    return { user: user.toJSON(), ...tokens };
  }
  
  async refreshToken(refreshToken) {
    const tokenDoc = await RefreshToken.findOne({
      where: { token: refreshToken, is_revoked: false }
    });
    
    if (!tokenDoc || tokenDoc.expires_at < new Date()) {
      throw new AuthenticationError('Invalid refresh token');
    }
    
    const user = await User.findByPk(tokenDoc.user_id);
    
    if (!user) {
      throw new NotFoundError('User');
    }
    
    await tokenDoc.update({ is_revoked: true });
    
    const tokens = this.generateTokens(user);
    
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    
    return tokens;
  }
  
  async logout(userId, refreshToken) {
    await RefreshToken.update(
      { is_revoked: true },
      { where: { user_id: userId, token: refreshToken } }
    );
    
    return { success: true };
  }
  
  generateTokens(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role
    };
    
    const accessToken = jwt.sign(payload, config.JWT.secret, {
      expiresIn: config.JWT.expiresIn
    });
    
    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      config.JWT.secret,
      { expiresIn: config.JWT.refreshExpiresIn }
    );
    
    return { accessToken, refreshToken };
  }
  
  async saveRefreshToken(userId, token) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    await RefreshToken.create({
      user_id: userId,
      token,
      expires_at: expiresAt,
      is_revoked: false
    });
  }
}

module.exports = new AuthService();
