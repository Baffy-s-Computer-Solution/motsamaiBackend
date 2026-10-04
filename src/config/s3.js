const AWS = require('aws-sdk');
const logger = require('./logger');

let s3 = null;

function getS3() {
	if (s3) return s3;
	const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

	if (!accessKeyId || !secretAccessKey) {
		logger.warn('AWS S3 not fully configured; falling back to non-S3 storage');
		return null;
	}

	s3 = new AWS.S3({ region, accessKeyId, secretAccessKey });
	return s3;
}

module.exports = { getS3 };
