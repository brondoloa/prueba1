const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Importar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const cashierRoutes = require('./routes/cashier');
const validatorRoutes = require('./routes/validator');
const apiRoutes = require('./routes/api');

// Importar middleware de autenticación
const authMiddleware = require('./middleware/auth');

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de seguridad
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // máximo 100 requests por ventana por IP
});

app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de autenticación (sin middleware de auth)
app.use('/auth', authRoutes);

// Rutas protegidas
app.use('/admin', authMiddleware.verifyToken, authMiddleware.requireRole(['admin']), adminRoutes);
app.use('/cashier', authMiddleware.verifyToken, authMiddleware.requireRole(['admin', 'cashier']), cashierRoutes);
app.use('/validator', authMiddleware.verifyToken, authMiddleware.requireRole(['admin', 'validator']), validatorRoutes);
app.use('/api', authMiddleware.verifyToken, apiRoutes);

// Ruta principal - redirigir al login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Rutas para servir las páginas HTML
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/admin-panel', authMiddleware.verifyTokenPage, authMiddleware.requireRolePage(['admin']), (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/cashier-panel', authMiddleware.verifyTokenPage, authMiddleware.requireRolePage(['admin', 'cashier']), (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'cashier.html'));
});

app.get('/validator-panel', authMiddleware.verifyTokenPage, authMiddleware.requireRolePage(['admin', 'validator']), (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'validator.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Error interno del servidor' 
    });
});

// Ruta para manejar 404
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Ruta no encontrada' 
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor TPV iniciado en puerto ${PORT}`);
    console.log(`📱 Panel Admin: http://localhost:${PORT}/admin-panel`);
    console.log(`💰 Panel Cajero: http://localhost:${PORT}/cashier-panel`);
    console.log(`✅ Panel Validador: http://localhost:${PORT}/validator-panel`);
});

module.exports = app;