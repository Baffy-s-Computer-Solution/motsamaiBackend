const { sequelize, Zone } = require('../../../src/models');
const { DataTypes } = require('sequelize');

describe('Zone Model Spatial Queries', () => {
  beforeAll(async () => {
    // Ensure PostGIS extension is available for testing
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    // Sync the Zone model to create the table
    await Zone.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('should correctly identify if a point is within a zone using ST_Contains', async () => {
    // Create a square zone around Maseru city center
    const maseruZone = await Zone.create({
      name: 'Maseru City Center',
      boundary: {
        type: 'Polygon',
        coordinates: [[
          [27.47, -29.32], // SW
          [27.49, -29.32], // SE
          [27.49, -29.30], // NE
          [27.47, -29.30], // NW
          [27.47, -29.32]  // Close the polygon
        ]]
      },
      base_fare: 10.00,
      is_active: true
    });

    // Point inside the zone (e.g., Pioneer Mall)
    const pointInside = { lat: -29.31, lng: 27.48 };

    // Point outside the zone (e.g., further south)
    const pointOutside = { lat: -29.35, lng: 27.48 };

    // Check for point inside
    const zoneContainingInsidePoint = await Zone.findOne({
      where: sequelize.where(
        sequelize.fn('ST_Contains', sequelize.col('boundary'),
          sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', pointInside.lng, pointInside.lat), 4326)
        ),
        true
      )
    });
    expect(zoneContainingInsidePoint).not.toBeNull();
    expect(zoneContainingInsidePoint.id).toBe(maseruZone.id);

    // Check for point outside
    const zoneContainingOutsidePoint = await Zone.findOne({
      where: sequelize.where(
        sequelize.fn('ST_Contains', sequelize.col('boundary'),
          sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', pointOutside.lng, pointOutside.lat), 4326)
        ),
        true
      )
    });
    expect(zoneContainingOutsidePoint).toBeNull();
  });
});
