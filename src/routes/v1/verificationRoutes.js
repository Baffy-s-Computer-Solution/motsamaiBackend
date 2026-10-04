const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../../models');
const config = require('../../config');
const asyncHandler = require('../../utils/asyncHandler');
const { sendResponse } = require('../../utils/response.util');
const { upload, handleUploadError } = require('../../utils/fileUpload');
const { uploadFile, downloadAsFile } = require('../../services/storageService');
const { auth } = require('../../middleware/auth');
const aiVerificationService = require('../../services/aiVerificationService');
const { AuthenticationError, BadRequestException } = require('../../exceptions/api.exception');

const router = express.Router();

const driverVerificationUpload = upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'id_document', maxCount: 1 },
  { name: 'national_id', maxCount: 1 },
  { name: 'license_document', maxCount: 1 },
  { name: 'driver_license', maxCount: 1 },
  { name: 'vehicle_document', maxCount: 1 },
  { name: 'vehicle_registration', maxCount: 1 },
]);

const selfieUpload = upload.single('selfie');
const documentUpload = upload.single('file');

const firstFile = (files, ...names) => {
  for (const name of names) {
    if (files?.[name]?.[0]) return files[name][0];
  }
  return null;
};

const normalizeAiStatus = (result = {}) => {
  if (result.is_verified === true || result.isVerified === true) return 'approved';
  if (Array.isArray(result.flags) && result.flags.length > 0) return 'in_review';
  return 'in_review';
};

const uploadVerificationFile = (userId, verificationId, label, file) => {
  if (!file) return Promise.resolve(null);
  return uploadFile(file, `motsamai/driver-verification/${userId}/${verificationId}/${label}`);
};

router.get('/health', asyncHandler(async (req, res) => {
  const aiHealth = await aiVerificationService.health();
  return sendResponse(res, 200, aiHealth, 'AI verification service is reachable');
}));

router.post('/driver/start', auth, driverVerificationUpload, handleUploadError, asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new AuthenticationError('Only drivers can submit driver verification');
  }

  const selfie = firstFile(req.files, 'selfie');
  const idDocument = firstFile(req.files, 'id_document', 'national_id');
  const licenseDocument = firstFile(req.files, 'license_document', 'driver_license');
  const vehicleDocument = firstFile(req.files, 'vehicle_document', 'vehicle_registration');

  if (!selfie || !idDocument || !licenseDocument) {
    throw new BadRequestException('Selfie, national ID, and driver license are required');
  }

  const correlationId = req.correlationId || uuidv4();
  const result = await aiVerificationService.verifyDriver({
    selfie,
    idDocument,
    licenseDocument,
    vehicleDocument,
    correlationId,
  });
  const status = normalizeAiStatus(result);
  const now = new Date();
  const [selfieUploadResult, idUploadResult, licenseUploadResult, vehicleUploadResult] = await Promise.all([
    uploadVerificationFile(req.user.id, correlationId, 'selfie', selfie),
    uploadVerificationFile(req.user.id, correlationId, 'national-id', idDocument),
    uploadVerificationFile(req.user.id, correlationId, 'driver-license', licenseDocument),
    uploadVerificationFile(req.user.id, correlationId, 'vehicle-registration', vehicleDocument),
  ]);
  const storedFiles = {
    selfie: selfieUploadResult,
    nationalId: idUploadResult,
    driverLicense: licenseUploadResult,
    vehicleRegistration: vehicleUploadResult,
  };

  await req.user.update({
    verification_status: status,
    verification_score: result.verification_score ?? result.verificationScore ?? null,
    verification_submitted_at: now,
    verification_reviewed_at: status === 'approved' ? now : null,
    reference_selfie_key: selfieUploadResult?.path || `driver-verification:${req.user.id}:${correlationId}`,
    biometric_enabled: status === 'approved',
    biometric_last_verified_at: status === 'approved' ? now : null,
    next_reverification_at: status === 'approved' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
    verification_documents: {
      nationalId: result.documents?.national_id || null,
      driverLicense: result.documents?.driver_license || null,
      vehicleRegistration: result.documents?.vehicle_registration || null,
      files: storedFiles,
    },
    vehicle_info: req.body.vehicle ? JSON.parse(req.body.vehicle) : req.user.vehicle_info,
    metadata: {
      ...(req.user.metadata || {}),
      latestVerification: result,
      latestVerificationFiles: storedFiles,
      latestVerificationCorrelationId: correlationId,
    },
  });

  return sendResponse(res, 200, {
    verificationId: correlationId,
    status: status === 'approved' ? 'VERIFIED' : 'PENDING_REVIEW',
    progress: status === 'approved' ? 100 : 80,
    currentStep: status === 'approved' ? 'complete' : 'review',
    ai: result,
    files: storedFiles,
  }, status === 'approved' ? 'Driver verification approved' : 'Driver verification submitted for review');
}));

router.get('/driver/status/:verificationId?', auth, asyncHandler(async (req, res) => {
  const latest = req.user.metadata?.latestVerification || null;
  const statusMap = {
    approved: 'VERIFIED',
    rejected: 'REJECTED',
    in_review: 'PENDING_REVIEW',
    pending: 'IN_PROGRESS',
    expired: 'EXPIRED',
    not_started: 'NOT_STARTED',
  };

  return sendResponse(res, 200, {
    verificationId: req.params.verificationId || req.user.metadata?.latestVerificationCorrelationId || null,
    status: statusMap[req.user.verification_status] || 'NOT_STARTED',
    progress: req.user.verification_status === 'approved' ? 100 : latest ? 80 : 0,
    currentStep: req.user.verification_status === 'approved' ? 'complete' : latest ? 'review' : 'documents',
    verificationScore: req.user.verification_score,
    reviewedAt: req.user.verification_reviewed_at,
    submittedAt: req.user.verification_submitted_at,
    nextReverificationAt: req.user.next_reverification_at,
    ai: latest,
  }, 'Verification status loaded');
}));

router.post('/documents', auth, documentUpload, handleUploadError, asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new AuthenticationError('Only drivers can upload verification documents');
  }

  if (!req.file) {
    throw new BadRequestException('Document file is required');
  }

  const { documentType, verificationId } = req.body;
  const currentDocuments = req.user.verification_documents || {};
  const documentRecord = {
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storage: await uploadFile(req.file, `motsamai/driver-verification/${req.user.id}/${verificationId || 'draft'}/${documentType || 'document'}`),
    uploadedAt: new Date().toISOString(),
    verificationId,
  };

  await req.user.update({
    verification_status: req.user.verification_status === 'not_started' ? 'pending' : req.user.verification_status,
    verification_documents: {
      ...currentDocuments,
      [documentType]: documentRecord,
    },
  });

  return sendResponse(res, 200, documentRecord, 'Verification document uploaded');
}));

router.post('/vehicle', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new AuthenticationError('Only drivers can submit vehicle verification details');
  }

  const { verificationId, ...vehicle } = req.body;
  await req.user.update({
    vehicle_info: vehicle,
    metadata: {
      ...(req.user.metadata || {}),
      latestVehicleVerificationId: verificationId,
    },
  });

  return sendResponse(res, 200, { verificationId, ...vehicle }, 'Vehicle verification details saved');
}));

router.post('/biometric', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new AuthenticationError('Only drivers can submit biometric verification');
  }

  await req.user.update({
    biometric_enabled: true,
    biometric_last_verified_at: new Date(),
    metadata: {
      ...(req.user.metadata || {}),
      latestBiometricEnrollment: req.body,
    },
  });

  return sendResponse(res, 200, {
    isVerified: true,
    verificationId: req.body.verificationId,
  }, 'Biometric verification saved');
}));

router.post('/biometric/selfie', auth, selfieUpload, handleUploadError, asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new AuthenticationError('Only drivers can submit biometric verification');
  }

  if (!req.file) {
    throw new BadRequestException('Selfie image is required');
  }

  const correlationId = req.correlationId || uuidv4();
  const liveness = await aiVerificationService.detectLiveness({ image: req.file, correlationId });
  const isLive = Boolean(liveness.is_live ?? liveness.isLive);
  const confidenceScore = Number(liveness.confidence_score ?? liveness.confidenceScore ?? liveness.liveness_score ?? 0);
  const isVerified = isLive && confidenceScore >= Number(process.env.BIOMETRIC_LIVENESS_MIN_CONFIDENCE || 70);
  const selfieUploadResult = await uploadVerificationFile(req.user.id, correlationId, 'selfie-enrollment', req.file);

  await req.user.update({
    biometric_enabled: isVerified || req.user.biometric_enabled,
    biometric_last_verified_at: isVerified ? new Date() : req.user.biometric_last_verified_at,
    reference_selfie_key: isVerified ? selfieUploadResult.path : req.user.reference_selfie_key,
    metadata: {
      ...(req.user.metadata || {}),
      latestSelfieEnrollment: { liveness, correlationId, isVerified, file: selfieUploadResult },
    },
  });

  return sendResponse(res, 200, {
    verificationId: correlationId,
    isVerified,
    isLive,
    confidenceScore,
    liveness,
  }, isVerified ? 'Selfie liveness verified' : 'Selfie liveness verification failed');
}));

router.post('/cancel/:verificationId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new AuthenticationError('Only drivers can cancel driver verification');
  }

  await req.user.update({
    verification_status: 'not_started',
    verification_score: null,
    verification_submitted_at: null,
    verification_review_notes: null,
  });

  return sendResponse(res, 200, { verificationId: req.params.verificationId }, 'Verification cancelled');
}));

router.post('/biometric/verify-selfie', selfieUpload, handleUploadError, asyncHandler(async (req, res) => {
  const { loginToken } = req.body;
  if (!loginToken) {
    throw new BadRequestException('Login token is required');
  }

  const decoded = jwt.verify(loginToken, config.JWT.secret);
  if (decoded.purpose !== 'driver-biometric-login') {
    throw new AuthenticationError('Invalid biometric login token');
  }

  const user = await User.findByPk(decoded.id);
  if (!user || user.role !== 'driver' || !user.is_active) {
    throw new AuthenticationError('Driver account is not available');
  }

  if (!req.file) {
    throw new BadRequestException('Selfie image is required');
  }

  if (typeof user.isBiometricLocked === 'function' && user.isBiometricLocked()) {
    throw new AuthenticationError('Biometric verification is temporarily locked');
  }

  const correlationId = req.correlationId || uuidv4();
  const liveness = await aiVerificationService.detectLiveness({ image: req.file, correlationId: `${correlationId}-live` });

  let comparison = { is_match: true, confidence_score: 100, similarity_score: 100 };
  if (user.reference_selfie_key) {
    const referenceSelfie = await downloadAsFile(user.reference_selfie_key, 'reference-selfie.jpg', req.file.mimetype);
    comparison = await aiVerificationService.verifySelfie({
      selfie: req.file,
      referenceSelfie,
      correlationId: `${correlationId}-match`,
    });
  }

  const isLive = Boolean(liveness.is_live ?? liveness.isLive);
  const isMatch = Boolean(comparison.is_match ?? comparison.isMatch);
  const score = Number(comparison.confidence_score ?? comparison.confidenceScore ?? comparison.similarity_score ?? 0);
  const isVerified = isLive && isMatch && score >= Number(process.env.BIOMETRIC_MIN_CONFIDENCE || 85);

  await user.update({
    biometric_failed_attempts: isVerified ? 0 : (user.biometric_failed_attempts || 0) + 1,
    biometric_locked_until: !isVerified && (user.biometric_failed_attempts || 0) + 1 >= 5
      ? new Date(Date.now() + 15 * 60 * 1000)
      : user.biometric_locked_until,
    biometric_last_verified_at: isVerified ? new Date() : user.biometric_last_verified_at,
    metadata: {
      ...(user.metadata || {}),
      latestBiometricVerification: { liveness, comparison, correlationId, isVerified },
    },
  });

  return sendResponse(res, 200, {
    verificationId: correlationId,
    isVerified,
    isLive,
    confidenceScore: score,
    liveness,
    comparison,
  }, isVerified ? 'Biometric selfie verified' : 'Biometric selfie did not match');
}));

module.exports = router;
