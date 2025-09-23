const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Voucher = require('../models/Voucher');
const { runQuery, getOne, getAll } = require('../config/database');

const router = express.Router();

// Configuración de multer para subida de archivos (logos)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif)'));
        }
    }
});

// GESTIÓN DE USUARIOS

// Obtener todos los usuarios
router.get('/users', async (req, res) => {
    try {
        const users = await User.findAll();
        res.json({
            success: true,
            users: users.map(user => user.toSafeObject())
        });
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Crear nuevo usuario
router.post('/users', async (req, res) => {
    try {
        const { username, password, role, full_name } = req.body;

        // Validar datos requeridos
        if (!username || !password || !role || !full_name) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }

        // Validar longitud de contraseña
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        const user = await User.create({
            username: username.trim(),
            password,
            role,
            full_name: full_name.trim()
        });

        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente',
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Actualizar usuario
router.put('/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const updateData = req.body;

        // Validar que no se esté intentando actualizar el propio usuario admin
        if (userId === req.user.id && updateData.role && updateData.role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'No puedes cambiar tu propio rol de administrador'
            });
        }

        const user = await User.update(userId, updateData);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuario actualizado exitosamente',
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Eliminar usuario
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Validar que no se esté intentando eliminar a sí mismo
        if (userId === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'No puedes eliminar tu propia cuenta'
            });
        }

        await User.delete(userId);

        res.json({
            success: true,
            message: 'Usuario eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GESTIÓN DE CATEGORÍAS

// Obtener todas las categorías
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

// Crear nueva categoría
router.post('/categories', async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'El nombre de la categoría es requerido'
            });
        }

        const result = await runQuery(
            'INSERT INTO categories (name, description) VALUES (?, ?)',
            [name.trim(), description?.trim() || '']
        );

        const category = await getOne('SELECT * FROM categories WHERE id = ?', [result.id]);

        res.status(201).json({
            success: true,
            message: 'Categoría creada exitosamente',
            category: category
        });
    } catch (error) {
        console.error('Error creando categoría:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Actualizar categoría
router.put('/categories/:id', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        const { name, description, active } = req.body;

        const fields = [];
        const values = [];

        if (name) {
            fields.push('name = ?');
            values.push(name.trim());
        }
        if (description !== undefined) {
            fields.push('description = ?');
            values.push(description?.trim() || '');
        }
        if (typeof active !== 'undefined') {
            fields.push('active = ?');
            values.push(active ? 1 : 0);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay datos para actualizar'
            });
        }

        values.push(categoryId);

        await runQuery(
            `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        const category = await getOne('SELECT * FROM categories WHERE id = ?', [categoryId]);

        res.json({
            success: true,
            message: 'Categoría actualizada exitosamente',
            category: category
        });
    } catch (error) {
        console.error('Error actualizando categoría:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Eliminar categoría
router.delete('/categories/:id', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);

        // Verificar si hay productos en esta categoría
        const productsInCategory = await getOne(
            'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND active = 1',
            [categoryId]
        );

        if (productsInCategory.count > 0) {
            return res.status(400).json({
                success: false,
                message: `No se puede eliminar la categoría porque tiene ${productsInCategory.count} producto(s) asociado(s)`
            });
        }

        await runQuery('UPDATE categories SET active = 0 WHERE id = ?', [categoryId]);

        res.json({
            success: true,
            message: 'Categoría eliminada exitosamente'
        });
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GESTIÓN DE PRODUCTOS

// Obtener todos los productos
router.get('/products', async (req, res) => {
    try {
        const products = await Product.findAll();
        res.json({
            success: true,
            products: products
        });
    } catch (error) {
        console.error('Error obteniendo productos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Crear nuevo producto
router.post('/products', async (req, res) => {
    try {
        const product = await Product.create(req.body);
        res.status(201).json({
            success: true,
            message: 'Producto creado exitosamente',
            product: product
        });
    } catch (error) {
        console.error('Error creando producto:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Actualizar producto
router.put('/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const product = await Product.update(productId, req.body);
        
        res.json({
            success: true,
            message: 'Producto actualizado exitosamente',
            product: product
        });
    } catch (error) {
        console.error('Error actualizando producto:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Eliminar producto
router.delete('/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        await Product.delete(productId);

        res.json({
            success: true,
            message: 'Producto eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Actualizar stock de producto
router.put('/products/:id/stock', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { quantity, reason } = req.body;

        if (typeof quantity !== 'number' || quantity < 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser un número mayor o igual a 0'
            });
        }

        const product = await Product.updateStock(
            productId, 
            quantity, 
            'adjustment', 
            reason || 'Ajuste manual por administrador', 
            req.user.id
        );

        res.json({
            success: true,
            message: 'Stock actualizado exitosamente',
            product: product
        });
    } catch (error) {
        console.error('Error actualizando stock:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// REPORTES Y ESTADÍSTICAS

// Dashboard principal
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Estadísticas de ventas
        const salesStats = await Sale.getStats(today, today);
        
        // Estadísticas de vales
        const voucherStats = await Voucher.getStats(today, today);
        
        // Productos con stock bajo
        const lowStockProducts = await Product.findLowStock();
        
        // Ventas de hoy
        const todaySales = await Sale.findToday();
        
        // Vales pendientes
        const pendingVouchers = await Voucher.findPending();

        res.json({
            success: true,
            dashboard: {
                sales: salesStats,
                vouchers: voucherStats,
                low_stock_products: lowStockProducts.slice(0, 10), // Top 10
                today_sales_count: todaySales.length,
                pending_vouchers_count: pendingVouchers.length,
                total_revenue_today: salesStats.general?.total_revenue || 0
            }
        });
    } catch (error) {
        console.error('Error obteniendo dashboard:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Reporte de ventas
router.get('/reports/sales', async (req, res) => {
    try {
        const { start_date, end_date, limit = 100, offset = 0 } = req.query;
        
        let sales;
        if (start_date && end_date) {
            sales = await Sale.findByDateRange(start_date, end_date, parseInt(limit), parseInt(offset));
        } else {
            sales = await Sale.findAll(parseInt(limit), parseInt(offset));
        }

        const stats = await Sale.getStats(start_date, end_date);

        res.json({
            success: true,
            sales: sales,
            statistics: stats,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: sales.length
            }
        });
    } catch (error) {
        console.error('Error obteniendo reporte de ventas:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Reporte de vales
router.get('/reports/vouchers', async (req, res) => {
    try {
        const { status, limit = 100, offset = 0 } = req.query;
        
        let vouchers;
        if (status) {
            vouchers = await Voucher.findByStatus(status);
        } else {
            vouchers = await Voucher.findAll(parseInt(limit), parseInt(offset));
        }

        const stats = await Voucher.getStats();

        res.json({
            success: true,
            vouchers: vouchers,
            statistics: stats,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: vouchers.length
            }
        });
    } catch (error) {
        console.error('Error obteniendo reporte de vales:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// CONFIGURACIÓN DEL RESTAURANTE

// Obtener configuración
router.get('/config', async (req, res) => {
    try {
        const config = await getOne('SELECT * FROM restaurant_config ORDER BY id DESC LIMIT 1');
        res.json({
            success: true,
            config: config || {}
        });
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Actualizar configuración
router.put('/config', async (req, res) => {
    try {
        const { 
            restaurant_name, 
            address, 
            phone, 
            tax_rate, 
            voucher_expiry_hours, 
            receipt_footer 
        } = req.body;

        // Verificar si existe configuración
        const existingConfig = await getOne('SELECT id FROM restaurant_config ORDER BY id DESC LIMIT 1');

        if (existingConfig) {
            // Actualizar configuración existente
            const fields = [];
            const values = [];

            if (restaurant_name) {
                fields.push('restaurant_name = ?');
                values.push(restaurant_name);
            }
            if (address !== undefined) {
                fields.push('address = ?');
                values.push(address);
            }
            if (phone !== undefined) {
                fields.push('phone = ?');
                values.push(phone);
            }
            if (tax_rate !== undefined) {
                fields.push('tax_rate = ?');
                values.push(tax_rate);
            }
            if (voucher_expiry_hours !== undefined) {
                fields.push('voucher_expiry_hours = ?');
                values.push(voucher_expiry_hours);
            }
            if (receipt_footer !== undefined) {
                fields.push('receipt_footer = ?');
                values.push(receipt_footer);
            }

            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(existingConfig.id);

            await runQuery(
                `UPDATE restaurant_config SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        } else {
            // Crear nueva configuración
            await runQuery(
                `INSERT INTO restaurant_config (restaurant_name, address, phone, tax_rate, voucher_expiry_hours, receipt_footer) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [restaurant_name, address, phone, tax_rate, voucher_expiry_hours, receipt_footer]
            );
        }

        const config = await getOne('SELECT * FROM restaurant_config ORDER BY id DESC LIMIT 1');

        res.json({
            success: true,
            message: 'Configuración actualizada exitosamente',
            config: config
        });
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Subir logo del restaurante
router.post('/config/logo', upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No se ha seleccionado ningún archivo'
            });
        }

        const logoPath = `/uploads/${req.file.filename}`;

        // Actualizar configuración con el nuevo logo
        const existingConfig = await getOne('SELECT id, logo_path FROM restaurant_config ORDER BY id DESC LIMIT 1');

        if (existingConfig) {
            // Eliminar logo anterior si existe
            if (existingConfig.logo_path) {
                const oldLogoPath = path.join(__dirname, '..', 'public', existingConfig.logo_path);
                if (fs.existsSync(oldLogoPath)) {
                    fs.unlinkSync(oldLogoPath);
                }
            }

            await runQuery(
                'UPDATE restaurant_config SET logo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [logoPath, existingConfig.id]
            );
        } else {
            await runQuery(
                'INSERT INTO restaurant_config (logo_path) VALUES (?)',
                [logoPath]
            );
        }

        res.json({
            success: true,
            message: 'Logo subido exitosamente',
            logo_path: logoPath
        });
    } catch (error) {
        console.error('Error subiendo logo:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;