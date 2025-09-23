const bcrypt = require('bcryptjs');
const { runQuery, getOne, getAll, closeDatabase } = require('../config/database');

async function initializeDatabase() {
    console.log('🔧 Inicializando base de datos...');

    try {
        // Crear usuarios adicionales de ejemplo
        await createSampleUsers();
        
        // Crear categorías adicionales
        await createSampleCategories();
        
        // Crear productos de ejemplo
        await createSampleProducts();
        
        // Crear configuración inicial
        await initializeConfig();

        console.log('✅ Base de datos inicializada exitosamente');
        console.log('\n📋 Usuarios creados:');
        console.log('   Admin: admin / admin123');
        console.log('   Cajero: cajero / cajero123');
        console.log('   Validador: validador / validador123');
        console.log('\n🚀 Puedes ejecutar: npm start');
        
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
    } finally {
        await closeDatabase();
    }
}

async function createSampleUsers() {
    console.log('👥 Creando usuarios de ejemplo...');

    const users = [
        {
            username: 'cajero',
            password: 'cajero123',
            role: 'cashier',
            full_name: 'María González - Cajera'
        },
        {
            username: 'validador',
            password: 'validador123', 
            role: 'validator',
            full_name: 'Carlos Rodríguez - Validador'
        },
        {
            username: 'validador2',
            password: 'validador123',
            role: 'validator', 
            full_name: 'Ana López - Validador Café'
        }
    ];

    for (let userData of users) {
        try {
            // Verificar si el usuario ya existe
            const existingUser = await getOne(
                'SELECT id FROM users WHERE username = ?', 
                [userData.username]
            );

            if (existingUser) {
                console.log(`   ⚠️  Usuario ${userData.username} ya existe`);
                continue;
            }

            // Crear usuario
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            await runQuery(
                'INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)',
                [userData.username, hashedPassword, userData.role, userData.full_name]
            );

            console.log(`   ✅ Usuario creado: ${userData.username} (${userData.role})`);
        } catch (error) {
            console.error(`   ❌ Error creando usuario ${userData.username}:`, error.message);
        }
    }
}

async function createSampleCategories() {
    console.log('📂 Creando categorías adicionales...');

    const categories = [
        ['Ensaladas', 'Ensaladas frescas y saludables'],
        ['Sopas', 'Sopas calientes del día'],
        ['Carnes', 'Platos de carne a la parrilla'],
        ['Pescados', 'Pescados y mariscos frescos'],
        ['Vegetarianos', 'Opciones vegetarianas y veganas'],
        ['Café y Té', 'Bebidas calientes especiales'],
        ['Jugos Naturales', 'Jugos y batidos frescos'],
        ['Helados', 'Helados artesanales']
    ];

    for (let [name, description] of categories) {
        try {
            // Verificar si la categoría ya existe
            const existing = await getOne(
                'SELECT id FROM categories WHERE name = ?',
                [name]
            );

            if (existing) {
                console.log(`   ⚠️  Categoría '${name}' ya existe`);
                continue;
            }

            await runQuery(
                'INSERT INTO categories (name, description) VALUES (?, ?)',
                [name, description]
            );

            console.log(`   ✅ Categoría creada: ${name}`);
        } catch (error) {
            console.error(`   ❌ Error creando categoría ${name}:`, error.message);
        }
    }
}

async function createSampleProducts() {
    console.log('🍽️  Creando productos de ejemplo...');

    // Obtener IDs de categorías
    const categories = await getAll('SELECT id, name FROM categories');
    const categoryMap = {};
    categories.forEach(cat => {
        categoryMap[cat.name] = cat.id;
    });

    const products = [
        // Platos Principales
        {
            name: 'Pollo Asado con Papas',
            description: 'Pollo asado al horno con papas doradas y ensalada',
            price: 15.99,
            category: 'Platos Principales',
            has_coffee: false,
            stock: 25,
            min_stock: 5
        },
        {
            name: 'Pasta Carbonara',
            description: 'Pasta con salsa carbonara, bacon y queso parmesano',
            price: 12.50,
            category: 'Platos Principales', 
            has_coffee: false,
            stock: 20,
            min_stock: 3
        },
        {
            name: 'Hamburguesa Completa',
            description: 'Hamburguesa con carne, queso, tomate, lechuga y papas fritas',
            price: 11.99,
            category: 'Platos Principales',
            has_coffee: false,
            stock: 30,
            min_stock: 5
        },

        // Platos con café incluido
        {
            name: 'Desayuno Ejecutivo',
            description: 'Huevos revueltos, bacon, tostadas y café americano',
            price: 8.99,
            category: 'Platos Principales',
            has_coffee: true,
            stock: 20,
            min_stock: 3
        },
        {
            name: 'Menú del Día + Café',
            description: 'Plato principal, postre y café incluido',
            price: 14.99,
            category: 'Platos Principales',
            has_coffee: true,
            stock: 15,
            min_stock: 2
        },

        // Bebidas
        {
            name: 'Coca Cola',
            description: 'Refresco de cola 350ml',
            price: 2.50,
            category: 'Bebidas',
            has_coffee: false,
            stock: 50,
            min_stock: 10
        },
        {
            name: 'Agua Mineral',
            description: 'Agua mineral natural 500ml',
            price: 1.50,
            category: 'Bebidas',
            has_coffee: false,
            stock: 60,
            min_stock: 15
        },
        {
            name: 'Jugo de Naranja Natural',
            description: 'Jugo de naranja recién exprimido',
            price: 3.99,
            category: 'Jugos Naturales',
            has_coffee: false,
            stock: 25,
            min_stock: 5
        },

        // Café y Té
        {
            name: 'Café Americano',
            description: 'Café negro tradicional',
            price: 2.99,
            category: 'Café y Té',
            has_coffee: false, // Este ES café, pero no "incluye" café adicional
            stock: 100,
            min_stock: 20
        },
        {
            name: 'Cappuccino',
            description: 'Café con leche espumosa y canela',
            price: 4.50,
            category: 'Café y Té',
            has_coffee: false,
            stock: 40,
            min_stock: 8
        },

        // Postres
        {
            name: 'Tiramisu',
            description: 'Postre italiano con café y mascarpone',
            price: 5.99,
            category: 'Postres',
            has_coffee: false,
            stock: 15,
            min_stock: 3
        },
        {
            name: 'Helado de Vainilla',
            description: 'Tres bolas de helado artesanal de vainilla',
            price: 4.50,
            category: 'Helados',
            has_coffee: false,
            stock: 20,
            min_stock: 5
        },

        // Ensaladas
        {
            name: 'Ensalada César',
            description: 'Lechuga romana, crutones, queso parmesano y pollo',
            price: 9.99,
            category: 'Ensaladas',
            has_coffee: false,
            stock: 18,
            min_stock: 3
        },

        // Aperitivos
        {
            name: 'Alitas de Pollo',
            description: '8 alitas de pollo con salsa BBQ',
            price: 7.99,
            category: 'Aperitivos',
            has_coffee: false,
            stock: 25,
            min_stock: 5
        }
    ];

    for (let productData of products) {
        try {
            const categoryId = categoryMap[productData.category];
            if (!categoryId) {
                console.log(`   ⚠️  Categoría '${productData.category}' no encontrada para producto '${productData.name}'`);
                continue;
            }

            // Verificar si el producto ya existe
            const existing = await getOne(
                'SELECT id FROM products WHERE name = ?',
                [productData.name]
            );

            if (existing) {
                console.log(`   ⚠️  Producto '${productData.name}' ya existe`);
                continue;
            }

            await runQuery(
                `INSERT INTO products (name, description, price, category_id, has_coffee, stock_quantity, min_stock)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    productData.name,
                    productData.description,
                    productData.price,
                    categoryId,
                    productData.has_coffee ? 1 : 0,
                    productData.stock,
                    productData.min_stock
                ]
            );

            console.log(`   ✅ Producto creado: ${productData.name} ($${productData.price})`);
        } catch (error) {
            console.error(`   ❌ Error creando producto ${productData.name}:`, error.message);
        }
    }
}

async function initializeConfig() {
    console.log('⚙️  Configurando restaurante...');

    try {
        // Verificar si ya existe configuración
        const existing = await getOne('SELECT id FROM restaurant_config LIMIT 1');
        
        if (existing) {
            console.log('   ⚠️  Configuración ya existe');
            return;
        }

        await runQuery(
            `INSERT INTO restaurant_config 
             (restaurant_name, address, phone, tax_rate, voucher_expiry_hours, receipt_footer)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                'Restaurante El Buen Sabor',
                'Calle Principal 123, Ciudad',
                '+1-234-567-8900',
                16.00, // 16% IVA
                24, // Los vales expiran en 24 horas
                '¡Gracias por visitarnos! Esperamos verte pronto.'
            ]
        );

        console.log('   ✅ Configuración inicial creada');
    } catch (error) {
        console.error('   ❌ Error creando configuración:', error.message);
    }
}

// Función para limpiar base de datos (útil para testing)
async function cleanDatabase() {
    console.log('🧹 Limpiando base de datos...');

    try {
        await runQuery('DELETE FROM vouchers');
        await runQuery('DELETE FROM sale_items');
        await runQuery('DELETE FROM sales');
        await runQuery('DELETE FROM stock_movements');
        await runQuery('DELETE FROM products WHERE id > 0'); // Mantener estructura
        await runQuery('DELETE FROM categories WHERE id > 0');
        await runQuery('DELETE FROM users WHERE username != "admin"'); // Mantener admin
        await runQuery('DELETE FROM restaurant_config WHERE id > 0');
        
        console.log('✅ Base de datos limpiada');
    } catch (error) {
        console.error('❌ Error limpiando base de datos:', error);
    }
}

// Función para crear datos de prueba (ventas y vales)
async function createTestData() {
    console.log('🧪 Creando datos de prueba...');

    try {
        // Obtener usuarios
        const admin = await getOne("SELECT id FROM users WHERE username = 'admin'");
        const cajero = await getOne("SELECT id FROM users WHERE username = 'cajero'");
        
        if (!admin || !cajero) {
            console.log('   ⚠️  Usuarios necesarios no encontrados');
            return;
        }

        // Crear algunas ventas de ejemplo
        const products = await getAll('SELECT id, price FROM products LIMIT 5');
        
        if (products.length === 0) {
            console.log('   ⚠️  No hay productos para crear ventas de prueba');
            return;
        }

        // Crear venta 1
        const sale1Result = await runQuery(
            'INSERT INTO sales (cashier_id, total_amount, tax_amount, status) VALUES (?, ?, ?, ?)',
            [cajero.id, 25.50, 4.08, 'completed']
        );

        await runQuery(
            'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)',
            [sale1Result.id, products[0].id, 2, products[0].price, products[0].price * 2]
        );

        // Crear vale para la venta 1
        const voucherCode = `TEST${Date.now().toString().slice(-6)}`;
        await runQuery(
            'INSERT INTO vouchers (code, sale_id, has_coffee, status, expires_at) VALUES (?, ?, ?, ?, datetime("now", "+24 hours"))',
            [voucherCode, sale1Result.id, 0, 'pending']
        );

        console.log(`   ✅ Venta de prueba creada con vale: ${voucherCode}`);

    } catch (error) {
        console.error('   ❌ Error creando datos de prueba:', error.message);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--clean')) {
        cleanDatabase().then(() => process.exit(0));
    } else if (args.includes('--test-data')) {
        createTestData().then(() => process.exit(0));
    } else {
        initializeDatabase().then(() => process.exit(0));
    }
}

module.exports = {
    initializeDatabase,
    cleanDatabase,
    createTestData,
    createSampleUsers,
    createSampleCategories,
    createSampleProducts,
    initializeConfig
};