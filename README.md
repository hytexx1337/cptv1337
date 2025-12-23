# 🎬 Movie Catalog - Next.js

Una aplicación web moderna para explorar películas y series, con reproductor integrado, subtítulos automáticos, y más.

## ✨ Características

- 🎥 Catálogo completo de películas y series (TMDB)
- 🎞️ Reproductor de video integrado con Video.js
- 📺 Soporte para múltiples fuentes de streaming
- 🔤 Subtítulos automáticos en múltiples idiomas
- 🎨 Interfaz moderna con Tailwind CSS
- 📱 Diseño responsive
- ⚡ Optimizado con Next.js 15 y Turbopack
- 🔍 Búsqueda avanzada por género, año, calificación
- 📊 Tracking de progreso ("Continuar viendo")
- 🎬 Trailers de YouTube integrados

## 🛠️ Stack Tecnológico

- **Framework:** Next.js 15 (App Router)
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS
- **UI Components:** Headless UI, Heroicons
- **Video Player:** Video.js
- **API:** TMDB API, YouTube API
- **Deployment:** VPS con PM2 + Nginx

## 🚀 Instalación Local

### Pre-requisitos

- Node.js 20+
- npm o yarn
- API keys de TMDB y YouTube

### Pasos

1. **Clonar el repositorio**

```bash
git clone https://github.com/tu-usuario/movie-catalog-videojs.git
cd movie-catalog-videojs
```

2. **Instalar dependencias**

```bash
npm install
```

3. **Configurar variables de entorno**

Crea un archivo `.env.local`:

```env
# TMDB API
NEXT_PUBLIC_TMDB_API_KEY=tu_tmdb_api_key

# YouTube API
NEXT_PUBLIC_YOUTUBE_API_KEY=tu_youtube_api_key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Logger (opcional)
NEXT_PUBLIC_ENABLE_LOGGER=true
```

4. **Ejecutar en desarrollo**

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## 📦 Despliegue en VPS

Para desplegar en un VPS Ubuntu/Debian, sigue la [Guía de Instalación VPS](./VPS-INSTALL-GUIDE.md).

### Resumen rápido:

1. **En tu máquina local:**
```bash
# Subir código limpio a GitHub
git-clean-push.bat  # (Windows)
# o
./git-clean-push.sh  # (Linux/Mac)
```

2. **En el VPS:**
```bash
# Descargar e instalar
curl -O https://raw.githubusercontent.com/tu-usuario/movie-catalog-videojs/main/vps-install.sh
chmod +x vps-install.sh
./vps-install.sh
```

3. **Para actualizar:**
```bash
cd /root/cptv2
./update-app.sh
```

## 📁 Estructura del Proyecto

```
movie-catalog-videojs/
├── src/
│   ├── app/                 # Pages (App Router)
│   │   ├── api/            # API Routes
│   │   ├── movies/         # Página de películas
│   │   ├── tv/             # Página de series
│   │   ├── anime/          # Página de anime
│   │   ├── watch/          # Reproductor
│   │   └── ...
│   ├── components/         # Componentes React
│   ├── lib/               # Utilidades y helpers
│   ├── hooks/             # Custom hooks
│   ├── types/             # TypeScript types
│   └── styles/            # Estilos globales
├── public/                # Assets estáticos
├── vps-install.sh        # Script de instalación VPS
├── update-app.sh         # Script de actualización
└── ecosystem.config.cjs  # Configuración PM2
```

## 🔧 Scripts Disponibles

```bash
# Desarrollo con Turbopack
npm run dev

# Desarrollo sin Turbopack
npm run dev:normal

# Build para producción
npm run build

# Iniciar en producción
npm start

# Linting
npm run lint
```

## 🌐 Variables de Entorno

| Variable | Descripción | Requerido |
|----------|-------------|-----------|
| `NEXT_PUBLIC_TMDB_API_KEY` | API Key de TMDB | ✅ |
| `NEXT_PUBLIC_YOUTUBE_API_KEY` | API Key de YouTube | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL de la aplicación | ✅ |
| `NEXT_PUBLIC_ENABLE_LOGGER` | Habilitar logs en consola | ❌ |

### Obtener API Keys

- **TMDB:** https://www.themoviedb.org/settings/api
- **YouTube:** https://console.cloud.google.com/apis/credentials

## 📝 Comandos VPS Útiles

```bash
# Ver logs de la aplicación
pm2 logs cptv2

# Reiniciar aplicación
pm2 restart cptv2

# Ver estado
pm2 status

# Ver uso de recursos
pm2 monit

# Ver logs de Nginx
tail -f /var/log/nginx/error.log
```

## 🔒 Seguridad

El script de instalación VPS configura automáticamente:

- ✅ Firewall (UFW) con reglas restrictivas
- ✅ Fail2Ban para protección contra ataques de fuerza bruta
- ✅ Nginx como reverse proxy
- ✅ PM2 para gestión de procesos

**Recomendaciones adicionales:**

1. Cambia la contraseña de root regularmente
2. Usa autenticación SSH con llaves
3. Mantén el sistema actualizado
4. Configura backups automáticos

## 🐛 Troubleshooting

### Error: "Cannot find module..."

```bash
rm -rf node_modules .next
npm install
npm run build
```

### Puerto ocupado

```bash
# Ver qué proceso usa el puerto
lsof -i :3000
# Matar el proceso
kill -9 PID
```

### Error de memoria en build

```bash
# Aumentar memoria de Node.js
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

## 📚 Documentación Adicional

- [Guía de Instalación VPS](./VPS-INSTALL-GUIDE.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [TMDB API Docs](https://developers.themoviedb.org/3)
- [Video.js Documentation](https://videojs.com/)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de uso personal.

## 🙏 Créditos

- [The Movie Database (TMDB)](https://www.themoviedb.org/) - API de películas y series
- [Video.js](https://videojs.com/) - Reproductor de video
- [Next.js](https://nextjs.org/) - Framework React
- [Tailwind CSS](https://tailwindcss.com/) - Framework CSS

---

**Desarrollado con ❤️ para la comunidad**

