const { APIError } = require('../utils/apiError');
const config = require('../config');
const { supabase, downloadFile: downloadFromSupabase } = require('../config/supabase');

const uploadRemoteImage = async (imageUrl, folder = 'motsamai/profile-images') => {
  if (!supabase || !imageUrl) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return null;
  }

  const allowedHosts = ['googleusercontent.com', 'googleapis.com', 'gstatic.com'];
  if (parsedUrl.protocol !== 'https:' || !allowedHosts.some((host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`))) {
    return null;
  }

  const response = await fetch(parsedUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new APIError(`Profile image download failed: ${response.status}`, 502);

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new APIError('Google profile URL is not an image', 400);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5 * 1024 * 1024) throw new APIError('Profile image is too large', 413);

  const extension = contentType.split('/')[1].split(';')[0].replace(/[^a-z0-9]/gi, '') || 'jpeg';
  const file = { buffer, mimetype: contentType, originalname: `google-profile.${extension}` };
  return uploadToSupabase(file, folder);
};

const sanitizePathPart = (value = '') => String(value)
  .trim()
  .replace(/\\/g, '/')
  .replace(/[^a-zA-Z0-9._/-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^\/+|\/+$/g, '');

const getExtension = (file) => {
  const originalName = file.originalname || '';
  const match = originalName.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : '';
};

const uploadToSupabase = async (file, folder) => {
  if (!supabase) return null;

  const bucket = config.SUPABASE.storageBucket;
  const safeFolder = sanitizePathPart(folder || 'uploads');
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${getExtension(file)}`;
  const filePath = `${safeFolder}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    throw new APIError(`Supabase upload failed: ${error.message}`, 502);
  }

  let publicUrl = null;
  if (config.SUPABASE.storagePublic) {
    publicUrl = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
  } else {
    const signed = await supabase.storage.from(bucket).createSignedUrl(data.path, 60 * 60);
    publicUrl = signed.data?.signedUrl || null;
  }

  return {
    secure_url: publicUrl,
    url: publicUrl,
    public_id: data.path,
    path: data.path,
    bucket,
    provider: 'supabase',
    format: getExtension(file).replace('.', ''),
    width: null,
    height: null,
  };
};

const uploadFile = async (file, folder = 'motsamai/uploads') => {
  if (!file || !file.buffer) {
    throw new APIError('Invalid file upload.', 400);
  }

  const supabaseResult = await uploadToSupabase(file, folder);
  if (supabaseResult) return supabaseResult;

  throw new APIError('Supabase storage is not configured.', 503);
};

const deleteFile = async (pathOrUrl) => {
  if (!pathOrUrl) return false;
  if (!supabase) return false;

  const bucket = config.SUPABASE.storageBucket;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const path = String(pathOrUrl).includes(marker)
    ? String(pathOrUrl).split(marker)[1]
    : pathOrUrl;

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw new APIError(`Supabase delete failed: ${error.message}`, 502);
  }

  return true;
};

const uploadToStorage = async (fileOrPath, options = {}) => {
  const file = typeof fileOrPath === 'string'
    ? { buffer: require('fs').readFileSync(fileOrPath), originalname: fileOrPath, mimetype: options.mimetype || 'application/octet-stream' }
    : fileOrPath;

  return uploadFile(file, options.folder || 'motsamai/uploads');
};

const deleteFromStorage = deleteFile;

const downloadAsFile = async (pathOrUrl, fallbackName = 'download.jpg', fallbackType = 'image/jpeg') => {
  if (!pathOrUrl) return null;

  const bucket = config.SUPABASE.storageBucket;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const objectPath = String(pathOrUrl).includes(marker)
    ? String(pathOrUrl).split(marker)[1]
    : pathOrUrl;
  const { data, error } = await downloadFromSupabase(bucket, objectPath);

  if (error || !data) {
    throw new APIError(`Supabase download failed: ${error?.message || 'file not found'}`, 502);
  }

  const arrayBuffer = await data.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    originalname: fallbackName,
    mimetype: data.type || fallbackType,
    size: data.size || arrayBuffer.byteLength,
  };
};

module.exports = {
  uploadFile,
  uploadRemoteImage,
  deleteFile,
  downloadAsFile,
  uploadToStorage,
  deleteFromStorage,
};
