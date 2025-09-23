const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Clave secreta para JWT (en producción debería estar en variables de entorno)
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-tpv-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

class AuthMiddleware {
    // Generar token JWT
    static generateToken(user) {
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        };

        return jwt.sign(payload, JWT_SECRET, { 
            expiresIn: JWT_EXPIRES_IN,
            issuer: 'restaurant-tpv',
            subject: user.id.toString()
        });
    }

    // Verificar token JWT para APIs
    static verifyToken(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Token de acceso requerido'
                });
            }

            jwt.verify(token, JWT_SECRET, async (err, decoded) => {
                if (err) {
                    let message = 'Token no válido';
                    if (err.name === 'TokenExpiredError') {
                        message = 'Token expirado';
                    } else if (err.name === 'JsonWebTokenError') {
                        message = 'Token malformado';
                    }

                    return res.status(401).json({
                        success: false,
                        message: message
                    });
                }

                try {
                    // Verificar que el usuario aún existe y está activo
                    const user = await User.findById(decoded.id);
                    if (!user) {
                        return res.status(401).json({
                            success: false,
                            message: 'Usuario no válido'
                        });
                    }

                    // Agregar información del usuario a la request
                    req.user = {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        full_name: user.full_name
                    };

                    next();
                } catch (error) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error verificando usuario'
                    });
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error en autenticación'
            });
        }
    }

    // Verificar token JWT para páginas HTML
    static verifyTokenPage(req, res, next) {
        try {
            const token = req.headers.authorization?.split(' ')[1] || 
                         req.query.token || 
                         req.cookies?.token;

            if (!token) {
                return res.redirect('/login?error=access_required');
            }

            jwt.verify(token, JWT_SECRET, async (err, decoded) => {
                if (err) {
                    let errorType = 'invalid_token';
                    if (err.name === 'TokenExpiredError') {
                        errorType = 'token_expired';
                    }
                    return res.redirect(`/login?error=${errorType}`);
                }

                try {
                    // Verificar que el usuario aún existe y está activo
                    const user = await User.findById(decoded.id);
                    if (!user) {
                        return res.redirect('/login?error=invalid_user');
                    }

                    // Agregar información del usuario a la request
                    req.user = {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        full_name: user.full_name
                    };

                    next();
                } catch (error) {
                    return res.redirect('/login?error=server_error');
                }
            });
        } catch (error) {
            return res.redirect('/login?error=server_error');
        }
    }

    // Middleware para requerir roles específicos
    static requireRole(allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado'
                });
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Permisos insuficientes'
                });
            }

            next();
        };
    }

    // Middleware para requerir roles específicos en páginas
    static requireRolePage(allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.redirect('/login?error=access_required');
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.redirect('/login?error=insufficient_permissions');
            }

            next();
        };
    }

    // Middleware opcional - no requiere autenticación pero la incluye si está presente
    static optionalAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                req.user = null;
                return next();
            }

            jwt.verify(token, JWT_SECRET, async (err, decoded) => {
                if (err) {
                    req.user = null;
                    return next();
                }

                try {
                    const user = await User.findById(decoded.id);
                    req.user = user ? {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        full_name: user.full_name
                    } : null;
                } catch (error) {
                    req.user = null;
                }

                next();
            });
        } catch (error) {
            req.user = null;
            next();
        }
    }

    // Verificar si el token está próximo a expirar (para renovación automática)
    static checkTokenExpiration(req, res, next) {
        if (!req.user) {
            return next();
        }

        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return next();
        }

        try {
            const decoded = jwt.decode(token);
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = decoded.exp - now;
            
            // Si el token expira en menos de 30 minutos, agregar header para renovación
            if (timeUntilExpiry < 1800) { // 30 minutos
                res.setHeader('X-Token-Renewal-Needed', 'true');
            }
        } catch (error) {
            // Ignorar errores de decodificación
        }

        next();
    }

    // Renovar token
    static async renewToken(req, res) {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Token requerido para renovación'
                });
            }

            jwt.verify(token, JWT_SECRET, async (err, decoded) => {
                if (err) {
                    return res.status(401).json({
                        success: false,
                        message: 'Token no válido para renovación'
                    });
                }

                try {
                    const user = await User.findById(decoded.id);
                    if (!user) {
                        return res.status(401).json({
                            success: false,
                            message: 'Usuario no válido'
                        });
                    }

                    const newToken = AuthMiddleware.generateToken(user);
                    
                    return res.json({
                        success: true,
                        message: 'Token renovado exitosamente',
                        token: newToken,
                        user: user.toSafeObject()
                    });
                } catch (error) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error renovando token'
                    });
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error en renovación de token'
            });
        }
    }

    // Extraer información del token sin verificar (para debugging)
    static decodeTokenInfo(token) {
        try {
            return jwt.decode(token);
        } catch (error) {
            return null;
        }
    }

    // Verificar si un token es válido sin hacer query a base de datos
    static isTokenValid(token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = AuthMiddleware;