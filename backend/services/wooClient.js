// backend/services/wooClient.js
// Minimal WooCommerce REST API (wc/v3) client.
//   HTTPS stores -> HTTP Basic auth with the consumer key/secret
//   HTTP stores (e.g. LocalWP) -> OAuth 1.0a one-legged signature (required by WooCommerce)

const crypto = require('crypto');
const axios = require('axios');
const { HttpError } = require('../middleware/errorHandler');

function getWooConfig() {
  const url = (process.env.WC_STORE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.WC_CONSUMER_KEY || '').trim();
  const secret = (process.env.WC_CONSUMER_SECRET || '').trim();
  const configured = Boolean(url && key && secret && !url.includes('your-store.com'));
  return { url, key, secret, configured };
}

// RFC 3986 encoding, as OAuth requires.
const enc = (s) => encodeURIComponent(String(s))
  .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function oauthSign(method, url, query, key, secret) {
  const params = {
    ...query,
    oauth_consumer_key: key,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: Math.floor(Date.now() / 1000),
  };
  const paramString = Object.keys(params).sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramString)].join('&');
  const signature = crypto.createHmac('sha256', `${secret}&`).update(base).digest('base64');
  return { ...params, oauth_signature: signature };
}

function friendlyError(err, storeUrl) {
  if (err.response) {
    const { status, data } = err.response;
    if (status === 401 || status === 403) {
      return new HttpError(502, `WooCommerce rejected the API keys (${data?.code || status}). `
        + 'Check WC_CONSUMER_KEY / WC_CONSUMER_SECRET and that the key has Read permission.');
    }
    if (status === 404) {
      return new HttpError(502, `WooCommerce API not found at ${storeUrl}/wp-json/wc/v3. `
        + 'Is WooCommerce active, and are permalinks set to anything other than "Plain"?');
    }
    return new HttpError(502, `WooCommerce error ${status}: ${data?.message || err.message}`);
  }
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code)) {
    return new HttpError(502, `Can't reach the store at ${storeUrl} (${err.code}). Is WC_STORE_URL correct and the site running?`);
  }
  return new HttpError(502, `WooCommerce request failed: ${err.message}`);
}

async function wooGet(endpoint, query = {}) {
  const { url, key, secret, configured } = getWooConfig();
  if (!configured) {
    throw new HttpError(400, 'WooCommerce is not configured. Set WC_STORE_URL, WC_CONSUMER_KEY and WC_CONSUMER_SECRET in backend/.env');
  }

  const endpointUrl = `${url}/wp-json/wc/v3/${endpoint}`;
  const isHttps = endpointUrl.startsWith('https://');

  try {
    const res = await axios.get(endpointUrl, {
      params: isHttps ? query : oauthSign('GET', endpointUrl, query, key, secret),
      auth: isHttps ? { username: key, password: secret } : undefined,
      timeout: 30000,
    });
    return { data: res.data, totalPages: Number(res.headers['x-wp-totalpages']) || 1 };
  } catch (err) {
    throw friendlyError(err, url);
  }
}

/** Fetch every page of a list endpoint (customers, orders, ...). */
async function wooGetAll(endpoint, query = {}) {
  const all = [];
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const res = await wooGet(endpoint, { ...query, per_page: 100, page });
    all.push(...res.data);
    totalPages = res.totalPages;
  }
  return all;
}

module.exports = { getWooConfig, wooGet, wooGetAll };
