# FotoApuntes — Instrucciones finales

## Estructura del proyecto (sube TODO esto a GitHub)
```
fotoapuntes/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── escolar.js
└── netlify/
    └── functions/
        └── delete-photo.js
```

---

## Paso 1 — Sube a GitHub
Crea un repositorio nuevo en GitHub y sube todos los archivos
manteniendo la estructura de carpetas exactamente como está.

---

## Paso 2 — Conecta con Netlify
1. Ve a https://app.netlify.com
2. "Add new site" → "Import from Git" → elige tu repositorio
3. Deja todo por defecto y haz clic en "Deploy"

---

## Paso 3 — Agrega las variables de entorno en Netlify
Ve a: Site settings → Environment variables → Add variable

| Variable                | Valor                        |
|-------------------------|------------------------------|
| CLOUDINARY_CLOUD_NAME   | dwjzn6n0a                    |
| CLOUDINARY_API_KEY      | 658928118369874              |
| CLOUDINARY_API_SECRET   | wyCuV2e8I9co9Ur2dq1K2hAx_N4 |
| ALLOWED_ORIGIN          | https://TU-SITIO.netlify.app |

---

## Paso 4 — Actualiza 2 líneas en escolar.js

Una vez que Netlify te dé tu URL (ej: fotoapuntes-abc123.netlify.app),
abre js/escolar.js y cambia estas 2 líneas:

  const DELETE_FUNCTION_URL = 'https://fotoapuntes-abc123.netlify.app/.netlify/functions/delete-photo';
  const ADMIN_PIN = '1234';   ← cambia por tu PIN secreto

Guarda, haz commit y push. Netlify se actualiza solo.

---

## Paso 5 — Crea el upload preset en Cloudinary
1. Cloudinary → Settings → Upload → Upload presets
2. "Add upload preset"
3. Signing mode: Unsigned
4. Nombre del preset: escolar_unsigned
5. Guardar

¡Listo! Tu app estará funcionando al 100%.
