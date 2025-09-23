const { runQuery, getOne, getAll } = require('../config/database');

class Product {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.price = data.price;
        this.category_id = data.category_id;
        this.category_name = data.category_name;
        this.has_coffee = data.has_coffee;
        this.stock_quantity = data.stock_quantity;
        this.min_stock = data.min_stock;
        this.active = data.active;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    // Crear nuevo producto
    static async create(productData) {
        try {
            const { 
                name, 
                description, 
                price, 
                category_id, 
                has_coffee = false, 
                stock_quantity = 0, 
                min_stock = 0 
            } = productData;

            // Validar datos requeridos
            if (!name || !price || !category_id) {
                throw new Error('Nombre, precio y categoría son requeridos');
            }

            if (price < 0) {
                throw new Error('El precio no puede ser negativo');
            }

            if (stock_quantity < 0 || min_stock < 0) {
                throw new Error('Las cantidades de stock no pueden ser negativas');
            }

            // Verificar que la categoría existe
            const categoryExists = await getOne(
                'SELECT id FROM categories WHERE id = ? AND active = 1',
                [category_id]
            );

            if (!categoryExists) {
                throw new Error('Categoría no válida');
            }

            const result = await runQuery(
                `INSERT INTO products (name, description, price, category_id, has_coffee, stock_quantity, min_stock) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, description, price, category_id, has_coffee ? 1 : 0, stock_quantity, min_stock]
            );

            return await Product.findById(result.id);
        } catch (error) {
            throw new Error(`Error creando producto: ${error.message}`);
        }
    }

    // Buscar producto por ID
    static async findById(id) {
        try {
            const row = await getOne(
                `SELECT p.*, c.name as category_name 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.id = ? AND p.active = 1`, 
                [id]
            );
            return row ? new Product(row) : null;
        } catch (error) {
            throw new Error(`Error buscando producto: ${error.message}`);
        }
    }

    // Obtener todos los productos
    static async findAll() {
        try {
            const rows = await getAll(
                `SELECT p.*, c.name as category_name 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.active = 1 
                 ORDER BY c.name, p.name`
            );
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error obteniendo productos: ${error.message}`);
        }
    }

    // Obtener productos por categoría
    static async findByCategory(category_id) {
        try {
            const rows = await getAll(
                `SELECT p.*, c.name as category_name 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.category_id = ? AND p.active = 1 
                 ORDER BY p.name`,
                [category_id]
            );
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error obteniendo productos por categoría: ${error.message}`);
        }
    }

    // Obtener productos con stock bajo
    static async findLowStock() {
        try {
            const rows = await getAll(
                `SELECT p.*, c.name as category_name 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.stock_quantity <= p.min_stock AND p.active = 1 
                 ORDER BY p.stock_quantity ASC`
            );
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error obteniendo productos con stock bajo: ${error.message}`);
        }
    }

    // Obtener productos con café
    static async findWithCoffee() {
        try {
            const rows = await getAll(
                `SELECT p.*, c.name as category_name 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.has_coffee = 1 AND p.active = 1 
                 ORDER BY c.name, p.name`
            );
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error obteniendo productos con café: ${error.message}`);
        }
    }

    // Actualizar producto
    static async update(id, updateData) {
        try {
            const { 
                name, 
                description, 
                price, 
                category_id, 
                has_coffee, 
                stock_quantity, 
                min_stock, 
                active 
            } = updateData;

            // Verificar que el producto existe
            const existingProduct = await Product.findById(id);
            if (!existingProduct) {
                throw new Error('Producto no encontrado');
            }

            // Validar precio si se proporciona
            if (price !== undefined && price < 0) {
                throw new Error('El precio no puede ser negativo');
            }

            // Validar cantidades de stock si se proporcionan
            if (stock_quantity !== undefined && stock_quantity < 0) {
                throw new Error('La cantidad de stock no puede ser negativa');
            }

            if (min_stock !== undefined && min_stock < 0) {
                throw new Error('El stock mínimo no puede ser negativo');
            }

            // Verificar categoría si se proporciona
            if (category_id) {
                const categoryExists = await getOne(
                    'SELECT id FROM categories WHERE id = ? AND active = 1',
                    [category_id]
                );
                if (!categoryExists) {
                    throw new Error('Categoría no válida');
                }
            }

            // Construir query dinámicamente
            const fields = [];
            const values = [];

            if (name) {
                fields.push('name = ?');
                values.push(name);
            }
            if (description !== undefined) {
                fields.push('description = ?');
                values.push(description);
            }
            if (price !== undefined) {
                fields.push('price = ?');
                values.push(price);
            }
            if (category_id) {
                fields.push('category_id = ?');
                values.push(category_id);
            }
            if (has_coffee !== undefined) {
                fields.push('has_coffee = ?');
                values.push(has_coffee ? 1 : 0);
            }
            if (stock_quantity !== undefined) {
                fields.push('stock_quantity = ?');
                values.push(stock_quantity);
            }
            if (min_stock !== undefined) {
                fields.push('min_stock = ?');
                values.push(min_stock);
            }
            if (typeof active !== 'undefined') {
                fields.push('active = ?');
                values.push(active ? 1 : 0);
            }

            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            await runQuery(
                `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
                values
            );

            return await Product.findById(id);
        } catch (error) {
            throw new Error(`Error actualizando producto: ${error.message}`);
        }
    }

    // Eliminar producto (soft delete)
    static async delete(id) {
        try {
            const product = await Product.findById(id);
            if (!product) {
                throw new Error('Producto no encontrado');
            }

            await runQuery(
                'UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );

            return true;
        } catch (error) {
            throw new Error(`Error eliminando producto: ${error.message}`);
        }
    }

    // Actualizar stock
    static async updateStock(id, newQuantity, movementType = 'adjustment', reason = '', userId = null) {
        try {
            const product = await Product.findById(id);
            if (!product) {
                throw new Error('Producto no encontrado');
            }

            if (newQuantity < 0) {
                throw new Error('La cantidad de stock no puede ser negativa');
            }

            const previousStock = product.stock_quantity;
            
            // Actualizar stock del producto
            await runQuery(
                'UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newQuantity, id]
            );

            // Registrar movimiento de stock
            if (userId) {
                await runQuery(
                    `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, reason, user_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id, 
                        movementType, 
                        Math.abs(newQuantity - previousStock), 
                        previousStock, 
                        newQuantity, 
                        reason, 
                        userId
                    ]
                );
            }

            return await Product.findById(id);
        } catch (error) {
            throw new Error(`Error actualizando stock: ${error.message}`);
        }
    }

    // Reducir stock (para ventas)
    static async reduceStock(id, quantity, userId) {
        try {
            const product = await Product.findById(id);
            if (!product) {
                throw new Error('Producto no encontrado');
            }

            if (quantity <= 0) {
                throw new Error('La cantidad debe ser mayor a 0');
            }

            if (product.stock_quantity < quantity) {
                throw new Error(`Stock insuficiente. Disponible: ${product.stock_quantity}`);
            }

            const newQuantity = product.stock_quantity - quantity;
            return await Product.updateStock(
                id, 
                newQuantity, 
                'out', 
                `Venta - Reducción automática`, 
                userId
            );
        } catch (error) {
            throw new Error(`Error reduciendo stock: ${error.message}`);
        }
    }

    // Verificar si el producto está disponible
    isAvailable() {
        return this.active && this.stock_quantity > 0;
    }

    // Verificar si el producto tiene stock bajo
    hasLowStock() {
        return this.stock_quantity <= this.min_stock;
    }

    // Obtener información de stock
    getStockInfo() {
        return {
            current_stock: this.stock_quantity,
            min_stock: this.min_stock,
            is_low_stock: this.hasLowStock(),
            is_available: this.isAvailable()
        };
    }
}

module.exports = Product;