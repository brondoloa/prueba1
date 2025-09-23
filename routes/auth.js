const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const AuthMiddleware = require('../middleware/auth');

const router = express.Router();

// Rate limiting específico para autenticación
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 intentos por IP
    message: {
        success: false,
        message: 'Demasiados intentos de login. Intente nuevamente en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// LOGIN
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validar datos de entrada
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }

        // Validar longitud
        if (username.length > 50 || password.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada no válidos'
            });
        }

        // Autenticar usuario
        const user = await User.authenticate(username.trim(), password);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas'
            });
        }

        // Generar token JWT
        const token = AuthMiddleware.generateToken(user);

        // Respuesta exitosa
        res.json({
            success: true,
            message: 'Login exitoso',
            token: token,
            user: user.toSafeObject(),
            expires_in: '24h'
        });

        // Log de acceso (opcional)
        console.log(`🔐 Login exitoso: ${user.username} (${user.role}) - ${new Date().toISOString()}`);

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// LOGOUT (opcional - el cliente simplemente elimina el token)
router.post('/logout', AuthMiddleware.verifyToken, (req, res) => {
    try {
        // En este caso, no necesitamos hacer nada en el servidor
        // El cliente debe eliminar el token del localStorage/sessionStorage
        
        console.log(`🔓 Logout: ${req.user.username} - ${new Date().toISOString()}`);
        
        res.json({
            success: true,
            message: 'Logout exitoso'
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// VERIFICAR TOKEN
router.get('/verify', AuthMiddleware.verifyToken, (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Token válido',
            user: req.user
        });
    } catch (error) {
        console.error('Error verificando token:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// RENOVAR TOKEN
router.post('/refresh', AuthMiddleware.renewToken);

// CAMBIAR CONTRASEÑA
router.post('/change-password', AuthMiddleware.verifyToken, async (req, res) => {
    try {
        const { current_password, new_password, confirm_password } = req.body;
        const userId = req.user.id;

        // Validar datos de entrada
        if (!current_password || !new_password || !confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }

        // Validar que las contraseñas coincidan
        if (new_password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'Las contraseñas nuevas no coinciden'
            });
        }

        // Validar longitud de la nueva contraseña
        if (new_password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        if (new_password.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña es demasiado larga'
            });
        }

        // Cambiar contraseña
        await User.changePassword(userId, current_password, new_password);

        res.json({
            success: true,
            message: 'Contraseña cambiada exitosamente'
        });

        console.log(`🔑 Cambio de contraseña: ${req.user.username} - ${new Date().toISOString()}`);

    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        
        let message = 'Error interno del servidor';
        if (error.message.includes('Contraseña actual incorrecta')) {
            message = 'La contraseña actual es incorrecta';
        }

        res.status(400).json({
            success: false,
            message: message
        });
    }
});

// INFORMACIÓN DEL USUARIO ACTUAL
router.get('/me', AuthMiddleware.verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('Error obteniendo información del usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// VALIDAR CREDENCIALES (para operaciones sensibles)
router.post('/validate-credentials', AuthMiddleware.verifyToken, async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user.id;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Contraseña requerida'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const isValidPassword = await user.validatePassword(password);
        
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Contraseña incorrecta'
            });
        }

        res.json({
            success: true,
            message: 'Credenciales válidas'
        });

    } catch (error) {
        console.error('Error validando credenciales:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// OBTENER ROLES DISPONIBLES
router.get('/roles', (req, res) => {
    try {
        const roles = [
            { value: 'admin', label: 'Administrador', description: 'Acceso completo al sistema' },
            { value: 'cashier', label: 'Cajero', description: 'Gestión de ventas y caja' },
            { value: 'validator', label: 'Validador', description: 'Validación de vales únicamente' }
        ];

        res.json({
            success: true,
            roles: roles
        });
    } catch (error) {
        console.error('Error obteniendo roles:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// MIDDLEWARE DE ERROR ESPECÍFICO PARA RUTAS DE AUTH
router.use((error, req, res, next) => {
    console.error('Error en rutas de autenticación:', error);
    
    res.status(500).json({
        success: false,
        message: 'Error en el sistema de autenticación'
    });
});

module.exports = router;