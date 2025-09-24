const bcrypt = require('bcryptjs');
const database = require('../config/database');

class User {
    constructor(data = {}) {
        this.id = data.id;
        this.username = data.username;
        this.password = data.password;
        this.role = data.role;
        this.fullName = data.fullName;
        this.active = data.active !== undefined ? data.active : true;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    // Crear usuario
    async create() {
        try {
            const hashedPassword = await bcrypt.hash(this.password, 10);
            const currentTime = new Date().toISOString();
            
            const result = await database.run(
                `INSERT INTO users (username, password, role, full_name, active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [this.username, hashedPassword, this.role, this.fullName, this.active, currentTime, currentTime]
            );
            
            this.id = result.id;
            this.createdAt = currentTime;
            this.updatedAt = currentTime;
            return this;
        } catch (error) {
            throw new Error(`Error al crear usuario: ${error.message}`);
        }
    }

    // Actualizar usuario
    async update() {
        try {
            const updateData = [this.fullName, this.role, this.active, new Date().toISOString(), this.id];
            let sql = `UPDATE users SET full_name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?`;
            
            if (this.password) {
                const hashedPassword = await bcrypt.hash(this.password, 10);
                sql = `UPDATE users SET full_name = ?, role = ?, active = ?, password = ?, updated_at = ? WHERE id = ?`;
                updateData.splice(3, 0, hashedPassword);
            }
            
            await database.run(sql, updateData);
            return this;
        } catch (error) {
            throw new Error(`Error al actualizar usuario: ${error.message}`);
        }
    }

    // Eliminar usuario (soft delete)
    async delete() {
        try {
            await database.run(
                'UPDATE users SET active = 0, updated_at = ? WHERE id = ?',
                [new Date().toISOString(), this.id]
            );
            return true;
        } catch (error) {
            throw new Error(`Error al eliminar usuario: ${error.message}`);
        }
    }

    // Verificar contraseña
    async checkPassword(password) {
        return await bcrypt.compare(password, this.password);
    }

    // Métodos estáticos
    static async findById(id) {
        try {
            const row = await database.get('SELECT * FROM users WHERE id = ? AND active = 1', [id]);
            return row ? new User(row) : null;
        } catch (error) {
            throw new Error(`Error al buscar usuario por ID: ${error.message}`);
        }
    }

    static async findByUsername(username) {
        try {
            const row = await database.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
            return row ? new User(row) : null;
        } catch (error) {
            throw new Error(`Error al buscar usuario por nombre: ${error.message}`);
        }
    }

    static async findAll() {
        try {
            const rows = await database.all('SELECT * FROM users WHERE active = 1 ORDER BY created_at DESC');
            return rows.map(row => new User(row));
        } catch (error) {
            throw new Error(`Error al obtener usuarios: ${error.message}`);
        }
    }

    static async authenticate(username, password) {
        try {
            const user = await User.findByUsername(username);
            if (!user) {
                return null;
            }
            
            const isValid = await user.checkPassword(password);
            return isValid ? user : null;
        } catch (error) {
            throw new Error(`Error en autenticación: ${error.message}`);
        }
    }

    static async countByRole(role) {
        try {
            const result = await database.get(
                'SELECT COUNT(*) as count FROM users WHERE role = ? AND active = 1',
                [role]
            );
            return result.count;
        } catch (error) {
            throw new Error(`Error al contar usuarios por rol: ${error.message}`);
        }
    }

    // Convertir a objeto JSON sin datos sensibles
    toJSON() {
        const obj = { ...this };
        delete obj.password;
        return obj;
    }
}

module.exports = User;