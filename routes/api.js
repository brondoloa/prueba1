const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { authenticate, isAdmin } = require('../middleware/auth');

// Configuración de multer para logos del restaurante
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsPath = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadsPath)) {
            fs.mkdirSync(uploadsPath, { recursive: true });
        }
        cb(null, uploadsPath);
    },
    filename: (req, file, cb) => {
        if (file.fieldname === 'logo') {
            cb(null, 'restaurant-logo' + path.extname(file.originalname));
        } else {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
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

// =============== RUTAS PÚBLICAS ===============

// Información general del sistema
router.get('/info', (req, res) => {
    res.json({
        success: true,
        system: {
            name: 'Restaurant TPV',
            version: '1.0.0',
            description: 'Sistema de punto de venta para restaurante',
            features: [
                'Gestión de usuarios (Admin, Cajero, Validador)',
                'Gestión de productos e inventario',
                'Ventas con generación de vouchers',
                'Validación de vouchers con códigos únicos',
                'Validación especial para café',
                'Reportes y estadísticas',
                'Impresión de vales personalizables'
            ]
        },
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// =============== CONFIGURACIÓN DEL RESTAURANTE ===============

// Obtener configuración del restaurante
router.get('/restaurant/config', async (req, res) => {
    try {
        const database = require('../config/database');
        
        // Obtener configuración desde la base de datos o valores por defecto
        const config = await database.get('SELECT * FROM restaurant_config WHERE id = 1');
        
        const defaultConfig = {
            name: 'Mi Restaurante',
            address: 'Dirección del Restaurante',
            phone: 'Teléfono',
            email: 'email@restaurante.com',
            logo: '/uploads/restaurant-logo.png',
            taxRate: 0.19,
            currency: 'COP',
            timezone: 'America/Bogota',
            receiptFooter: 'Gracias por su preferencia',
            voucherExpirationHours: 24
        };
        
        const restaurantConfig = config ? { ...defaultConfig, ...config } : defaultConfig;
        
        res.json({
            success: true,
            config: restaurantConfig
        });
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar configuración del restaurante (solo admin)
router.put('/restaurant/config', authenticate, isAdmin, async (req, res) => {
    try {
        const { name, address, phone, email, taxRate, currency, timezone, receiptFooter, voucherExpirationHours } = req.body;
        const database = require('../config/database');
        
        const configData = {
            name: name || 'Mi Restaurante',
            address: address || 'Dirección del Restaurante',
            phone: phone || 'Teléfono',
            email: email || 'email@restaurante.com',
            tax_rate: parseFloat(taxRate) || 0.19,
            currency: currency || 'COP',
            timezone: timezone || 'America/Bogota',
            receipt_footer: receiptFooter || 'Gracias por su preferencia',
            voucher_expiration_hours: parseInt(voucherExpirationHours) || 24,
            updated_at: new Date().toISOString()
        };
        
        // Verificar si ya existe configuración
        const existingConfig = await database.get('SELECT id FROM restaurant_config WHERE id = 1');
        
        if (existingConfig) {
            await database.run(
                `UPDATE restaurant_config SET 
                 name = ?, address = ?, phone = ?, email = ?, tax_rate = ?, 
                 currency = ?, timezone = ?, receipt_footer = ?, voucher_expiration_hours = ?, updated_at = ?
                 WHERE id = 1`,
                [configData.name, configData.address, configData.phone, configData.email, 
                 configData.tax_rate, configData.currency, configData.timezone, 
                 configData.receipt_footer, configData.voucher_expiration_hours, configData.updated_at]
            );
        } else {
            await database.run(
                `INSERT INTO restaurant_config 
                 (id, name, address, phone, email, tax_rate, currency, timezone, receipt_footer, voucher_expiration_hours, created_at, updated_at)
                 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [configData.name, configData.address, configData.phone, configData.email, 
                 configData.tax_rate, configData.currency, configData.timezone, 
                 configData.receipt_footer, configData.voucher_expiration_hours, configData.updated_at, configData.updated_at]
            );
        }
        
        res.json({
            success: true,
            message: 'Configuración actualizada exitosamente',
            config: configData
        });
        
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Subir logo del restaurante (solo admin)
router.post('/restaurant/logo', authenticate, isAdmin, upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo' });
        }
        
        const logoUrl = `/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            message: 'Logo subido exitosamente',
            logoUrl
        });
    } catch (error) {
        console.error('Error subiendo logo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// =============== UTILIDADES ===============

// Generar código QR para voucher
router.post('/qr/generate', authenticate, async (req, res) => {
    try {
        const { text, size = 200 } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Texto requerido para generar QR' });
        }
        
        const qrCodeDataURL = await QRCode.toDataURL(text, {
            width: parseInt(size),
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        res.json({
            success: true,
            qrCode: qrCodeDataURL
        });
    } catch (error) {
        console.error('Error generando código QR:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Generar template de voucher para impresión
router.post('/voucher/template', authenticate, async (req, res) => {
    try {
        const { voucher, restaurantConfig, includeQR = true } = req.body;
        
        if (!voucher) {
            return res.status(400).json({ error: 'Datos del voucher requeridos' });
        }
        
        let qrCodeDataURL = '';
        if (includeQR) {
            qrCodeDataURL = await QRCode.toDataURL(voucher.code, {
                width: 150,
                margin: 1
            });
        }
        
        const template = {
            voucher,
            restaurantConfig,
            qrCode: qrCodeDataURL,
            generatedAt: new Date().toISOString(),
            template: 'default'
        };
        
        res.json({
            success: true,
            template
        });
    } catch (error) {
        console.error('Error generando template de voucher:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener estadísticas generales del sistema
router.get('/stats/general', authenticate, async (req, res) => {
    try {
        const database = require('../config/database');
        const today = new Date().toISOString().split('T')[0];
        
        // Estadísticas básicas
        const stats = await database.get(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE active = 1) as active_users,
                (SELECT COUNT(*) FROM products WHERE active = 1) as active_products,
                (SELECT COUNT(*) FROM sales WHERE DATE(created_at) = ?) as today_sales,
                (SELECT COUNT(*) FROM vouchers WHERE DATE(created_at) = ?) as today_vouchers,
                (SELECT COUNT(*) FROM vouchers WHERE is_validated = 0 AND status = 'active' AND datetime(expires_at) > datetime('now')) as pending_vouchers
        `, [today, today]);
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas generales:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Backup de datos (solo admin)
router.post('/backup', authenticate, isAdmin, async (req, res) => {
    try {
        const database = require('../config/database');
        
        // Obtener datos de todas las tablas principales
        const users = await database.all('SELECT * FROM users WHERE active = 1');
        const products = await database.all('SELECT * FROM products');
        const sales = await database.all('SELECT * FROM sales ORDER BY created_at DESC LIMIT 1000');
        const vouchers = await database.all('SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 1000');
        const config = await database.get('SELECT * FROM restaurant_config WHERE id = 1');
        
        const backupData = {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            data: {
                users: users.map(u => {
                    const { password, ...userWithoutPassword } = u;
                    return userWithoutPassword;
                }),
                products,
                sales: sales.slice(0, 100), // Últimas 100 ventas
                vouchers: vouchers.slice(0, 100), // Últimos 100 vouchers
                config
            }
        };
        
        res.json({
            success: true,
            message: 'Backup generado exitosamente',
            backup: backupData
        });
    } catch (error) {
        console.error('Error generando backup:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Manejo de errores de multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'El archivo es demasiado grande (máximo 5MB)' });
        }
    }
    
    if (error.message === 'Solo se permiten archivos de imagen') {
        return res.status(400).json({ error: 'Solo se permiten archivos de imagen' });
    }
    
    next(error);
});

module.exports = router;