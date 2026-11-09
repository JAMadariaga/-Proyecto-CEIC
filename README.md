<div align="center">

<img src="./Proyecto/ceic-catalogo-simple/frontend/public/logo.png" alt="Logo CEIC" width="140" />

# Catálogo Digital CEIC

**Plataforma web de catálogo de productos y servicios para los Talleres Laborales del Centro Educativo Integral de Curicó (CEIC)**

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

</div>

---

## Descripción del Proyecto

El **Catálogo Digital CEIC** es una aplicación web diseñada para visibilizar y facilitar la difusión de los productos físicos y servicios elaborados por los estudiantes de los **Talleres Laborales del Centro Educativo Integral de Curicó**.

El sistema cuenta con una vitrina pública accesible para la comunidad y un panel de gestión con control de acceso basado en roles (**Administrador General** y **Encargados de Taller**), además de herramientas integradas para la generación y medición de visitas mediante códigos QR.

---

## Características Principales

### 🛍️ Catálogo Público
- **Vitrina Interactiva**: Visualización clara de productos físicos y servicios con precios formateados en pesos chilenos (`CLP`), imágenes optimizadas y descripciones.
- **Filtro por Taller**: Navegación rápida por talleres laborales (*Lavado de autos*, *Repostería*, *Mantención y reparaciones*, *Tetería*, entre otros).
- **Diseño Responsivo y Accesible**: Interfaz adaptada para celulares, tablets y computadores, con alto contraste y controles de fácil lectura.

### 🔐 Panel de Administración (`/admin`)
- **Dashboard de Estadísticas**: Resumen en tiempo real del total de talleres activos, usuarios registrados, productos/servicios publicados y escaneos de códigos QR.
- **Gestión de Talleres**: Creación, edición, activación/desactivación y eliminación segura de talleres laborales.
- **Gestión de Usuarios**: Creación de cuentas para encargados de taller, asignación de talleres y restablecimiento de contraseñas.
- **Gestión Global de Productos y Servicios**: Control de inventario, precios, fotografías y diferenciación entre producto físico (con stock) y servicio.
- **Seguridad del Administrador**: Cambio de contraseña de administrador directamente desde el panel con validación de clave actual y hashing criptográfico (`scrypt`).
- **Generador de Códigos QR**: Creación de códigos QR personalizados por origen (ej. `?src=feria`), descarga directa en formato `PNG` y conteo automático de escaneos.

### 🛠️ Panel de Encargado de Taller
- **Acceso Delimitado por Rol**: Cada encargado administra exclusivamente los productos y servicios pertenecientes a su taller asignado.
- **Procesamiento Automático de Fotografías**: Las imágenes subidas desde teléfonos o computadores se rotan automáticamente según metadatos EXIF, se redimensionan a un máximo de `900x900px` y se comprimen en formato `JPEG` mediante `Sharp`.

---

## Tecnologías Utilizadas

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend** | React 19, Vite 8, CSS3 moderno, `qrcode.react` |
| **Backend** | Node.js, Express.js, Multer (carga de archivos), Sharp (procesamiento de imágenes) |
| **Seguridad** | Autenticación Bearer Token en memoria con expiración (TTL), hashing con `crypto.scryptSync` + comparación segura `timingSafeEqual`, Rate Limiting por IP |
| **Base de Datos** | PostgreSQL 15 (`pg`) con inicialización idempotente de esquemas |
| **Despliegue** | Docker, Docker Compose |

---

## Estructura del Repositorio

```text
-Proyecto-CEIC/
└── Proyecto/
    └── ceic-catalogo-simple/
        ├── backend/
        │   ├── controllers/
        │   │   ├── adminController.js      # Consultas y actualización de administradores
        │   │   ├── productoController.js   # CRUD de productos y servicios
        │   │   ├── qrScanController.js     # Registro y métricas de escaneos QR
        │   │   ├── tallerController.js     # CRUD de talleres laborales
        │   │   └── usuarioController.js    # CRUD de usuarios encargados de taller
        │   ├── authorization.js            # Reglas de permisos por rol y taller
        │   ├── authorization.test.js       # Pruebas unitarias de autorización
        │   ├── db.js                       # Conexión a PostgreSQL y creación de tablas
        │   ├── server.js                   # Servidor Express, rutas API y autenticación
        │   └── package.json
        ├── frontend/
        │   ├── public/                     # Activos estáticos y logo institucional
        │   ├── src/
        │   │   ├── App.jsx                 # Enrutador principal ('/' y '/admin')
        │   │   ├── Catalog.jsx             # Vista del catálogo público
        │   │   ├── Manager.jsx             # Panel de administración y gestión de talleres
        │   │   ├── talleres.js             # Utilidades de formato de precios e íconos
        │   │   ├── App.css                 # Estilos base y layout del panel
        │   │   ├── extra.css               # Estilos del catálogo público y QR
        │   │   └── polish.css              # Animaciones, transiciones y acabados visuales
        │   └── package.json
        ├── Dockerfile                      # Construcción multi-etapa para producción
        ├── docker-compose.yml              # Orquestación de App + PostgreSQL 15
        └── .env                            # Variables de entorno (no versionado en producción)
```

---

## Modelo de Base de Datos

Al iniciar el servidor, `backend/db.js` crea de forma automática e idempotente las siguientes tablas en PostgreSQL:

| Tabla | Descripción |
| :--- | :--- |
| `admin` | Cuentas de administración general (`id_admin`, `nombre`, `correo`, `password_hash`, `activo`). |
| `talleres` | Talleres laborales del establecimiento (`id_taller`, `nombre`, `descripcion`, `direccion`, `activo`). |
| `usuarios` | Encargados asignados a un taller (`id_usuario`, `nombre`, `apellido`, `correo`, `password_hash`, `id_taller`, `activo`). |
| `productos` | Catálogo de productos físicos y servicios (`id_producto`, `id_taller`, `tipo`, `nombre`, `descripcion`, `precio`, `stock`, `imagen_url`, `activo`). |
| `qr_scans` | Historial de visitas originadas por códigos QR (`id`, `source`, `scanned_at`). |

---

## Configuración de Variables de Entorno

Crea un archivo `.env` dentro de `Proyecto/ceic-catalogo-simple/.env` con la siguiente estructura:

```env
# Conexión directa mediante URL (ej. Neon, Render, Supabase)
DATABASE_URL=postgresql://usuario:password@host:5432/ceic_catalogo

# O configuración por parámetros individuales (usado en Docker / local)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ceic_catalogo
DB_USER=ceic_user
DB_PASSWORD=ceic_password

# Credenciales iniciales del Administrador
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin
ADMIN_NAME=Administrador
ADMIN_PASSWORD=tu_password_seguro_aqui

# Orígenes permitidos por CORS (separados por coma)
CORS_ORIGIN=http://localhost:5173
```

---

## Instalación y Ejecución

### Opción 1: Ejecución con Docker (Recomendado)

Ubícate en la carpeta de la aplicación y levanta los contenedores:

```bash
cd Proyecto/ceic-catalogo-simple
docker compose up --build
```

- **Catálogo Público**: [http://localhost:3000](http://localhost:3000)
- **Panel de Administración**: [http://localhost:3000/admin](http://localhost:3000/admin)
- **Base de Datos PostgreSQL**: `localhost:5432`

---

### Opción 2: Ejecución en Entorno de Desarrollo Local

#### 1. Clonar e instalar dependencias del Backend
```bash
cd Proyecto/ceic-catalogo-simple/backend
npm install
npm start
```
El servidor API quedará disponible en `http://localhost:3000`.

#### 2. Instalar dependencias y levantar el Frontend
En una nueva terminal:
```bash
cd Proyecto/ceic-catalogo-simple/frontend
npm install
npm run dev
```
El cliente de desarrollo Vite se abrirá en `http://localhost:5173` (con proxy automático hacia `/api` en el puerto `3000`).

#### 3. Ejecutar pruebas unitarias
```bash
cd Proyecto/ceic-catalogo-simple/backend
npm test
```

---

## Principales Endpoints de la API

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/workshops` | Público | Lista todos los talleres activos. |
| `GET` | `/api/products` | Público | Lista los productos y servicios activos. |
| `GET` | `/api/products/:id/image` | Público | Sirve la imagen optimizada de un producto. |
| `GET` | `/qr?src=<origen>` | Público | Registra un escaneo QR y redirige al catálogo. |
| `POST` | `/api/login` | Público | Inicia sesión como administrador o encargado de taller. |
| `GET` | `/api/me` | Autenticado | Obtiene el perfil y taller de la sesión actual. |
| `POST` | `/api/logout` | Autenticado | Cierra la sesión activa. |
| `POST` | `/api/admin/password` | Admin | Permite al administrador cambiar su contraseña. |
| `GET / POST / PUT / DELETE` | `/api/admin/workshops` | Admin | Gestión completa de talleres. |
| `GET / POST / PUT / DELETE` | `/api/admin/users` | Admin | Gestión completa de usuarios de taller. |
| `GET / POST / PUT / DELETE` | `/api/my/products` | Encargado | Gestión de productos/servicios del propio taller. |
| `GET` | `/api/admin/stats` | Admin | Métricas globales y conteo de escaneos QR. |

---

<div align="center">
  <sub>Desarrollado para el <strong>Centro Educativo Integral de Curicó (CEIC)</strong> · 2026</sub>
</div>
