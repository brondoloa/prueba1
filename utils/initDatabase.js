const fs = require('fs');
const path = require('path');
const database = require('../config/database');
const User = require('../models/User');
const Product = require('../models/Product');

async function initializeDatabase() {
    console.log('🔧 Inicializando base de datos...');
    
    try {
        // Crear directorio de base de datos si no existe
        const dbDir = path.join(__dirname, '../database');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log('📁 Directorio de base de datos creado');
        }
        
        // Crear directorio de uploads si no existe
        const uploadsDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log('📁 Directorio de uploads creado');
        }
        
        // Conectar a la base de datos
        await database.connect();
        
        // Crear tablas
        await createTables();
        
        // Crear usuarios por defecto
        await createDefaultUsers();
        
        // Crear productos de ejemplo
        await createSampleProducts();
        
        // Crear configuración inicial
        await createInitialConfig();
        
        console.log('✅ Base de datos inicializada exitosamente');
        
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        throw error;
    }
}

async function createTables() {
    console.log('📋 Creando tablas...');
    
    // Tabla de usuarios
    await database.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'cashier', 'validator')),
            full_name VARCHAR(100) NOT NULL,
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Tabla de productos
    await database.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            price DECIMAL(10,2) NOT NULL,
            category VARCHAR(50) NOT NULL,
            stock INTEGER DEFAULT 0,
            min_stock INTEGER DEFAULT 5,
            active BOOLEAN DEFAULT 1,
            requires_coffee_validation BOOLEAN DEFAULT 0,
            image VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Tabla de ventas
    await database.run(`
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_number VARCHAR(20) UNIQUE NOT NULL,
            cashier_id INTEGER NOT NULL,
            subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
            tax DECIMAL(10,2) NOT NULL DEFAULT 0,
            discount DECIMAL(10,2) NOT NULL DEFAULT 0,
            total DECIMAL(10,2) NOT NULL DEFAULT 0,
            payment_method VARCHAR(20) DEFAULT 'cash',
            status VARCHAR(20) DEFAULT 'completed',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cashier_id) REFERENCES users (id)
        )
    `);
    
    // Tabla de items de venta
    await database.run(`
        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price DECIMAL(10,2) NOT NULL,
            total_price DECIMAL(10,2) NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products (id)
        )
    `);
    
    // Tabla de vouchers
    await database.run(`
        CREATE TABLE IF NOT EXISTS vouchers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR(8) UNIQUE NOT NULL,
            sale_id INTEGER NOT NULL,
            requires_coffee_validation BOOLEAN DEFAULT 0,
            is_validated BOOLEAN DEFAULT 0,
            is_coffee_validated BOOLEAN DEFAULT 0,
            validated_by INTEGER,
            validated_at DATETIME,
            coffee_validated_by INTEGER,
            coffee_validated_at DATETIME,
            status VARCHAR(20) DEFAULT 'active',
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sale_id) REFERENCES sales (id),
            FOREIGN KEY (validated_by) REFERENCES users (id),
            FOREIGN KEY (coffee_validated_by) REFERENCES users (id)
        )
    `);
    
    // Tabla de items de voucher
    await database.run(`
        CREATE TABLE IF NOT EXISTS voucher_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL,
            requires_coffee_validation BOOLEAN DEFAULT 0,
            FOREIGN KEY (voucher_id) REFERENCES vouchers (id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products (id)
        )
    `);
    
    // Tabla de configuración del restaurante
    await database.run(`
        CREATE TABLE IF NOT EXISTS restaurant_config (
            id INTEGER PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            address TEXT,
            phone VARCHAR(20),
            email VARCHAR(100),
            logo VARCHAR(255),
            tax_rate DECIMAL(4,4) DEFAULT 0.19,
            currency VARCHAR(10) DEFAULT 'COP',
            timezone VARCHAR(50) DEFAULT 'America/Bogota',
            receipt_footer TEXT,
            voucher_expiration_hours INTEGER DEFAULT 24,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    console.log('✅ Tablas creadas exitosamente');
}

async function createDefaultUsers() {
    console.log('👤 Creando usuarios por defecto...');
    
    try {
        // Verificar si ya existe el admin
        const existingAdmin = await User.findByUsername('admin');
        
        if (!existingAdmin) {
            // Crear usuario administrador
            const admin = new User({
                username: 'admin',
                password: 'admin123',
                role: 'admin',
                fullName: 'Administrador del Sistema'
            });
            await admin.create();
            console.log('✅ Usuario admin creado (usuario: admin, contraseña: admin123)');
        }
        
        // Crear cajero por defecto
        const existingCashier = await User.findByUsername('cajero');
        if (!existingCashier) {
            const cashier = new User({
                username: 'cajero',
                password: 'cajero123',
                role: 'cashier',
                fullName: 'Cajero Principal'
            });
            await cashier.create();
            console.log('✅ Usuario cajero creado (usuario: cajero, contraseña: cajero123)');
        }
        
        // Crear validador por defecto
        const existingValidator = await User.findByUsername('validador');
        if (!existingValidator) {
            const validator = new User({
                username: 'validador',
                password: 'validador123',
                role: 'validator',
                fullName: 'Validador Principal'
            });
            await validator.create();
            console.log('✅ Usuario validador creado (usuario: validador, contraseña: validador123)');
        }
        
    } catch (error) {
        console.error('❌ Error creando usuarios por defecto:', error);
    }
}

async function createSampleProducts() {
    console.log('🍽️ Creando productos de ejemplo...');
    
    const sampleProducts = [
        // Platos principales
        {
            name: 'Hamburguesa Clásica',
            description: 'Hamburguesa de carne con lechuga, tomate y queso',
            price: 15000,
            category: 'Platos Principales',
            stock: 50,
            minStock: 10,
            requiresCoffeeValidation: false
        },
        {
            name: 'Pizza Margherita',
            description: 'Pizza con salsa de tomate, mozzarella y albahaca',
            price: 18000,
            category: 'Platos Principales',
            stock: 30,
            minStock: 5,
            requiresCoffeeValidation: false
        },
        {
            name: 'Ensalada César',
            description: 'Ensalada con pollo, lechuga, crutones y aderezo césar',
            price: 12000,
            category: 'Ensaladas',
            stock: 40,
            minStock: 8,
            requiresCoffeeValidation: false
        },
        
        // Bebidas
        {
            name: 'Café Americano',
            description: 'Café negro americano',
            price: 3500,
            category: 'Bebidas Calientes',
            stock: 100,
            minStock: 20,
            requiresCoffeeValidation: true
        },
        {
            name: 'Cappuccino',
            description: 'Café con leche espumosa y canela',
            price: 4500,
            category: 'Bebidas Calientes',
            stock: 80,
            minStock: 15,
            requiresCoffeeValidation: true
        },
        {
            name: 'Coca Cola',
            description: 'Bebida gaseosa 350ml',
            price: 2500,
            category: 'Bebidas Frías',
            stock: 200,
            minStock: 30,
            requiresCoffeeValidation: false
        },
        
        // Postres
        {
            name: 'Torta de Chocolate',
            description: 'Deliciosa torta de chocolate con crema',
            price: 8000,
            category: 'Postres',
            stock: 15,
            minStock: 3,
            requiresCoffeeValidation: false
        },
        {
            name: 'Helado de Vainilla',
            description: 'Helado cremoso de vainilla con salsa de chocolate',
            price: 6000,
            category: 'Postres',
            stock: 25,
            minStock: 5,
            requiresCoffeeValidation: false
        },
        
        // Menú combo con café
        {
            name: 'Combo Desayuno',
            description: 'Sandwich + Café americano + jugo de naranja',
            price: 12000,
            category: 'Combos',
            stock: 30,
            minStock: 5,
            requiresCoffeeValidation: true
        }
    ];
    
    try {
        for (const productData of sampleProducts) {
            const existingProduct = await database.get(
                'SELECT id FROM products WHERE name = ?',
                [productData.name]
            );
            
            if (!existingProduct) {
                const product = new Product(productData);
                await product.create();
                console.log(`✅ Producto creado: ${productData.name}`);
            }
        }
    } catch (error) {
        console.error('❌ Error creando productos de ejemplo:', error);
    }
}

async function createInitialConfig() {
    console.log('⚙️ Creando configuración inicial...');
    
    try {
        const existingConfig = await database.get('SELECT id FROM restaurant_config WHERE id = 1');
        
        if (!existingConfig) {
            await database.run(`
                INSERT INTO restaurant_config 
                (id, name, address, phone, email, logo, tax_rate, currency, timezone, receipt_footer, voucher_expiration_hours, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                1,
                'Mi Restaurante TPV',
                'Calle Principal #123, Ciudad',
                '+57 300 123 4567',
                'contacto@mirestaurante.com',
                '/uploads/restaurant-logo.png',
                0.19,
                'COP',
                'America/Bogota',
                'Gracias por visitarnos. ¡Esperamos verte pronto!',
                24,
                new Date().toISOString(),
                new Date().toISOString()
            ]);
            
            console.log('✅ Configuración inicial creada');
        }
    } catch (error) {
        console.error('❌ Error creando configuración inicial:', error);
    }
}

// Función para reinicializar la base de datos (eliminar y crear nueva)
async function resetDatabase() {
    console.log('🔄 Reinicializando base de datos...');
    
    const dbPath = path.join(__dirname, '../database/restaurant.db');
    
    try {
        // Cerrar conexión actual si existe
        await database.close();
        
        // Eliminar archivo de base de datos
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
            console.log('🗑️ Base de datos anterior eliminada');
        }
        
        // Reinicializar
        await initializeDatabase();
        
    } catch (error) {
        console.error('❌ Error reinicializando base de datos:', error);
        throw error;
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--reset')) {
        resetDatabase()
            .then(() => {
                console.log('🎉 Base de datos reinicializada completamente');
                process.exit(0);
            })
            .catch((error) => {
                console.error('💥 Error durante la reinicialización:', error);
                process.exit(1);
            });
    } else {
        initializeDatabase()
            .then(() => {
                console.log('🎉 Inicialización completada');
                process.exit(0);
            })
            .catch((error) => {
                console.error('💥 Error durante la inicialización:', error);
                process.exit(1);
            });
    }
}

module.exports = {
    initializeDatabase,
    resetDatabase,
    createTables,
    createDefaultUsers,
    createSampleProducts,
    createInitialConfig
};