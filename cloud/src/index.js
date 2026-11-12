// James cloud: versioned device config (the bottle setup is live, unversioned) + stats ingest + the config UI.
//
// Static files in public/ are served by the Workers assets binding (see
// wrangler.toml); only /api/* reaches this code. Two bearer tokens, both
// Worker secrets: DEVICE_TOKEN for the Pi (src/routes/device.js) and
// ADMIN_TOKEN for the UI (src/routes/admin.js).

import {json, error, isDevice, isAdmin, HttpError} from './http.js';
import * as device from './routes/device.js';
import * as admin from './routes/admin.js';

const ADMIN_ROUTES = [
  ['GET', /^\/api\/admin\/overview$/, admin.overview],
  ['GET', /^\/api\/admin\/config$/, admin.getConfig],
  ['PUT', /^\/api\/admin\/config$/, admin.putConfig],
  ['GET', /^\/api\/admin\/bottles$/, admin.getBottles],
  ['PUT', /^\/api\/admin\/bottles$/, admin.putBottles],
  ['GET', /^\/api\/admin\/config\/versions$/, admin.versions],
  ['GET', /^\/api\/admin\/config\/versions\/(\d{1,9})$/, admin.version],
  ['POST', /^\/api\/admin\/config\/rollback$/, admin.rollback],
  ['GET', /^\/api\/admin\/stats$/, admin.stats],
  ['GET', /^\/api\/admin\/schema$/, admin.schema],
];

const DEVICE_ROUTES = [
  ['GET', /^\/api\/device\/config$/, device.getConfig],
  ['POST', /^\/api\/device\/stats$/, device.postStats],
  ['POST', /^\/api\/device\/recipes$/, device.addRecipe],
];

function match(routes, method, path) {
  for (const [m, re, handler] of routes) {
    const found = method === m && path.match(re);
    if (found) return {handler, params: found.slice(1)};
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/health') return json({ok: true});

    try {
      if (path.startsWith('/api/device/')) {
        const route = match(DEVICE_ROUTES, request.method, path);
        if (!route) return error('not found', 404);
        if (!(await isDevice(request, env))) return error('unauthorized', 401);
        return await route.handler(request, env, ...route.params);
      }

      if (path.startsWith('/api/admin/')) {
        const route = match(ADMIN_ROUTES, request.method, path);
        if (!route) return error('not found', 404);
        if (!(await isAdmin(request, env))) return error('unauthorized', 401);
        return await route.handler(request, env, ...route.params);
      }
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status, e.extra);
      console.error(`${request.method} ${path} failed:`, e);
      return error('internal error', 500);
    }

    return error('not found', 404);
  },
};
