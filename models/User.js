const bcrypt = require('bcryptjs');
const { runQuery, getOne, getAll } = require('../config/database');

class User {
    constructor(data) {
        this.id = data.id;
        this.username = data.username;
        this.password = data.password;
        this.role = data.role;
        this.full_name = data.full_name;
        this.active = data.active;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    // Crear nuevo usuario
    static async create(userData) {
        try {
            const { username, password, role, full_name } = userData;
            
            // Verificar si el usuario ya existe
            const existingUser = await getOne(
                'SELECT id FROM users WHERE username = ?', 
                [username]
            );
            
            if (existingUser) {
                throw new Error('El nombre de usuario ya existe');
            }

            // Validar rol
            const validRoles = ['admin', 'cashier', 'validator'];
            if (!validRoles.includes(role)) {
                throw new Error('Rol no válido');
            }

            // Hashear contraseña
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insertar usuario
            const result = await runQuery(
                `INSERT INTO users (username, password, role, full_name) 
                 VALUES (?, ?, ?, ?)`,
                [username, hashedPassword, role, full_name]
            );

            return await User.findById(result.id);
        } catch (error) {
            throw new Error(`Error creando usuario: ${error.message}`);
        }
    }

    // Buscar usuario por ID
    static async findById(id) {
        try {
            const row = await getOne(
                'SELECT * FROM users WHERE id = ? AND active = 1', 
                [id]
            );
            return row ? new User(row) : null;
        } catch (error) {
            throw new Error(`Error buscando usuario: ${error.message}`);
        }
    }

    // Buscar usuario por nombre de usuario
    static async findByUsername(username) {
        try {
            const row = await getOne(
                'SELECT * FROM users WHERE username = ? AND active = 1', 
                [username]
            );
            return row ? new User(row) : null;
        } catch (error) {
            throw new Error(`Error buscando usuario: ${error.message}`);
        }
    }

    // Obtener todos los usuarios
    static async findAll() {
        try {
            const rows = await getAll(
                'SELECT * FROM users WHERE active = 1 ORDER BY full_name'
            );
            return rows.map(row => new User(row));
        } catch (error) {
            throw new Error(`Error obteniendo usuarios: ${error.message}`);
        }
    }

    // Obtener usuarios por rol
    static async findByRole(role) {
        try {
            const rows = await getAll(
                'SELECT * FROM users WHERE role = ? AND active = 1 ORDER BY full_name',
                [role]
            );
            return rows.map(row => new User(row));
        } catch (error) {
            throw new Error(`Error obteniendo usuarios por rol: ${error.message}`);
        }
    }

    // Validar contraseña
    async validatePassword(password) {
        try {
            return await bcrypt.compare(password, this.password);
        } catch (error) {
            throw new Error(`Error validando contraseña: ${error.message}`);
        }
    }

    // Actualizar usuario
    static async update(id, updateData) {
        try {
            const { username, full_name, role, active } = updateData;
            let { password } = updateData;

            // Si se proporciona nueva contraseña, hashearla
            if (password) {
                password = await bcrypt.hash(password, 10);
            }

            // Verificar que el usuario existe
            const existingUser = await User.findById(id);
            if (!existingUser) {
                throw new Error('Usuario no encontrado');
            }

            // Si se cambia el username, verificar que no exista otro usuario con el mismo
            if (username && username !== existingUser.username) {
                const userWithSameUsername = await getOne(
                    'SELECT id FROM users WHERE username = ? AND id != ?',
                    [username, id]
                );
                if (userWithSameUsername) {
                    throw new Error('El nombre de usuario ya existe');
                }
            }

            // Construir query dinámicamente
            const fields = [];
            const values = [];

            if (username) {
                fields.push('username = ?');
                values.push(username);
            }
            if (password) {
                fields.push('password = ?');
                values.push(password);
            }
            if (full_name) {
                fields.push('full_name = ?');
                values.push(full_name);
            }
            if (role) {
                fields.push('role = ?');
                values.push(role);
            }
            if (typeof active !== 'undefined') {
                fields.push('active = ?');
                values.push(active ? 1 : 0);
            }

            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            await runQuery(
                `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
                values
            );

            return await User.findById(id);
        } catch (error) {
            throw new Error(`Error actualizando usuario: ${error.message}`);
        }
    }

    // Eliminar usuario (soft delete)
    static async delete(id) {
        try {
            const user = await User.findById(id);
            if (!user) {
                throw new Error('Usuario no encontrado');
            }

            await runQuery(
                'UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );

            return true;
        } catch (error) {
            throw new Error(`Error eliminando usuario: ${error.message}`);
        }
    }

    // Cambiar contraseña
    static async changePassword(id, oldPassword, newPassword) {
        try {
            const user = await User.findById(id);
            if (!user) {
                throw new Error('Usuario no encontrado');
            }

            // Validar contraseña actual
            const isValidPassword = await user.validatePassword(oldPassword);
            if (!isValidPassword) {
                throw new Error('Contraseña actual incorrecta');
            }

            // Hashear nueva contraseña
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);

            await runQuery(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [hashedNewPassword, id]
            );

            return true;
        } catch (error) {
            throw new Error(`Error cambiando contraseña: ${error.message}`);
        }
    }

    // Método para obtener datos seguros (sin contraseña)
    toSafeObject() {
        return {
            id: this.id,
            username: this.username,
            role: this.role,
            full_name: this.full_name,
            active: this.active,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    // Método para autenticar usuario
    static async authenticate(username, password) {
        try {
            const user = await User.findByUsername(username);
            if (!user) {
                return null;
            }

            const isValidPassword = await user.validatePassword(password);
            if (!isValidPassword) {
                return null;
            }

            return user;
        } catch (error) {
            throw new Error(`Error en autenticación: ${error.message}`);
        }
    }
}

module.exports = User;