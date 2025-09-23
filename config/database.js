const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Crear la base de datos
const dbPath = path.join(__dirname, '..', 'database', 'restaurant.db');

// Asegurar que el directorio database existe
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err.message);
    } else {
        console.log('✅ Conectado a la base de datos SQLite');
        initializeTables();
    }
});

// Función para inicializar las tablas
function initializeTables() {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'validator')),
        full_name TEXT NOT NULL,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabla de categorías de productos
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabla de productos
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category_id INTEGER,
        has_coffee BOOLEAN DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id)
    )`);

    // Tabla de ventas
    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cashier_id INTEGER NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        payment_method TEXT DEFAULT 'cash',
        status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cashier_id) REFERENCES users (id)
    )`);

    // Tabla de items de venta
    db.run(`CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id)
    )`);

    // Tabla de vales
    db.run(`CREATE TABLE IF NOT EXISTS vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        sale_id INTEGER NOT NULL,
        qr_code TEXT,
        has_coffee BOOLEAN DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'validated', 'coffee_validated', 'fully_validated')),
        food_validated_at DATETIME NULL,
        coffee_validated_at DATETIME NULL,
        food_validator_id INTEGER NULL,
        coffee_validator_id INTEGER NULL,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales (id),
        FOREIGN KEY (food_validator_id) REFERENCES users (id),
        FOREIGN KEY (coffee_validator_id) REFERENCES users (id)
    )`);

    // Tabla de movimientos de stock
    db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment')),
        quantity INTEGER NOT NULL,
        previous_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        reason TEXT,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Tabla de configuración del restaurante
    db.run(`CREATE TABLE IF NOT EXISTS restaurant_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_name TEXT DEFAULT 'Mi Restaurante',
        logo_path TEXT,
        address TEXT,
        phone TEXT,
        tax_rate DECIMAL(5,2) DEFAULT 16.00,
        voucher_expiry_hours INTEGER DEFAULT 24,
        receipt_footer TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insertar configuración por defecto
    db.get("SELECT COUNT(*) as count FROM restaurant_config", (err, row) => {
        if (!err && row.count === 0) {
            db.run(`INSERT INTO restaurant_config (restaurant_name, address, phone, receipt_footer) 
                    VALUES (?, ?, ?, ?)`, 
                    ['Mi Restaurante', 'Dirección del restaurante', '+123456789', '¡Gracias por su visita!']);
        }
    });

    // Crear usuario admin por defecto
    db.get("SELECT COUNT(*) as count FROM users WHERE username = 'admin'", (err, row) => {
        if (!err && row.count === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            
            db.run(`INSERT INTO users (username, password, role, full_name) 
                    VALUES (?, ?, ?, ?)`, 
                    ['admin', hashedPassword, 'admin', 'Administrador'], 
                    function(err) {
                        if (err) {
                            console.error('Error creando usuario admin:', err);
                        } else {
                            console.log('✅ Usuario admin creado - Usuario: admin, Contraseña: admin123');
                        }
                    });
        }
    });

    // Crear categorías por defecto
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
        if (!err && row.count === 0) {
            const defaultCategories = [
                ['Platos Principales', 'Comidas principales del menú'],
                ['Bebidas', 'Bebidas frías y calientes'],
                ['Postres', 'Postres y dulces'],
                ['Aperitivos', 'Entradas y aperitivos']
            ];

            defaultCategories.forEach(([name, description]) => {
                db.run(`INSERT INTO categories (name, description) VALUES (?, ?)`, [name, description]);
            });
            console.log('✅ Categorías por defecto creadas');
        }
    });

    console.log('✅ Base de datos inicializada correctamente');
}

// Función para cerrar la base de datos
function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                reject(err);
            } else {
                console.log('📁 Conexión a la base de datos cerrada');
                resolve();
            }
        });
    });
}

// Función para ejecutar consultas
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}

// Función para obtener un registro
function getOne(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Función para obtener múltiples registros
function getAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

module.exports = {
    db,
    runQuery,
    getOne,
    getAll,
    closeDatabase
};