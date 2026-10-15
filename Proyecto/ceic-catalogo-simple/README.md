# CEIC Catálogo Simple

Ambiente de trabajo básico con Node.js, React, PostgreSQL y Docker.

## Estructura

- `backend/` - Servidor Express, conexión a PostgreSQL y variables de entorno
- `frontend/` - Aplicación React con Vite
- `Dockerfile` - Configuración de Docker para la app
- `docker-compose.yml` - Configuración de Docker Compose (app + PostgreSQL)
- `.env` - Variables de entorno para la base de datos, fuera de `backend/`

## Ejecutar con Docker

Configura `DATABASE_URL` o los valores `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` en `.env`. También configura `ADMIN_PASSWORD` para crear el administrador inicial; se almacena con scrypt y no existe una contraseña por defecto. Copia `.env.example` como base y reemplaza sus valores de ejemplo.

```bash
docker compose up --build
```

Esto iniciará:
- Servidor Node.js en http://localhost:3000
- PostgreSQL en localhost:5432

## Acceder a la aplicación

Abre tu navegador en: http://localhost:3000

Deberías ver el mensaje: **"Conectado al servidor y a PostgreSQL"**

## Ejecutar sin Docker (desarrollo)

### 1. Iniciar PostgreSQL localmente:
```bash
docker run -d -p 5432:5432 -e POSTGRES_DB=ceic_catalogo -e POSTGRES_USER=ceic_user -e POSTGRES_PASSWORD=ceic_password postgres:15-alpine
```

### 2. Servidor backend:
```bash
cd backend
npm install
npm start
```

### 3. Cliente React:
```bash
cd frontend
npm install
npm run dev
```

## Configuración de PostgreSQL

- Base de datos: `ceic_catalogo`
- Usuario: `ceic_user`
- Contraseña: `ceic_password`
- Puerto: `5432`

## Gestión de talleres y usuarios

Abre `/admin` e inicia sesión como administrador o como usuario asignado a un taller. El administrador puede gestionar talleres, usuarios, asignaciones y productos; los usuarios solo pueden gestionar los productos de su taller. Las cuentas de usuario nuevas requieren una contraseña inicial de al menos 8 caracteres.

Las tablas actuales (`admin`, `talleres`, `usuarios`, `productos` y `qr_scans`) se crean de forma idempotente desde `backend/db.js`. Se conservan las restricciones existentes: al eliminar un taller, sus usuarios quedan sin asignación y PostgreSQL rechaza la eliminación si todavía tiene productos asociados. La aplicación no elimina ni recrea datos al iniciar.

En desarrollo, ejecuta backend y frontend desde `Proyecto/ceic-catalogo-simple`:

```bash
cd backend
npm install
npm start
```

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite reenvía `/api` al backend en `http://localhost:3000`; en producción el frontend compilado y la API usan el mismo origen. Para producción, define `DATABASE_URL`, `ADMIN_PASSWORD` y `CORS_ORIGIN` (orígenes separados por comas) en el entorno del servidor, nunca en el frontend. El servidor permite `http://localhost:5173` por defecto para el desarrollo local.
