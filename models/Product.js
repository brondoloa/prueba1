const database = require('../config/database');

class Product {
    constructor(data = {}) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.price = data.price;
        this.category = data.category;
        this.stock = data.stock || 0;
        this.minStock = data.minStock || 5;
        this.active = data.active !== undefined ? data.active : true;
        this.requiresCoffeeValidation = data.requiresCoffeeValidation || false;
        this.image = data.image;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    // Crear producto
    async create() {
        try {
            const currentTime = new Date().toISOString();
            
            const result = await database.run(
                `INSERT INTO products (name, description, price, category, stock, min_stock, active, requires_coffee_validation, image, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    this.name,
                    this.description,
                    this.price,
                    this.category,
                    this.stock,
                    this.minStock,
                    this.active,
                    this.requiresCoffeeValidation,
                    this.image,
                    currentTime,
                    currentTime
                ]
            );
            
            this.id = result.id;
            this.createdAt = currentTime;
            this.updatedAt = currentTime;
            return this;
        } catch (error) {
            throw new Error(`Error al crear producto: ${error.message}`);
        }
    }

    // Actualizar producto
    async update() {
        try {
            const currentTime = new Date().toISOString();
            
            await database.run(
                `UPDATE products SET 
                 name = ?, description = ?, price = ?, category = ?, 
                 stock = ?, min_stock = ?, active = ?, requires_coffee_validation = ?,
                 image = ?, updated_at = ?
                 WHERE id = ?`,
                [
                    this.name,
                    this.description,
                    this.price,
                    this.category,
                    this.stock,
                    this.minStock,
                    this.active,
                    this.requiresCoffeeValidation,
                    this.image,
                    currentTime,
                    this.id
                ]
            );
            
            this.updatedAt = currentTime;
            return this;
        } catch (error) {
            throw new Error(`Error al actualizar producto: ${error.message}`);
        }
    }

    // Eliminar producto (soft delete)
    async delete() {
        try {
            await database.run(
                'UPDATE products SET active = 0, updated_at = ? WHERE id = ?',
                [new Date().toISOString(), this.id]
            );
            return true;
        } catch (error) {
            throw new Error(`Error al eliminar producto: ${error.message}`);
        }
    }

    // Actualizar stock
    async updateStock(quantity, operation = 'subtract') {
        try {
            let newStock;
            if (operation === 'add') {
                newStock = this.stock + quantity;
            } else {
                newStock = this.stock - quantity;
                if (newStock < 0) {
                    throw new Error('Stock insuficiente');
                }
            }

            await database.run(
                'UPDATE products SET stock = ?, updated_at = ? WHERE id = ?',
                [newStock, new Date().toISOString(), this.id]
            );
            
            this.stock = newStock;
            return this;
        } catch (error) {
            throw new Error(`Error al actualizar stock: ${error.message}`);
        }
    }

    // Verificar si hay stock suficiente
    hasStock(quantity) {
        return this.stock >= quantity;
    }

    // Verificar si está por debajo del stock mínimo
    isLowStock() {
        return this.stock <= this.minStock;
    }

    // Métodos estáticos
    static async findById(id) {
        try {
            const row = await database.get('SELECT * FROM products WHERE id = ?', [id]);
            return row ? new Product(row) : null;
        } catch (error) {
            throw new Error(`Error al buscar producto por ID: ${error.message}`);
        }
    }

    static async findAll(activeOnly = true) {
        try {
            let sql = 'SELECT * FROM products';
            if (activeOnly) {
                sql += ' WHERE active = 1';
            }
            sql += ' ORDER BY category, name';
            
            const rows = await database.all(sql);
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error al obtener productos: ${error.message}`);
        }
    }

    static async findByCategory(category, activeOnly = true) {
        try {
            let sql = 'SELECT * FROM products WHERE category = ?';
            let params = [category];
            
            if (activeOnly) {
                sql += ' AND active = 1';
            }
            sql += ' ORDER BY name';
            
            const rows = await database.all(sql, params);
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error al buscar productos por categoría: ${error.message}`);
        }
    }

    static async findLowStock() {
        try {
            const rows = await database.all(
                'SELECT * FROM products WHERE stock <= min_stock AND active = 1 ORDER BY stock ASC'
            );
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error al buscar productos con stock bajo: ${error.message}`);
        }
    }

    static async getCategories() {
        try {
            const rows = await database.all(
                'SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category'
            );
            return rows.map(row => row.category);
        } catch (error) {
            throw new Error(`Error al obtener categorías: ${error.message}`);
        }
    }

    static async search(term, category = null) {
        try {
            let sql = `SELECT * FROM products WHERE active = 1 AND (name LIKE ? OR description LIKE ?)`;
            let params = [`%${term}%`, `%${term}%`];
            
            if (category) {
                sql += ' AND category = ?';
                params.push(category);
            }
            
            sql += ' ORDER BY name';
            
            const rows = await database.all(sql, params);
            return rows.map(row => new Product(row));
        } catch (error) {
            throw new Error(`Error al buscar productos: ${error.message}`);
        }
    }

    // Convertir a objeto JSON
    toJSON() {
        return { ...this };
    }
}

module.exports = Product;