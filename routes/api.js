const express = require('express');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Voucher = require('../models/Voucher');
const { getOne, getAll, runQuery } = require('../config/database');

const router = express.Router();

// RUTAS GENERALES DISPONIBLES PARA TODOS LOS ROLES AUTENTICADOS

// Obtener información del sistema
router.get('/system/info', async (req, res) => {
    try {
        const config = await getOne('SELECT * FROM restaurant_config ORDER BY id DESC LIMIT 1');
        
        const systemInfo = {
            restaurant_name: config?.restaurant_name || 'Mi Restaurante',
            logo_path: config?.logo_path,
            version: '1.0.0',
            user: req.user,
            server_time: new Date().toISOString()
        };

        res.json({
            success: true,
            system: systemInfo
        });
    } catch (error) {
        console.error('Error obteniendo información del sistema:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener estadísticas generales
router.get('/stats/general', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Estadísticas básicas que todos pueden ver
        const stats = await getOne(`
            SELECT 
                COUNT(DISTINCT p.id) as total_products,
                COUNT(DISTINCT CASE WHEN p.active = 1 THEN p.id END) as active_products,
                COUNT(DISTINCT c.id) as total_categories,
                COUNT(DISTINCT u.id) as total_users
            FROM products p
            CROSS JOIN categories c
            CROSS JOIN users u
            WHERE c.active = 1 AND u.active = 1
        `);

        // Estadísticas de hoy (solo totales)
        const todayStats = await getOne(`
            SELECT 
                COUNT(*) as sales_count,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as revenue,
                COUNT(DISTINCT cashier_id) as active_cashiers
            FROM sales 
            WHERE DATE(created_at) = ?
        `, [today]);

        // Estadísticas de vales de hoy
        const voucherStats = await getOne(`
            SELECT 
                COUNT(*) as total_vouchers,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_vouchers,
                COUNT(CASE WHEN status = 'fully_validated' THEN 1 END) as completed_vouchers
            FROM vouchers 
            WHERE DATE(created_at) = ?
        `, [today]);

        res.json({
            success: true,
            statistics: {
                system: stats,
                today: {
                    sales: todayStats,
                    vouchers: voucherStats
                }
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas generales:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Buscar productos (para todos los usuarios)
router.get('/products/search', async (req, res) => {
    try {
        const { q, category_id, available_only = false } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'El término de búsqueda debe tener al menos 2 caracteres'
            });
        }

        const searchTerm = `%${q.trim()}%`;
        let whereConditions = ['p.active = 1', '(p.name LIKE ? OR p.description LIKE ?)'];
        let params = [searchTerm, searchTerm];

        if (category_id) {
            whereConditions.push('p.category_id = ?');
            params.push(parseInt(category_id));
        }

        if (available_only === 'true') {
            whereConditions.push('p.stock_quantity > 0');
        }

        const products = await getAll(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY p.name
            LIMIT 20
        `, params);

        res.json({
            success: true,
            products: products,
            search: {
                query: q.trim(),
                category_id: category_id || null,
                available_only: available_only === 'true',
                results_count: products.length
            }
        });
    } catch (error) {
        console.error('Error buscando productos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener detalles de un producto específico
router.get('/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            product: product
        });
    } catch (error) {
        console.error('Error obteniendo producto:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Buscar vales (con restricciones según el rol)
router.get('/vouchers/search', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code || code.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: 'El código debe tener al menos 3 caracteres'
            });
        }

        const searchCode = code.trim().toUpperCase();
        
        let query = `
            SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name,
                   u2.full_name as food_validator_name, u3.full_name as coffee_validator_name
            FROM vouchers v 
            LEFT JOIN sales s ON v.sale_id = s.id
            LEFT JOIN users u ON s.cashier_id = u.id
            LEFT JOIN users u2 ON v.food_validator_id = u2.id
            LEFT JOIN users u3 ON v.coffee_validator_id = u3.id
            WHERE v.code LIKE ?
        `;

        const params = [`%${searchCode}%`];

        // Restricciones según el rol
        if (req.user.role === 'cashier') {
            query += ' AND s.cashier_id = ?';
            params.push(req.user.id);
        }
        // Los validadores y admins pueden ver todos los vales

        query += ' ORDER BY v.created_at DESC LIMIT 10';

        const vouchers = await getAll(query, params);

        res.json({
            success: true,
            vouchers: vouchers.map(voucher => ({
                ...voucher,
                status_info: (new Voucher(voucher)).getStatusInfo()
            })),
            search: {
                code: searchCode,
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

// Generar reporte de recibo/ticket para impresión
router.get('/sales/:id/receipt', async (req, res) => {
    try {
        const saleId = parseInt(req.params.id);
        const sale = await Sale.findById(saleId);

        if (!sale) {
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        // Verificar permisos
        if (req.user.role === 'cashier' && sale.cashier_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta venta'
            });
        }

        // Obtener configuración del restaurante
        const config = await getOne('SELECT * FROM restaurant_config ORDER BY id DESC LIMIT 1');

        // Obtener vale si existe
        const voucher = await getOne('SELECT * FROM vouchers WHERE sale_id = ?', [saleId]);

        const receipt = {
            restaurant: {
                name: config?.restaurant_name || 'Mi Restaurante',
                address: config?.address || '',
                phone: config?.phone || '',
                logo_path: config?.logo_path
            },
            sale: {
                id: sale.id,
                date: sale.created_at,
                cashier: sale.cashier_name,
                items: sale.items,
                summary: sale.getSummary()
            },
            voucher: voucher ? {
                code: voucher.code,
                qr_code: voucher.qr_code,
                has_coffee: voucher.has_coffee,
                expires_at: voucher.expires_at
            } : null,
            footer: config?.receipt_footer || '¡Gracias por su visita!'
        };

        res.json({
            success: true,
            receipt: receipt
        });
    } catch (error) {
        console.error('Error generando recibo:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Verificar estado del vale para impresión
router.get('/vouchers/:code/print-info', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const voucher = await Voucher.findByCode(code);

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Vale no encontrado'
            });
        }

        // Verificar permisos
        if (req.user.role === 'cashier') {
            const sale = await Sale.findById(voucher.sale_id);
            if (sale && sale.cashier_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes acceso a este vale'
                });
            }
        }

        // Obtener configuración del restaurante
        const config = await getOne('SELECT * FROM restaurant_config ORDER BY id DESC LIMIT 1');

        const printInfo = {
            restaurant: {
                name: config?.restaurant_name || 'Mi Restaurante',
                address: config?.address || '',
                phone: config?.phone || '',
                logo_path: config?.logo_path
            },
            voucher: {
                code: voucher.code,
                qr_code: voucher.qr_code,
                sale_id: voucher.sale_id,
                has_coffee: voucher.has_coffee,
                status: voucher.status,
                expires_at: voucher.expires_at,
                created_at: voucher.created_at,
                status_info: voucher.getStatusInfo()
            },
            sale: {
                total_amount: voucher.sale_total,
                cashier_name: voucher.cashier_name,
                items: voucher.sale_items
            }
        };

        res.json({
            success: true,
            print_info: printInfo
        });
    } catch (error) {
        console.error('Error obteniendo información para impresión:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener movimientos de stock (solo admin y cashier)
router.get('/stock/movements', async (req, res) => {
    try {
        // Solo admin y cashier pueden ver movimientos de stock
        if (!['admin', 'cashier'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Acceso no autorizado'
            });
        }

        const { product_id, limit = 50, offset = 0 } = req.query;
        
        let whereCondition = '';
        let params = [];

        if (product_id) {
            whereCondition = 'WHERE sm.product_id = ?';
            params.push(parseInt(product_id));
        }

        params.push(parseInt(limit), parseInt(offset));

        const movements = await getAll(`
            SELECT sm.*, p.name as product_name, u.full_name as user_name
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.id
            LEFT JOIN users u ON sm.user_id = u.id
            ${whereCondition}
            ORDER BY sm.created_at DESC
            LIMIT ? OFFSET ?
        `, params);

        res.json({
            success: true,
            movements: movements,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: movements.length
            }
        });
    } catch (error) {
        console.error('Error obteniendo movimientos de stock:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Validar código QR
router.post('/qr/validate', async (req, res) => {
    try {
        const { qr_data } = req.body;

        if (!qr_data) {
            return res.status(400).json({
                success: false,
                message: 'Datos del código QR requeridos'
            });
        }

        let parsedData;
        try {
            parsedData = JSON.parse(qr_data);
        } catch (e) {
            // Si no es JSON, asumimos que es solo el código
            parsedData = { code: qr_data };
        }

        if (!parsedData.code) {
            return res.status(400).json({
                success: false,
                message: 'Código no válido en el QR'
            });
        }

        const voucher = await Voucher.findByCode(parsedData.code);

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Vale no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Código QR válido',
            voucher: {
                ...voucher,
                status_info: voucher.getStatusInfo()
            }
        });
    } catch (error) {
        console.error('Error validando código QR:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Endpoint de salud del sistema
router.get('/health', async (req, res) => {
    try {
        // Verificar conexión a base de datos
        const dbCheck = await getOne('SELECT 1 as test');
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbCheck ? 'connected' : 'disconnected',
            version: '1.0.0',
            uptime: process.uptime()
        };

        res.json({
            success: true,
            health: health
        });
    } catch (error) {
        console.error('Error en health check:', error);
        res.status(503).json({
            success: false,
            health: {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Database connection failed'
            }
        });
    }
});

module.exports = router;