const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 60000;

const getBaseUrl = () => (
  process.env.AI_VERIFICATION_URL ||
  process.env.AI_ML_SERVICE_URL ||
  'http://localhost:8000/api/v1'
).replace(/\/$/, '');

const appendFile = (formData, fieldName, file) => {
  if (!file) return;

  const blob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
  formData.append(fieldName, blob, file.originalname || `${fieldName}.jpg`);
};

const postMultipart = async (path, files = {}, fields = {}) => {
  const formData = new FormData();

  Object.entries(files).forEach(([fieldName, file]) => appendFile(formData, fieldName, file));
  Object.entries(fields).forEach(([fieldName, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(fieldName, String(value));
    }
  });

  const response = await axios.post(`${getBaseUrl()}${path}`, formData, {
    timeout: Number(process.env.AI_VERIFICATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    headers: formData.getHeaders ? formData.getHeaders() : undefined,
  });

  return response.data?.data || response.data;
};

const verifyDriver = ({ selfie, idDocument, licenseDocument, vehicleDocument, correlationId }) => postMultipart(
  '/verification/verify-driver',
  {
    selfie,
    id_document: idDocument,
    license_document: licenseDocument,
    vehicle_document: vehicleDocument,
  },
  { correlation_id: correlationId },
);

const verifySelfie = ({ selfie, referenceSelfie, correlationId }) => postMultipart(
  '/verification/compare-faces',
  {
    source_image: referenceSelfie,
    target_image: selfie,
  },
  { correlation_id: correlationId },
);

const detectLiveness = ({ image, correlationId }) => postMultipart(
  '/verification/detect-liveness',
  { image },
  { correlation_id: correlationId },
);

const health = async () => {
  const response = await axios.get(`${getBaseUrl()}/verification/health`, {
    timeout: Number(process.env.AI_VERIFICATION_HEALTH_TIMEOUT_MS || 10000),
  });
  return response.data;
};

module.exports = {
  health,
  verifyDriver,
  verifySelfie,
  detectLiveness,
};
