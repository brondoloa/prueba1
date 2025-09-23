const express = require('express');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Voucher = require('../models/Voucher');
const { getOne, getAll } = require('../config/database');

const router = express.Router();

// GESTIÓN DE PRODUCTOS PARA VENTAS

// Obtener productos disponibles para venta
router.get('/products', async (req, res) => {
    try {
        const { category_id } = req.query;
        
        let products;
        if (category_id) {
            products = await Product.findByCategory(parseInt(category_id));
        } else {
            products = await Product.findAll();
        }

        // Filtrar solo productos activos y disponibles
        const availableProducts = products.filter(product => 
            product.active && product.stock_quantity > 0
        );

        res.json({
            success: true,
            products: availableProducts
        });
    } catch (error) {
        console.error('Error obteniendo productos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener categorías para filtrar productos
router.get('/categories', async (req, res) => {
    try {
        const categories = await getAll('SELECT * FROM categories WHERE active = 1 ORDER BY name');
        res.json({
            success: true,
            categories: categories
        });
    } catch (error) {
        console.error('Error obteniendo categorías:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Verificar disponibilidad de producto
router.get('/products/:id/availability', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { quantity = 1 } = req.query;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        const requestedQuantity = parseInt(quantity);
        const isAvailable = product.isAvailable() && product.stock_quantity >= requestedQuantity;

        res.json({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                price: product.price,
                stock_quantity: product.stock_quantity,
                is_available: isAvailable,
                can_fulfill_quantity: product.stock_quantity >= requestedQuantity,
                stock_info: product.getStockInfo()
            }
        });
    } catch (error) {
        console.error('Error verificando disponibilidad:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GESTIÓN DE VENTAS

// Crear nueva venta
router.post('/sales', async (req, res) => {
    try {
        const { items, payment_method = 'cash', discount_amount = 0 } = req.body;

        // Validar datos de entrada
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Debe incluir al menos un producto en la venta'
            });
        }

        // Validar cada item
        for (let item of items) {
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cada producto debe tener un ID válido y cantidad mayor a 0'
                });
            }
        }

        // Validar descuento
        if (discount_amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'El descuento no puede ser negativo'
            });
        }

        const saleData = {
            cashier_id: req.user.id,
            items: items,
            payment_method: payment_method,
            discount_amount: discount_amount
        };

        // Crear la venta
        const sale = await Sale.create(saleData);

        res.status(201).json({
            success: true,
            message: 'Venta creada exitosamente',
            sale: sale
        });
    } catch (error) {
        console.error('Error creando venta:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener ventas del cajero actual
router.get('/sales', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const sales = await Sale.findByCashier(req.user.id, parseInt(limit), parseInt(offset));

        res.json({
            success: true,
            sales: sales,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: sales.length
            }
        });
    } catch (error) {
        console.error('Error obteniendo ventas:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener detalles de una venta específica
router.get('/sales/:id', async (req, res) => {
    try {
        const saleId = parseInt(req.params.id);
        const sale = await Sale.findById(saleId);

        if (!sale) {
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        // Verificar que el cajero tiene acceso a esta venta (o es admin)
        if (req.user.role !== 'admin' && sale.cashier_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta venta'
            });
        }

        res.json({
            success: true,
            sale: sale
        });
    } catch (error) {
        console.error('Error obteniendo venta:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Cancelar venta (solo si no tiene vale generado)
router.delete('/sales/:id', async (req, res) => {
    try {
        const saleId = parseInt(req.params.id);
        const { reason = 'Cancelada por cajero' } = req.body;

        const sale = await Sale.findById(saleId);
        if (!sale) {
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        // Verificar que el cajero tiene acceso a esta venta (o es admin)
        if (req.user.role !== 'admin' && sale.cashier_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta venta'
            });
        }

        // Verificar si ya tiene un vale generado
        const existingVoucher = await getOne('SELECT id FROM vouchers WHERE sale_id = ?', [saleId]);
        if (existingVoucher) {
            return res.status(400).json({
                success: false,
                message: 'No se puede cancelar una venta que ya tiene un vale generado'
            });
        }

        await Sale.cancel(saleId, reason);

        res.json({
            success: true,
            message: 'Venta cancelada exitosamente'
        });
    } catch (error) {
        console.error('Error cancelando venta:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GESTIÓN DE VALES

// Generar vale para una venta
router.post('/sales/:id/voucher', async (req, res) => {
    try {
        const saleId = parseInt(req.params.id);

        const sale = await Sale.findById(saleId);
        if (!sale) {
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        // Verificar que el cajero tiene acceso a esta venta (o es admin)
        if (req.user.role !== 'admin' && sale.cashier_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta venta'
            });
        }

        // Verificar que la venta esté completada
        if (sale.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Solo se pueden generar vales para ventas completadas'
            });
        }

        const voucher = await Voucher.create(saleId);

        res.status(201).json({
            success: true,
            message: 'Vale generado exitosamente',
            voucher: voucher
        });
    } catch (error) {
        console.error('Error generando vale:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener vales generados por el cajero
router.get('/vouchers', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        // Si es cajero, solo mostrar sus vales, si es admin mostrar todos
        let query = `
            SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name,
                   u2.full_name as food_validator_name, u3.full_name as coffee_validator_name
            FROM vouchers v 
            LEFT JOIN sales s ON v.sale_id = s.id
            LEFT JOIN users u ON s.cashier_id = u.id
            LEFT JOIN users u2 ON v.food_validator_id = u2.id
            LEFT JOIN users u3 ON v.coffee_validator_id = u3.id
        `;

        const params = [];

        if (req.user.role === 'cashier') {
            query += ' WHERE s.cashier_id = ?';
            params.push(req.user.id);
        }

        query += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const vouchers = await getAll(query, params);

        res.json({
            success: true,
            vouchers: vouchers,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: vouchers.length
            }
        });
    } catch (error) {
        console.error('Error obteniendo vales:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener detalles de un vale específico
router.get('/vouchers/:code', async (req, res) => {
    try {
        const code = req.params.code;
        const voucher = await Voucher.findByCode(code);

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Vale no encontrado'
            });
        }

        // Verificar acceso si es cajero
        if (req.user.role === 'cashier') {
            const sale = await Sale.findById(voucher.sale_id);
            if (sale && sale.cashier_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes acceso a este vale'
                });
            }
        }

        res.json({
            success: true,
            voucher: voucher
        });
    } catch (error) {
        console.error('Error obteniendo vale:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ESTADÍSTICAS DEL CAJERO

// Dashboard del cajero
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Ventas de hoy del cajero
        const todaySales = await Sale.findByDateRange(today, today);
        const mySales = req.user.role === 'admin' ? todaySales : 
                       todaySales.filter(sale => sale.cashier_id === req.user.id);

        // Calcular totales
        const totalRevenue = mySales.reduce((sum, sale) => 
            sale.status === 'completed' ? sum + parseFloat(sale.total_amount) : sum, 0
        );

        // Vales pendientes generados por el cajero
        const pendingVouchers = await getAll(`
            SELECT v.* FROM vouchers v
            LEFT JOIN sales s ON v.sale_id = s.id
            WHERE v.status IN ('pending', 'validated') 
            AND datetime(v.expires_at) > datetime('now')
            ${req.user.role === 'cashier' ? 'AND s.cashier_id = ?' : ''}
            ORDER BY v.created_at DESC
        `, req.user.role === 'cashier' ? [req.user.id] : []);

        // Productos más vendidos (últimos 7 días)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const topProducts = await getAll(`
            SELECT p.name, SUM(si.quantity) as total_sold
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            JOIN sales s ON si.sale_id = s.id
            WHERE s.status = 'completed' 
            AND DATE(s.created_at) >= ?
            ${req.user.role === 'cashier' ? 'AND s.cashier_id = ?' : ''}
            GROUP BY p.id, p.name
            ORDER BY total_sold DESC
            LIMIT 5
        `, req.user.role === 'cashier' ? [weekAgoStr, req.user.id] : [weekAgoStr]);

        res.json({
            success: true,
            dashboard: {
                today_sales_count: mySales.length,
                today_revenue: totalRevenue.toFixed(2),
                pending_vouchers_count: pendingVouchers.length,
                top_products: topProducts,
                recent_sales: mySales.slice(0, 10) // 10 ventas más recientes
            }
        });
    } catch (error) {
        console.error('Error obteniendo dashboard del cajero:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Obtener configuración básica para el cajero
router.get('/config', async (req, res) => {
    try {
        const config = await getOne(`
            SELECT restaurant_name, tax_rate, logo_path 
            FROM restaurant_config 
            ORDER BY id DESC LIMIT 1
        `);

        res.json({
            success: true,
            config: config || {
                restaurant_name: 'Mi Restaurante',
                tax_rate: 16.00,
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