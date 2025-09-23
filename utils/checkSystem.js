const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🔍 Verificando Sistema TPV Restaurante...\n');

// Verificar versión de Node.js
function checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    console.log(`📦 Node.js versión: ${nodeVersion}`);
    
    if (majorVersion < 14) {
        console.log('❌ ADVERTENCIA: Se recomienda Node.js >= 14.x');
    } else {
        console.log('✅ Versión de Node.js compatible');
    }
    console.log();
}

// Verificar npm
function checkNpmVersion() {
    exec('npm --version', (error, stdout, stderr) => {
        if (error) {
            console.log('❌ npm no encontrado');
            return;
        }
        
        const npmVersion = stdout.trim();
        console.log(`📦 npm versión: ${npmVersion}`);
        
        const majorVersion = parseInt(npmVersion.split('.')[0]);
        if (majorVersion < 6) {
            console.log('❌ ADVERTENCIA: Se recomienda npm >= 6.x');
        } else {
            console.log('✅ Versión de npm compatible');
        }
        console.log();
    });
}

// Verificar estructura de directorios
function checkDirectoryStructure() {
    console.log('📁 Verificando estructura de directorios...');
    
    const requiredDirs = [
        'config',
        'middleware',
        'models',
        'routes',
        'views',
        'utils',
        'public',
        'public/uploads'
    ];
    
    let allDirsExist = true;
    
    requiredDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            console.log(`✅ ${dir}/`);
        } else {
            console.log(`❌ ${dir}/ - FALTA`);
            allDirsExist = false;
        }
    });
    
    if (allDirsExist) {
        console.log('✅ Estructura de directorios correcta');
    } else {
        console.log('❌ Faltan algunos directorios requeridos');
    }
    console.log();
}

// Verificar archivos críticos
function checkCriticalFiles() {
    console.log('📄 Verificando archivos críticos...');
    
    const criticalFiles = [
        'server.js',
        'package.json',
        'config/database.js',
        'models/User.js',
        'models/Product.js',
        'models/Sale.js',
        'models/Voucher.js',
        'middleware/auth.js',
        'routes/auth.js',
        'routes/admin.js',
        'routes/cashier.js',
        'routes/validator.js',
        'views/login.html',
        'views/admin.html',
        'views/cashier.html',
        'views/validator.html'
    ];
    
    let allFilesExist = true;
    
    criticalFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`✅ ${file}`);
        } else {
            console.log(`❌ ${file} - FALTA`);
            allFilesExist = false;
        }
    });
    
    if (allFilesExist) {
        console.log('✅ Todos los archivos críticos están presentes');
    } else {
        console.log('❌ Faltan algunos archivos críticos');
    }
    console.log();
}

// Verificar dependencias en package.json
function checkPackageJson() {
    console.log('📦 Verificando package.json...');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        console.log(`📝 Nombre del proyecto: ${packageJson.name}`);
        console.log(`🔢 Versión: ${packageJson.version}`);
        
        const requiredDeps = [
            'express',
            'sqlite3',
            'bcryptjs',
            'jsonwebtoken',
            'cors',
            'uuid',
            'qrcode',
            'moment',
            'multer',
            'express-rate-limit',
            'helmet'
        ];
        
        let missingDeps = [];
        
        requiredDeps.forEach(dep => {
            if (packageJson.dependencies && packageJson.dependencies[dep]) {
                console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
            } else {
                console.log(`❌ ${dep} - FALTA`);
                missingDeps.push(dep);
            }
        });
        
        if (missingDeps.length === 0) {
            console.log('✅ Todas las dependencias requeridas están listadas');
        } else {
            console.log(`❌ Faltan dependencias: ${missingDeps.join(', ')}`);
        }
        
    } catch (error) {
        console.log('❌ Error leyendo package.json:', error.message);
    }
    console.log();
}

// Verificar node_modules
function checkNodeModules() {
    console.log('📦 Verificando instalación de dependencias...');
    
    if (fs.existsSync('node_modules')) {
        console.log('✅ Directorio node_modules encontrado');
        
        // Verificar algunas dependencias críticas
        const criticalModules = [
            'express',
            'sqlite3',
            'bcryptjs',
            'jsonwebtoken'
        ];
        
        criticalModules.forEach(module => {
            if (fs.existsSync(path.join('node_modules', module))) {
                console.log(`✅ ${module} instalado`);
            } else {
                console.log(`❌ ${module} - NO INSTALADO`);
            }
        });
    } else {
        console.log('❌ Directorio node_modules no encontrado');
        console.log('   Ejecuta: npm install');
    }
    console.log();
}

// Verificar puerto disponible
function checkPort() {
    console.log('🌐 Verificando disponibilidad del puerto...');
    
    const net = require('net');
    const port = process.env.PORT || 3000;
    
    const server = net.createServer();
    
    server.listen(port, () => {
        console.log(`✅ Puerto ${port} disponible`);
        server.close();
    });
    
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`❌ Puerto ${port} ya está en uso`);
            console.log(`   Usa un puerto diferente: PORT=3001 npm start`);
        } else {
            console.log(`❌ Error verificando puerto: ${err.message}`);
        }
    });
}

// Verificar base de datos
function checkDatabase() {
    console.log('🗄️  Verificando base de datos...');
    
    const dbPath = path.join(__dirname, '..', 'database', 'restaurant.db');
    
    if (fs.existsSync(dbPath)) {
        console.log('✅ Base de datos encontrada');
        console.log(`   Ubicación: ${dbPath}`);
        
        // Verificar tamaño de la base de datos
        const stats = fs.statSync(dbPath);
        const sizeInBytes = stats.size;
        const sizeInKB = Math.round(sizeInBytes / 1024);
        
        console.log(`   Tamaño: ${sizeInKB} KB`);
        
        if (sizeInBytes < 1000) {
            console.log('⚠️  Base de datos muy pequeña, podría estar vacía');
            console.log('   Ejecuta: npm run init-db');
        }
    } else {
        console.log('❌ Base de datos no encontrada');
        console.log('   Ejecuta: npm run init-db');
    }
    console.log();
}

// Verificar permisos de escritura
function checkWritePermissions() {
    console.log('🔑 Verificando permisos de escritura...');
    
    const testDirs = [
        'database',
        'public/uploads',
        'logs'
    ];
    
    testDirs.forEach(dir => {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const testFile = path.join(dir, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            
            console.log(`✅ ${dir}/ - escritura OK`);
        } catch (error) {
            console.log(`❌ ${dir}/ - sin permisos de escritura`);
        }
    });
    console.log();
}

// Función principal
function runSystemCheck() {
    console.log('=' .repeat(50));
    console.log('  VERIFICACIÓN DEL SISTEMA TPV RESTAURANTE');
    console.log('=' .repeat(50));
    console.log();
    
    checkNodeVersion();
    checkNpmVersion();
    checkDirectoryStructure();
    checkCriticalFiles();
    checkPackageJson();
    checkNodeModules();
    checkDatabase();
    checkWritePermissions();
    checkPort();
    
    console.log('=' .repeat(50));
    console.log('  VERIFICACIÓN COMPLETADA');
    console.log('=' .repeat(50));
    console.log();
    console.log('Si hay errores (❌), corrígelos antes de iniciar el servidor.');
    console.log('Para inicializar la base de datos: npm run init-db');
    console.log('Para instalar dependencias: npm install');
    console.log('Para iniciar el servidor: npm start');
    console.log();
}

// Ejecutar si se llama directamente
if (require.main === module) {
    runSystemCheck();
}

module.exports = {
    runSystemCheck,
    checkNodeVersion,
    checkDirectoryStructure,
    checkCriticalFiles,
    checkDatabase
};