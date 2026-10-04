/**
 * Driver Document Controller - COMPLETE PRODUCTION VERSION
 * Version: 3.0.0
 * Description: Complete document management for drivers
 * 
 * @module controllers/driverDocumentController
 * @author Motsamai Development Team
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { APIError: AppError } = require('../utils/apiError');
const { Driver, Document, User } = require('../models');
const { uploadToStorage, deleteFromStorage } = require('../services/storageService');
const { redisClient } = require('../config/redis');

// =============================================================================
// GET DOCUMENTS
// =============================================================================

/**
 * Get all documents for a driver
 * @route GET /api/v1/drivers/documents
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getDocuments = async (req, res, next) => {
    try {
        const driverId = req.user.id;

        // Get driver
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Get all documents
        const documents = await Document.findAll({
            where: { driverId: driver.id },
            order: [['createdAt', 'DESC']]
        });

        // Get document statistics
        const stats = {
            total: documents.length,
            verified: documents.filter(d => d.status === 'verified').length,
            pending: documents.filter(d => d.status === 'pending').length,
            rejected: documents.filter(d => d.status === 'rejected').length,
            expired: documents.filter(d => {
                if (!d.expiryDate) return false;
                return new Date(d.expiryDate) < new Date();
            }).length
        };

        res.status(200).json({
            success: true,
            data: {
                documents,
                stats
            }
        });
    } catch (error) {
        logger.error('Get documents error:', error);
        next(error);
    }
};

/**
 * Get document by ID
 * @route GET /api/v1/drivers/documents/:id
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getDocumentById = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { id } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const document = await Document.findOne({
            where: { id, driverId: driver.id }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        res.status(200).json({
            success: true,
            data: document
        });
    } catch (error) {
        logger.error('Get document by ID error:', error);
        next(error);
    }
};

// =============================================================================
// UPLOAD DOCUMENTS
// =============================================================================

/**
 * Upload driver documents
 * @route POST /api/v1/drivers/documents
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.uploadDocuments = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { documentType, notes, expiryDate } = req.body;
        const files = req.files || {};

        // Get driver
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const uploadedDocuments = [];
        const documentTypes = ['license', 'id', 'profilePhoto', 'backgroundCheck'];

        // Process each file type
        for (const type of documentTypes) {
            if (files[type] && files[type].length > 0) {
                const file = files[type][0];
                
                // Upload to Supabase storage
                const uploadResult = await uploadToStorage(file.path, {
                    folder: `drivers/${driver.id}/documents`,
                    public_id: `${type}_${Date.now()}`
                });

                // Create document record
                const document = await Document.create({
                    id: uuidv4(),
                    driverId: driver.id,
                    type: documentType || type,
                    name: file.originalname,
                    url: uploadResult.secure_url,
                    publicId: uploadResult.public_id,
                    size: file.size,
                    mimeType: file.mimetype,
                    status: 'pending',
                    notes: notes || null,
                    expiryDate: expiryDate || null,
                    createdAt: new Date()
                });

                uploadedDocuments.push(document);
            }
        }

        if (uploadedDocuments.length === 0) {
            throw new AppError('No documents uploaded', 400, 'NO_DOCUMENTS');
        }

        // Update driver verification status
        await driver.update({
            verificationStatus: 'pending',
            documentsUploadedAt: new Date()
        });

        // Invalidate cache
        await redisClient.del(`driver:documents:${driver.id}`);

        res.status(201).json({
            success: true,
            message: `${uploadedDocuments.length} document(s) uploaded successfully`,
            data: {
                documents: uploadedDocuments,
                count: uploadedDocuments.length
            }
        });
    } catch (error) {
        logger.error('Upload documents error:', error);
        next(error);
    }
};

/**
 * Upload a single document
 * @route POST /api/v1/drivers/documents/upload
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.uploadSingleDocument = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { type, notes, expiryDate } = req.body;
        const file = req.file;

        if (!file) {
            throw new AppError('No file uploaded', 400, 'NO_FILE');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Upload to Supabase storage
        const uploadResult = await uploadToStorage(file.path, {
            folder: `drivers/${driver.id}/documents`,
            public_id: `${type}_${Date.now()}`
        });

        // Create document record
        const document = await Document.create({
            id: uuidv4(),
            driverId: driver.id,
            type: type || 'general',
            name: file.originalname,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            size: file.size,
            mimeType: file.mimetype,
            status: 'pending',
            notes: notes || null,
            expiryDate: expiryDate || null,
            createdAt: new Date()
        });

        // Invalidate cache
        await redisClient.del(`driver:documents:${driver.id}`);

        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            data: document
        });
    } catch (error) {
        logger.error('Upload single document error:', error);
        next(error);
    }
};

// =============================================================================
// DOWNLOAD DOCUMENTS
// =============================================================================

/**
 * Download a document
 * @route GET /api/v1/drivers/documents/:id/download
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.downloadDocument = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { id } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const document = await Document.findOne({
            where: { id, driverId: driver.id }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        // Log download
        await document.update({
            downloadedAt: new Date(),
            downloadCount: (document.downloadCount || 0) + 1
        });

        // Redirect to document URL or stream file
        if (document.url) {
            return res.redirect(document.url);
        }

        // If file is stored locally
        if (document.path) {
            return res.download(document.path, document.name);
        }

        throw new AppError('Document file not found', 404, 'FILE_NOT_FOUND');
    } catch (error) {
        logger.error('Download document error:', error);
        next(error);
    }
};

// =============================================================================
// DELETE DOCUMENTS
// =============================================================================

/**
 * Delete a document
 * @route DELETE /api/v1/drivers/documents/:id
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.deleteDocument = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { id } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const document = await Document.findOne({
            where: { id, driverId: driver.id }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        // Delete from cloud storage
        if (document.publicId) {
            await deleteFromStorage(document.publicId);
        }

        // Delete record
        await document.destroy();

        // Invalidate cache
        await redisClient.del(`driver:documents:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        logger.error('Delete document error:', error);
        next(error);
    }
};

/**
 * Delete multiple documents
 * @route DELETE /api/v1/drivers/documents/bulk
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.bulkDeleteDocuments = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { documentIds } = req.body;

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            throw new AppError('No document IDs provided', 400, 'NO_DOCUMENTS');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const deleted = [];
        for (const id of documentIds) {
            const document = await Document.findOne({
                where: { id, driverId: driver.id }
            });

            if (document) {
                if (document.publicId) {
                    await deleteFromStorage(document.publicId);
                }
                await document.destroy();
                deleted.push(id);
            }
        }

        // Invalidate cache
        await redisClient.del(`driver:documents:${driver.id}`);

        res.status(200).json({
            success: true,
            message: `${deleted.length} document(s) deleted successfully`,
            data: { deleted }
        });
    } catch (error) {
        logger.error('Bulk delete documents error:', error);
        next(error);
    }
};

// =============================================================================
// DOCUMENT MANAGEMENT
// =============================================================================

/**
 * Rename a document
 * @route PUT /api/v1/drivers/documents/:id/rename
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.renameDocument = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { id } = req.params;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            throw new AppError('Document name is required', 400, 'NAME_REQUIRED');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const document = await Document.findOne({
            where: { id, driverId: driver.id }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        await document.update({ name: name.trim() });

        // Invalidate cache
        await redisClient.del(`driver:documents:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Document renamed successfully',
            data: document
        });
    } catch (error) {
        logger.error('Rename document error:', error);
        next(error);
    }
};

/**
 * Share a document
 * @route POST /api/v1/drivers/documents/:id/share
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.shareDocument = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { id } = req.params;
        const { recipients, message, expiry = '24h' } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            throw new AppError('At least one recipient required', 400, 'RECIPIENTS_REQUIRED');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const document = await Document.findOne({
            where: { id, driverId: driver.id }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        // Generate share token
        const shareToken = crypto.randomBytes(32).toString('hex');
        const expiryMap = { '1h': 3600, '24h': 86400, '7d': 604800 };
        const ttl = expiryMap[expiry] || 86400;

        // Store share info in Redis
        await redisClient.setex(
            `share:document:${shareToken}`,
            ttl,
            JSON.stringify({
                documentId: document.id,
                driverId: driver.id,
                recipients,
                message,
                createdAt: new Date().toISOString()
            })
        );

        // Create share URL
        const shareUrl = `${process.env.FRONTEND_URL}/share/${shareToken}`;

        // Log share
        await document.update({
            sharedAt: new Date(),
            shareCount: (document.shareCount || 0) + 1
        });

        res.status(200).json({
            success: true,
            message: 'Document shared successfully',
            data: {
                shareUrl,
                shareToken,
                expiresIn: expiry,
                recipients: recipients.length
            }
        });
    } catch (error) {
        logger.error('Share document error:', error);
        next(error);
    }
};

// =============================================================================
// DOCUMENT VERIFICATION (ADMIN)
// =============================================================================

/**
 * Verify a document (Admin only)
 * @route PUT /api/v1/drivers/documents/:id/verify
 * @access Private (Admin only)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.verifyDocument = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!['verified', 'rejected', 'pending'].includes(status)) {
            throw new AppError('Invalid status', 400, 'INVALID_STATUS');
        }

        const document = await Document.findByPk(id);
        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        await document.update({
            status,
            verifiedAt: new Date(),
            verifiedBy: req.user.id,
            verificationNotes: notes || null
        });

        // If all documents are verified, update driver status
        if (status === 'verified') {
            const allDocuments = await Document.findAll({
                where: { driverId: document.driverId }
            });

            const allVerified = allDocuments.every(d => d.status === 'verified');
            if (allVerified) {
                await Driver.update(
                    { verificationStatus: 'verified' },
                    { where: { id: document.driverId } }
                );
            }
        }

        // Invalidate cache
        await redisClient.del(`driver:documents:${document.driverId}`);

        res.status(200).json({
            success: true,
            message: `Document ${status}`,
            data: document
        });
    } catch (error) {
        logger.error('Verify document error:', error);
        next(error);
    }
};

/**
 * Get document verification status
 * @route GET /api/v1/drivers/documents/verification-status
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getVerificationStatus = async (req, res, next) => {
    try {
        const driverId = req.user.id;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const documents = await Document.findAll({
            where: { driverId: driver.id }
        });

        const status = {
            overall: driver.verificationStatus || 'pending',
            documents: documents.map(d => ({
                id: d.id,
                type: d.type,
                name: d.name,
                status: d.status,
                uploadedAt: d.createdAt,
                verifiedAt: d.verifiedAt
            })),
            summary: {
                total: documents.length,
                verified: documents.filter(d => d.status === 'verified').length,
                pending: documents.filter(d => d.status === 'pending').length,
                rejected: documents.filter(d => d.status === 'rejected').length
            }
        };

        res.status(200).json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error('Get verification status error:', error);
        next(error);
    }
};
