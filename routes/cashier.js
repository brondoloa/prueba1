const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Voucher = require('../models/Voucher');
const { isCashier } = require('../middleware/auth');

// Middleware para verificar que el usuario es cajero o admin
router.use(isCashier);

// =============== PRODUCTOS ===============

// Obtener productos activos para la venta
router.get('/products', async (req, res) => {
    try {
        const products = await Product.findAll(true); // Solo activos
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error obteniendo productos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener productos por categoría
router.get('/products/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const products = await Product.findByCategory(category, true);
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error obteniendo productos por categoría:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Buscar productos
router.get('/products/search', async (req, res) => {
    try {
        const { q, category } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({ 
                error: 'El término de búsqueda debe tener al menos 2 caracteres' 
            });
        }
        
        const products = await Product.search(q.trim(), category);
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error buscando productos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener categorías disponibles
router.get('/categories', async (req, res) => {
    try {
        const categories = await Product.getCategories();
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Error obteniendo categorías:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =============== VENTAS ===============

// Crear nueva venta y generar voucher
router.post('/sales', async (req, res) => {
    try {
        const { items, paymentMethod, discount, notes } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ 
                error: 'Debe incluir al menos un producto en la venta' 
            });
        }
        
        // Validar items y verificar stock
        const saleItems = [];
        let hasProductsWithCoffeeValidation = false;
        
        for (const item of items) {
            const product = await Product.findById(item.productId);
            
            if (!product) {
                return res.status(404).json({ 
                    error: `Producto con ID ${item.productId} no encontrado` 
                });
            }
            
            if (!product.active) {
                return res.status(400).json({ 
                    error: `El producto ${product.name} no está disponible` 
                });
            }
            
            if (!product.hasStock(item.quantity)) {
                return res.status(400).json({ 
                    error: `Stock insuficiente para ${product.name}. Stock disponible: ${product.stock}` 
                });
            }
            
            if (product.requiresCoffeeValidation) {
                hasProductsWithCoffeeValidation = true;
            }
            
            saleItems.push({
                productId: product.id,
                productName: product.name,
                quantity: parseInt(item.quantity),
                unitPrice: product.price,
                totalPrice: product.price * parseInt(item.quantity),
                requiresCoffeeValidation: product.requiresCoffeeValidation
            });
        }
        
        // Crear la venta
        const sale = new Sale({
            cashierId: req.user.id,
            items: saleItems,
            paymentMethod: paymentMethod || 'cash',
            discount: parseFloat(discount) || 0,
            notes
        });
        
        sale.calculateTotals();
        await sale.create();
        
        // Crear voucher
        const voucher = new Voucher({
            saleId: sale.id,
            items: saleItems,
            requiresCoffeeValidation: hasProductsWithCoffeeValidation
        });
        
        await voucher.create();
        
        res.status(201).json({
            success: true,
            message: 'Venta creada exitosamente',
            sale: sale.toJSON(),
            voucher: voucher.toJSON()
        });
        
    } catch (error) {
        console.error('Error creando venta:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

// Obtener ventas del cajero actual (del día)
router.get('/sales/today', async (req, res) => {
    try {
        const todaySales = await Sale.getTodaySales();
        
        // Filtrar solo las ventas del cajero actual (excepto si es admin)
        let filteredSales = todaySales;
        if (req.user.role !== 'admin') {
            filteredSales = todaySales.filter(sale => sale.cashierId === req.user.id);
        }
        
        res.json({
            success: true,
            sales: filteredSales
        });
    } catch (error) {
        console.error('Error obteniendo ventas de hoy:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener detalle de una venta específica
router.get('/sales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sale = await Sale.findById(id);
        
        if (!sale) {
            return res.status(404).json({ error: 'Venta no encontrada' });
        }
        
        // Verificar que el cajero solo pueda ver sus propias ventas (excepto admin)
        if (req.user.role !== 'admin' && sale.cashierId !== req.user.id) {
            return res.status(403).json({ error: 'No tienes permisos para ver esta venta' });
        }
        
        // Obtener vouchers asociados
        const vouchers = await Voucher.findBySaleId(id);
        
        res.json({
            success: true,
            sale: sale.toJSON(),
            vouchers
        });
    } catch (error) {
        console.error('Error obteniendo venta:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =============== VOUCHERS ===============

// Obtener voucher por código de venta
router.get('/vouchers/sale/:saleId', async (req, res) => {
    try {
        const { saleId } = req.params;
        const vouchers = await Voucher.findBySaleId(saleId);
        
        res.json({
            success: true,
            vouchers
        });
    } catch (error) {
        console.error('Error obteniendo vouchers:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener voucher por código
router.get('/vouchers/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const voucher = await Voucher.findByCode(code);
        
        if (!voucher) {
            return res.status(404).json({ error: 'Voucher no encontrado' });
        }
        
        res.json({
            success: true,
            voucher: voucher.toJSON()
        });
    } catch (error) {
        console.error('Error obteniendo voucher:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Reimprimir voucher
router.post('/vouchers/:id/reprint', async (req, res) => {
    try {
        const { id } = req.params;
        const voucher = await Voucher.findById(id);
        
        if (!voucher) {
            return res.status(404).json({ error: 'Voucher no encontrado' });
        }
        
        // Verificar que el voucher pertenezca a una venta del cajero actual (excepto admin)
        if (req.user.role !== 'admin') {
            const sale = await Sale.findById(voucher.saleId);
            if (!sale || sale.cashierId !== req.user.id) {
                return res.status(403).json({ error: 'No tienes permisos para reimprimir este voucher' });
            }
        }
        
        res.json({
            success: true,
            message: 'Voucher listo para reimprimir',
            voucher: voucher.toJSON()
        });
    } catch (error) {
        console.error('Error reimprimiendo voucher:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =============== ESTADÍSTICAS DEL CAJERO ===============

// Estadísticas del día actual para el cajero
router.get('/stats/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todaySales = await Sale.findByDateRange(today, today);
        
        // Filtrar por cajero actual si no es admin
        let cashierSales = todaySales;
        if (req.user.role !== 'admin') {
            cashierSales = todaySales.filter(sale => sale.cashierId === req.user.id);
        }
        
        const stats = {
            totalSales: cashierSales.length,
            totalRevenue: cashierSales.reduce((sum, sale) => sum + sale.total, 0),
            averageSale: cashierSales.length > 0 ? 
                (cashierSales.reduce((sum, sale) => sum + sale.total, 0) / cashierSales.length) : 0,
            cashSales: cashierSales.filter(sale => sale.paymentMethod === 'cash').length,
            cardSales: cashierSales.filter(sale => sale.paymentMethod === 'card').length
        };
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener productos más vendidos por el cajero
router.get('/stats/best-selling', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        const startDateStr = startDate.toISOString().split('T')[0];
        
        let products = await Sale.getBestSellingProducts(startDateStr, endDate, 10);
        
        // Si no es admin, filtrar por ventas del cajero
        if (req.user.role !== 'admin') {
            // Esta consulta necesitaría modificación en el modelo Sale para incluir cashier_id
            // Por simplicidad, devolvemos todos los productos más vendidos
        }
        
        res.json({
            success: true,
            bestSellingProducts: products
        });
    } catch (error) {
        console.error('Error obteniendo productos más vendidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;