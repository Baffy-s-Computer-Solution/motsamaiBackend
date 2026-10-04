const crypto = require('crypto');
const path = require('path');
const { supabase } = require('../config/supabase');
const config = require('../config');

const sanitizePathPart = (value = '') => String(value)
  .trim()
  .replace(/\\/g, '/')
  .replace(/[^a-zA-Z0-9._/-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^\/+|\/+$/g, '');

const getExtension = (fileName = '') => {
  const ext = path.extname(fileName);
  return ext ? ext.toLowerCase() : '';
};

const uploadBuffer = async (buffer, folder = 'motsamai/uploads', options = {}) => {
  if (!supabase) {
    throw new Error('Supabase storage is not configured');
  }

  const bucket = options.bucket || config.SUPABASE.storageBucket;
  const safeFolder = sanitizePathPart(folder || 'uploads');
  const extension = getExtension(options.fileName || options.originalname || '') || options.extension || '';
  const fileName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const filePath = `${safeFolder}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: options.contentType || 'application/octet-stream',
      cacheControl: options.cacheControl || '3600',
      upsert: Boolean(options.upsert),
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
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
    format: extension.replace('.', ''),
    width: null,
    height: null,
  };
};

const deleteObject = async (pathOrUrl, bucket = config.SUPABASE.storageBucket) => {
  if (!supabase || !pathOrUrl) return false;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const objectPath = String(pathOrUrl).includes(marker)
    ? String(pathOrUrl).split(marker)[1]
    : pathOrUrl;

  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }

  return true;
};

module.exports = {
  uploadBuffer,
  deleteObject,
};
