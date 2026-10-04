# Backend Google OAuth Setup Guide

## Quick Start

### 1. Firebase Admin SDK Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Copy all values to your `.env` file

### 2. Environment Configuration

Copy the following to your `.env`:

```env
# Firebase Admin SDK (required for Google OAuth)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY=<NEW_SERVICE_ACCOUNT_PRIVATE_KEY>
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...

# JWT Configuration
JWT_SECRET=replace-me
JWT_EXPIRATION=24h
REFRESH_TOKEN_EXPIRY=7d

# OAuth Settings
DEFAULT_PHONE_FOR_OAUTH=+1234567890
OAUTH_AUTO_CREATE=true
```

### 3. Important Notes

⚠️ **Private Key Format:** The private key must have `\n` for newlines:
```
FIREBASE_PRIVATE_KEY=<NEW_SERVICE_ACCOUNT_PRIVATE_KEY>
```

✅ **Database Migration:** Ensure your User model has these fields:
- `google_id` (string, optional) - Store Google UID
- `email_verified` (boolean) - Mark Google emails as verified
- `profile_picture_url` (string, optional) - User avatar
- `last_login` (timestamp, optional) - Track last login

## API Endpoints

### Google Sign-In Endpoint
- **Route:** `POST /api/v1/auth/google-signin`
- **Rate Limit:** 10 requests/minute
- **No Authentication Required**

**Request:**
```json
{
  "idToken": "Firebase ID token from frontend",
  "email": "user@example.com",
  "displayName": "John Doe",
  "photoURL": "https://example.com/photo.jpg",
  "role": "rider"
}
```

**Success Response (201/200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "rider",
      "email_verified": true,
      "profile_picture_url": "https://..."
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "message": "Login successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "data": null,
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

## Security Implementation

### Token Verification (verifyGoogleToken)
```javascript
const { verifyGoogleToken } = require('./middleware/googleAuth');

// Manually verify a token
const decoded = await verifyGoogleToken(idToken);
console.log(decoded.email, decoded.name);
```

### Middleware Usage
```javascript
const { verifyGoogleTokenMiddleware } = require('./middleware/googleAuth');

router.post('/custom-endpoint', 
  verifyGoogleTokenMiddleware,
  (req, res) => {
    const { email, name } = req.googleToken;
    // Process request
  }
);
```

## Middleware Details

### verifyGoogleTokenMiddleware
- Validates Firebase ID token
- Checks token signature
- Verifies token expiration
- Adds `req.googleToken` to request

**Errors:**
- `400 Bad Request` - Missing token
- `401 Unauthorized` - Invalid/expired token

## Database Schema

Ensure User model includes:

```javascript
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    first_name: DataTypes.STRING,
    last_name: DataTypes.STRING,
    phone: DataTypes.STRING,
    password_hash: DataTypes.STRING, // May be null for OAuth users
    role: {
      type: DataTypes.ENUM('rider', 'driver', 'admin'),
      defaultValue: 'rider'
    },
    profile_picture_url: DataTypes.STRING, // NEW: For Google profile pics
    google_id: DataTypes.STRING, // NEW: Store Google UID
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    last_login: DataTypes.DATE, // NEW: Track logins
    // ... other fields
  });
  return User;
};
```

## Testing

### Using cURL
```bash
curl -X POST http://localhost:4000/api/v1/auth/google-signin \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "eyJhbGciOiJSUzI1NiIs...",
    "email": "test@gmail.com",
    "displayName": "Test User",
    "photoURL": "https://example.com/photo.jpg",
    "role": "rider"
  }'
```

### Using Postman
1. Create POST request to `http://localhost:4000/api/v1/auth/google-signin`
2. Set header: `Content-Type: application/json`
3. Set body to JSON with required fields
4. Send request

### Integration Test
```javascript
const request = require('supertest');
const app = require('../app');

describe('Google OAuth', () => {
  it('should sign in with valid Google token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google-signin')
      .send({
        idToken: 'valid_firebase_token',
        email: 'user@gmail.com',
        displayName: 'John Doe',
        role: 'rider'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('user@gmail.com');
  });
});
```

## Troubleshooting

### Firebase Initialization Error
```
Error: No service account found
```
**Solution:** Check `FIREBASE_PRIVATE_KEY` format and ensure all credentials are set.

### Token Verification Failed
```
Error: auth/invalid-id-token
```
**Solution:** Verify the token is from your Firebase project and not expired.

### User Creation Failed
```
Error: User with this email already exists
```
**Solution:** Handle case where Google email matches existing user.

### Rate Limit Exceeded
```
Error: Too many Google sign-in attempts
```
**Solution:** Implement exponential backoff on frontend, wait 60 seconds.

## Environment Template

Create a `.env` file with:

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY=<NEW_SERVICE_ACCOUNT_PRIVATE_KEY>
FIREBASE_CLIENT_EMAIL=your-email@iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_CLIENT_X509_CERT_URL=your-cert-url

# Authentication
JWT_SECRET=replace-me
JWT_EXPIRATION=24h
REFRESH_TOKEN_EXPIRY=7d

# OAuth
DEFAULT_PHONE_FOR_OAUTH=+1234567890
OAUTH_AUTO_CREATE=true
```

## Production Checklist

- [ ] Firebase credentials added to production `.env`
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] HTTPS enabled
- [ ] CORS configured properly
- [ ] Rate limiting tested
- [ ] Database backups enabled
- [ ] Error logging configured
- [ ] Monitoring alerts set up

## Additional Resources

- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
