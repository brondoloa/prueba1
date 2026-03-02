const jwt = require('jsonwebtoken');
const database = require('../config/database');

const JWT_SECRET = 'your-secret-key-change-in-production-2024-restaurant-tpv';

// Middleware de autenticación general
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Token de acceso requerido' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await database.get(
            'SELECT id, username, role, active FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user || !user.active) {
            return res.status(401).json({ error: 'Usuario no válido' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Middleware para verificar roles específicos
const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'No tienes permisos para esta acción' });
        }

        next();
    };
};

// Middleware específico para admin
const isAdmin = authorize(['admin']);

// Middleware específico para cajero
const isCashier = authorize(['admin', 'cashier']);

// Middleware específico para validador
const isValidator = authorize(['admin', 'validator']);

// Middleware que permite admin y cajero
const isAdminOrCashier = authorize(['admin', 'cashier']);

// Middleware que permite todos los roles
const isAnyRole = authorize(['admin', 'cashier', 'validator']);

// Generar token JWT
const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        JWT_SECRET,
        { expiresIn: '8h' }
    );
};

// Verificar token sin middleware
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = {
    authenticate,
    authorize,
    isAdmin,
    isCashier,
    isValidator,
    isAdminOrCashier,
    isAnyRole,
    generateToken,
    verifyToken,
    JWT_SECRET
};