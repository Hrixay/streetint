// STREETINT live API — Cloudflare Pages Function.
// GET /v1/indices → computes every index on request, edge-cached 15 minutes,
// CORS-open so any dashboard (including the Risk Intelligence Index) can consume it.
import { computeIndices } from '../_compute.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let data;
  try {
    data = await computeIndices();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'compute_failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json', ...CORS },
    });
  }

  const resp = new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=900',
      ...CORS,
    },
  });
  waitUntil(cache.put(request, resp.clone()));
  return resp;
}
