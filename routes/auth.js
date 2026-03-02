const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authenticate } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Usuario y contraseña son requeridos' 
            });
        }
        
        const user = await User.authenticate(username, password);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        const token = generateToken(user.id, user.role);
        
        // Establecer cookie segura
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });
        
        res.json({
            success: true,
            message: 'Login exitoso',
            user: user.toJSON(),
            token,
            redirectUrl: getRedirectUrl(user.role)
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// Logout
router.post('/logout', (req, res) => {
    try {
        res.clearCookie('token');
        res.json({
            success: true,
            message: 'Logout exitoso'
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// Verificar token y obtener usuario actual
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ 
                error: 'Usuario no encontrado' 
            });
        }
        
        res.json({
            success: true,
            user: user.toJSON()
        });
        
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// Cambiar contraseña
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ 
                error: 'Todos los campos son requeridos' 
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                error: 'Las contraseñas no coinciden' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ 
                error: 'Usuario no encontrado' 
            });
        }
        
        // Verificar contraseña actual
        const isCurrentPasswordValid = await user.checkPassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ 
                error: 'Contraseña actual incorrecta' 
            });
        }
        
        // Actualizar contraseña
        user.password = newPassword;
        await user.update();
        
        res.json({
            success: true,
            message: 'Contraseña actualizada exitosamente'
        });
        
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// Verificar estado de autenticación
router.get('/check', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
    
    if (!token) {
        return res.json({
            authenticated: false,
            user: null
        });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);
        
        User.findById(decoded.userId)
            .then(user => {
                if (user && user.active) {
                    res.json({
                        authenticated: true,
                        user: user.toJSON(),
                        redirectUrl: getRedirectUrl(user.role)
                    });
                } else {
                    res.json({
                        authenticated: false,
                        user: null
                    });
                }
            })
            .catch(error => {
                res.json({
                    authenticated: false,
                    user: null
                });
            });
    } catch (error) {
        res.json({
            authenticated: false,
            user: null
        });
    }
});

// Función auxiliar para determinar URL de redirección según rol
function getRedirectUrl(role) {
    switch (role) {
        case 'admin':
            return '/admin.html';
        case 'cashier':
            return '/cashier.html';
        case 'validator':
            return '/validator.html';
        default:
            return '/login.html';
    }
}

module.exports = router;