/**
 * FotoApuntes — Función Netlify para eliminar fotos de Cloudinary
 * Archivo: netlify/functions/delete-photo.js
 */

const https  = require('https');
const crypto = require('crypto');

exports.handler = async (event) => {
  // Permitir cualquier origen si no está configurado (o el configurado)
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

  const headers = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  let publicId;
  try {
    const body = JSON.parse(event.body || '{}');
    publicId = body.publicId;
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }
  if (!publicId || typeof publicId !== 'string' || publicId.trim() === '') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta publicId o está vacío' }) };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Variables de entorno de Cloudinary no configuradas en Netlify' })
    };
  }

  const timestamp = Math.round(Date.now() / 1000);
  // La firma debe incluir exactamente los parámetros que se envían (ordenados alfabéticamente)
  const toSign    = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha256').update(toSign).digest('hex');

  const formData = new URLSearchParams({
    public_id: publicId,
    timestamp:  String(timestamp),
    api_key:    apiKey,
    signature:  signature,
  }).toString();

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
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ result: 'parse_error', raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });

  if (result.result === 'ok') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } else {
    const msg = result.error?.message || result.result || 'No se pudo eliminar';
    return { statusCode: 400, headers, body: JSON.stringify({ error: msg, detail: result }) };
  }
};
