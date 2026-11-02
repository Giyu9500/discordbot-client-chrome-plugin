'use strict';

// Discord Bot Panel 1.7 — lokalny pomocnik REST.
// Brak zależności, brak plików z tokenem, brak nasłuchiwania w sieci LAN.
const http = require('node:http');
const { URL } = require('node:url');

const HOST = '127.0.0.1';
const PORT = 17643;
const API_ORIGIN = 'https://discord.com';
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const CLIENT_VERSION = '1.12.0';
const EXTENSION_ORIGIN = /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f-]{36})$/;

function isAllowedRoute(method, pathname) {
  const id = '[0-9]{16,22}';
  const routes = [
    ['GET', /^\/api\/v10\/users\/@me$/],
    ['GET', new RegExp(`^/api/v10/users/${id}$`)],
    ['POST', /^\/api\/v10\/users\/@me\/channels$/],
    ['GET', new RegExp(`^/api/v10/guilds/${id}$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/audit-logs$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/(channels|roles|threads/active|invites|bans|emojis|stickers|widget)$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/widget$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/channels$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/roles$`)],
    ['POST', new RegExp(`^/api/v10/guilds/${id}/emojis$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/emojis/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/emojis/${id}$`)],
    ['POST', new RegExp(`^/api/v10/guilds/${id}/stickers$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/stickers/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/stickers/${id}$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/members/${id}$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/members/search$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/members$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/auto-moderation/rules$`)],
    ['POST', new RegExp(`^/api/v10/guilds/${id}/auto-moderation/rules$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/auto-moderation/rules/${id}$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/auto-moderation/rules/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/auto-moderation/rules/${id}$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/members/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/members/${id}$`)],
    ['PUT', new RegExp(`^/api/v10/guilds/${id}/members/${id}/roles/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/members/${id}/roles/${id}$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/bans/${id}$`)],
    ['PUT', new RegExp(`^/api/v10/guilds/${id}/bans/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/bans/${id}$`)],
    ['POST', new RegExp(`^/api/v10/guilds/${id}/channels$`)],
    ['GET', new RegExp(`^/api/v10/channels/${id}$`)],
    ['PATCH', new RegExp(`^/api/v10/channels/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/channels/${id}$`)],
    ['GET', new RegExp(`^/api/v10/channels/${id}/invites$`)],
    ['POST', new RegExp(`^/api/v10/channels/${id}/invites$`)],
    ['PUT', new RegExp(`^/api/v10/channels/${id}/permissions/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/channels/${id}/permissions/${id}$`)],
    ['POST', new RegExp(`^/api/v10/guilds/${id}/roles$`)],
    ['PATCH', new RegExp(`^/api/v10/guilds/${id}/roles/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/guilds/${id}/roles/${id}$`)],
    ['DELETE', /^\/api\/v10\/invites\/[A-Za-z0-9_-]{2,32}$/],
    ['GET', new RegExp(`^/api/v10/channels/${id}/messages$`)],
    ['GET', new RegExp(`^/api/v10/channels/${id}/messages/pins$`)],
    ['PUT', new RegExp(`^/api/v10/channels/${id}/messages/pins/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/channels/${id}/messages/pins/${id}$`)],
    ['POST', new RegExp(`^/api/v10/channels/${id}/messages/bulk-delete$`)],
    ['GET', new RegExp(`^/api/v10/channels/${id}/messages/${id}/reactions/[^/]{1,200}$`)],
    ['POST', new RegExp(`^/api/v10/channels/${id}/threads$`)],
    ['POST', new RegExp(`^/api/v10/channels/${id}/messages/${id}/threads$`)],
    ['GET', new RegExp(`^/api/v10/channels/${id}/threads/archived/public$`)],
    ['GET', new RegExp(`^/api/v10/guilds/${id}/messages/search$`)],
    ['POST', new RegExp(`^/api/v10/channels/${id}/messages$`)],
    ['PATCH', new RegExp(`^/api/v10/channels/${id}/messages/${id}$`)],
    ['DELETE', new RegExp(`^/api/v10/channels/${id}/messages/${id}$`)],
    ['PUT', new RegExp(`^/api/v10/channels/${id}/messages/${id}/reactions/[^/]{1,200}/@me$`)],
    ['DELETE', new RegExp(`^/api/v10/channels/${id}/messages/${id}/reactions/[^/]{1,200}/@me$`)]
  ];
  return routes.some(([m, re]) => m === method && re.test(pathname));
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_BODY_BYTES) throw Object.assign(new Error('Plik jest za duży (30 MB).'), { status: 413 });
  const parts = [];
  let total = 0;
  for await (const part of req) {
    total += part.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('Plik jest za duży (30 MB).'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}

function makeServer(deps = {}) {
  const remoteFetch = deps.fetch || globalThis.fetch;
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    // Rozszerzenia z uprawnieniem host_permissions mogą wysłać GET/POST bez Origin.
    // Nie oznacza to, że zwykła strona powinna uzyskać dostęp do lokalnego API.
    // Wymagamy niestandardowego nagłówka (strona musiałaby przejść preflight,
    // który z własnym Origin zostaje odrzucony).
    const allowedOrigin = EXTENSION_ORIGIN.test(origin);
    const allowedOriginless = !origin && req.headers['x-botpanel-bridge'] === '1';
    if (req.headers.host !== `${HOST}:${PORT}`) return json(res, 403, { message: 'Nieprawidłowy adres pomocnika.', code: 'BRIDGE_BAD_HOST' });
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (url.pathname === '/health' && req.method === 'GET') {
      // Bez tokenu, tylko diagnoza połączenia.
      if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', origin);
      return json(res, 200, { service: 'DiscordBotPanelLocalBridge', ok: true, version: CLIENT_VERSION });
    }

    // Cross-origin ze zwykłej witryny jest zabroniony. Origin-less jest dozwolony
    // tylko z niestandardowym nagłówkiem rozszerzenia, bez dostępu CORS dla witryn.
    if (!allowedOrigin && !allowedOriginless) {
      console.warn(`[BRIDGE] Odrzucono ${req.method} ${url.pathname}: ${origin ? 'nieuprawniony Origin' : 'brak nagłówka klienta'}`);
      return json(res, 403, { message: 'Niedozwolone źródło żądania.', code: 'BRIDGE_ORIGIN_DENIED' });
    }
    if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-BotPanel-Bridge, X-Audit-Log-Reason');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.headers['x-botpanel-bridge'] !== '1') return json(res, 403, { message: 'Nieznany klient.', code: 'BRIDGE_CLIENT_DENIED' });
    if (!isAllowedRoute(req.method, url.pathname)) return json(res, 404, { message: 'Ta operacja nie jest obsługiwana.' });
    if (typeof req.headers.authorization !== 'string' || !/^Bot [^\s]{10,200}$/.test(req.headers.authorization)) {
      return json(res, 401, { message: 'Brak poprawnego nagłówka autoryzacji bota.' });
    }
    // Wyszukiwanie ma odrębny zestaw jawnie dopuszczonych parametrów.
    const isSearch = /^\/api\/v10\/guilds\/\d{16,22}\/messages\/search$/.test(url.pathname);
    const searchParams = new Set(['content', 'channel_id', 'author_id', 'has', 'sort_by', 'sort_order', 'limit', 'offset', 'min_id', 'max_id']);
    const historyParams = new Set(['limit', 'before', 'after', 'around']);
    const isHistory = /^\/api\/v10\/channels\/\d{16,22}\/messages$/.test(url.pathname);
    const isAudit = /^\/api\/v10\/guilds\/\d{16,22}\/audit-logs$/.test(url.pathname);
    const isBanList = /^\/api\/v10\/guilds\/\d{16,22}\/bans$/.test(url.pathname);
    const isMemberSearch = /^\/api\/v10\/guilds\/\d{16,22}\/members\/search$/.test(url.pathname);
    const isMemberList = /^\/api\/v10\/guilds\/\d{16,22}\/members$/.test(url.pathname);
    const isPins = /^\/api\/v10\/channels\/\d{16,22}\/messages\/pins$/.test(url.pathname);
    const isReactions = /^\/api\/v10\/channels\/\d{16,22}\/messages\/\d{16,22}\/reactions\/[^/]+$/.test(url.pathname);
    const isArchivedThreads = /^\/api\/v10\/channels\/\d{16,22}\/threads\/archived\/public$/.test(url.pathname);
    const allowParams = isSearch ? searchParams : isHistory ? historyParams : isAudit ? new Set(['limit','before','after','user_id','action_type']) : isBanList ? new Set(['limit','before','after']) : isMemberSearch ? new Set(['query','limit']) : isMemberList ? new Set(['limit','after']) : isPins ? new Set(['limit','before']) : isReactions ? new Set(['limit','after']) : isArchivedThreads ? new Set(['limit','before']) : new Set();
    if (![...url.searchParams.keys()].every(k => allowParams.has(k))) {
      return json(res, 400, { message: 'Nieobsługiwany parametr żądania.' });
    }
    if (isSearch && (url.search.length > 9500 || (url.searchParams.get('content') || '').length > 1024 || Number(url.searchParams.get('offset') || 0) > 9975)) {
      return json(res, 400, { message: 'Zbyt długie zapytanie wyszukiwania.' });
    }

    try {
      const body = await readBody(req);
      const headers = {
        'Authorization': req.headers.authorization,
        'User-Agent': 'DiscordBot (https://discord.com/developers/docs, 1.12.0)',
        'Accept': 'application/json'
      };
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      if (typeof req.headers['x-audit-log-reason'] === 'string' && req.headers['x-audit-log-reason'].length <= 512) headers['X-Audit-Log-Reason'] = req.headers['x-audit-log-reason'];
      const upstream = await remoteFetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
        method: req.method,
        headers,
        body: body.length ? body : undefined,
        signal: AbortSignal.timeout(25000)
      });
      const content = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const retry = upstream.headers.get('retry-after');
      if (retry) res.setHeader('Retry-After', retry);
      res.end(content);
    } catch (error) {
      // Nigdy nie logujemy tokenu ani treści wiadomości / załączników.
      const status = error.status || 502;
      const reason = status === 413 ? error.message : `Discord API nieosiągalne (${error.cause?.code || error.code || error.name || 'network'}).`;
      console.error(`[REST] ${req.method} ${url.pathname}: ${reason}`);
      if (!res.headersSent) json(res, status, { message: reason, code: 'LOCAL_BRIDGE_ERROR' });
      else res.end();
    }
  });
}

if (require.main === module) {
  const server = makeServer();
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} jest zajety. Zamknij drugi pomocnik i sprobuj ponownie.`);
    else console.error('Nie mozna uruchomic pomocnika:', error.message);
    process.exitCode = 1;
  });
  server.listen(PORT, HOST, () => {
    console.log('==============================================');
    console.log(' Discord Bot Panel - lokalny pomocnik v1.12');
    console.log('==============================================');
    console.log(` Dziala na http://${HOST}:${PORT}`);
    console.log(' Teraz mozesz otworzyc panel w przegladarce.');
    console.log(' Zostaw to okno otwarte podczas korzystania.');
    console.log(' Aby wylaczyc, wcisnij Ctrl+C.');
    console.log(' Token nie jest zapisywany w tym procesie.');
    console.log('==============================================');
  });
}

module.exports = { makeServer, isAllowedRoute, HOST, PORT };
