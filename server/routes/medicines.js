const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();




router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 10, active_only = true } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, name, unit, price, is_active, created_at, updated_at
      FROM medicines 
      WHERE 1=1
    `;
    let queryParams = [];
    let paramCount = 0;

    if (active_only === 'true') {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      queryParams.push(true);
    }

    if (search) {
      paramCount++;
      query += ` AND name ILIKE $${paramCount}`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY name ASC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    
    let countQuery = 'SELECT COUNT(*) FROM medicines WHERE 1=1';
    let countParams = [];
    let countParamCount = 0;

    if (active_only === 'true') {
      countParamCount++;
      countQuery += ` AND is_active = $${countParamCount}`;
      countParams.push(true);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND name ILIKE $${countParamCount}`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get medicines error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching medicines'
    });
  }
});




router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM medicines WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching medicine'
    });
  }
});




router.post('/', [
  authenticateToken,
  authorizeRoles('admin'),
  body('name').notEmpty().withMessage('Medicine name is required'),
  body('unit').notEmpty().withMessage('Unit is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { name, unit, price } = req.body;

    
    const existingMedicine = await pool.query(
      'SELECT id FROM medicines WHERE name = $1 AND unit = $2',
      [name, unit]
    );

    if (existingMedicine.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Medicine with this name and unit already exists'
      });
    }

    const result = await pool.query(
      `INSERT INTO medicines (name, unit, price)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, unit, price]
    );

    res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating medicine'
    });
  }
});




router.put('/:id', [
  authenticateToken,
  authorizeRoles('admin'),
  body('name').optional().notEmpty().withMessage('Medicine name cannot be empty'),
  body('unit').optional().notEmpty().withMessage('Unit cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { name, unit, price, is_active } = req.body;

    
    const existingMedicine = await pool.query(
      'SELECT id FROM medicines WHERE id = $1',
      [id]
    );

    if (existingMedicine.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    
    if (name && unit) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM medicines WHERE name = $1 AND unit = $2 AND id != $3',
        [name, unit, id]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Medicine with this name and unit already exists'
        });
      }
    }

    const result = await pool.query(
      `UPDATE medicines 
       SET name = COALESCE($1, name),
           unit = COALESCE($2, unit),
           price = COALESCE($3, price),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, unit, price, is_active, id]
    );

    res.json({
      success: true,
      message: 'Medicine updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating medicine'
    });
  }
});




router.delete('/:id', [
  authenticateToken,
  authorizeRoles('admin')
], async (req, res) => {
  try {
    const { id } = req.params;

    
    const existingMedicine = await pool.query(
      'SELECT id FROM medicines WHERE id = $1',
      [id]
    );

    if (existingMedicine.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    
    await pool.query(
      'UPDATE medicines SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Medicine deleted successfully'
    });

  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting medicine'
    });
  }
});

module.exports = router;
