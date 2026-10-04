const { Zone } = require('../models');

const listZones = async () => Zone.findAll({ order: [['name', 'ASC']] });
const createZone = async (payload) => Zone.create(payload);

module.exports = { listZones, createZone };
