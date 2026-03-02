const express = require('express');
const router = express.Router();
const Voucher = require('../models/Voucher');
const Sale = require('../models/Sale');
const { isValidator } = require('../middleware/auth');

// Middleware para verificar que el usuario es validador o admin
router.use(isValidator);

// =============== VALIDACIÓN DE VOUCHERS ===============

// Validar voucher por código (validación principal)
router.post('/validate', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ 
                error: 'Código de voucher requerido' 
            });
        }
        
        const voucher = await Voucher.findByCode(code.toUpperCase());
        
        if (!voucher) {
            return res.status(404).json({ 
                error: 'Voucher no encontrado',
                status: 'not_found'
            });
        }
        
        if (voucher.isExpired()) {
            return res.status(400).json({ 
                error: 'El voucher ha expirado',
                status: 'expired',
                voucher: voucher.toJSON()
            });
        }
        
        if (voucher.isValidated) {
            return res.status(400).json({ 
                error: 'El voucher ya ha sido validado',
                status: 'already_validated',
                voucher: voucher.toJSON()
            });
        }
        
        // Validar el voucher
        await voucher.validate(req.user.id);
        
        res.json({
            success: true,
            message: 'Voucher validado exitosamente',
            status: 'validated',
            voucher: voucher.toJSON(),
            requiresCoffeeValidation: voucher.requiresCoffeeValidation
        });
        
    } catch (error) {
        console.error('Error validando voucher:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor',
            status: 'error'
        });
    }
});

// Validar café específicamente
router.post('/validate-coffee', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ 
                error: 'Código de voucher requerido' 
            });
        }
        
        const voucher = await Voucher.findByCode(code.toUpperCase());
        
        if (!voucher) {
            return res.status(404).json({ 
                error: 'Voucher no encontrado',
                status: 'not_found'
            });
        }
        
        if (voucher.isExpired()) {
            return res.status(400).json({ 
                error: 'El voucher ha expirado',
                status: 'expired',
                voucher: voucher.toJSON()
            });
        }
        
        if (!voucher.requiresCoffeeValidation) {
            return res.status(400).json({ 
                error: 'Este voucher no requiere validación de café',
                status: 'no_coffee_required',
                voucher: voucher.toJSON()
            });
        }
        
        if (!voucher.isValidated) {
            return res.status(400).json({ 
                error: 'El voucher debe ser validado primero en el área de comida',
                status: 'not_validated',
                voucher: voucher.toJSON()
            });
        }
        
        if (voucher.isCoffeeValidated) {
            return res.status(400).json({ 
                error: 'El café ya ha sido validado',
                status: 'coffee_already_validated',
                voucher: voucher.toJSON()
            });
        }
        
        // Validar el café
        await voucher.validateCoffee(req.user.id);
        
        res.json({
            success: true,
            message: 'Café validado exitosamente',
            status: 'coffee_validated',
            voucher: voucher.toJSON()
        });
        
    } catch (error) {
        console.error('Error validando café:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor',
            status: 'error'
        });
    }
});

// Consultar estado de voucher sin validar
router.get('/check/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        const voucher = await Voucher.findByCode(code.toUpperCase());
        
        if (!voucher) {
            return res.status(404).json({ 
                error: 'Voucher no encontrado',
                status: 'not_found'
            });
        }
        
        const status = voucher.getValidationStatus();
        
        res.json({
            success: true,
            voucher: voucher.toJSON(),
            status,
            isExpired: voucher.isExpired(),
            canValidate: !voucher.isValidated && !voucher.isExpired(),
            canValidateCoffee: voucher.requiresCoffeeValidation && voucher.isValidated && !voucher.isCoffeeValidated && !voucher.isExpired()
        });
        
    } catch (error) {
        console.error('Error consultando voucher:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// =============== CONSULTAS Y ESTADÍSTICAS ===============

// Obtener vouchers pendientes de validación
router.get('/pending', async (req, res) => {
    try {
        const pendingVouchers = await Voucher.findPendingValidation();
        
        res.json({
            success: true,
            vouchers: pendingVouchers,
            count: pendingVouchers.length
        });
    } catch (error) {
        console.error('Error obteniendo vouchers pendientes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener vouchers pendientes de validación de café
router.get('/pending-coffee', async (req, res) => {
    try {
        const pendingCoffeeVouchers = await Voucher.findPendingCoffeeValidation();
        
        res.json({
            success: true,
            vouchers: pendingCoffeeVouchers,
            count: pendingCoffeeVouchers.length
        });
    } catch (error) {
        console.error('Error obteniendo vouchers pendientes de café:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener historial de validaciones del validador actual
router.get('/history', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const database = require('../config/database');
        
        // Obtener vouchers validados por el usuario actual
        const vouchers = await database.all(
            `SELECT v.*, s.sale_number 
             FROM vouchers v 
             JOIN sales s ON v.sale_id = s.id 
             WHERE v.validated_by = ? OR v.coffee_validated_by = ?
             ORDER BY v.validated_at DESC, v.coffee_validated_at DESC
             LIMIT ? OFFSET ?`,
            [req.user.id, req.user.id, parseInt(limit), parseInt(offset)]
        );
        
        res.json({
            success: true,
            vouchers: vouchers.map(v => new Voucher(v).toJSON()),
            count: vouchers.length
        });
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Estadísticas del día para el validador
router.get('/stats/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const database = require('../config/database');
        
        // Estadísticas de validaciones del usuario actual
        const stats = await database.get(
            `SELECT 
             COUNT(CASE WHEN DATE(validated_at) = ? AND validated_by = ? THEN 1 END) as validated_today,
             COUNT(CASE WHEN DATE(coffee_validated_at) = ? AND coffee_validated_by = ? THEN 1 END) as coffee_validated_today,
             COUNT(CASE WHEN validated_by = ? THEN 1 END) as total_validated,
             COUNT(CASE WHEN coffee_validated_by = ? THEN 1 END) as total_coffee_validated
             FROM vouchers`,
            [today, req.user.id, today, req.user.id, req.user.id, req.user.id]
        );
        
        // Vouchers pendientes
        const pendingGeneral = await Voucher.findPendingValidation();
        const pendingCoffee = await Voucher.findPendingCoffeeValidation();
        
        res.json({
            success: true,
            stats: {
                today: {
                    validated: parseInt(stats.validated_today) || 0,
                    coffeeValidated: parseInt(stats.coffee_validated_today) || 0
                },
                total: {
                    validated: parseInt(stats.total_validated) || 0,
                    coffeeValidated: parseInt(stats.total_coffee_validated) || 0
                },
                pending: {
                    general: pendingGeneral.length,
                    coffee: pendingCoffee.length
                }
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Buscar vouchers por número de venta
router.get('/search/sale/:saleNumber', async (req, res) => {
    try {
        const { saleNumber } = req.params;
        
        const database = require('../config/database');
        
        const sale = await database.get(
            'SELECT * FROM sales WHERE sale_number = ?',
            [saleNumber]
        );
        
        if (!sale) {
            return res.status(404).json({ 
                error: 'Venta no encontrada' 
            });
        }
        
        const vouchers = await Voucher.findBySaleId(sale.id);
        
        res.json({
            success: true,
            sale,
            vouchers
        });
    } catch (error) {
        console.error('Error buscando por venta:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener detalles completos de un voucher
router.get('/details/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        const voucher = await Voucher.findByCode(code.toUpperCase());
        
        if (!voucher) {
            return res.status(404).json({ 
                error: 'Voucher no encontrado' 
            });
        }
        
        // Obtener información de la venta asociada
        const sale = await Sale.findById(voucher.saleId);
        
        res.json({
            success: true,
            voucher: voucher.toJSON(),
            sale: sale ? sale.toJSON() : null,
            validationStatus: voucher.getValidationStatus()
        });
    } catch (error) {
        console.error('Error obteniendo detalles del voucher:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;