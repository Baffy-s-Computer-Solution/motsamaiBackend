﻿const { User, Driver } = require('../models');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const { BadRequestException, AuthenticationError } = require('../exceptions/api.exception');
const emailAdapter = require('../adapters/email.adapter');
const {
    admin,
    authFirebaseApp,
    firestoreFirebaseApp,
    isAuthFirebaseEnabled,
    isFirestoreFirebaseEnabled,
} = require('../config/firebase');
const {
    syncUserToFirestore,
    syncFirebaseRoleClaims,
    getFirestoreUserByUid,
    getFirestoreUserByEmail,
    persistFirebaseUserProfile,
} = require('../services/firestoreUserService');
const { uploadRemoteImage } = require('../services/storageService');
const isDatabaseUnavailable = require('../utils/isDatabaseUnavailable');

const markDriverOnline = async (user) => {
    if (user?.role !== 'driver') return;
    await Driver.update(
        { is_online: true, status: 'available' },
        { where: { user_id: user.id } },
    );
};

const isDemoAdminLogin = (email, password) => {
    return Boolean(
        config.DEMO_ADMIN?.email &&
        config.DEMO_ADMIN?.password &&
        email === config.DEMO_ADMIN.email &&
        password === config.DEMO_ADMIN.password
    );
};

const isConfiguredAdminEmail = (email) => Boolean(
    config.CONFIGURED_ADMIN?.email &&
    email === config.CONFIGURED_ADMIN.email
);

const isAdminBypassLogin = (email, password) => isDemoAdminLogin(email, password);

const verifyPassword = async (password, passwordHash) => {
    if (!password || !passwordHash) return false;

    try {
        return await bcrypt.compare(password, passwordHash);
    } catch (error) {
        return false;
    }
};

const buildUniqueOAuthPhone = (uid = '') => {
    const digits = `${Date.now()}${uid.replace(/\D/g, '')}`.slice(-8);
    const prefix = process.env.DEFAULT_PHONE_FOR_OAUTH_PREFIX || '+266';
    return `${prefix}${digits.padStart(8, '0')}`;
};

const buildUniquePhone = (seed = '') => {
    const digits = `${Date.now()}${String(seed).replace(/\D/g, '')}`.slice(-8);
    return `+266${digits.padStart(8, '0')}`;
};

const generateAuthTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user.id, firebase_uid: user.firebase_uid || undefined, role: user.role, email: user.email },
        config.JWT.secret,
        { expiresIn: config.JWT.expiresIn || '24h' }
    );

    const refreshToken = jwt.sign(
        { id: user.id, firebase_uid: user.firebase_uid || undefined, role: user.role, email: user.email, type: 'refresh' },
        config.JWT.refreshSecret || config.JWT.secret,
        { expiresIn: config.JWT.refreshExpiresIn || config.JWT.refreshTokenExpiry || '30d' }
    );

    return { accessToken, refreshToken, token: accessToken };
};

const generateBiometricLoginToken = (user) => jwt.sign(
    { id: user.id, role: user.role, email: user.email, purpose: 'driver-biometric-login' },
    config.JWT.secret,
    { expiresIn: '15m' }
);

const buildNameParts = (name = 'Motsamai Admin') => {
    const [firstName, ...lastNameParts] = name.trim().split(/\s+/).filter(Boolean);
    return {
        first_name: firstName || 'Motsamai',
        last_name: lastNameParts.join(' ') || 'Admin',
    };
};

const buildFirebaseUserProfile = (firebaseUser, firestoreData = {}) => {
    const name = firestoreData.name
        || firebaseUser.displayName
        || (isConfiguredAdminEmail((firebaseUser.email || '').toLowerCase()) ? config.CONFIGURED_ADMIN.name : '')
        || firebaseUser.email?.split('@')[0]
        || 'Motsamai User';
    const nameParts = buildNameParts(name);
    const isConfiguredAdmin = isConfiguredAdminEmail((firebaseUser.email || '').toLowerCase());
    const profile = {
        id: firebaseUser.uid,
        firebase_uid: firebaseUser.uid,
        first_name: firestoreData.first_name || nameParts.first_name,
        last_name: firestoreData.last_name || nameParts.last_name,
        name,
        email: firebaseUser.email,
        phone: firestoreData.phone || null,
        role: isConfiguredAdmin ? 'admin' : (firestoreData.role || firebaseUser.customClaims?.role || 'rider'),
        is_active: !firebaseUser.disabled && firestoreData.is_active !== false && firestoreData.status !== 'disabled',
        is_verified: Boolean(firebaseUser.emailVerified || firestoreData.is_verified),
        email_verified_at: firestoreData.email_verified_at || (firebaseUser.emailVerified ? new Date() : null),
        avatar_url: firestoreData.avatar_url || firebaseUser.photoURL || null,
        password_hash: null,
    };

    Object.defineProperty(profile, 'toJSON', {
        value: () => {
            const json = { ...profile };
            delete json.password_hash;
            delete json.firebase_uid;
            return json;
        },
    });

    return profile;
};

const resolveFirebaseLogin = async (email, idToken) => {
    if (!idToken || !isAuthFirebaseEnabled || !authFirebaseApp) return null;

    const decodedToken = await admin.auth(authFirebaseApp).verifyIdToken(idToken);
    if (decodedToken.email?.toLowerCase() !== email.toLowerCase()) {
        throw new AuthenticationError('Firebase account does not match this email');
    }

    const firebaseUser = await admin.auth(authFirebaseApp).getUser(decodedToken.uid);
    let firestoreData = {};

    try {
        const firestore = admin.firestore(firestoreFirebaseApp);
        const snapshot = await firestore.collection('users').doc(firebaseUser.uid).get();
        if (snapshot.exists) firestoreData = snapshot.data() || {};
    } catch (error) {
        console.warn('Firestore profile lookup failed; using Firebase Auth profile', error.message);
    }

    return buildFirebaseUserProfile(firebaseUser, firestoreData);
};

const persistConfiguredAdmin = async (firebaseProfile) => {
    const email = (firebaseProfile.email || '').trim().toLowerCase();
    let user = await User.findOne({
        where: { email },
        paranoid: false,
    });

    if (user?.firebase_uid && user.firebase_uid !== firebaseProfile.firebase_uid) {
        throw new AuthenticationError('Administrator account is linked to a different Firebase user');
    }

    if (user?.deletedAt && typeof user.restore === 'function') {
        await user.restore();
    }

    const adminFields = {
        first_name: firebaseProfile.first_name,
        last_name: firebaseProfile.last_name,
        phone: firebaseProfile.phone || buildUniquePhone(firebaseProfile.firebase_uid),
        role: 'admin',
        is_active: true,
        is_verified: true,
        email_verified_at: firebaseProfile.email_verified_at || new Date(),
        firebase_uid: firebaseProfile.firebase_uid,
    };

    if (!user) {
        user = await User.create({
            ...adminFields,
            email,
            password_hash: crypto.randomBytes(48).toString('hex'),
        });
    } else {
        user.set(adminFields);
        await user.save({ paranoid: false });
    }

    return user;
};

const persistFirebaseProfile = async (profile) => {
    const persisted = await persistFirebaseUserProfile(profile);
    const claimResult = await Promise.allSettled([
        syncFirebaseRoleClaims(persisted),
    ]);
    for (const result of claimResult) {
        if (result.status === 'rejected') {
            console.warn('Firebase role claim synchronization failed', result.reason?.message || result.reason);
        }
    }
    return persisted;
};

const createFirestoreGoogleProfile = async (googleToken, requestedRole, displayName, photoURL) => {
    const firebaseUser = await admin.auth(authFirebaseApp).getUser(googleToken.uid);
    const email = String(firebaseUser.email || googleToken.email || '').trim().toLowerCase();
    if (!email || (googleToken.email && email !== googleToken.email.trim().toLowerCase())) {
        throw new AuthenticationError('Google account email could not be verified');
    }

    const [userByUid, userByEmail] = await Promise.all([
        getFirestoreUserByUid(firebaseUser.uid),
        getFirestoreUserByEmail(email),
    ]);
    if (userByEmail?.firebase_uid && userByEmail.firebase_uid !== firebaseUser.uid) {
        throw new AuthenticationError('This email is already linked to a different Firebase account');
    }

    const firestoreData = userByUid || userByEmail || {};
    const profile = buildFirebaseUserProfile(firebaseUser, firestoreData);
    const resolvedName = displayName || firebaseUser.displayName || email.split('@')[0];
    const [firstName, ...lastNameParts] = resolvedName.trim().split(/\s+/).filter(Boolean);
    const persisted = await persistFirebaseProfile({
        ...profile,
        id: firebaseUser.uid,
        firebase_uid: firebaseUser.uid,
        email,
        name: firestoreData.name || resolvedName,
        first_name: firestoreData.first_name || firstName || 'Google',
        last_name: firestoreData.last_name || lastNameParts.join(' ') || 'User',
        phone: firestoreData.phone || buildUniqueOAuthPhone(firebaseUser.uid),
        role: firestoreData.role || requestedRole,
        avatar_url: firestoreData.avatar_url || photoURL || firebaseUser.photoURL || null,
        profile_picture: firestoreData.profile_picture || photoURL || firebaseUser.photoURL || null,
        is_active: profile.is_active,
        is_verified: Boolean(firebaseUser.emailVerified),
        email_verified_at: firebaseUser.emailVerified
            ? (firestoreData.email_verified_at || new Date())
            : null,
        last_login_at: new Date(),
    });

    return buildFirebaseUserProfile(firebaseUser, {
        ...firestoreData,
        ...persisted,
    });
};

const persistConfiguredAdminToFirestore = async (firebaseProfile) => {
    const profile = await persistFirebaseProfile({
        ...firebaseProfile,
        role: 'admin',
        is_active: true,
        is_verified: true,
        email_verified_at: firebaseProfile.email_verified_at || new Date(),
        phone: firebaseProfile.phone || buildUniquePhone(firebaseProfile.firebase_uid),
    });
    return buildFirebaseUserProfile({
        uid: profile.firebase_uid,
        email: profile.email,
        displayName: profile.name,
        emailVerified: true,
        disabled: false,
    }, profile);
};

const createEmailVerificationToken = (user) => jwt.sign(
    { id: user.id, email: user.email, purpose: 'email-verification' },
    config.JWT.secret,
    { expiresIn: '24h' }
);

const ensureAdminForLogin = async (email, password) => {
    const isDemoAdmin = isDemoAdminLogin(email, password);

    if (!isDemoAdmin) return null;

    const adminProfile = config.DEMO_ADMIN;
    const nameParts = buildNameParts(adminProfile.name);

    const adminDefaults = {
        ...nameParts,
        email,
        phone: adminProfile.phone || process.env.ADMIN_PHONE || `+266${String(Date.now()).slice(-8)}`,
        password_hash: password,
        role: 'admin',
        is_active: true,
        is_verified: true,
        email_verified_at: new Date(),
    };

    const existingAdmin = await User.findOne({
        where: { email },
        paranoid: false,
    });

    if (!existingAdmin) {
        return User.create(adminDefaults);
    }

    existingAdmin.set({
        role: 'admin',
        is_active: true,
        is_verified: true,
        email_verified_at: existingAdmin.email_verified_at || new Date(),
        deleted_at: null,
    });

    const currentPasswordWorks = await verifyPassword(password, existingAdmin.password_hash);
    if (isDemoAdmin && !currentPasswordWorks) {
        existingAdmin.password_hash = password;
    }

    await existingAdmin.save({ paranoid: false });
    return existingAdmin;
};

/**
 * Register a new user
 */
exports.register = asyncHandler(async (req, res) => {
    const { email, password, name, phone, role, firebase_uid } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const resolvedPhone = phone || buildUniquePhone(normalizedEmail);
    const [firstName, ...lastNameParts] = (name || '').trim().split(/\s+/).filter(Boolean);
    const assignedRole = role === 'driver' ? 'driver' : 'rider';

    if (!firstName) {
        throw new BadRequestException('Please enter your name');
    }

    let user;
    try {
        const existingUser = await User.findOne({ where: { email: normalizedEmail } });
        if (existingUser) {
            throw new BadRequestException('User with this email already exists');
        }

        user = await User.create({
            first_name: firstName,
            last_name: lastNameParts.join(' ') || firstName,
            email: normalizedEmail,
            phone: resolvedPhone,
            password_hash: password,
            role: assignedRole,
            firebase_uid: firebase_uid || null,
            is_verified: false,
            metadata: { emailVerificationIssuedAt: new Date().toISOString() },
        });
    } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        if (!firebase_uid || !isAuthFirebaseEnabled || !authFirebaseApp) {
            throw new AuthenticationError('Database is unavailable and Firebase account verification is not configured');
        }

        console.warn('Postgres unavailable during registration; persisting the Firebase profile to Firestore', error.message);
        const firebaseUser = await admin.auth(authFirebaseApp).getUser(firebase_uid);
        if (firebaseUser.email?.trim().toLowerCase() !== normalizedEmail) {
            throw new AuthenticationError('Firebase account does not match the registration email');
        }

        const [existingByUid, existingByEmail] = await Promise.all([
            getFirestoreUserByUid(firebase_uid),
            getFirestoreUserByEmail(normalizedEmail),
        ]);
        if (existingByEmail?.firebase_uid && existingByEmail.firebase_uid !== firebase_uid) {
            throw new BadRequestException('User with this email already exists');
        }

        const firestoreData = existingByUid || existingByEmail || {};
        const profile = buildFirebaseUserProfile(firebaseUser, firestoreData);
        const persisted = await persistFirebaseProfile({
            ...profile,
            id: firebase_uid,
            firebase_uid,
            email: normalizedEmail,
            name: firestoreData.name || name.trim(),
            first_name: firestoreData.first_name || firstName,
            last_name: firestoreData.last_name || lastNameParts.join(' ') || firstName,
            phone: firestoreData.phone || resolvedPhone,
            role: firestoreData.role || assignedRole,
            is_active: !firebaseUser.disabled,
            is_verified: Boolean(firebaseUser.emailVerified),
            email_verified_at: firebaseUser.emailVerified ? new Date() : null,
            metadata: { ...(firestoreData.metadata || {}), authProvider: 'password' },
        });

        const frontendUrl = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
        let verificationUrl = null;
        try {
            verificationUrl = await admin.auth(authFirebaseApp).generateEmailVerificationLink(normalizedEmail, {
                url: `${frontendUrl.replace(/\/$/, '')}/verify-email`,
                handleCodeInApp: true,
            });
        } catch (linkError) {
            console.warn('Firebase verification link generation failed during Firestore registration', linkError.message);
        }

        return sendResponse(res, 201, {
            user: buildFirebaseUserProfile(firebaseUser, persisted).toJSON(),
            verificationRequired: !firebaseUser.emailVerified,
            verificationUrl,
        }, 'Account created using Firebase and Firestore');
    }

    // Exclude password from response
    const userData = user.toJSON();
    delete userData.password_hash;

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
    let verificationUrl;

    if (isAuthFirebaseEnabled && authFirebaseApp) {
        try {
            verificationUrl = await admin.auth(authFirebaseApp).generateEmailVerificationLink(user.email, {
                url: `${frontendUrl.replace(/\/$/, '')}/verify-email`,
                handleCodeInApp: true,
            });
        } catch (error) {
            console.error('Firebase verification link generation failed; using local verification token', {
                email: user.email,
                error: error.message,
            });
        }
    }

    if (!verificationUrl) {
        const verificationToken = createEmailVerificationToken(user);
        verificationUrl = `${frontendUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(verificationToken)}`;
    }

    // Do not hold registration open on a slow or unavailable email provider.
    void emailAdapter.send({
        to: user.email,
        subject: 'Verify your Motsamai email address',
        text: `Verify your Motsamai account by opening this link: ${verificationUrl}`,
        html: `<p>Welcome to Motsamai.</p><p>Please verify your email address before signing in:</p><p><a href="${verificationUrl}">Verify my email address</a></p><p>This link expires in 24 hours.</p>`,
    }).catch((error) => {
        console.error('Registration verification email delivery failed', {
            email: user.email,
            error: error.message,
        });
    });

    await Promise.allSettled([
        syncUserToFirestore(user),
        syncFirebaseRoleClaims(user),
    ]);

    return sendResponse(res, 201, {
        user: userData,
        verificationRequired: true,
        verificationUrl,
    }, 'Account created. Please verify your email before signing in');
});

/**
 * Login user
 */
exports.login = asyncHandler(async (req, res) => {
    const { email, password, idToken } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    let user;
    if (isConfiguredAdminEmail(normalizedEmail)) {
        const firebaseProfile = await resolveFirebaseLogin(normalizedEmail, idToken);
        if (!firebaseProfile) {
            throw new AuthenticationError('Administrator sign in is temporarily unavailable');
        }

        try {
            user = await persistConfiguredAdmin(firebaseProfile);
        } catch (error) {
            if (!isDatabaseUnavailable(error)) throw error;
            console.warn('Postgres unavailable during administrator login; persisting the profile to Firestore', error.message);
            user = await persistConfiguredAdminToFirestore(firebaseProfile);
        }
    } else {
        let databaseAvailable = true;
        try {
            user = await User.findOne({ where: { email: normalizedEmail } });
        } catch (error) {
            if (!isDatabaseUnavailable(error)) throw error;
            databaseAvailable = false;
            console.warn('Postgres unavailable during login; authenticating with Firebase and Firestore', error.message);
        }

        if (!databaseAvailable) {
            user = await resolveFirebaseLogin(normalizedEmail, idToken);
            if (!user) throw new AuthenticationError('Sign in is temporarily unavailable');

            if (!user.is_active) throw new AuthenticationError('Account is disabled');
            if (!user.is_verified) throw new AuthenticationError('Please verify your email before signing in');

            user.last_login_at = new Date();
            user = buildFirebaseUserProfile(
                { uid: user.firebase_uid, email: user.email, displayName: user.name, emailVerified: user.is_verified },
                await persistFirebaseProfile(user),
            );
            const tokens = generateAuthTokens(user);
            return sendResponse(res, 200, { user: user.toJSON(), ...tokens }, 'Logged in with Firebase');
        }

        let firebaseAuthenticated = false;
        if (idToken) {
            const firebaseProfile = await resolveFirebaseLogin(normalizedEmail, idToken);
            if (firebaseProfile) {
                if (!user) {
                    if (!firebaseProfile.is_verified) {
                        throw new AuthenticationError('Please verify your email before signing in');
                    }
                    firebaseProfile.last_login_at = new Date();
                    const persistedProfile = await persistFirebaseProfile(firebaseProfile);
                    const firestoreUser = buildFirebaseUserProfile({
                        uid: firebaseProfile.firebase_uid,
                        email: firebaseProfile.email,
                        displayName: firebaseProfile.name,
                        emailVerified: firebaseProfile.is_verified,
                    }, persistedProfile);
                    const tokens = generateAuthTokens(firebaseProfile);
                    return sendResponse(
                        res,
                        200,
                        { user: firestoreUser.toJSON(), ...tokens },
                        'Logged in with Firebase',
                    );
                }

                if (user.firebase_uid && user.firebase_uid !== firebaseProfile.firebase_uid) {
                    throw new AuthenticationError('Firebase account does not match this user');
                }

                user.firebase_uid = firebaseProfile.firebase_uid;
                user.is_verified = true;
                user.email_verified_at = firebaseProfile.email_verified_at || user.email_verified_at;
                firebaseAuthenticated = true;
            }
        }

        if (!user) {
            user = await ensureAdminForLogin(normalizedEmail, password);
        }

        if (firebaseAuthenticated && user && !user.is_active) {
            throw new AuthenticationError('Account is disabled');
        }

        if (firebaseAuthenticated && user) {
            user.last_login_at = new Date();
            await user.save();
            await markDriverOnline(user);
            await Promise.allSettled([
                syncUserToFirestore(user),
                syncFirebaseRoleClaims(user),
            ]);
            const tokens = generateAuthTokens(user);
            return sendResponse(
                res,
                200,
                { user: user.toJSON(), ...tokens },
                'Logged in successfully',
            );
        }
    }

    if (!user) {
        throw new AuthenticationError('Invalid credentials');
    }

    if (!user.is_verified && !isAdminBypassLogin(normalizedEmail, password)) {
        if (!user.is_verified) {
            throw new AuthenticationError('Please verify your email before signing in');
        }
    }

    // 2. Verify password
    const isMatch = isConfiguredAdminEmail(normalizedEmail)
        || await verifyPassword(password, user.password_hash);
    if (!isMatch && !isAdminBypassLogin(normalizedEmail, password)) {
        throw new AuthenticationError('Invalid credentials');
    }

    if (isConfiguredAdminEmail(normalizedEmail)) {
        user.role = 'admin';
        user.is_active = true;
        user.is_verified = true;
        user.email_verified_at = user.email_verified_at || new Date();
    }

    if (!user.is_active) {
        throw new AuthenticationError('Account is disabled');
    }

    if (
        user.role === 'driver' &&
        typeof user.requiresBiometricLogin === 'function' &&
        user.requiresBiometricLogin() &&
        !isAdminBypassLogin(normalizedEmail, password)
    ) {
        if (typeof user.isBiometricLocked === 'function' && user.isBiometricLocked()) {
            throw new AuthenticationError('Biometric login is temporarily locked');
        }

        return sendResponse(res, 200, {
            requiresBiometric: true,
            loginToken: generateBiometricLoginToken(user),
            user: user.toJSON(),
        }, 'Biometric verification required');
    }

    user.last_login_at = new Date();
    await user.save();
    await markDriverOnline(user);

    const firebaseSync = [
        syncUserToFirestore(user),
        syncFirebaseRoleClaims(user),
    ];
    if (isConfiguredAdminEmail(normalizedEmail)) {
        await Promise.all(firebaseSync);
    } else {
        await Promise.allSettled(firebaseSync);
    }

    const tokens = generateAuthTokens(user);

    // 4. Exclude password hash from response
    const userData = user.toJSON();
    delete userData.password_hash;

    return sendResponse(res, 200, { user: userData, ...tokens }, 'Logged in successfully');
});

exports.completeBiometricLogin = asyncHandler(async (req, res) => {
    const { loginToken, verificationId } = req.body;

    if (!loginToken || !verificationId) {
        throw new BadRequestException('Login token and verification ID are required');
    }

    const decoded = jwt.verify(loginToken, config.JWT.secret);
    if (decoded.purpose !== 'driver-biometric-login') {
        throw new AuthenticationError('Invalid biometric login token');
    }

    const user = await User.findByPk(decoded.id);
    if (!user || user.role !== 'driver') {
        throw new AuthenticationError('Driver account not found');
    }

    if (!user.is_active) {
        throw new AuthenticationError('Account is disabled');
    }

    const latest = user.metadata?.latestBiometricVerification;
    if (!latest?.isVerified || latest?.correlationId !== verificationId) {
        throw new AuthenticationError('Biometric verification has not been completed');
    }

    user.last_login_at = new Date();
    user.biometric_last_verified_at = new Date();
    user.biometric_failed_attempts = 0;
    user.biometric_locked_until = null;
    await user.save();
    await markDriverOnline(user);

    await Promise.allSettled([
        syncUserToFirestore(user),
        syncFirebaseRoleClaims(user),
    ]);

    const tokens = generateAuthTokens(user);
    const userData = user.toJSON();
    delete userData.password_hash;

    return sendResponse(res, 200, { user: userData, ...tokens }, 'Biometric login completed');
});

// Logout user - invalidate tokens / session
exports.logout = asyncHandler(async (req, res) => {
    // If using refresh token store, invalidate the provided token here
    return sendResponse(res, 200, {}, 'Logged out successfully');
});

// Refresh access token
exports.refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        throw new BadRequestException('Refresh token required');
    }

    // NOTE: In a real implementation, validate the refresh token from DB or cache
    // For tests and basic behavior, simply issue a new token
    const decoded = jwt.verify(refreshToken, config.JWT.refreshSecret, {
        issuer: config.JWT.issuer,
        audience: config.JWT.audience,
    });
    if (decoded.type !== 'refresh') throw new AuthenticationError('Invalid refresh token');
    const newToken = jwt.sign({
        id: decoded.id,
        firebase_uid: decoded.firebase_uid || undefined,
        role: decoded.role,
        email: decoded.email,
    }, config.JWT.secret, {
        expiresIn: config.JWT.expiresIn || '24h',
        issuer: config.JWT.issuer,
        audience: config.JWT.audience,
    });

    return sendResponse(res, 200, { accessToken: newToken, refreshToken }, 'Token refreshed');
});

// Revoke refresh token
exports.revokeToken = asyncHandler(async (req, res) => {
    // Invalidate token in DB/cache if applicable
    return sendResponse(res, 200, {}, 'Token revoked');
});

// Forgot password - send reset email
exports.forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return sendResponse(res, 200, {}, 'If the email exists, a reset link was sent');

    // Generate reset token and send email (omitted in tests)
    return sendResponse(res, 200, {}, 'Password reset instructions sent');
});

// Reset password using token
exports.resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) throw new BadRequestException('Invalid request');

    // Token handling omitted; locate user and update password
    // For now, respond success
    return sendResponse(res, 200, {}, 'Password reset successfully');
});

// Change password (authenticated)
exports.changePassword = asyncHandler(async (req, res) => {
    const userId = req.user && req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!userId) throw new AuthenticationError('Not authenticated');

    const user = await User.findByPk(userId);
    if (!user) throw new BadRequestException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new BadRequestException('Current password is incorrect');

    user.password = newPassword;
    await user.save();

    return sendResponse(res, 200, {}, 'Password changed successfully');
});

// Verify email
exports.verifyEmail = asyncHandler(async (req, res) => {
    const { token, email } = req.body;

    if (!token && !email) throw new BadRequestException('Verification email or token required');

    if (!token && email && isAuthFirebaseEnabled && authFirebaseApp) {
        const firebaseUser = await admin.auth(authFirebaseApp).getUserByEmail(email.trim().toLowerCase());
        if (!firebaseUser.emailVerified) {
            throw new BadRequestException('Email is not verified yet');
        }

        let user;
        try {
            user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
            if (user) {
                user.is_verified = true;
                user.email_verified_at = new Date();
                await user.save();
            }
        } catch (error) {
            if (!isDatabaseUnavailable(error)) throw error;
            console.warn('Postgres unavailable during email verification; updating the Firestore profile', error.message);
        }

        if (!user) {
            const firestoreProfile = await getFirestoreUserByUid(firebaseUser.uid);
            if (!firestoreProfile) throw new BadRequestException('Verification account not found');
            await persistFirebaseProfile({
                ...buildFirebaseUserProfile(firebaseUser, firestoreProfile),
                ...firestoreProfile,
                id: firebaseUser.uid,
                firebase_uid: firebaseUser.uid,
                is_verified: true,
                email_verified_at: new Date(),
            });
        }

        return sendResponse(res, 200, { verified: true }, 'Email verified successfully');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.JWT.secret);
    } catch {
        throw new BadRequestException('Verification link is invalid or expired');
    }

    if (decoded.purpose !== 'email-verification' || !decoded.id) {
        throw new BadRequestException('Invalid verification token');
    }

    let user;
    try {
        user = await User.findByPk(decoded.id);
    } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        console.warn('Postgres unavailable during email verification; checking Firestore profile', error.message);
    }

    if (!user && isFirestoreFirebaseEnabled) {
        const firestoreProfile = await getFirestoreUserByUid(decoded.firebase_uid || decoded.id);
        if (firestoreProfile && firestoreProfile.email === decoded.email) {
            const firebaseUser = await admin.auth(authFirebaseApp).getUser(
                firestoreProfile.firebase_uid || decoded.firebase_uid || decoded.id,
            );
            const persisted = await persistFirebaseProfile({
                ...buildFirebaseUserProfile(firebaseUser, firestoreProfile),
                ...firestoreProfile,
                id: firebaseUser.uid,
                firebase_uid: firebaseUser.uid,
                is_verified: true,
                email_verified_at: new Date(),
            });
            return sendResponse(res, 200, { verified: true, user: persisted }, 'Email verified successfully');
        }
    }

    if (!user || user.email !== decoded.email) {
        throw new BadRequestException('Verification account not found');
    }

    user.is_verified = true;
    user.email_verified_at = new Date();
    await user.save();

    return sendResponse(res, 200, { verified: true }, 'Email verified successfully');
});

// Resend verification email
exports.resendVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;
    // Lookup user and resend email (omitted)
    return sendResponse(res, 200, {}, 'Verification email resent');
});

// 2FA setup - generate secret and QR
exports.setupTwoFactor = asyncHandler(async (req, res) => {
    // Return mock 2FA setup details
    return sendResponse(res, 200, { secret: 'MOCKSECRET', qrCode: 'data:image/png;base64,...' }, '2FA setup created');
});

// 2FA verify
exports.verifyTwoFactor = asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) throw new BadRequestException('2FA code required');
    // Verify code (omitted)
    return sendResponse(res, 200, {}, '2FA verified');
});

// 2FA disable
exports.disableTwoFactor = asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) throw new BadRequestException('2FA code required');
    // Disable logic (omitted)
    return sendResponse(res, 200, {}, '2FA disabled');
});

/**
 * Google OAuth Sign-In / Sign-Up
 * Authenticates user via Google and returns JWT tokens
 * Automatically creates account if user doesn't exist
 * 
 * @route POST /api/v1/auth/google-signin
 * @access Public
 * @body {string} idToken - Firebase Google ID token
 * @body {string} email - User email from Google
 * @body {string} displayName - User display name from Google
 * @body {string} photoURL - User photo URL from Google
 * @body {string} role - User role (rider/driver/admin) - defaults to 'rider'
 */
exports.googleSignIn = asyncHandler(async (req, res) => {
    const { email, displayName, photoURL, role } = req.body;
    const googleToken = req.googleToken; // From middleware
    const allowedRoles = new Set(['rider', 'driver']);
    const requestedRole = allowedRoles.has(role) ? role : 'rider';
    
    // Validate required fields
    const tokenEmail = googleToken.email;
    const resolvedEmail = tokenEmail || email;
    if (!resolvedEmail) {
        throw new BadRequestException('Email is required');
    }

    if (email && tokenEmail && email.trim().toLowerCase() !== tokenEmail.trim().toLowerCase()) {
        throw new BadRequestException('Google token email does not match request email');
    }

    const normalizedEmail = resolvedEmail.trim().toLowerCase();
    const resolvedName = displayName || googleToken.name || normalizedEmail.split('@')[0];
    const [firstName, ...lastNameParts] = resolvedName.trim().split(/\s+/).filter(Boolean);
    let storedPhotoURL = photoURL || googleToken.picture || null;

    if (storedPhotoURL) {
        try {
            const uploadedPhoto = await uploadRemoteImage(storedPhotoURL, 'motsamai/profile-images');
            storedPhotoURL = uploadedPhoto?.secure_url || storedPhotoURL;
        } catch (error) {
            console.warn(`Google profile image storage failed: ${error.message}`);
        }
    }

    let user;
    try {
        user = await User.findOne({ where: { email: normalizedEmail } });

        if (user) {
            user.last_login_at = new Date();

            if (displayName && !user.first_name && firstName) {
                user.first_name = firstName;
                user.last_name = lastNameParts.join(' ') || 'User';
            }

            if (storedPhotoURL && (!user.profile_picture || user.profile_picture.includes('googleusercontent.com'))) {
                user.profile_picture = storedPhotoURL;
            }

            user.firebase_uid = user.firebase_uid || googleToken.uid;
            user.is_verified = true;
            user.email_verified_at = user.email_verified_at || new Date();
            user.metadata = {
                ...(user.metadata || {}),
                authProvider: 'google',
                googlePhotoURL: storedPhotoURL || user.metadata?.googlePhotoURL,
            };

            await user.save();
        } else {
            user = await User.create({
                first_name: firstName || 'Google',
                last_name: lastNameParts.join(' ') || 'User',
                email: normalizedEmail,
                phone: buildUniqueOAuthPhone(googleToken.uid),
                password_hash: `GoogleAuth-${googleToken.uid}-${Date.now()}`,
                role: requestedRole,
                profile_picture: storedPhotoURL,
                firebase_uid: googleToken.uid,
                is_verified: true,
                email_verified_at: new Date(),
                last_login_at: new Date(),
                metadata: {
                    authProvider: 'google',
                    googlePhotoURL: storedPhotoURL,
                },
            });
        }
    } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        console.warn('Postgres unavailable during Google sign-in; persisting the profile to Firestore', error.message);
        user = await createFirestoreGoogleProfile(googleToken, requestedRole, resolvedName, storedPhotoURL);
        const tokens = generateAuthTokens(user);
        return sendResponse(
            res,
            200,
            { user: user.toJSON(), ...tokens },
            'Google sign-in successful using Firebase and Firestore',
        );
    }

    await markDriverOnline(user);

    const tokens = generateAuthTokens(user);

    await Promise.allSettled([
        syncUserToFirestore(user),
        syncFirebaseRoleClaims(user),
    ]);

    // Prepare user data (exclude sensitive fields)
    const userData = user.toJSON();
    delete userData.password_hash;
    delete userData.firebase_uid;

    return sendResponse(
        res, 
        200, 
        { 
            user: userData, 
            ...tokens
        }, 
        user.id ? 'Login successful' : 'Account created successfully'
    );
});
