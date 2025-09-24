const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Voucher {
    constructor(data = {}) {
        this.id = data.id;
        this.code = data.code;
        this.saleId = data.saleId;
        this.items = data.items || [];
        this.requiresCoffeeValidation = data.requiresCoffeeValidation || false;
        this.isValidated = data.isValidated || false;
        this.isCoffeeValidated = data.isCoffeeValidated || false;
        this.validatedBy = data.validatedBy;
        this.validatedAt = data.validatedAt;
        this.coffeeValidatedBy = data.coffeeValidatedBy;
        this.coffeeValidatedAt = data.coffeeValidatedAt;
        this.status = data.status || 'active'; // active, validated, expired
        this.expiresAt = data.expiresAt;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    // Crear voucher
    async create() {
        try {
            const currentTime = new Date().toISOString();
            const expirationTime = new Date();
            expirationTime.setHours(expirationTime.getHours() + 24); // Expira en 24 horas
            
            // Generar código único
            this.code = this.generateUniqueCode();
            
            const result = await database.run(
                `INSERT INTO vouchers (code, sale_id, requires_coffee_validation, is_validated, is_coffee_validated, 
                 status, expires_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    this.code,
                    this.saleId,
                    this.requiresCoffeeValidation,
                    this.isValidated,
                    this.isCoffeeValidated,
                    this.status,
                    expirationTime.toISOString(),
                    currentTime,
                    currentTime
                ]
            );
            
            this.id = result.id;
            this.expiresAt = expirationTime.toISOString();
            this.createdAt = currentTime;
            this.updatedAt = currentTime;
            
            // Crear items del voucher
            for (const item of this.items) {
                await database.run(
                    `INSERT INTO voucher_items (voucher_id, product_id, product_name, quantity, requires_coffee_validation)
                     VALUES (?, ?, ?, ?, ?)`,
                    [this.id, item.productId, item.productName, item.quantity, item.requiresCoffeeValidation]
                );
            }
            
            return this;
        } catch (error) {
            throw new Error(`Error al crear voucher: ${error.message}`);
        }
    }

    // Generar código único de 8 caracteres
    generateUniqueCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres confusos como I, O, 0, 1
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Validar voucher principal
    async validate(validatorId) {
        try {
            if (this.isValidated) {
                throw new Error('El voucher ya ha sido validado');
            }

            if (this.isExpired()) {
                throw new Error('El voucher ha expirado');
            }

            const currentTime = new Date().toISOString();
            
            await database.run(
                'UPDATE vouchers SET is_validated = 1, validated_by = ?, validated_at = ?, status = ?, updated_at = ? WHERE id = ?',
                [validatorId, currentTime, 'validated', currentTime, this.id]
            );
            
            this.isValidated = true;
            this.validatedBy = validatorId;
            this.validatedAt = currentTime;
            this.status = 'validated';
            this.updatedAt = currentTime;
            
            return this;
        } catch (error) {
            throw new Error(`Error al validar voucher: ${error.message}`);
        }
    }

    // Validar parte del café
    async validateCoffee(validatorId) {
        try {
            if (!this.requiresCoffeeValidation) {
                throw new Error('Este voucher no requiere validación de café');
            }

            if (!this.isValidated) {
                throw new Error('El voucher debe ser validado primero');
            }

            if (this.isCoffeeValidated) {
                throw new Error('El café ya ha sido validado');
            }

            if (this.isExpired()) {
                throw new Error('El voucher ha expirado');
            }

            const currentTime = new Date().toISOString();
            
            await database.run(
                'UPDATE vouchers SET is_coffee_validated = 1, coffee_validated_by = ?, coffee_validated_at = ?, updated_at = ? WHERE id = ?',
                [validatorId, currentTime, currentTime, this.id]
            );
            
            this.isCoffeeValidated = true;
            this.coffeeValidatedBy = validatorId;
            this.coffeeValidatedAt = currentTime;
            this.updatedAt = currentTime;
            
            return this;
        } catch (error) {
            throw new Error(`Error al validar café: ${error.message}`);
        }
    }

    // Verificar si el voucher ha expirado
    isExpired() {
        return new Date() > new Date(this.expiresAt);
    }

    // Verificar si está completamente validado
    isCompletelyValidated() {
        if (this.requiresCoffeeValidation) {
            return this.isValidated && this.isCoffeeValidated;
        }
        return this.isValidated;
    }

    // Obtener estado del voucher
    getValidationStatus() {
        if (this.isExpired()) {
            return 'expired';
        }
        
        if (this.requiresCoffeeValidation) {
            if (this.isValidated && this.isCoffeeValidated) {
                return 'fully_validated';
            } else if (this.isValidated) {
                return 'partially_validated';
            } else {
                return 'pending';
            }
        } else {
            return this.isValidated ? 'validated' : 'pending';
        }
    }

    // Métodos estáticos
    static async findByCode(code) {
        try {
            const voucher = await database.get('SELECT * FROM vouchers WHERE code = ?', [code]);
            if (!voucher) return null;
            
            const voucherObj = new Voucher(voucher);
            
            // Cargar items del voucher
            const items = await database.all(
                'SELECT * FROM voucher_items WHERE voucher_id = ?',
                [voucher.id]
            );
            
            voucherObj.items = items;
            return voucherObj;
        } catch (error) {
            throw new Error(`Error al buscar voucher por código: ${error.message}`);
        }
    }

    static async findById(id) {
        try {
            const voucher = await database.get('SELECT * FROM vouchers WHERE id = ?', [id]);
            if (!voucher) return null;
            
            const voucherObj = new Voucher(voucher);
            
            // Cargar items del voucher
            const items = await database.all(
                'SELECT * FROM voucher_items WHERE voucher_id = ?',
                [id]
            );
            
            voucherObj.items = items;
            return voucherObj;
        } catch (error) {
            throw new Error(`Error al buscar voucher por ID: ${error.message}`);
        }
    }

    static async findBySaleId(saleId) {
        try {
            const vouchers = await database.all('SELECT * FROM vouchers WHERE sale_id = ?', [saleId]);
            
            const voucherObjs = [];
            for (const voucher of vouchers) {
                const voucherObj = new Voucher(voucher);
                
                // Cargar items del voucher
                const items = await database.all(
                    'SELECT * FROM voucher_items WHERE voucher_id = ?',
                    [voucher.id]
                );
                
                voucherObj.items = items;
                voucherObjs.push(voucherObj);
            }
            
            return voucherObjs;
        } catch (error) {
            throw new Error(`Error al buscar vouchers por venta: ${error.message}`);
        }
    }

    static async findAll(limit = 100, offset = 0) {
        try {
            const vouchers = await database.all(
                `SELECT v.*, s.sale_number 
                 FROM vouchers v 
                 JOIN sales s ON v.sale_id = s.id 
                 ORDER BY v.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            
            return vouchers.map(voucher => new Voucher(voucher));
        } catch (error) {
            throw new Error(`Error al obtener vouchers: ${error.message}`);
        }
    }

    static async findPendingValidation() {
        try {
            const vouchers = await database.all(
                `SELECT v.*, s.sale_number 
                 FROM vouchers v 
                 JOIN sales s ON v.sale_id = s.id 
                 WHERE v.is_validated = 0 AND v.status = 'active' AND datetime(v.expires_at) > datetime('now')
                 ORDER BY v.created_at ASC`
            );
            
            return vouchers.map(voucher => new Voucher(voucher));
        } catch (error) {
            throw new Error(`Error al obtener vouchers pendientes: ${error.message}`);
        }
    }

    static async findPendingCoffeeValidation() {
        try {
            const vouchers = await database.all(
                `SELECT v.*, s.sale_number 
                 FROM vouchers v 
                 JOIN sales s ON v.sale_id = s.id 
                 WHERE v.is_validated = 1 AND v.requires_coffee_validation = 1 AND v.is_coffee_validated = 0 
                 AND datetime(v.expires_at) > datetime('now')
                 ORDER BY v.created_at ASC`
            );
            
            return vouchers.map(voucher => new Voucher(voucher));
        } catch (error) {
            throw new Error(`Error al obtener vouchers pendientes de café: ${error.message}`);
        }
    }

    static async getValidationStats(startDate, endDate) {
        try {
            const stats = await database.get(
                `SELECT 
                 COUNT(*) as total_vouchers,
                 SUM(CASE WHEN is_validated = 1 THEN 1 ELSE 0 END) as validated_vouchers,
                 SUM(CASE WHEN requires_coffee_validation = 1 AND is_coffee_validated = 1 THEN 1 ELSE 0 END) as coffee_validated,
                 SUM(CASE WHEN datetime(expires_at) < datetime('now') AND is_validated = 0 THEN 1 ELSE 0 END) as expired_vouchers
                 FROM vouchers 
                 WHERE DATE(created_at) BETWEEN ? AND ?`,
                [startDate, endDate]
            );
            
            return stats;
        } catch (error) {
            throw new Error(`Error al obtener estadísticas de vouchers: ${error.message}`);
        }
    }

    // Convertir a objeto JSON
    toJSON() {
        return { ...this };
    }
}

module.exports = Voucher;