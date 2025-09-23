const { runQuery, getOne, getAll } = require('../config/database');
const Product = require('./Product');

class Sale {
    constructor(data) {
        this.id = data.id;
        this.cashier_id = data.cashier_id;
        this.cashier_name = data.cashier_name;
        this.total_amount = data.total_amount;
        this.tax_amount = data.tax_amount;
        this.discount_amount = data.discount_amount;
        this.payment_method = data.payment_method;
        this.status = data.status;
        this.created_at = data.created_at;
        this.items = data.items || [];
    }

    // Crear nueva venta
    static async create(saleData) {
        try {
            const { 
                cashier_id, 
                items, 
                payment_method = 'cash', 
                discount_amount = 0 
            } = saleData;

            if (!cashier_id || !items || items.length === 0) {
                throw new Error('Cajero y productos son requeridos');
            }

            // Obtener configuración de impuestos
            const config = await getOne('SELECT tax_rate FROM restaurant_config ORDER BY id DESC LIMIT 1');
            const taxRate = config ? config.tax_rate : 16.00;

            // Calcular totales
            let subtotal = 0;
            const processedItems = [];

            // Validar items y calcular subtotal
            for (let item of items) {
                const product = await Product.findById(item.product_id);
                if (!product) {
                    throw new Error(`Producto con ID ${item.product_id} no encontrado`);
                }

                if (!product.isAvailable()) {
                    throw new Error(`Producto "${product.name}" no disponible`);
                }

                if (product.stock_quantity < item.quantity) {
                    throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock_quantity}`);
                }

                const itemTotal = product.price * item.quantity;
                subtotal += itemTotal;

                processedItems.push({
                    product_id: product.id,
                    product_name: product.name,
                    quantity: item.quantity,
                    unit_price: product.price,
                    total_price: itemTotal,
                    has_coffee: product.has_coffee
                });
            }

            // Aplicar descuento
            const discountedSubtotal = subtotal - (discount_amount || 0);
            if (discountedSubtotal < 0) {
                throw new Error('El descuento no puede ser mayor al subtotal');
            }

            // Calcular impuestos
            const taxAmount = (discountedSubtotal * taxRate) / 100;
            const totalAmount = discountedSubtotal + taxAmount;

            // Crear la venta
            const saleResult = await runQuery(
                `INSERT INTO sales (cashier_id, total_amount, tax_amount, discount_amount, payment_method, status) 
                 VALUES (?, ?, ?, ?, ?, 'completed')`,
                [cashier_id, totalAmount.toFixed(2), taxAmount.toFixed(2), discount_amount || 0, payment_method]
            );

            const saleId = saleResult.id;

            // Agregar items a la venta
            for (let item of processedItems) {
                await runQuery(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [saleId, item.product_id, item.quantity, item.unit_price, item.total_price]
                );

                // Reducir stock
                await Product.reduceStock(item.product_id, item.quantity, cashier_id);
            }

            return await Sale.findById(saleId);
        } catch (error) {
            throw new Error(`Error creando venta: ${error.message}`);
        }
    }

    // Buscar venta por ID con items
    static async findById(id) {
        try {
            const saleRow = await getOne(
                `SELECT s.*, u.full_name as cashier_name 
                 FROM sales s 
                 LEFT JOIN users u ON s.cashier_id = u.id 
                 WHERE s.id = ?`, 
                [id]
            );

            if (!saleRow) {
                return null;
            }

            // Obtener items de la venta
            const itemRows = await getAll(
                `SELECT si.*, p.name as product_name, p.has_coffee 
                 FROM sale_items si 
                 LEFT JOIN products p ON si.product_id = p.id 
                 WHERE si.sale_id = ?`,
                [id]
            );

            const sale = new Sale(saleRow);
            sale.items = itemRows;
            
            return sale;
        } catch (error) {
            throw new Error(`Error buscando venta: ${error.message}`);
        }
    }

    // Obtener todas las ventas
    static async findAll(limit = 100, offset = 0) {
        try {
            const rows = await getAll(
                `SELECT s.*, u.full_name as cashier_name 
                 FROM sales s 
                 LEFT JOIN users u ON s.cashier_id = u.id 
                 ORDER BY s.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            return rows.map(row => new Sale(row));
        } catch (error) {
            throw new Error(`Error obteniendo ventas: ${error.message}`);
        }
    }

    // Obtener ventas por cajero
    static async findByCashier(cashier_id, limit = 100, offset = 0) {
        try {
            const rows = await getAll(
                `SELECT s.*, u.full_name as cashier_name 
                 FROM sales s 
                 LEFT JOIN users u ON s.cashier_id = u.id 
                 WHERE s.cashier_id = ? 
                 ORDER BY s.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [cashier_id, limit, offset]
            );
            return rows.map(row => new Sale(row));
        } catch (error) {
            throw new Error(`Error obteniendo ventas por cajero: ${error.message}`);
        }
    }

    // Obtener ventas por fecha
    static async findByDateRange(startDate, endDate, limit = 100, offset = 0) {
        try {
            const rows = await getAll(
                `SELECT s.*, u.full_name as cashier_name 
                 FROM sales s 
                 LEFT JOIN users u ON s.cashier_id = u.id 
                 WHERE DATE(s.created_at) BETWEEN ? AND ? 
                 ORDER BY s.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [startDate, endDate, limit, offset]
            );
            return rows.map(row => new Sale(row));
        } catch (error) {
            throw new Error(`Error obteniendo ventas por fecha: ${error.message}`);
        }
    }

    // Obtener ventas de hoy
    static async findToday() {
        try {
            const rows = await getAll(
                `SELECT s.*, u.full_name as cashier_name 
                 FROM sales s 
                 LEFT JOIN users u ON s.cashier_id = u.id 
                 WHERE DATE(s.created_at) = DATE('now') 
                 ORDER BY s.created_at DESC`
            );
            return rows.map(row => new Sale(row));
        } catch (error) {
            throw new Error(`Error obteniendo ventas de hoy: ${error.message}`);
        }
    }

    // Cancelar venta
    static async cancel(id, reason = '') {
        try {
            const sale = await Sale.findById(id);
            if (!sale) {
                throw new Error('Venta no encontrada');
            }

            if (sale.status === 'cancelled') {
                throw new Error('La venta ya está cancelada');
            }

            // Marcar venta como cancelada
            await runQuery(
                'UPDATE sales SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['cancelled', id]
            );

            // Devolver stock de los productos
            for (let item of sale.items) {
                const product = await Product.findById(item.product_id);
                if (product) {
                    const newStock = product.stock_quantity + item.quantity;
                    await Product.updateStock(
                        item.product_id,
                        newStock,
                        'in',
                        `Cancelación de venta #${id} - ${reason}`,
                        null
                    );
                }
            }

            return await Sale.findById(id);
        } catch (error) {
            throw new Error(`Error cancelando venta: ${error.message}`);
        }
    }

    // Obtener estadísticas de ventas
    static async getStats(startDate = null, endDate = null) {
        try {
            let dateFilter = '';
            let params = [];

            if (startDate && endDate) {
                dateFilter = 'WHERE DATE(s.created_at) BETWEEN ? AND ?';
                params = [startDate, endDate];
            } else if (startDate) {
                dateFilter = 'WHERE DATE(s.created_at) >= ?';
                params = [startDate];
            } else if (endDate) {
                dateFilter = 'WHERE DATE(s.created_at) <= ?';
                params = [endDate];
            }

            // Estadísticas generales
            const generalStats = await getOne(
                `SELECT 
                    COUNT(*) as total_sales,
                    SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END) as total_revenue,
                    AVG(CASE WHEN status = 'completed' THEN total_amount ELSE NULL END) as avg_sale_amount,
                    SUM(CASE WHEN status = 'completed' THEN tax_amount ELSE 0 END) as total_tax,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_sales
                 FROM sales s ${dateFilter}`,
                params
            );

            // Ventas por método de pago
            const paymentMethodStats = await getAll(
                `SELECT 
                    payment_method,
                    COUNT(*) as count,
                    SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END) as total_amount
                 FROM sales s ${dateFilter} 
                 GROUP BY payment_method
                 ORDER BY total_amount DESC`,
                params
            );

            // Productos más vendidos
            const topProductsQuery = dateFilter 
                ? `SELECT p.name, SUM(si.quantity) as total_sold, SUM(si.total_price) as total_revenue
                   FROM sale_items si 
                   JOIN products p ON si.product_id = p.id
                   JOIN sales s ON si.sale_id = s.id
                   ${dateFilter} AND s.status = 'completed'
                   GROUP BY p.id, p.name 
                   ORDER BY total_sold DESC 
                   LIMIT 10`
                : `SELECT p.name, SUM(si.quantity) as total_sold, SUM(si.total_price) as total_revenue
                   FROM sale_items si 
                   JOIN products p ON si.product_id = p.id
                   JOIN sales s ON si.sale_id = s.id
                   WHERE s.status = 'completed'
                   GROUP BY p.id, p.name 
                   ORDER BY total_sold DESC 
                   LIMIT 10`;

            const topProducts = await getAll(topProductsQuery, params);

            return {
                general: generalStats,
                payment_methods: paymentMethodStats,
                top_products: topProducts
            };
        } catch (error) {
            throw new Error(`Error obteniendo estadísticas: ${error.message}`);
        }
    }

    // Verificar si la venta tiene productos con café
    hasCoffeeProducts() {
        return this.items.some(item => item.has_coffee);
    }

    // Obtener resumen de la venta
    getSummary() {
        const subtotal = this.total_amount - this.tax_amount;
        const subtotalWithDiscount = subtotal + (this.discount_amount || 0);
        
        return {
            id: this.id,
            subtotal: subtotalWithDiscount.toFixed(2),
            discount: (this.discount_amount || 0).toFixed(2),
            subtotal_after_discount: subtotal.toFixed(2),
            tax: (this.tax_amount || 0).toFixed(2),
            total: this.total_amount,
            payment_method: this.payment_method,
            status: this.status,
            items_count: this.items.length,
            has_coffee: this.hasCoffeeProducts(),
            created_at: this.created_at
        };
    }
}

module.exports = Sale;