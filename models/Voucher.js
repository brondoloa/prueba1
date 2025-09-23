const { runQuery, getOne, getAll } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const moment = require('moment');

class Voucher {
    constructor(data) {
        this.id = data.id;
        this.code = data.code;
        this.sale_id = data.sale_id;
        this.qr_code = data.qr_code;
        this.has_coffee = data.has_coffee;
        this.status = data.status;
        this.food_validated_at = data.food_validated_at;
        this.coffee_validated_at = data.coffee_validated_at;
        this.food_validator_id = data.food_validator_id;
        this.coffee_validator_id = data.coffee_validator_id;
        this.food_validator_name = data.food_validator_name;
        this.coffee_validator_name = data.coffee_validator_name;
        this.expires_at = data.expires_at;
        this.created_at = data.created_at;
        
        // Información adicional de la venta
        this.sale_total = data.sale_total;
        this.cashier_name = data.cashier_name;
        this.sale_items = data.sale_items || [];
    }

    // Crear nuevo vale
    static async create(saleId) {
        try {
            // Verificar que la venta existe
            const saleExists = await getOne('SELECT id FROM sales WHERE id = ? AND status = "completed"', [saleId]);
            if (!saleExists) {
                throw new Error('Venta no encontrada o no completada');
            }

            // Verificar si ya existe un vale para esta venta
            const existingVoucher = await getOne('SELECT id FROM vouchers WHERE sale_id = ?', [saleId]);
            if (existingVoucher) {
                throw new Error('Ya existe un vale para esta venta');
            }

            // Verificar si la venta contiene productos con café
            const coffeeProducts = await getOne(
                `SELECT COUNT(*) as count 
                 FROM sale_items si 
                 JOIN products p ON si.product_id = p.id 
                 WHERE si.sale_id = ? AND p.has_coffee = 1`,
                [saleId]
            );

            const hasCoffee = coffeeProducts.count > 0;

            // Generar código único
            const code = Voucher.generateCode();

            // Obtener configuración para determinar vencimiento
            const config = await getOne('SELECT voucher_expiry_hours FROM restaurant_config ORDER BY id DESC LIMIT 1');
            const expiryHours = config ? config.voucher_expiry_hours : 24;
            const expiresAt = moment().add(expiryHours, 'hours').format('YYYY-MM-DD HH:mm:ss');

            // Generar QR Code
            const qrCodeData = JSON.stringify({
                code: code,
                sale_id: saleId,
                type: 'voucher',
                created_at: new Date().toISOString()
            });

            const qrCodeImage = await QRCode.toDataURL(qrCodeData);

            // Insertar vale
            const result = await runQuery(
                `INSERT INTO vouchers (code, sale_id, qr_code, has_coffee, status, expires_at) 
                 VALUES (?, ?, ?, ?, 'pending', ?)`,
                [code, saleId, qrCodeImage, hasCoffee ? 1 : 0, expiresAt]
            );

            return await Voucher.findById(result.id);
        } catch (error) {
            throw new Error(`Error creando vale: ${error.message}`);
        }
    }

    // Generar código único para el vale
    static generateCode() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        return `${timestamp}${random}`;
    }

    // Buscar vale por ID
    static async findById(id) {
        try {
            const row = await getOne(
                `SELECT v.*, s.total_amount as sale_total, u1.full_name as cashier_name,
                        u2.full_name as food_validator_name, u3.full_name as coffee_validator_name
                 FROM vouchers v 
                 LEFT JOIN sales s ON v.sale_id = s.id
                 LEFT JOIN users u1 ON s.cashier_id = u1.id
                 LEFT JOIN users u2 ON v.food_validator_id = u2.id
                 LEFT JOIN users u3 ON v.coffee_validator_id = u3.id
                 WHERE v.id = ?`, 
                [id]
            );

            if (!row) {
                return null;
            }

            const voucher = new Voucher(row);
            
            // Obtener items de la venta
            const items = await getAll(
                `SELECT si.*, p.name as product_name, p.has_coffee 
                 FROM sale_items si 
                 LEFT JOIN products p ON si.product_id = p.id 
                 WHERE si.sale_id = ?`,
                [voucher.sale_id]
            );
            
            voucher.sale_items = items;
            return voucher;
        } catch (error) {
            throw new Error(`Error buscando vale: ${error.message}`);
        }
    }

    // Buscar vale por código
    static async findByCode(code) {
        try {
            const row = await getOne(
                `SELECT v.*, s.total_amount as sale_total, u1.full_name as cashier_name,
                        u2.full_name as food_validator_name, u3.full_name as coffee_validator_name
                 FROM vouchers v 
                 LEFT JOIN sales s ON v.sale_id = s.id
                 LEFT JOIN users u1 ON s.cashier_id = u1.id
                 LEFT JOIN users u2 ON v.food_validator_id = u2.id
                 LEFT JOIN users u3 ON v.coffee_validator_id = u3.id
                 WHERE v.code = ?`, 
                [code]
            );

            if (!row) {
                return null;
            }

            const voucher = new Voucher(row);
            
            // Obtener items de la venta
            const items = await getAll(
                `SELECT si.*, p.name as product_name, p.has_coffee 
                 FROM sale_items si 
                 LEFT JOIN products p ON si.product_id = p.id 
                 WHERE si.sale_id = ?`,
                [voucher.sale_id]
            );
            
            voucher.sale_items = items;
            return voucher;
        } catch (error) {
            throw new Error(`Error buscando vale por código: ${error.message}`);
        }
    }

    // Obtener todos los vales
    static async findAll(limit = 100, offset = 0) {
        try {
            const rows = await getAll(
                `SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name
                 FROM vouchers v 
                 LEFT JOIN sales s ON v.sale_id = s.id
                 LEFT JOIN users u ON s.cashier_id = u.id
                 ORDER BY v.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            return rows.map(row => new Voucher(row));
        } catch (error) {
            throw new Error(`Error obteniendo vales: ${error.message}`);
        }
    }

    // Validar comida (primera validación)
    static async validateFood(code, validatorId) {
        try {
            const voucher = await Voucher.findByCode(code);
            if (!voucher) {
                throw new Error('Vale no encontrado');
            }

            // Verificar si el vale no ha expirado
            if (voucher.isExpired()) {
                throw new Error('El vale ha expirado');
            }

            // Verificar estado
            if (voucher.status === 'validated' || voucher.status === 'fully_validated') {
                throw new Error('El vale ya ha sido validado para comida');
            }

            // Marcar como validado para comida
            const newStatus = voucher.has_coffee ? 'validated' : 'fully_validated';
            
            await runQuery(
                `UPDATE vouchers SET 
                    status = ?, 
                    food_validated_at = CURRENT_TIMESTAMP,
                    food_validator_id = ? 
                 WHERE code = ?`,
                [newStatus, validatorId, code]
            );

            return await Voucher.findByCode(code);
        } catch (error) {
            throw new Error(`Error validando comida: ${error.message}`);
        }
    }

    // Validar café (segunda validación)
    static async validateCoffee(code, validatorId) {
        try {
            const voucher = await Voucher.findByCode(code);
            if (!voucher) {
                throw new Error('Vale no encontrado');
            }

            // Verificar si el vale no ha expirado
            if (voucher.isExpired()) {
                throw new Error('El vale ha expirado');
            }

            // Verificar si el vale tiene café
            if (!voucher.has_coffee) {
                throw new Error('Este vale no incluye café');
            }

            // Verificar estado - debe estar validado para comida primero
            if (voucher.status === 'pending') {
                throw new Error('Debe validar la comida primero');
            }

            if (voucher.status === 'coffee_validated' || voucher.status === 'fully_validated') {
                throw new Error('El café ya ha sido validado para este vale');
            }

            // Marcar como totalmente validado
            await runQuery(
                `UPDATE vouchers SET 
                    status = 'fully_validated', 
                    coffee_validated_at = CURRENT_TIMESTAMP,
                    coffee_validator_id = ? 
                 WHERE code = ?`,
                [validatorId, code]
            );

            return await Voucher.findByCode(code);
        } catch (error) {
            throw new Error(`Error validando café: ${error.message}`);
        }
    }

    // Obtener vales pendientes
    static async findPending() {
        try {
            const rows = await getAll(
                `SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name
                 FROM vouchers v 
                 LEFT JOIN sales s ON v.sale_id = s.id
                 LEFT JOIN users u ON s.cashier_id = u.id
                 WHERE v.status IN ('pending', 'validated') 
                 AND datetime(v.expires_at) > datetime('now')
                 ORDER BY v.created_at ASC`
            );
            return rows.map(row => new Voucher(row));
        } catch (error) {
            throw new Error(`Error obteniendo vales pendientes: ${error.message}`);
        }
    }

    // Obtener vales por estado
    static async findByStatus(status) {
        try {
            const validStatuses = ['pending', 'validated', 'coffee_validated', 'fully_validated'];
            if (!validStatuses.includes(status)) {
                throw new Error('Estado no válido');
            }

            const rows = await getAll(
                `SELECT v.*, s.total_amount as sale_total, u.full_name as cashier_name
                 FROM vouchers v 
                 LEFT JOIN sales s ON v.sale_id = s.id
                 LEFT JOIN users u ON s.cashier_id = u.id
                 WHERE v.status = ?
                 ORDER BY v.created_at DESC`,
                [status]
            );
            return rows.map(row => new Voucher(row));
        } catch (error) {
            throw new Error(`Error obteniendo vales por estado: ${error.message}`);
        }
    }

    // Obtener estadísticas de vales
    static async getStats(startDate = null, endDate = null) {
        try {
            let dateFilter = '';
            let params = [];

            if (startDate && endDate) {
                dateFilter = 'WHERE DATE(v.created_at) BETWEEN ? AND ?';
                params = [startDate, endDate];
            }

            const stats = await getOne(
                `SELECT 
                    COUNT(*) as total_vouchers,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'validated' THEN 1 END) as food_validated,
                    COUNT(CASE WHEN status = 'fully_validated' THEN 1 END) as fully_validated,
                    COUNT(CASE WHEN has_coffee = 1 THEN 1 END) as with_coffee,
                    COUNT(CASE WHEN datetime(expires_at) < datetime('now') AND status != 'fully_validated' THEN 1 END) as expired
                 FROM vouchers v ${dateFilter}`,
                params
            );

            return stats;
        } catch (error) {
            throw new Error(`Error obteniendo estadísticas de vales: ${error.message}`);
        }
    }

    // Verificar si el vale ha expirado
    isExpired() {
        return moment().isAfter(moment(this.expires_at));
    }

    // Verificar si el vale está pendiente
    isPending() {
        return this.status === 'pending';
    }

    // Verificar si la comida ha sido validada
    isFoodValidated() {
        return ['validated', 'fully_validated'].includes(this.status);
    }

    // Verificar si el café ha sido validado
    isCoffeeValidated() {
        return ['coffee_validated', 'fully_validated'].includes(this.status);
    }

    // Verificar si está completamente validado
    isFullyValidated() {
        return this.status === 'fully_validated';
    }

    // Obtener el próximo paso de validación
    getNextValidationStep() {
        if (this.isExpired()) {
            return 'expired';
        }

        if (this.status === 'pending') {
            return 'food';
        }

        if (this.status === 'validated' && this.has_coffee) {
            return 'coffee';
        }

        if (this.status === 'fully_validated') {
            return 'completed';
        }

        return 'unknown';
    }

    // Obtener información de estado
    getStatusInfo() {
        return {
            code: this.code,
            status: this.status,
            has_coffee: !!this.has_coffee,
            is_expired: this.isExpired(),
            is_pending: this.isPending(),
            is_food_validated: this.isFoodValidated(),
            is_coffee_validated: this.isCoffeeValidated(),
            is_fully_validated: this.isFullyValidated(),
            next_step: this.getNextValidationStep(),
            expires_at: this.expires_at,
            created_at: this.created_at,
            food_validated_at: this.food_validated_at,
            coffee_validated_at: this.coffee_validated_at
        };
    }
}

module.exports = Voucher;