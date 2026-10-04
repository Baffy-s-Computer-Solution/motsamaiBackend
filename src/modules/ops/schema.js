const express = require('express');
const { QueryTypes } = require('sequelize');
const asyncHandler = require('../../utils/asyncHandler');
const { sequelize } = require('../../models');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tables = await sequelize.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position;`,
      { type: QueryTypes.SELECT },
    );

    const foreignKeys = await sequelize.query(
      `SELECT
         tc.table_name,
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name,
         tc.constraint_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = kcu.constraint_name
         AND ccu.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
       ORDER BY tc.table_name, kcu.ordinal_position;`,
      { type: QueryTypes.SELECT },
    );

    res.json({
      success: true,
      data: {
        models: Object.keys(sequelize.models),
        tables,
        foreignKeys,
      },
    });
  }),
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const tableCounts = await sequelize.query(
      `SELECT table_name, COUNT(*) AS column_count
       FROM information_schema.columns
       WHERE table_schema = 'public'
       GROUP BY table_name
       ORDER BY table_name;`,
      { type: QueryTypes.SELECT },
    );

    const foreignKeyCounts = await sequelize.query(
      `SELECT tc.table_name, COUNT(*) AS foreign_key_count
       FROM information_schema.table_constraints AS tc
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
       GROUP BY tc.table_name
       ORDER BY tc.table_name;`,
      { type: QueryTypes.SELECT },
    );

    res.json({
      success: true,
      data: {
        models: Object.keys(sequelize.models),
        tableCounts,
        foreignKeyCounts,
      },
    });
  }),
);

module.exports = router;
