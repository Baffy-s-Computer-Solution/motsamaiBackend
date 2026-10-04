const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Zone = sequelize.define('Zone', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    boundary: {
      type: DataTypes.GEOMETRY('POLYGON', 4326), // 4326 is the SRID for WGS 84
      allowNull: false,
    },
    base_fare: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  }, {
    tableName: 'Zones',
    indexes: [
      {
        fields: ['boundary'],
        using: 'gist', // Spatial index for PostGIS performance
      },
    ],
    timestamps: true,
  });

  return Zone;
};