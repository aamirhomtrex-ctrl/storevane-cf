// Runs a Netlify-style handler ({httpMethod, headers, body} -> {statusCode, headers, body}) as a Cloudflare Pages Function.
export async function run(mod, ctx) {
  const req = ctx.request;
  globalThis.process = { env: Object.assign({}, ctx.env || {}) };
  const headers = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  if (headers['cf-connecting-ip']) headers['x-nf-client-connection-ip'] = headers['cf-connecting-ip'];
  const body = (req.method === 'GET' || req.method === 'HEAD') ? '' : await req.text();
  const out = await mod.handler({ httpMethod: req.method, headers, body, isBase64Encoded: false, queryStringParameters: {} });
  const noBody = out.statusCode === 204 || out.statusCode === 304;
  return new Response(noBody ? null : (out.body || ''), { status: out.statusCode, headers: out.headers || {} });
}
