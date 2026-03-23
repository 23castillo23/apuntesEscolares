/**
 * FotoApuntes — Función Netlify para eliminar fotos de Cloudinary
 * Archivo: netlify/functions/delete-photo.js
 *
 * Variables de entorno en Netlify (ya configuradas con tus datos):
 *   CLOUDINARY_CLOUD_NAME = dwjzn6n0a
 *   CLOUDINARY_API_KEY    = 658928118369874
 *   CLOUDINARY_API_SECRET = wyCuV2e8I9co9Ur2dq1K2hAx_N4
 *   ALLOWED_ORIGIN        = (tu URL de Netlify cuando la tengas)
 */

const https  = require('https');
const crypto = require('crypto');

exports.handler = async (event) => {
  const origin = process.env.ALLOWED_ORIGIN || '*';

  const headers = {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  let publicId;
  try {
    ({ publicId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido' }) };
  }
  if (!publicId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta publicId' }) };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Variables de entorno no configuradas' }) };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const toSign    = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha256').update(toSign).digest('hex');
  const formData  = `public_id=${encodeURIComponent(publicId)}&timestamp=${timestamp}&api_key=${apiKey}&signature=${signature}`;

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path:     `/v1_1/${cloudName}/image/destroy`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ result: 'error' }); } });
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });

  if (result.result === 'ok') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: result.error?.message || 'No se pudo eliminar' }) };
  }
};
