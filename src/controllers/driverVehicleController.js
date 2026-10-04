/**
 * Driver Vehicle Controller - COMPLETE PRODUCTION VERSION
 * Version: 3.0.0
 * Description: Complete vehicle management for drivers
 * 
 * @module controllers/driverVehicleController
 * @author Motsamai Development Team
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { APIError: AppError } = require('../utils/apiError');
const { Driver, Vehicle, Document } = require('../models');
const { uploadToStorage, deleteFromStorage } = require('../services/storageService');
const { redisClient } = require('../config/redis');

// =============================================================================
// VEHICLE CRUD
// =============================================================================

/**
 * Get vehicle details
 * @route GET /api/v1/drivers/vehicle
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getVehicle = async (req, res, next) => {
    try {
        const driverId = req.user.id;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const vehicle = await Vehicle.findOne({
            where: { driverId: driver.id },
            include: [
                { model: Document, as: 'documents', attributes: ['id', 'name', 'url', 'status'] }
            ]
        });

        if (!vehicle) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No vehicle registered'
            });
        }

        res.status(200).json({
            success: true,
            data: vehicle
        });
    } catch (error) {
        logger.error('Get vehicle error:', error);
        next(error);
    }
};

/**
 * Create or update vehicle
 * @route PUT /api/v1/drivers/vehicle
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.updateVehicle = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const vehicleData = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Validate required fields
        const required = ['make', 'model', 'year', 'licensePlate', 'vehicleType'];
        for (const field of required) {
            if (!vehicleData[field]) {
                throw new AppError(`${field} is required`, 400, `${field.toUpperCase()}_REQUIRED`);
            }
        }

        // Find existing vehicle or create new
        let vehicle = await Vehicle.findOne({ where: { driverId: driver.id } });

        if (vehicle) {
            await vehicle.update(vehicleData);
        } else {
            vehicle = await Vehicle.create({
                id: uuidv4(),
                driverId: driver.id,
                ...vehicleData,
                createdAt: new Date()
            });
        }

        // Invalidate cache
        await redisClient.del(`driver:vehicle:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Vehicle updated successfully',
            data: vehicle
        });
    } catch (error) {
        logger.error('Update vehicle error:', error);
        next(error);
    }
};

/**
 * Partial update vehicle
 * @route PATCH /api/v1/drivers/vehicle
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.partialUpdateVehicle = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const updates = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const vehicle = await Vehicle.findOne({ where: { driverId: driver.id } });
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
        }

        await vehicle.update(updates);

        await redisClient.del(`driver:vehicle:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Vehicle updated successfully',
            data: vehicle
        });
    } catch (error) {
        logger.error('Partial update vehicle error:', error);
        next(error);
    }
};

// =============================================================================
// VEHICLE PHOTOS
// =============================================================================

/**
 * Upload vehicle photos
 * @route POST /api/v1/drivers/vehicle/photos
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.uploadVehiclePhotos = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { primary, angle } = req.body;
        const files = req.files || [];

        if (files.length === 0) {
            throw new AppError('No photos uploaded', 400, 'NO_PHOTOS');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        let vehicle = await Vehicle.findOne({ where: { driverId: driver.id } });
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
        }

        const uploaded = [];
        const photos = vehicle.photos || [];

        for (const [index, file] of files.entries()) {
            const uploadResult = await uploadToStorage(file.path, {
                folder: `drivers/${driver.id}/vehicle`,
                public_id: `vehicle_${Date.now()}_${index}`
            });

            const photo = {
                id: uuidv4(),
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                angle: angle || 'general',
                isPrimary: index === parseInt(primary || 0),
                uploadedAt: new Date()
            };

            photos.push(photo);
            uploaded.push(photo);
        }

        await vehicle.update({ photos });

        await redisClient.del(`driver:vehicle:${driver.id}`);

        res.status(201).json({
            success: true,
            message: `${uploaded.length} photo(s) uploaded successfully`,
            data: uploaded
        });
    } catch (error) {
        logger.error('Upload vehicle photos error:', error);
        next(error);
    }
};

/**
 * Delete vehicle photo
 * @route DELETE /api/v1/drivers/vehicle/photos/:photoId
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.deleteVehiclePhoto = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { photoId } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const vehicle = await Vehicle.findOne({ where: { driverId: driver.id } });
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
        }

        const photos = vehicle.photos || [];
        const photoIndex = photos.findIndex(p => p.id === photoId);

        if (photoIndex === -1) {
            throw new AppError('Photo not found', 404, 'PHOTO_NOT_FOUND');
        }

        // Delete from Supabase storage
        if (photos[photoIndex].publicId) {
            await deleteFromStorage(photos[photoIndex].publicId);
        }

        photos.splice(photoIndex, 1);

        // If deleted photo was primary, set new primary
        if (photos.length > 0 && !photos.some(p => p.isPrimary)) {
            photos[0].isPrimary = true;
        }

        await vehicle.update({ photos });

        await redisClient.del(`driver:vehicle:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Photo deleted successfully'
        });
    } catch (error) {
        logger.error('Delete vehicle photo error:', error);
        next(error);
    }
};

// =============================================================================
// VEHICLE DOCUMENTS
// =============================================================================

/**
 * Upload vehicle documents
 * @route POST /api/v1/drivers/vehicle/documents
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.uploadVehicleDocuments = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { notes, expiryDate } = req.body;
        const files = req.files || {};

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        let vehicle = await Vehicle.findOne({ where: { driverId: driver.id } });
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
        }

        const uploaded = [];
        const documentTypes = ['registration', 'insurance', 'inspection', 'logbook'];

        for (const type of documentTypes) {
            if (files[type] && files[type].length > 0) {
                const file = files[type][0];
                
                const uploadResult = await uploadToStorage(file.path, {
                    folder: `drivers/${driver.id}/vehicle/documents`,
                    public_id: `${type}_${Date.now()}`
                });

                const document = await Document.create({
                    id: uuidv4(),
                    driverId: driver.id,
                    vehicleId: vehicle.id,
                    type: type,
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

                uploaded.push(document);
            }
        }

        if (uploaded.length === 0) {
            throw new AppError('No documents uploaded', 400, 'NO_DOCUMENTS');
        }

        await redisClient.del(`driver:vehicle:${driver.id}`);

        res.status(201).json({
            success: true,
            message: `${uploaded.length} document(s) uploaded successfully`,
            data: uploaded
        });
    } catch (error) {
        logger.error('Upload vehicle documents error:', error);
        next(error);
    }
};

/**
 * Get vehicle documents
 * @route GET /api/v1/drivers/vehicle/documents
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getVehicleDocuments = async (req, res, next) => {
    try {
        const driverId = req.user.id;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const vehicle = await Vehicle.findOne({ where: { driverId: driver.id } });
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
        }

        const documents = await Document.findAll({
            where: { 
                driverId: driver.id,
                vehicleId: vehicle.id,
                type: { [Op.in]: ['registration', 'insurance', 'inspection', 'logbook'] }
            },
            order: [['createdAt', 'DESC']]
        });

        const summary = {
            total: documents.length,
            verified: documents.filter(d => d.status === 'verified').length,
            pending: documents.filter(d => d.status === 'pending').length,
            rejected: documents.filter(d => d.status === 'rejected').length
        };

        res.status(200).json({
            success: true,
            data: {
                documents,
                summary
            }
        });
    } catch (error) {
        logger.error('Get vehicle documents error:', error);
        next(error);
    }
};

/**
 * Delete vehicle document
 * @route DELETE /api/v1/drivers/vehicle/documents/:docId
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.deleteVehicleDocument = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { docId } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const document = await Document.findOne({
            where: { id: docId, driverId: driver.id }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        if (document.publicId) {
            await deleteFromStorage(document.publicId);
        }

        await document.destroy();

        await redisClient.del(`driver:vehicle:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        logger.error('Delete vehicle document error:', error);
        next(error);
    }
};

/**
 * Verify vehicle document (Admin only)
 * @route PUT /api/v1/drivers/vehicle/documents/:docId/verify
 * @access Private (Admin only)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.verifyVehicleDocument = async (req, res, next) => {
    try {
        const { docId } = req.params;
        const { status, notes } = req.body;

        if (!['verified', 'rejected', 'pending'].includes(status)) {
            throw new AppError('Invalid status', 400, 'INVALID_STATUS');
        }

        const document = await Document.findOne({
            where: { id: docId, vehicleId: { [Op.ne]: null } }
        });

        if (!document) {
            throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }

        await document.update({
            status,
            verifiedAt: new Date(),
            verifiedBy: req.user.id,
            verificationNotes: notes || null
        });

        await redisClient.del(`driver:vehicle:${document.driverId}`);

        res.status(200).json({
            success: true,
            message: `Document ${status}`,
            data: document
        });
    } catch (error) {
        logger.error('Verify vehicle document error:', error);
        next(error);
    }
};
