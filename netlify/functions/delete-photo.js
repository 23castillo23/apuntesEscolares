const https = require('https');
const crypto = require('crypto');

function buildSignature(params, apiSecret) {
  const serialized = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método no permitido' };

  const { publicId } = JSON.parse(event.body || '{}');
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!publicId || !cloudName || !apiKey || !apiSecret) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Faltan datos para eliminar (publicId o variables de entorno).' }),
    };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const signature = buildSignature({ public_id: publicId, timestamp }, apiSecret);

  const formData = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key:   apiKey,
    signature: signature,
  }).toString();

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${cloudName}/image/destroy`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ result: 'error' }); }
      });
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });

  if (result.result === 'ok') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: result.error?.message || 'Error al eliminar' }) };
  }
};