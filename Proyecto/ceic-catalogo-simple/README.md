# CEIC Catálogo Simple

Ambiente de trabajo básico con Node.js, React, PostgreSQL y Docker.

## Estructura

- `server.js` - Servidor Express con API y conexión a PostgreSQL en [Neon](https://neon.tech)
- `client/` - Aplicación React con Vite
- `Dockerfile` - Configuración de Docker para la app
- `docker-compose.yml` - Configuración de Docker Compose (lee las variables desde `.env`)
- `.env.example` - Plantilla de variables de entorno (copiar a `.env`, que no se sube a git)

## Base de datos (Neon)

Toda la base de datos vive en Neon. Copia la plantilla y pega tu cadena de conexión (Neon Dashboard > Connect):

```bash
cp .env.example .env
# DATABASE_URL=postgresql://usuario:contraseña@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

Al iniciar, el servidor crea las tablas `admins` y `products` si no existen.

## Ejecutar con Docker

```bash
docker-compose up --build
```

Abre tu navegador en http://localhost:3000

## Acceso de administrador

Antes de entrar al sitio se muestra una pantalla de inicio de sesión. Al iniciar el servidor se crea (si no existe) un administrador en la tabla `admins` de PostgreSQL con la contraseña guardada como hash:

- Usuario: `admin` (variable `ADMIN_USERNAME`)
- Contraseña: `admin123` (variable `ADMIN_PASSWORD`)

Cambia estas credenciales en `.env` antes de usarlo en producción. Las rutas `/api/products` requieren una sesión de administrador (`Authorization: Bearer <token>`); la sesión dura 8 horas y se pierde al reiniciar el servidor.

## Ejecutar sin Docker (desarrollo)

### 1. Servidor backend:
```bash
npm install
npm start
```

### 2. Cliente React:
```bash
cd client
npm install
npm run dev
```
