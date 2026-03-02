const database = require('../config/database');
const Product = require('./Product');

class Sale {
    constructor(data = {}) {
        this.id = data.id;
        this.saleNumber = data.saleNumber;
        this.cashierId = data.cashierId;
        this.items = data.items || [];
        this.subtotal = data.subtotal || 0;
        this.tax = data.tax || 0;
        this.discount = data.discount || 0;
        this.total = data.total || 0;
        this.paymentMethod = data.paymentMethod || 'cash';
        this.status = data.status || 'completed';
        this.notes = data.notes;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    // Crear venta
    async create() {
        const db = database.getConnection();
        
        return new Promise((resolve, reject) => {
            db.serialize(async () => {
                db.run('BEGIN TRANSACTION');
                
                try {
                    const currentTime = new Date().toISOString();
                    const saleNumber = await this.generateSaleNumber();
                    
                    // Crear la venta
                    const saleResult = await database.run(
                        `INSERT INTO sales (sale_number, cashier_id, subtotal, tax, discount, total, payment_method, status, notes, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            saleNumber,
                            this.cashierId,
                            this.subtotal,
                            this.tax,
                            this.discount,
                            this.total,
                            this.paymentMethod,
                            this.status,
                            this.notes,
                            currentTime,
                            currentTime
                        ]
                    );
                    
                    this.id = saleResult.id;
                    this.saleNumber = saleNumber;
                    this.createdAt = currentTime;
                    this.updatedAt = currentTime;
                    
                    // Crear los items de la venta y actualizar stock
                    for (const item of this.items) {
                        await database.run(
                            `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
                             VALUES (?, ?, ?, ?, ?)`,
                            [this.id, item.productId, item.quantity, item.unitPrice, item.totalPrice]
                        );
                        
                        // Actualizar stock del producto
                        const product = await Product.findById(item.productId);
                        if (product) {
                            await product.updateStock(item.quantity, 'subtract');
                        }
                    }
                    
                    db.run('COMMIT');
                    resolve(this);
                } catch (error) {
                    db.run('ROLLBACK');
                    reject(new Error(`Error al crear venta: ${error.message}`));
                }
            });
        });
    }

    // Generar número de venta único
    async generateSaleNumber() {
        const today = new Date();
        const dateStr = today.getFullYear().toString() + 
                       (today.getMonth() + 1).toString().padStart(2, '0') + 
                       today.getDate().toString().padStart(2, '0');
        
        const lastSale = await database.get(
            'SELECT sale_number FROM sales WHERE sale_number LIKE ? ORDER BY id DESC LIMIT 1',
            [`${dateStr}%`]
        );
        
        let sequence = 1;
        if (lastSale) {
            const lastSequence = parseInt(lastSale.sale_number.slice(-4));
            sequence = lastSequence + 1;
        }
        
        return `${dateStr}${sequence.toString().padStart(4, '0')}`;
    }

    // Calcular totales
    calculateTotals(taxRate = 0.19) {
        this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
        this.tax = this.subtotal * taxRate;
        this.total = this.subtotal + this.tax - this.discount;
        
        // Redondear a 2 decimales
        this.subtotal = Math.round(this.subtotal * 100) / 100;
        this.tax = Math.round(this.tax * 100) / 100;
        this.total = Math.round(this.total * 100) / 100;
    }

    // Agregar item a la venta
    addItem(productId, quantity, unitPrice) {
        const existingItem = this.items.find(item => item.productId === productId);
        
        if (existingItem) {
            existingItem.quantity += quantity;
            existingItem.totalPrice = existingItem.quantity * existingItem.unitPrice;
        } else {
            this.items.push({
                productId,
                quantity,
                unitPrice,
                totalPrice: quantity * unitPrice
            });
        }
        
        this.calculateTotals();
    }

    // Remover item de la venta
    removeItem(productId) {
        this.items = this.items.filter(item => item.productId !== productId);
        this.calculateTotals();
    }

    // Actualizar cantidad de un item
    updateItemQuantity(productId, quantity) {
        const item = this.items.find(item => item.productId === productId);
        if (item) {
            if (quantity <= 0) {
                this.removeItem(productId);
            } else {
                item.quantity = quantity;
                item.totalPrice = quantity * item.unitPrice;
                this.calculateTotals();
            }
        }
    }

    // Métodos estáticos
    static async findById(id) {
        try {
            const sale = await database.get('SELECT * FROM sales WHERE id = ?', [id]);
            if (!sale) return null;
            
            const saleObj = new Sale(sale);
            
            // Cargar items de la venta
            const items = await database.all(
                `SELECT si.*, p.name as product_name 
                 FROM sale_items si 
                 JOIN products p ON si.product_id = p.id 
                 WHERE si.sale_id = ?`,
                [id]
            );
            
            saleObj.items = items;
            return saleObj;
        } catch (error) {
            throw new Error(`Error al buscar venta por ID: ${error.message}`);
        }
    }

    static async findAll(limit = 100, offset = 0) {
        try {
            const sales = await database.all(
                `SELECT s.*, u.username as cashier_name 
                 FROM sales s 
                 JOIN users u ON s.cashier_id = u.id 
                 ORDER BY s.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            
            return sales.map(sale => new Sale(sale));
        } catch (error) {
            throw new Error(`Error al obtener ventas: ${error.message}`);
        }
    }

    static async findByDateRange(startDate, endDate) {
        try {
            const sales = await database.all(
                `SELECT s.*, u.username as cashier_name 
                 FROM sales s 
                 JOIN users u ON s.cashier_id = u.id 
                 WHERE DATE(s.created_at) BETWEEN ? AND ? 
                 ORDER BY s.created_at DESC`,
                [startDate, endDate]
            );
            
            return sales.map(sale => new Sale(sale));
        } catch (error) {
            throw new Error(`Error al buscar ventas por fecha: ${error.message}`);
        }
    }

    static async getTodaySales() {
        const today = new Date().toISOString().split('T')[0];
        return await Sale.findByDateRange(today, today);
    }

    static async getSalesStats(startDate, endDate) {
        try {
            const stats = await database.get(
                `SELECT 
                 COUNT(*) as total_sales,
                 SUM(total) as total_revenue,
                 AVG(total) as average_sale,
                 SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_sales,
                 SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_sales
                 FROM sales 
                 WHERE DATE(created_at) BETWEEN ? AND ?`,
                [startDate, endDate]
            );
            
            return stats;
        } catch (error) {
            throw new Error(`Error al obtener estadísticas de ventas: ${error.message}`);
        }
    }

    static async getBestSellingProducts(startDate, endDate, limit = 10) {
        try {
            const products = await database.all(
                `SELECT 
                 p.name,
                 p.category,
                 SUM(si.quantity) as total_quantity,
                 SUM(si.total_price) as total_revenue
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.id
                 JOIN sales s ON si.sale_id = s.id
                 WHERE DATE(s.created_at) BETWEEN ? AND ?
                 GROUP BY p.id, p.name, p.category
                 ORDER BY total_quantity DESC
                 LIMIT ?`,
                [startDate, endDate, limit]
            );
            
            return products;
        } catch (error) {
            throw new Error(`Error al obtener productos más vendidos: ${error.message}`);
        }
    }

    // Convertir a objeto JSON
    toJSON() {
        return { ...this };
    }
}

module.exports = Sale;