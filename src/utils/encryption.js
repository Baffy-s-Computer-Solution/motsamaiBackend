const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function _getKey() {
	const secret = process.env.APP_ENCRYPTION_KEY || 'change-this-secret-key-32-bytes!';
	// ensure 32 bytes
	return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
	const iv = crypto.randomBytes(IV_LEN);
	const key = _getKey();
	const cipher = crypto.createCipheriv(ALGO, key, iv);
	const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload) {
	const buf = Buffer.from(payload, 'base64');
	const iv = buf.slice(0, IV_LEN);
	const tag = buf.slice(IV_LEN, IV_LEN + 16);
	const encrypted = buf.slice(IV_LEN + 16);
	const key = _getKey();
	const decipher = crypto.createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);
	const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
	return out.toString('utf8');
}

module.exports = { encrypt, decrypt };
