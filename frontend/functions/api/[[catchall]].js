export async function onRequest(context) {
  const url = new URL(context.request.url);
  const workerBackendOrigin = 'https://applyflow-backend.harishabblu123.workers.dev';
  const targetUrl = new URL(`${workerBackendOrigin}${url.pathname}${url.search}`);

  // Forward headers with proxy host annotations
  const requestHeaders = new Headers(context.request.headers);
  requestHeaders.set('X-Forwarded-Host', url.host);
  requestHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  // Avoid piping request body on GET/HEAD
  const method = context.request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const proxyRequest = new Request(targetUrl, {
    method,
    headers: requestHeaders,
    body: hasBody ? context.request.body : undefined,
    redirect: 'follow',
  });

  return fetch(proxyRequest);
}
