const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Voucher = require('../models/Voucher');
const { isAdmin } = require('../middleware/auth');

// Configuración de multer para subida de imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsPath = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadsPath)) {
            fs.mkdirSync(uploadsPath, { recursive: true });
        }
        cb(null, uploadsPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'), false);
        }
    }
});

// Middleware para verificar que el usuario es admin
router.use(isAdmin);

// =============== GESTIÓN DE USUARIOS ===============

// Obtener todos los usuarios
router.get('/users', async (req, res) => {
    try {
        const users = await User.findAll();
        res.json({
            success: true,
            users: users.map(user => user.toJSON())
        });
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear usuario
router.post('/users', async (req, res) => {
    try {
        const { username, password, role, fullName } = req.body;
        
        if (!username || !password || !role || !fullName) {
            return res.status(400).json({ 
                error: 'Todos los campos son requeridos' 
            });
        }
        
        if (!['admin', 'cashier', 'validator'].includes(role)) {
            return res.status(400).json({ 
                error: 'Rol no válido' 
            });
        }
        
        // Verificar si el usuario ya existe
        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({ 
                error: 'El usuario ya existe' 
            });
        }
        
        const user = new User({
            username,
            password,
            role,
            fullName
        });
        
        await user.create();
        
        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente',
            user: user.toJSON()
        });
        
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar usuario
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, role, active, password } = req.body;
        
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Evitar que el admin se desactive a sí mismo
        if (user.id === req.user.id && active === false) {
            return res.status(400).json({ 
                error: 'No puedes desactivar tu propia cuenta' 
            });
        }
        
        user.fullName = fullName || user.fullName;
        user.role = role || user.role;
        user.active = active !== undefined ? active : user.active;
        
        if (password) {
            user.password = password;
        }
        
        await user.update();
        
        res.json({
            success: true,
            message: 'Usuario actualizado exitosamente',
            user: user.toJSON()
        });
        
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar usuario (soft delete)
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ 
                error: 'No puedes eliminar tu propia cuenta' 
            });
        }
        
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        await user.delete();
        
        res.json({
            success: true,
            message: 'Usuario eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =============== GESTIÓN DE PRODUCTOS ===============

// Obtener todos los productos
router.get('/products', async (req, res) => {
    try {
        const products = await Product.findAll(false); // Incluir inactivos
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error obteniendo productos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear producto
router.post('/products', upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, category, stock, minStock, requiresCoffeeValidation } = req.body;
        
        if (!name || !price || !category) {
            return res.status(400).json({ 
                error: 'Nombre, precio y categoría son requeridos' 
            });
        }
        
        const product = new Product({
            name,
            description,
            price: parseFloat(price),
            category,
            stock: parseInt(stock) || 0,
            minStock: parseInt(minStock) || 5,
            requiresCoffeeValidation: requiresCoffeeValidation === 'true',
            image: req.file ? `/uploads/${req.file.filename}` : null
        });
        
        await product.create();
        
        res.status(201).json({
            success: true,
            message: 'Producto creado exitosamente',
            product
        });
        
    } catch (error) {
        console.error('Error creando producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar producto
router.put('/products/:id', upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, category, stock, minStock, requiresCoffeeValidation, active } = req.body;
        
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        product.name = name || product.name;
        product.description = description || product.description;
        product.price = price ? parseFloat(price) : product.price;
        product.category = category || product.category;
        product.stock = stock !== undefined ? parseInt(stock) : product.stock;
        product.minStock = minStock !== undefined ? parseInt(minStock) : product.minStock;
        product.requiresCoffeeValidation = requiresCoffeeValidation !== undefined ? requiresCoffeeValidation === 'true' : product.requiresCoffeeValidation;
        product.active = active !== undefined ? active : product.active;
        
        if (req.file) {
            product.image = `/uploads/${req.file.filename}`;
        }
        
        await product.update();
        
        res.json({
            success: true,
            message: 'Producto actualizado exitosamente',
            product
        });
        
    } catch (error) {
        console.error('Error actualizando producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar producto (soft delete)
router.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        await product.delete();
        
        res.json({
            success: true,
            message: 'Producto eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('Error eliminando producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener productos con stock bajo
router.get('/products/low-stock', async (req, res) => {
    try {
        const products = await Product.findLowStock();
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error obteniendo productos con stock bajo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =============== REPORTES Y ESTADÍSTICAS ===============

// Dashboard - estadísticas generales
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Estadísticas de hoy
        const todaySales = await Sale.getSalesStats(today, today);
        const todayVouchers = await Voucher.getValidationStats(today, today);
        
        // Productos con stock bajo
        const lowStockProducts = await Product.findLowStock();
        
        // Vouchers pendientes
        const pendingVouchers = await Voucher.findPendingValidation();
        const pendingCoffeeVouchers = await Voucher.findPendingCoffeeValidation();
        
        // Conteos generales
        const totalUsers = await User.findAll();
        const totalProducts = await Product.findAll();
        
        res.json({
            success: true,
            dashboard: {
                today: {
                    sales: todaySales,
                    vouchers: todayVouchers
                },
                inventory: {
                    lowStockCount: lowStockProducts.length,
                    lowStockProducts: lowStockProducts.slice(0, 5) // Primeros 5
                },
                pending: {
                    vouchers: pendingVouchers.length,
                    coffeeVouchers: pendingCoffeeVouchers.length
                },
                totals: {
                    users: totalUsers.length,
                    products: totalProducts.length
                }
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo dashboard:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Reporte de ventas por rango de fechas
router.get('/reports/sales', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ 
                error: 'Fechas de inicio y fin son requeridas' 
            });
        }
        
        const sales = await Sale.findByDateRange(startDate, endDate);
        const stats = await Sale.getSalesStats(startDate, endDate);
        const bestSelling = await Sale.getBestSellingProducts(startDate, endDate);
        
        res.json({
            success: true,
            report: {
                period: { startDate, endDate },
                stats,
                sales,
                bestSellingProducts: bestSelling
            }
        });
        
    } catch (error) {
        console.error('Error generando reporte de ventas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Reporte de inventario
router.get('/reports/inventory', async (req, res) => {
    try {
        const allProducts = await Product.findAll(false);
        const lowStockProducts = await Product.findLowStock();
        const categories = await Product.getCategories();
        
        // Agrupar por categoría
        const inventoryByCategory = {};
        for (const category of categories) {
            inventoryByCategory[category] = allProducts.filter(p => p.category === category);
        }
        
        res.json({
            success: true,
            report: {
                totalProducts: allProducts.length,
                activeProducts: allProducts.filter(p => p.active).length,
                lowStockCount: lowStockProducts.length,
                categories: categories.length,
                inventoryByCategory,
                lowStockProducts
            }
        });
        
    } catch (error) {
        console.error('Error generando reporte de inventario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Reporte de vouchers
router.get('/reports/vouchers', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ 
                error: 'Fechas de inicio y fin son requeridas' 
            });
        }
        
        const stats = await Voucher.getValidationStats(startDate, endDate);
        const pendingVouchers = await Voucher.findPendingValidation();
        const pendingCoffeeVouchers = await Voucher.findPendingCoffeeValidation();
        
        res.json({
            success: true,
            report: {
                period: { startDate, endDate },
                stats,
                pending: {
                    general: pendingVouchers.length,
                    coffee: pendingCoffeeVouchers.length
                }
            }
        });
        
    } catch (error) {
        console.error('Error generando reporte de vouchers:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;