const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Importar configuración y rutas
const database = require('./config/database');
const { initializeDatabase } = require('./utils/initDatabase');

// Importar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const cashierRoutes = require('./routes/cashier');
const validatorRoutes = require('./routes/validator');
const apiRoutes = require('./routes/api');

// Configuración del servidor
const app = express();
const PORT = process.env.PORT || 3000;

// Crear directorio public si no existe
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// Crear directorio uploads si no existe
const uploadsDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware de seguridad
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        // Permitir requests sin origin (como aplicaciones móviles o herramientas de testing)
        if (!origin) return callback(null, true);
        
        // Permitir localhost en diferentes puertos para desarrollo
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        
        // En producción, configurar aquí los dominios permitidos
        // const allowedOrigins = ['https://mi-dominio.com'];
        // if (allowedOrigins.indexOf(origin) !== -1) {
        //     return callback(null, true);
        // }
        
        return callback(null, true); // Para desarrollo, permitir todo
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // límite de 1000 requests por IP por ventana de tiempo
    message: {
        error: 'Demasiadas solicitudes desde esta IP, intente más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Rate limiting más estricto para rutas de autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // límite de 10 intentos de login por IP
    message: {
        error: 'Demasiados intentos de login, intente más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware de parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos
app.use('/uploads', express.static(uploadsDir));
app.use('/public', express.static(publicDir));

// Middleware para logging de requests (desarrollo)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
        next();
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
    });
});

// Rutas de API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cashier', cashierRoutes);
app.use('/api/validator', validatorRoutes);
app.use('/api', apiRoutes);

// Servir archivos HTML estáticos
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/cashier.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'cashier.html'));
});

app.get('/validator.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'validator.html'));
});

// Middleware para manejar errores de archivos no encontrados
app.use((req, res, next) => {
    if (req.path.endsWith('.js')) {
        res.status(404).json({ error: 'Archivo JavaScript no encontrado' });
    } else if (req.path.endsWith('.css')) {
        res.status(404).json({ error: 'Archivo CSS no encontrado' });
    } else {
        next();
    }
});

// Ruta catch-all para SPA (Single Page Application)
app.get('*', (req, res) => {
    // Si es una ruta de API que no existe
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint no encontrado' });
        return;
    }
    
    // Para cualquier otra ruta, redirigir al login
    res.redirect('/login.html');
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // Error de validación de JSON
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'JSON inválido en la solicitud' });
    }
    
    // Error de Multer (subida de archivos)
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo es demasiado grande' });
    }
    
    // Error de base de datos
    if (err.message && err.message.includes('database')) {
        return res.status(500).json({ error: 'Error en la base de datos' });
    }
    
    // Error genérico
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 
               'Error interno del servidor' : 
               err.message
    });
});

// Función para inicializar el servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor TPV Restaurante...');
        
        // Conectar a la base de datos
        console.log('📊 Conectando a la base de datos...');
        await database.connect();
        
        // Verificar si necesita inicialización
        try {
            await database.get('SELECT COUNT(*) as count FROM users');
            console.log('✅ Base de datos ya inicializada');
        } catch (error) {
            console.log('🔧 Inicializando base de datos...');
            await initializeDatabase();
        }
        
        // Iniciar el servidor
        const server = app.listen(PORT, () => {
            console.log('\n=================================');
            console.log('🎉 SERVIDOR TPV RESTAURANTE INICIADO');
            console.log('=================================');
            console.log(`🌐 Servidor corriendo en: http://localhost:${PORT}`);
            console.log(`📱 Entorno: ${process.env.NODE_ENV || 'development'}`);
            console.log('=================================');
            console.log('\n📋 USUARIOS POR DEFECTO:');
            console.log('👑 Admin: admin / admin123');
            console.log('💰 Cajero: cajero / cajero123');
            console.log('✅ Validador: validador / validador123');
            console.log('\n🔗 RUTAS DISPONIBLES:');
            console.log('🏠 Principal: http://localhost:' + PORT);
            console.log('🔑 Login: http://localhost:' + PORT + '/login.html');
            console.log('👑 Admin: http://localhost:' + PORT + '/admin.html');
            console.log('💰 Cajero: http://localhost:' + PORT + '/cashier.html');
            console.log('✅ Validador: http://localhost:' + PORT + '/validator.html');
            console.log('\n📚 API ENDPOINTS:');
            console.log('🔐 Auth: /api/auth/*');
            console.log('👑 Admin: /api/admin/*');
            console.log('💰 Cajero: /api/cashier/*');
            console.log('✅ Validador: /api/validator/*');
            console.log('⚙️  General: /api/*');
            console.log('=================================\n');
        });
        
        // Manejo de cierre graceful
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Recibida señal ${signal}. Cerrando servidor...`);
            
            server.close(async (err) => {
                if (err) {
                    console.error('❌ Error cerrando servidor HTTP:', err);
                    process.exit(1);
                }
                
                try {
                    console.log('📊 Cerrando conexión a base de datos...');
                    await database.close();
                    console.log('✅ Servidor cerrado correctamente');
                    process.exit(0);
                } catch (dbError) {
                    console.error('❌ Error cerrando base de datos:', dbError);
                    process.exit(1);
                }
            });
            
            // Forzar cierre después de 30 segundos
            setTimeout(() => {
                console.error('❌ Forzando cierre del servidor...');
                process.exit(1);
            }, 30000);
        };
        
        // Eventos de cierre
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
        // Manejo de errores no capturados
        process.on('uncaughtException', (error) => {
            console.error('💥 Error no capturado:', error);
            gracefulShutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Promesa rechazada no manejada:', reason);
            gracefulShutdown('unhandledRejection');
        });
        
    } catch (error) {
        console.error('💥 Error al iniciar el servidor:', error);
        process.exit(1);
    }
}

// Función para mostrar ayuda
function showHelp() {
    console.log(`
TPV Restaurante - Sistema de Punto de Venta

USO:
  node server.js [opciones]

OPCIONES:
  --help, -h        Mostrar esta ayuda
  --init-db         Inicializar/reinicializar la base de datos
  --port PORT       Puerto del servidor (por defecto: 3000)

VARIABLES DE ENTORNO:
  NODE_ENV          Entorno de ejecución (development/production)
  PORT              Puerto del servidor
  DB_PATH           Ruta del archivo de base de datos

EJEMPLOS:
  node server.js                    # Iniciar servidor normal
  node server.js --port 8080        # Iniciar en puerto 8080
  node server.js --init-db          # Reinicializar base de datos

SCRIPTS NPM:
  npm start                         # Iniciar servidor
  npm run dev                       # Modo desarrollo con nodemon
  npm run init-db                   # Inicializar base de datos
`);
}

// Procesamiento de argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
}

if (args.includes('--init-db')) {
    console.log('🔧 Reinicializando base de datos...');
    const { resetDatabase } = require('./utils/initDatabase');
    resetDatabase()
        .then(() => {
            console.log('✅ Base de datos reinicializada exitosamente');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error reinicializando base de datos:', error);
            process.exit(1);
        });
} else {
    // Configurar puerto desde argumentos
    const portIndex = args.indexOf('--port');
    if (portIndex !== -1 && args[portIndex + 1]) {
        process.env.PORT = args[portIndex + 1];
    }
    
    // Iniciar servidor
    startServer();
}

// Exportar app para testing
module.exports = app;