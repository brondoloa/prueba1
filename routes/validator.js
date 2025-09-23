const express = require('express');
const Voucher = require('../models/Voucher');
const { getOne, getAll } = require('../config/database');

const router = express.Router();

// VALIDACIÓN DE VALES

// Buscar vale por código
router.get('/vouchers/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Código de vale requerido'
            });
        }

        const voucher = await Voucher.findByCode(code);
        
        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Vale no encontrado'
            });
        }

        // Incluir información completa del estado del vale
        const statusInfo = voucher.getStatusInfo();
        
        res.json({
            success: true,
            voucher: {
                ...voucher,
                status_info: statusInfo
            }
        });
    } catch (error) {
        console.error('Error buscando vale:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Validar comida (primera validación)
router.post('/vouchers/:code/validate-food', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const validatorId = req.user.id;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Código de vale requerido'
            });
        }

        const voucher = await Voucher.validateFood(code, validatorId);

        res.json({
            success: true,
            message: 'Comida validada exitosamente',
            voucher: {
                ...voucher,
                status_info: voucher.getStatusInfo()
            }
        });

        console.log(`🍽️ Comida validada - Vale: ${code}, Validador: ${req.user.full_name} - ${new Date().toISOString()}`);

    } catch (error) {
        console.error('Error validando comida:', error);
        
        let statusCode = 400;
        if (error.message.includes('no encontrado')) {
            statusCode = 404;
        } else if (error.message.includes('expirado')) {
            statusCode = 410; // Gone
        }

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
});

// Validar café (segunda validación)
router.post('/vouchers/:code/validate-coffee', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const validatorId = req.user.id;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Código de vale requerido'
            });
        }

        const voucher = await Voucher.validateCoffee(code, validatorId);

        res.json({
            success: true,
            message: 'Café validado exitosamente',
            voucher: {
                ...voucher,
                status_info: voucher.getStatusInfo()
            }
        });

        console.log(`☕ Café validado - Vale: ${code}, Validador: ${req.user.full_name} - ${new Date().toISOString()}`);

    } catch (error) {
        console.error('Error validando café:', error);
        
        let statusCode = 400;
        if (error.message.includes('no encontrado')) {
            statusCode = 404;
        } else if (error.message.includes('expirado')) {
            statusCode = 410; // Gone
        } else if (error.message.includes('no incluye café')) {
            statusCode = 422; // Unprocessable Entity
        }

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
});

// Validación automática según el tipo de validador
router.post('/vouchers/:code/validate', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const { validation_type } = req.body; // 'food' o 'coffee'
        const validatorId = req.user.id;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Código de vale requerido'
            });
        }

        if (!validation_type || !['food', 'coffee'].includes(validation_type)) {
            return res.status(400).json({
                success: false,
                message: 'Tipo de validación requerido: food o coffee'
            });
        }

        let voucher;
        let message;

        if (validation_type === 'food') {
            voucher = await Voucher.validateFood(code, validatorId);
            message = 'Comida validada exitosamente';
            console.log(`🍽️ Comida validada - Vale: ${code}, Validador: ${req.user.full_name}`);
        } else if (validation_type === 'coffee') {
            voucher = await Voucher.validateCoffee(code, validatorId);
            message = 'Café validado exitosamente';
            console.log(`☕ Café validado - Vale: ${code}, Validador: ${req.user.full_name}`);
        }

        res.json({
            success: true,
            message: message,
            voucher: {
                ...voucher,
                status_info: voucher.getStatusInfo()
            }
        });

    } catch (error) {
        console.error('Error en validación:', error);
        
        let statusCode = 400;
        if (error.message.includes('no encontrado')) {
            statusCode = 404;
        } else if (error.message.includes('expirado')) {
            statusCode = 410;
        } else if (error.message.includes('no incluye café')) {
            statusCode = 422;
        }

        res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
});

// CONSULTAS Y REPORTES PARA VALIDADORES

// Obtener vales pendientes de validación
router.get('/vouchers/pending', async (req, res) => {
    try {
        const { validation_type } = req.query; // 'food', 'coffee', o 'all'
        
        let whereCondition = `v.status IN ('pending', 'validated') 
                             AND datetime(v.expires_at) > datetime('now')`;

        if (validation_type === 'food') {
            whereCondition += ` AND v.status = 'pending'`;
        } else if (validation_type === 'coffee') {
            whereCondition += ` AND v.status = 'validated' AND v.has_coffee = 1`;
        }

        const vouchers = await getAll(`
            SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name
            FROM vouchers v 
            LEFT JOIN sales s ON v.sale_id = s.id
            LEFT JOIN users u ON s.cashier_id = u.id
            WHERE ${whereCondition}
            ORDER BY v.created_at ASC
            LIMIT 100
        `);

        res.json({
            success: true,
            vouchers: vouchers.map(voucher => ({
                ...voucher,
                status_info: (new Voucher(voucher)).getStatusInfo()
            }))
        });
    } catch (error) {
        console.error('Error obteniendo vales pendientes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener historial de validaciones del validador actual
router.get('/validations/history', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const validatorId = req.user.id;

        // Obtener vales validados por este validador (tanto comida como café)
        const validations = await getAll(`
            SELECT DISTINCT v.*, s.total_amount as sale_total, u.full_name as cashier_name,
                   CASE 
                     WHEN v.food_validator_id = ? THEN 'food'
                     WHEN v.coffee_validator_id = ? THEN 'coffee'
                     ELSE 'unknown'
                   END as validation_type,
                   CASE 
                     WHEN v.food_validator_id = ? THEN v.food_validated_at
                     WHEN v.coffee_validator_id = ? THEN v.coffee_validated_at
                     ELSE NULL
                   END as validated_at
            FROM vouchers v 
            LEFT JOIN sales s ON v.sale_id = s.id
            LEFT JOIN users u ON s.cashier_id = u.id
            WHERE v.food_validator_id = ? OR v.coffee_validator_id = ?
            ORDER BY 
                CASE 
                  WHEN v.food_validator_id = ? THEN v.food_validated_at
                  WHEN v.coffee_validator_id = ? THEN v.coffee_validated_at
                END DESC
            LIMIT ? OFFSET ?
        `, [
            validatorId, validatorId, validatorId, validatorId, 
            validatorId, validatorId, validatorId, validatorId,
            parseInt(limit), parseInt(offset)
        ]);

        res.json({
            success: true,
            validations: validations,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: validations.length
            }
        });
    } catch (error) {
        console.error('Error obteniendo historial de validaciones:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Dashboard del validador
router.get('/dashboard', async (req, res) => {
    try {
        const validatorId = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        // Validaciones de hoy
        const todayValidations = await getAll(`
            SELECT v.*, 
                   CASE 
                     WHEN v.food_validator_id = ? AND DATE(v.food_validated_at) = ? THEN 'food'
                     WHEN v.coffee_validator_id = ? AND DATE(v.coffee_validated_at) = ? THEN 'coffee'
                     ELSE NULL
                   END as validation_type
            FROM vouchers v
            WHERE (v.food_validator_id = ? AND DATE(v.food_validated_at) = ?)
               OR (v.coffee_validator_id = ? AND DATE(v.coffee_validated_at) = ?)
        `, [validatorId, today, validatorId, today, validatorId, today, validatorId, today]);

        // Contar tipos de validaciones
        const foodValidations = todayValidations.filter(v => v.validation_type === 'food').length;
        const coffeeValidations = todayValidations.filter(v => v.validation_type === 'coffee').length;

        // Vales pendientes que este validador puede procesar
        const pendingFood = await getAll(`
            SELECT COUNT(*) as count FROM vouchers 
            WHERE status = 'pending' 
            AND datetime(expires_at) > datetime('now')
        `);

        const pendingCoffee = await getAll(`
            SELECT COUNT(*) as count FROM vouchers 
            WHERE status = 'validated' 
            AND has_coffee = 1 
            AND datetime(expires_at) > datetime('now')
        `);

        // Estadísticas de la semana
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const weekStats = await getOne(`
            SELECT 
                COUNT(CASE WHEN v.food_validator_id = ? AND DATE(v.food_validated_at) >= ? THEN 1 END) as week_food_validations,
                COUNT(CASE WHEN v.coffee_validator_id = ? AND DATE(v.coffee_validated_at) >= ? THEN 1 END) as week_coffee_validations
            FROM vouchers v
            WHERE (v.food_validator_id = ? AND DATE(v.food_validated_at) >= ?)
               OR (v.coffee_validator_id = ? AND DATE(v.coffee_validated_at) >= ?)
        `, [validatorId, weekAgoStr, validatorId, weekAgoStr, validatorId, weekAgoStr, validatorId, weekAgoStr]);

        res.json({
            success: true,
            dashboard: {
                today: {
                    total_validations: todayValidations.length,
                    food_validations: foodValidations,
                    coffee_validations: coffeeValidations
                },
                pending: {
                    food_vouchers: pendingFood[0]?.count || 0,
                    coffee_vouchers: pendingCoffee[0]?.count || 0
                },
                week: {
                    food_validations: weekStats?.week_food_validations || 0,
                    coffee_validations: weekStats?.week_coffee_validations || 0,
                    total_validations: (weekStats?.week_food_validations || 0) + (weekStats?.week_coffee_validations || 0)
                },
                recent_validations: todayValidations.slice(0, 10)
            }
        });
    } catch (error) {
        console.error('Error obteniendo dashboard del validador:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Buscar vales por diferentes criterios
router.get('/vouchers/search', async (req, res) => {
    try {
        const { query, type = 'code' } = req.query;
        
        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Parámetro de búsqueda requerido'
            });
        }

        const searchTerm = query.trim();
        let vouchers = [];

        switch (type) {
            case 'code':
                // Buscar por código exacto o parcial
                vouchers = await getAll(`
                    SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name
                    FROM vouchers v 
                    LEFT JOIN sales s ON v.sale_id = s.id
                    LEFT JOIN users u ON s.cashier_id = u.id
                    WHERE v.code LIKE ?
                    ORDER BY v.created_at DESC
                    LIMIT 20
                `, [`%${searchTerm}%`]);
                break;

            case 'sale_id':
                // Buscar por ID de venta
                const saleId = parseInt(searchTerm);
                if (isNaN(saleId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'ID de venta debe ser un número'
                    });
                }
                
                vouchers = await getAll(`
                    SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name
                    FROM vouchers v 
                    LEFT JOIN sales s ON v.sale_id = s.id
                    LEFT JOIN users u ON s.cashier_id = u.id
                    WHERE v.sale_id = ?
                `, [saleId]);
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Tipo de búsqueda no válido. Use: code o sale_id'
                });
        }

        res.json({
            success: true,
            vouchers: vouchers.map(voucher => ({
                ...voucher,
                status_info: (new Voucher(voucher)).getStatusInfo()
            })),
            search: {
                query: searchTerm,
                type: type,
                results_count: vouchers.length
            }
        });
    } catch (error) {
        console.error('Error buscando vales:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener configuración básica para el validador
router.get('/config', async (req, res) => {
    try {
        const config = await getOne(`
            SELECT restaurant_name, logo_path 
            FROM restaurant_config 
            ORDER BY id DESC LIMIT 1
        `);

        res.json({
            success: true,
            config: config || {
                restaurant_name: 'Mi Restaurante',
                logo_path: null
            }
        });
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;