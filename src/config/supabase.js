/**
 * Supabase Configuration
 * Handles connection to Supabase with proper error handling
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Get configuration from environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'motsamai';
const supabaseStoragePublic = process.env.SUPABASE_STORAGE_PUBLIC === 'true';

// Determine which key to use (priority: service_role > secret > publishable > anon)
const getSupabaseKey = () => {
  if (supabaseServiceRoleKey) return supabaseServiceRoleKey;
  if (supabaseSecretKey) return supabaseSecretKey;
  if (supabasePublishableKey) return supabasePublishableKey;
  return supabaseAnonKey;
};

const supabaseKey = getSupabaseKey();

// Validate configuration
if (!supabaseUrl) {
  logger.warn('⚠️  SUPABASE_URL is not set in environment variables.');
}

if (!supabaseKey) {
  logger.warn('⚠️  No Supabase key found in environment variables. Supabase features will be disabled.');
}

// Create Supabase client if configuration is valid
let supabaseClient = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'X-Client-Info': 'motsamai-backend',
        },
      },
    });

    logger.info('✅ Supabase client initialized successfully.');
    logger.info(`📦 Storage bucket: ${supabaseStorageBucket}`);
    logger.info(`🌐 Storage public: ${supabaseStoragePublic}`);
  } catch (error) {
    logger.error('❌ Failed to initialize Supabase client:', {
      error: error.message,
      stack: error.stack,
    });
    supabaseClient = null;
  }
} else {
  logger.warn('⚠️  Supabase client not initialized. Missing URL or key.');
}

// Helper function to ensure Supabase client is available
const ensureSupabase = () => {
  if (!supabaseClient) {
    throw new Error('Supabase client is not initialized. Check your SUPABASE_URL and SUPABASE_*_KEY environment variables.');
  }
  return supabaseClient;
};

// Helper function to upload file to Supabase storage
const uploadToStorage = async (bucket, filePath, fileBuffer, options = {}) => {
  try {
    const client = ensureSupabase();
    const { data, error } = await client.storage
      .from(bucket || supabaseStorageBucket)
      .upload(filePath, fileBuffer, {
        contentType: options.contentType || 'application/octet-stream',
        cacheControl: options.cacheControl || '3600',
        upsert: options.upsert || false,
        ...options,
      });

    if (error) throw error;

    // Get public URL if bucket is public
    let publicUrl = null;
    if (supabaseStoragePublic) {
      const { data: urlData } = client.storage
        .from(bucket || supabaseStorageBucket)
        .getPublicUrl(filePath);
      publicUrl = urlData.publicUrl;
    }

    return { data, publicUrl, error: null };
  } catch (error) {
    logger.error('Upload to Supabase storage failed:', {
      error: error.message,
      bucket,
      filePath,
    });
    return { data: null, publicUrl: null, error };
  }
};

// Helper function to get public URL for a file
const getPublicUrl = (bucket, filePath) => {
  try {
    const client = ensureSupabase();
    const { data } = client.storage
      .from(bucket || supabaseStorageBucket)
      .getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    logger.error('Failed to get public URL:', {
      error: error.message,
      bucket,
      filePath,
    });
    return null;
  }
};

// Helper function to list files in a bucket
const listFiles = async (bucket, path = '', options = {}) => {
  try {
    const client = ensureSupabase();
    const { data, error } = await client.storage
      .from(bucket || supabaseStorageBucket)
      .list(path, {
        limit: options.limit || 100,
        offset: options.offset || 0,
        sortBy: options.sortBy || { column: 'name', order: 'asc' },
        ...options,
      });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logger.error('Failed to list files:', {
      error: error.message,
      bucket,
      path,
    });
    return { data: null, error };
  }
};

// Helper function to delete a file
const deleteFile = async (bucket, filePath) => {
  try {
    const client = ensureSupabase();
    const { data, error } = await client.storage
      .from(bucket || supabaseStorageBucket)
      .remove([filePath]);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logger.error('Failed to delete file:', {
      error: error.message,
      bucket,
      filePath,
    });
    return { data: null, error };
  }
};

// Helper function to download a file
const downloadFile = async (bucket, filePath) => {
  try {
    const client = ensureSupabase();
    const { data, error } = await client.storage
      .from(bucket || supabaseStorageBucket)
      .download(filePath);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logger.error('Failed to download file:', {
      error: error.message,
      bucket,
      filePath,
    });
    return { data: null, error };
  }
};

// Helper function to create a bucket
const createBucket = async (bucket, options = {}) => {
  try {
    const client = ensureSupabase();
    const { data, error } = await client.storage.createBucket(bucket, {
      public: supabaseStoragePublic,
      fileSizeLimit: options.fileSizeLimit || 52428800, // 50MB
      allowedMimeTypes: options.allowedMimeTypes || ['*/*'],
      ...options,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logger.error('Failed to create bucket:', {
      error: error.message,
      bucket,
    });
    return { data: null, error };
  }
};

// Get bucket info
const getBucketInfo = async (bucket) => {
  try {
    const client = ensureSupabase();
    const { data, error } = await client.storage.getBucket(bucket || supabaseStorageBucket);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logger.error('Failed to get bucket info:', {
      error: error.message,
      bucket,
    });
    return { data: null, error };
  }
};

module.exports = {
  supabase: supabaseClient,
  ensureSupabase,
  uploadToStorage,
  getPublicUrl,
  listFiles,
  deleteFile,
  downloadFile,
  createBucket,
  getBucketInfo,
  // Expose configuration
  config: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    publishableKey: supabasePublishableKey,
    secretKey: supabaseSecretKey,
    serviceRoleKey: supabaseServiceRoleKey,
    storageBucket: supabaseStorageBucket,
    storagePublic: supabaseStoragePublic,
    isInitialized: !!supabaseClient,
  },
};