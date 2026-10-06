# CEIC Catálogo Simple

Ambiente de trabajo básico con Node.js, React, PostgreSQL y Docker.

## Estructura

- `server.js` - Servidor Express con API de prueba y conexión a PostgreSQL
- `client/` - Aplicación React con Vite
- `Dockerfile` - Configuración de Docker para la app
- `docker-compose.yml` - Configuración de Docker Compose (app + PostgreSQL)
- `.env` - Variables de entorno para la base de datos

## Ejecutar con Docker

```bash
docker-compose up --build
```

Esto iniciará:
- Servidor Node.js en http://localhost:3000
- PostgreSQL en localhost:5432

## Acceder a la aplicación

Abre tu navegador en: http://localhost:3000

Deberías ver el mensaje: **"Conectado al servidor y a PostgreSQL"**

## Acceso de administrador

Antes de entrar al sitio se muestra una pantalla de inicio de sesión. Al iniciar el servidor se crea (si no existe) un administrador en la tabla `admins` de PostgreSQL con la contraseña guardada como hash:

- Usuario: `admin` (variable `ADMIN_USERNAME`)
- Contraseña: `admin123` (variable `ADMIN_PASSWORD`)

Cambia estas credenciales en `docker-compose.yml` antes de usarlo en producción. Las rutas `/api/products` requieren una sesión de administrador (`Authorization: Bearer <token>`); la sesión dura 8 horas y se pierde al reiniciar el servidor.

## Ejecutar sin Docker (desarrollo)

### 1. Iniciar PostgreSQL localmente:
```bash
docker run -d -p 5432:5432 -e POSTGRES_DB=ceic_catalogo -e POSTGRES_USER=ceic_user -e POSTGRES_PASSWORD=ceic_password postgres:15-alpine
```

### 2. Servidor backend:
```bash
npm install
npm start
```

### 3. Cliente React:
```bash
cd client
npm install
npm run dev
```

## Configuración de PostgreSQL

- Base de datos: `ceic_catalogo`
- Usuario: `ceic_user`
- Contraseña: `ceic_password`
- Puerto: `5432`
