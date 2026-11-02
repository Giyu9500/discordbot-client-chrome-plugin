'use strict';

// Discord Bot Panel 1.6 — REST przez lokalnego pomocnika, Gateway bezpośrednio.
// Token bota pozostaje w pamięci rozszerzenia / chrome.storage.session, opcjonalnie storage.local.
const API = 'http://127.0.0.1:17643/api/v10';
const BRIDGE_HEALTH = 'http://127.0.0.1:17643/health';
const REQUIRED_BRIDGE_VERSION = '1.12.0';
const PRESENCE_LABELS = { online: 'Dostępny', idle: 'Zaraz wracam', dnd: 'Nie przeszkadzać', invisible: 'Niewidoczny' };
const PRESENCE_STATUSES = new Set(Object.keys(PRESENCE_LABELS));
const ACTIVITY_TYPES = new Set([0, 2, 3, 5]);
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const INTENTS = (1 << 0) | (1 << 2) | (1 << 20) | (1 << 21) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 13);
const MESSAGE_CONTENT_INTENT = 1 << 15;
const PRESENCE_INTENT = 1 << 8;
const SUPPORTED_CHANNEL_TYPES = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15, 16]);
const NO_DIRECT_MESSAGES_TYPES = new Set([4, 15, 16]);
const CHANNEL_ICONS = { 0: '#', 2: '🔊', 5: '📢', 10: '⌗', 11: '⌗', 12: '⌗', 13: '🎙', 15: '▤', 16: '▧' };
const FLAGS = { VIEW_CHANNEL: 1n << 10n, SEND_MESSAGES: 1n << 11n, READ_MESSAGE_HISTORY: 1n << 16n, ADMINISTRATOR: 1n << 3n, SEND_MESSAGES_IN_THREADS: 1n << 38n };
const $ = id => document.getElementById(id);
const state = {
  token: null, me: null, remember: false, contentIntent: true, intentFallback: false,
  presenceStatus: 'online', activityType: 0, activityName: '', presenceIntent: true, presenceFallback: false, memberPresences: new Map(),
  gatewayBase: GATEWAY, ws: null, seq: null, sessionId: null, resumeUrl: null,
  heartbeatId: null, reconnectId: null, heartbeatAck: true, retryCount: 0,
  guilds: new Map(), roles: new Map(), memberCache: new Map(), memberQueue: [], memberMissing: new Set(), memberRunner: null, channels: [], guildId: null, channelId: null, oldGuild: null, oldChannel: null,
  channelPermissions: new Map(), messages: new Map(), hasOlder: new Map(), unread: new Set(),
  selectedReply: null, file: null, loadingMessages: false, sending: false, editingMessage: null,
  channelRefreshTimer: null, loginGeneration: 0, messageGeneration: 0,
  dmView: false, dmChannels: new Map(), nativePort: null, nativeReady: false, nativeError: null,
  auditBefore: null, auditBusy: false, profileUser: null,
  searchGeneration: 0, searchBusy: false, searchParams: null, searchOffset: 0,
  searchTotal: 0, searchThreads: new Map(), highlightId: null, historyJump: false, pauseOlder: false,
};

class DiscordError extends Error {
  constructor(message, status, code) { super(message); this.name = 'DiscordError'; this.status = status; this.code = code; }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const permissions = n => { try { return BigInt(n || '0'); } catch (_) { return 0n; } };
const has = (value, bit) => (value & bit) === bit;
const timeString = timestamp => {
  try { return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)); }
  catch (_) { return ''; }
};
function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = String(text);
  return node;
}
function toast(message, isError = false) {
  const node = el('div', `toast${isError ? ' error' : ''}`, message);
  $('toast-layer').append(node);
  setTimeout(() => node.remove(), 5600);
}
function showBanner(message = '') {
  $('warning-banner').textContent = message;
  $('warning-banner').classList.toggle('hidden', !message);
}
function showLoginError(message = '') {
  $('login-error').textContent = message;
  $('login-error').classList.toggle('hidden', !message);
}
function status(label, mode = 'connecting') {
  $('gateway-status').textContent = label;
  $('gateway-pill').className = `connection-pill ${mode} hidden`;
  const acc = $('account-connection'); if(acc){acc.className=`account-connection ${mode}`;$('account-connection-text').textContent = mode==='online'?'Na żywo':(label||'Łączenie…');}
}
function shortName(name) {
  const words = (name || '?').trim().split(/\s+/);
  return (words.length > 1 ? words.slice(0, 2).map(w => w[0]).join('') : words[0].slice(0, 2)).toUpperCase();
}
function safeMediaUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net' || parsed.hostname.endsWith('.discordapp.net')) return parsed.href;
  } catch (_) { /* ignore invalid URL */ }
  return null;
}
function avatarUrl(user, size = 80) {
  if (!user) return null;
  if (user.avatar && user.id) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=${size}`;
  return null;
}
function setAvatar(container, user, size = 80) {
  container.replaceChildren();
  const url = avatarUrl(user, size);
  if (url) {
    const img = el('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover';
    img.addEventListener('error', () => { container.textContent = shortName(user.global_name || user.username || 'Bot'); }, { once: true });
    container.append(img);
  } else container.textContent = shortName(user?.global_name || user?.username || '?');
}
function clearGateway() {
  if (state.heartbeatId) clearInterval(state.heartbeatId);
  if (state.reconnectId) clearTimeout(state.reconnectId);
  if (state.channelRefreshTimer) clearTimeout(state.channelRefreshTimer);
  state.heartbeatId = null; state.reconnectId = null; state.channelRefreshTimer = null;
  const ws = state.ws;
  state.ws = null;
  if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(1000, 'Closing panel'); } catch (_) {} }
}
async function ensureBridge() {
  // Pierwsze uruchomienie natywnego pomocnika może potrwać kilka sekund.
  if (state.nativePort && !state.nativeReady && !state.nativeError) {
    for (let i=0;i<45 && state.nativePort && !state.nativeReady && !state.nativeError;i++) await delay(120);
  }
  if (state.nativeError && !state.nativeReady) {
    // Ręczny START-PANEL.bat pozostaje możliwą drogą awaryjną.
    try { const r=await fetch(BRIDGE_HEALTH,{signal:AbortSignal.timeout(1000)}); if (!r.ok) throw Error(); }
    catch (_) { throw new DiscordError('Autostart nie jest skonfigurowany: '+state.nativeError+' Uruchom INSTALUJ-AUTOSTART.bat, podaj ID rozszerzenia i odśwież kartę.',0,'BRIDGE_NATIVE_INSTALL'); }
  }
  try {
    const response = await fetch(BRIDGE_HEALTH, { cache: 'no-store', signal: AbortSignal.timeout(3500) });
    const data = await response.json();
    if (response.ok && data?.service === 'DiscordBotPanelLocalBridge' && data?.ok === true) {
      if (data.version !== REQUIRED_BRIDGE_VERSION) {
        throw new DiscordError(`Uruchomiony pomocnik ma wersję ${data.version || 'nieznaną'}, a potrzebna jest ${REQUIRED_BRIDGE_VERSION}. Zamknij stare START-PANEL.bat i korzystaj z pomocnika v1.12.`, 0, 'BRIDGE_OLD_VERSION');
      }
      return true;
    }
  } catch (error) { if (error?.code === 'BRIDGE_OLD_VERSION') throw error; }
  throw new DiscordError('Nie mogę połączyć się z lokalnym pomocnikiem. Uruchom INSTALUJ-AUTOSTART.bat (jednorazowo), a następnie odśwież kartę. Możesz też awaryjnie użyć START-PANEL.bat.', 0, 'BRIDGE_OFFLINE');
}
async function api(path, options = {}, attempt = 0) {
  if (!state.token) throw new DiscordError('Nie jesteś zalogowany.', 401);
  const headers = { Authorization: `Bot ${state.token}` };
  if (!(options.body instanceof FormData) && options.body != null) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers, 'X-BotPanel-Bridge': '1' }, signal: AbortSignal.timeout(30000) });
  } catch (error) { throw new DiscordError('Brak kontaktu z lokalnym pomocnikiem. Zainstaluj autostart przez INSTALUJ-AUTOSTART.bat lub uruchom START-PANEL.bat. (' + (error?.name || 'network') + ')', 0, 'BRIDGE_OFFLINE'); }
  if (response.status === 204) return null;
  let result;
  try { result = await response.json(); } catch (_) { result = null; }
  if (response.status === 429 && attempt < 2) {
    const retryAfter = Math.max(0.3, Math.min(15, Number(result?.retry_after ?? response.headers.get('Retry-After') ?? 1)));
    await delay(retryAfter * 1000 + 150);
    return api(path, options, attempt + 1);
  }
  if ([502, 503, 504].includes(response.status) && attempt < 1) {
    await delay(1250);
    return api(path, options, attempt + 1);
  }
  if (!response.ok) {
    const description = {
      400: 'Niepoprawne żądanie.', 401: 'Token bota jest nieprawidłowy lub utracił ważność.',
      403: 'Bot nie ma wymaganych uprawnień.', 404: 'Nie znaleziono kanału lub wiadomości.',
      413: 'Plik jest za duży.', 429: 'Discord ograniczył liczbę żądań. Spróbuj ponownie za chwilę.'
    }[response.status] || 'Żądanie nie powiodło się.';
    if (result?.code === 'BRIDGE_ORIGIN_DENIED' || result?.code === 'BRIDGE_CLIENT_DENIED') {
      throw new DiscordError('Pomocnik odrzucił żądanie panelu. Upewnij się, że otwierasz panel przez ikonę zainstalowanego rozszerzenia i korzystasz z pomocnika v1.8 (zamknij starsze START-PANEL.bat).', 403, result.code);
    }
    if (result?.code === 40333) {
      throw new DiscordError('Discord/Cloudflare zablokował żądanie (HTTP 403, kod 40333). To nie oznacza braku uprawnień bota. Sprawdź połączenie lub spróbuj później.', 403, 40333);
    }
    throw new DiscordError(`${description}${result?.message && response.status !== 401 ? ` (${String(result.message).slice(0, 110)})` : ''}${result?.code ? ` [kod: ${result.code}]` : ''}`, response.status, result?.code);
  }
  return result;
}

function resetWorkspace() {
  state.loginGeneration += 1;
  state.messageGeneration += 1;
  state.searchGeneration += 1;
  state.guilds.clear(); state.roles.clear(); state.memberCache.clear(); state.memberQueue = []; state.memberMissing.clear(); clearTimeout(state.memberRunner); state.memberRunner = null; state.channels = []; state.messages.clear(); state.hasOlder.clear();
  state.unread.clear(); state.channelPermissions.clear();
  state.guildId = null; state.channelId = null; state.dmView = false; state.dmChannels.clear(); state.selectedReply = null; state.file = null;
  state.seq = null; state.sessionId = null; state.resumeUrl = null;
  state.retryCount = 0; state.loadingMessages = false; state.sending = false;
  state.searchBusy = false; state.searchParams = null; state.searchOffset = 0; state.searchTotal = 0;
  state.searchThreads.clear(); state.highlightId = null; state.historyJump = false; state.pauseOlder = false;
  $('search-results').replaceChildren(); $('search-description').textContent = 'Wybierz filtry i kliknij „Szukaj”.';
  $('search-more-button').classList.add('hidden'); $('latest-button').classList.add('hidden');
  $('search-panel').classList.add('hidden'); $('open-search-button').classList.remove('active');
  $('guild-list').replaceChildren(); $('channel-list').replaceChildren(); $('messages').replaceChildren();
  $('guild-title').textContent = 'Wybierz serwer'; $('channel-title').textContent = 'Wybierz kanał'; $('dm-home').classList.remove('active');
  $('channel-topic').textContent = ''; updateComposer(); showBanner('');
}
function switchToLogin(error = '') {
  clearGateway(); resetWorkspace(); state.token = null; state.me = null;
  $('app-view').classList.add('hidden'); $('login-view').classList.remove('hidden');
  $('token-input').value = ''; $('login-button').disabled = false; $('login-button').textContent = 'Połącz z botem →';
  showLoginError(error);
}
function switchToApp() {
  $('login-view').classList.add('hidden'); $('app-view').classList.remove('hidden');
  $('my-name').textContent = state.me.global_name || state.me.username || 'Bot';
  $('my-id').textContent = `ID: ${state.me.id}`;
  setAvatar($('my-avatar'), state.me, 80);
  status('Łączenie…');
  updateComposer();
}
async function saveToken() {
  try {
    await chrome.storage.session.set({ botToken: state.token, useContentIntent: state.contentIntent });
    if (state.remember) await chrome.storage.local.set({ botToken: state.token });
    else await chrome.storage.local.remove('botToken');
  } catch (_) { toast('Nie można zapisać sesji w przeglądarce.', true); }
}
async function login(token, opts = {}) {
  const cleaned = String(token || '').trim().replace(/^Bot\s+/i, '');
  if (!cleaned) { showLoginError('Wklej token bota.'); return; }
  const generation = ++state.loginGeneration;
  $('login-button').disabled = true;
  $('login-button').textContent = 'Sprawdzanie tokenu…';
  showLoginError('');
  state.token = cleaned;
  state.remember = !!opts.remember;
  state.contentIntent = opts.contentIntent !== false;
  state.intentFallback = false;
  try {
    await ensureBridge();
    const user = await api('/users/@me');
    if (generation !== state.loginGeneration) return;
    if (!user.bot) throw new DiscordError('Ten token nie należy do bota. Użyj tokenu z Discord Developer Portal.', 401);
    state.me = user;
    await saveToken();
    const saved = await chrome.storage.local.get(['selectedGuildId', 'selectedChannelId']).catch(() => ({}));
    state.oldGuild = saved.selectedGuildId || null;
    state.oldChannel = saved.selectedChannelId || null;
    await restoreDmChannels();
    switchToApp();
    connectGateway(false);
  } catch (err) {
    if (generation !== state.loginGeneration) return;
    state.token = null;
    showLoginError(err.message || 'Nie udało się zalogować.');
    $('login-button').disabled = false;
    $('login-button').textContent = 'Połącz z botem →';
  }
}
async function logout() {
  clearGateway();
  try { await Promise.all([chrome.storage.local.remove('botToken'), chrome.storage.session.remove('botToken')]); }
  catch (_) { /* continue; storage may be unavailable */ }
  switchToLogin();
  toast('Wylogowano. Zapamiętany token został usunięty.');
}

function sendGateway(op, d) {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ op, d }));
}
function presencePayload() {
  const activities = state.activityName.trim()
    ? [{ name: state.activityName.trim(), type: state.activityType }]
    : [];
  return {
    since: state.presenceStatus === 'idle' ? Date.now() : null,
    activities,
    status: state.presenceStatus,
    afk: state.presenceStatus === 'idle'
  };
}
function pushPresence() {
  // W czasie IDENTIFY obecność jest wysyłana w pakiecie startowym.
  if (!state.sessionId || state.ws?.readyState !== WebSocket.OPEN) return false;
  sendGateway(3, presencePayload());
  return true;
}
function updatePresenceDisplay() {
  const label = PRESENCE_LABELS[state.presenceStatus] || PRESENCE_LABELS.online;
  $('presence-label').textContent = label;
  $('presence-dot').className = `presence-dot ${state.presenceStatus}`;
  $('presence-open-button').title = `Zmień status lub aktywność bota (teraz: ${label})`;
}
function openPresenceSettings() {
  $('presence-status-input').value = state.presenceStatus;
  $('activity-type-input').value = String(state.activityType);
  $('activity-name-input').value = state.activityName;
  $('presence-dialog').showModal();
}
async function savePresenceSettings() {
  const value = $('presence-status-input').value;
  const activityType = Number($('activity-type-input').value);
  const activityName = $('activity-name-input').value.trim().slice(0, 128);
  if (!PRESENCE_STATUSES.has(value) || !ACTIVITY_TYPES.has(activityType)) {
    toast('Niepoprawne ustawienia obecności.', true);
    return;
  }
  state.presenceStatus = value;
  state.activityType = activityType;
  state.activityName = activityName;
  updatePresenceDisplay();
  $('presence-dialog').close();
  try {
    await chrome.storage.local.set({ botPresenceStatus: value, botActivityType: activityType, botActivityName: activityName });
  } catch (_) { toast('Nie można zapisać ustawień obecności na urządzeniu.', true); }
  const sent = pushPresence();
  toast(sent ? `Wysłano zmianę obecności: ${PRESENCE_LABELS[value]}.` : `Zapisano status „${PRESENCE_LABELS[value]}”. Zostanie wysłany po połączeniu z Gateway.`);
}
function beginHeartbeat(interval) {
  if (state.heartbeatId) clearInterval(state.heartbeatId);
  state.heartbeatAck = true;
  // Discord wymaga losowego przesunięcia pierwszego heartbeat.
  const ws = state.ws;
  const heartbeat = () => {
    if (state.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
    if (!state.heartbeatAck) { ws.close(4000, 'Heartbeat timeout'); return; }
    state.heartbeatAck = false;
    sendGateway(1, state.seq);
  };
  const initial = setTimeout(() => {
    if (state.ws !== ws) return;
    heartbeat();
    state.heartbeatId = setInterval(heartbeat, interval);
  }, Math.floor(Math.random() * interval));
  ws.addEventListener('close', () => clearTimeout(initial), { once: true });
}
function scheduleReconnect(invalidate = false) {
  if (!state.token || state.reconnectId) return;
  if (invalidate) { state.sessionId = null; state.seq = null; state.resumeUrl = null; }
  const backoff = Math.min(30000, 1000 * 2 ** Math.min(state.retryCount++, 5)) + Math.round(Math.random() * 700);
  state.reconnectId = setTimeout(() => { state.reconnectId = null; connectGateway(!!state.sessionId); }, backoff);
}
function connectGateway(resume = false) {
  if (!state.token) return;
  clearGateway();
  status(resume ? 'Wznawianie…' : 'Łączenie…');
  try {
    const base = resume && state.resumeUrl ? state.resumeUrl : GATEWAY;
    const url = new URL(base);
    url.searchParams.set('v', '10'); url.searchParams.set('encoding', 'json');
    if (url.protocol !== 'wss:' || !(url.hostname === 'gateway.discord.gg' || /^gateway-[a-z0-9-]+\.discord\.gg$/.test(url.hostname))) throw Error('Invalid gateway URL');
    const ws = new WebSocket(url.href);
    state.ws = ws;
    ws.onopen = () => status('Autoryzacja…');
    ws.onmessage = event => {
      if (state.ws !== ws) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch (_) { return; }
      if (payload.s !== null && payload.s !== undefined) state.seq = payload.s;
      switch (payload.op) {
        case 10: {
          beginHeartbeat(payload.d.heartbeat_interval);
          if (resume && state.sessionId && state.seq !== null) {
            sendGateway(6, { token: state.token, session_id: state.sessionId, seq: state.seq });
          } else {
            sendGateway(2, {
              token: state.token,
              intents: INTENTS | (state.contentIntent ? MESSAGE_CONTENT_INTENT : 0) | (state.presenceIntent ? PRESENCE_INTENT : 0),
              properties: { os: 'windows', browser: 'discord_bot_panel', device: 'discord_bot_panel' },
              presence: presencePayload()
            });
          }
          break;
        }
        case 11: state.heartbeatAck = true; break;
        case 1: sendGateway(1, state.seq); break;
        case 7: ws.close(4000, 'Reconnect requested'); break;
        case 9:
          state.sessionId = null; state.seq = null;
          ws.close(4000, 'Invalid session');
          break;
        case 0: handleGatewayEvent(payload.t, payload.d); break;
      }
    };
    ws.onerror = () => { /* onclose handles all connection errors */ };
    ws.onclose = event => {
      if (state.ws !== ws) return;
      state.ws = null;
      if (state.heartbeatId) clearInterval(state.heartbeatId);
      state.heartbeatId = null;
      status('Rozłączono', 'offline');
      if (!state.token) return;
      if (event.code === 4004) {
        toast('Discord odrzucił token. Zaloguj się ponownie.', true);
        chrome.storage.session.remove('botToken').catch(() => {});
        chrome.storage.local.remove('botToken').catch(() => {});
        switchToLogin('Discord odrzucił token bota.');
      } else if (event.code === 4014 && state.presenceIntent && !state.presenceFallback) {
        state.presenceIntent = false; state.presenceFallback = true;
        showBanner('Discord nie udostępnił Presence Intent. Zalogowano bez statusów członków. Włącz Guild Presences Intent w Developer Portal i połącz ponownie.');
        scheduleReconnect(true);
      } else if (event.code === 4014 && state.contentIntent && !state.intentFallback) {
        state.contentIntent = false;
        state.intentFallback = true;
        showBanner('Message Content Intent nie jest włączony lub zatwierdzony dla tego bota. Połączono bez tego uprawnienia; treść części wiadomości może być niedostępna. Włącz je w Discord Developer Portal.');
        saveToken().catch(() => {});
        scheduleReconnect(true);
      } else if (event.code === 4013 || event.code === 4014) {
        toast(`Discord odrzucił wymagane intencje Gateway (${event.code}).`, true);
        status('Błąd uprawnień', 'offline');
      } else if ([4007, 4009].includes(event.code)) {
        scheduleReconnect(true);
      } else if ([4003, 4005].includes(event.code)) {
        toast(`Połączenie Gateway odrzucone (${event.code}).`, true);
      } else {
        scheduleReconnect(false);
      }
    };
  } catch (_) {
    status('Brak połączenia', 'offline'); scheduleReconnect(true);
  }
}
function handleGatewayEvent(type, data) {
  switch (type) {
    case 'READY':
      state.retryCount = 0;
      state.sessionId = data.session_id;
      state.resumeUrl = data.resume_gateway_url || GATEWAY;
      state.guilds.clear(); state.memberPresences.clear();
      for (const guild of data.guilds || []) state.guilds.set(guild.id, guild);
      status('Na żywo', 'online'); renderGuilds();
      autoSelectGuild();
      break;
    case 'RESUMED':
      state.retryCount = 0;
      status('Na żywo', 'online');
      pushPresence();
      if (state.channelId) loadMessages(state.channelId, false);
      break;
    case 'GUILD_CREATE':
    case 'GUILD_UPDATE':
      if (type === 'GUILD_CREATE' && Array.isArray(data?.presences)) {
        for (const pr of data.presences) if (pr.user?.id) state.memberPresences.set(pr.user.id, pr);
      }
      if (!data?.id) return;
      // READY zawiera {id, unavailable:true}. GUILD_CREATE z dostępnym serwerem
      // może w ogóle nie mieć pola 'unavailable'. Nie wolno zachować starego true.
      const wasSelected = state.guildId === data.id;
      state.guilds.set(data.id, {
        ...(state.guilds.get(data.id) || {}), ...data,
        unavailable: data.unavailable === true
      });
      renderGuilds();
      autoSelectGuild();
      if (state.guildId === data.id) {
        $('guild-title').textContent = data.name || 'Serwer';
        // Gdy użytkownik kliknął serwer zanim ten stał się dostępny,
        // po zdarzeniu GUILD_CREATE ponawiamy próbę pobrania kanałów.
        if (wasSelected && !state.channels.length && data.unavailable !== true) scheduleChannelRefresh();
      }
      break;
    case 'GUILD_DELETE':
      if (data?.unavailable) { const existing = state.guilds.get(data.id); if (existing) existing.unavailable = true; }
      else { state.guilds.delete(data.id); if (state.guildId === data.id) { state.guildId = null; state.channelId = null; autoSelectGuild(); } }
      renderGuilds(); break;
    case 'PRESENCE_UPDATE':
      if (data.guild_id === state.guildId && data.user?.id) state.memberPresences.set(data.user.id, data);
      break;
    case 'GUILD_ROLE_CREATE':
    case 'GUILD_ROLE_UPDATE':
      if (data?.guild_id === state.guildId && data.role?.id) { state.roles.set(data.role.id, data.role); renderMessages(); }
      break;
    case 'GUILD_ROLE_DELETE':
      if (data?.guild_id === state.guildId) { state.roles.delete(data.role_id); renderMessages(); }
      break;
    case 'CHANNEL_CREATE':
    case 'CHANNEL_UPDATE':
    case 'CHANNEL_DELETE':
      if (data?.type === 1 && data?.id && type !== 'CHANNEL_DELETE') { rememberDmChannel(data); if (state.dmView) renderChannels(); }
      if (data?.type === 1 && type === 'CHANNEL_DELETE') { state.dmChannels.delete(data.id); persistDmChannels(); if (state.dmView) renderChannels(); }
    case 'THREAD_CREATE':
    case 'THREAD_UPDATE':
    case 'THREAD_DELETE':
      if (data?.guild_id === state.guildId) scheduleChannelRefresh();
      break;
    case 'MESSAGE_CREATE':
      if (data?.channel_id) {
        if (!data.guild_id && data.channel_id !== state.channelId) rememberIncomingDm(data);
        addIncomingMessage(data);
      }
      break;
    case 'MESSAGE_UPDATE':
      if (data?.channel_id) updateIncomingMessage(data);
      break;
    case 'MESSAGE_DELETE':
      if (data?.channel_id && data?.id) removeIncomingMessage(data.channel_id, data.id);
      break;
    case 'MESSAGE_DELETE_BULK':
      if (data?.channel_id) for (const id of data.ids || []) removeIncomingMessage(data.channel_id, id);
      break;
    case 'CHANNEL_PINS_UPDATE':
      if(data?.channel_id===state.channelId){
        const cid=data.channel_id;
        api(`/channels/${cid}/messages/pins?limit=100`).then(result=>{
          if(cid!==state.channelId)return;
          const pinnedIds=new Set((result?.items||[]).map(x=>x.message?.id).filter(Boolean));
          for(const m of state.messages.get(cid)||[])m.pinned=pinnedIds.has(m.id);
          renderMessages();
        }).catch(()=>{});
      }
      break;
    case 'MESSAGE_REACTION_ADD':
    case 'MESSAGE_REACTION_REMOVE':
      adjustReaction(data, type === 'MESSAGE_REACTION_ADD' ? 1 : -1);
      break;
  }
}
function scheduleChannelRefresh() {
  if (state.channelRefreshTimer) clearTimeout(state.channelRefreshTimer);
  state.channelRefreshTimer = setTimeout(() => { state.channelRefreshTimer = null; if (state.guildId) loadChannels(state.guildId); }, 1700);
}
function autoSelectGuild() {
  if (state.guildId || state.dmView || !state.guilds.size) return;
  const list = [...state.guilds.values()].filter(g => !g.unavailable);
  const target = list.find(g => g.id === state.oldGuild) || list.find(g => g.name) || list[0];
  if (target) selectGuild(target.id);
}
function renderGuilds() {
  const container = $('guild-list'); container.replaceChildren();
  const guilds = [...state.guilds.values()].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'pl'));
  for (const guild of guilds) {
    const btn = el('button', `guild-button${guild.id === state.guildId ? ' active' : ''}`);
    btn.type = 'button'; btn.title = guild.name || guild.id;
    btn.setAttribute('aria-label', `Serwer: ${guild.name || guild.id}`);
    if (guild.icon) {
      const img = el('img'); img.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`;
      img.alt = ''; img.loading = 'lazy'; img.addEventListener('error', () => { btn.textContent = shortName(guild.name || guild.id); });
      btn.append(img);
    } else btn.textContent = shortName(guild.name || guild.id);
    btn.addEventListener('click', () => selectGuild(guild.id));
    container.append(btn);
  }
  if (!guilds.length) container.append(el('div', 'empty-channel', 'Bot nie ma jeszcze serwerów.'));
}

function applyOverrides(base, overwrites, member, guildId) {
  let perms = base;
  if (has(perms, FLAGS.ADMINISTRATOR)) return perms;
  const everyone = overwrites?.find(o => o.id === guildId && o.type === 0);
  if (everyone) perms = (perms & ~permissions(everyone.deny)) | permissions(everyone.allow);
  let allow = 0n, deny = 0n;
  for (const overw of overwrites || []) {
    if (overw.type === 0 && (member.roles || []).includes(overw.id)) { allow |= permissions(overw.allow); deny |= permissions(overw.deny); }
  }
  perms = (perms & ~deny) | allow;
  const personal = overwrites?.find(o => o.type === 1 && o.id === member.user?.id);
  if (personal) perms = (perms & ~permissions(personal.deny)) | permissions(personal.allow);
  return perms;
}
function calculateChannelPerms(channels, roles, member, guild) {
  const result = new Map();
  if (!roles || !member) { for (const c of channels) result.set(c.id, { view: true, history: true, send: true }); return result; }
  const roleMap = new Map(roles.map(r => [r.id, r]));
  let base = permissions(roleMap.get(guild.id)?.permissions);
  for (const roleId of member.roles || []) base |= permissions(roleMap.get(roleId)?.permissions);
  const admin = guild.owner_id === state.me?.id || has(base, FLAGS.ADMINISTRATOR);
  const channelMap = new Map(channels.map(c => [c.id, c]));
  for (const channel of channels) {
    let value = base;
    if (!admin) {
      // Wątek dziedziczy uprawnienia rodzica; wątki bez rodzica sprawdza samo API.
      if ([10, 11, 12].includes(channel.type) && channel.parent_id && channelMap.has(channel.parent_id)) {
        value = applyOverrides(value, channelMap.get(channel.parent_id).permission_overwrites, member, guild.id);
      } else value = applyOverrides(value, channel.permission_overwrites, member, guild.id);
    }
    const thread = [10, 11, 12].includes(channel.type);
    result.set(channel.id, {
      view: admin || has(value, FLAGS.VIEW_CHANNEL),
      history: admin || has(value, FLAGS.READ_MESSAGE_HISTORY),
      send: admin || has(value, thread ? FLAGS.SEND_MESSAGES_IN_THREADS : FLAGS.SEND_MESSAGES)
    });
  }
  return result;
}
async function selectGuild(id) {
  if (!state.guilds.has(id)) return;
  if (state.guildId === id && state.channels.length && !state.dmView) return;
  state.dmView = false; $('dm-home').classList.remove('active'); updateModeControls();
  state.guildId = id;
  state.roles.clear(); state.memberCache.clear(); state.memberQueue = []; state.memberMissing.clear(); clearTimeout(state.memberRunner); state.memberRunner = null;
  state.channelId = null;
  state.searchGeneration++;
  state.searchParams = null; state.searchThreads.clear();
  $('search-results').replaceChildren(); $('search-description').textContent = 'Wybierz filtry i kliknij „Szukaj”.';
  $('search-more-button').classList.add('hidden'); $('search-channel').value = '';
  state.historyJump = false; state.highlightId = null;
  $('latest-button').classList.add('hidden');
  state.messageGeneration++;
  state.selectedReply = null; state.file = null;
  $('guild-title').textContent = state.guilds.get(id).name || 'Serwer';
  $('channel-title').textContent = 'Wybierz kanał'; $('channel-topic').textContent = '';
  document.querySelector('.chat-header-title .hash-symbol').textContent = '#';
  showChatPlaceholder('Wybierz kanał', 'Kliknij kanał tekstowy na liście, aby otworzyć wiadomości.');
  $('channel-list').replaceChildren(el('div', 'empty-channel', 'Ładowanie kanałów…'));
  updateComposer(); renderGuilds(); updateModeControls();
  chrome.storage.local.set({ selectedGuildId: id }).catch(() => {});
  await loadChannels(id);
}
async function loadChannels(id) {
  if (id !== state.guildId) return;
  try {
    const results = await Promise.allSettled([
      api(`/guilds/${id}/channels`),
      api(`/guilds/${id}/roles`),
      api(`/guilds/${id}/members/${state.me.id}`),
      api(`/guilds/${id}/threads/active`)
    ]);
    if (state.guildId !== id) return;
    if (results[0].status === 'rejected') throw results[0].reason;
    const all = results[0].value || [];
    if (results[3].status === 'fulfilled') {
      for (const thread of results[3].value?.threads || []) if (!all.find(c => c.id === thread.id)) all.push(thread);
    }
    if (results[1].status === 'fulfilled') { state.roles = new Map((results[1].value || []).map(role => [role.id, role])); }
    state.channelPermissions = calculateChannelPerms(
      all,
      results[1].status === 'fulfilled' ? results[1].value : null,
      results[2].status === 'fulfilled' ? results[2].value : null,
      state.guilds.get(id)
    );
    state.channels = all.filter(c => SUPPORTED_CHANNEL_TYPES.has(c.type) && state.channelPermissions.get(c.id)?.view);
    renderChannels();
    updateSearchChannelOptions();
    if (!state.channelId) {
      const previous = state.channels.find(c => c.id === state.oldChannel && c.type !== 4);
      const first = previous || state.channels.find(c => [0, 5, 10, 11, 12, 2, 13].includes(c.type)) || state.channels.find(c => c.type !== 4);
      if (first) selectChannel(first.id);
      else {
        const explanation = !all.length
          ? 'Discord API zwróciło 0 kanałów. Spróbuj odświeżyć kanały lub sprawdź, czy bot nadal należy do tego serwera.'
          : `Discord API zwróciło ${all.length} kanałów, ale nie ma żadnych dostępnych dla bota w obsługiwanych typach. Sprawdź uprawnienia i odśwież.`;
        showChatPlaceholder('Brak dostępnych kanałów', explanation);
      }
    } else if (!state.channels.some(c => c.id === state.channelId)) {
      state.channelId = null;
      showChatPlaceholder('Brak dostępu', 'Bot utracił dostęp do tego kanału.'); updateComposer();
    }
  } catch (err) {
    if (state.guildId !== id) return;
    state.channels = [];
    $('channel-list').replaceChildren(el('div', 'empty-channel', err.message));
    showChatPlaceholder('Nie można odczytać kanałów', err.message);
  }
}
function renderChannels() {
  const target = $('channel-list'); target.replaceChildren();
  if (state.dmView) { renderDmList(target); return; }
  const sortByPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id);
  const categories = state.channels.filter(c => c.type === 4).sort(sortByPosition);
  const textChannels = state.channels.filter(c => c.type !== 4);
  let count = 0;
  function createChannel(channel, holder) {
    const button = el('button', `channel-entry${channel.id === state.channelId ? ' active' : ''}`);
    button.type = 'button';
    button.dataset.channelId = channel.id;
    button.title = channel.name;
    button.append(el('span', 'channel-hash', CHANNEL_ICONS[channel.type] || '#'));
    button.append(el('span', 'entry-name', channel.name));
    if (state.unread.has(channel.id) && channel.id !== state.channelId) button.append(el('span', 'unread-marker'));
    button.addEventListener('click', () => selectChannel(channel.id));
    holder.append(button); count++;
  }
  const withoutCategory = textChannels.filter(c => !c.parent_id || !categories.find(g => g.id === c.parent_id)).sort(sortByPosition);
  for (const channel of withoutCategory) createChannel(channel, target);
  for (const category of categories) {
    const group = el('section', 'category');
    const key=`bp_category_${state.me?.id||'bot'}_${state.guildId}_${category.id}`;
    const collapsed=localStorage.getItem(key)==='1';
    const categoryLabel = el('button', 'category-title', `${collapsed?'▸':'▾'} ${category.name}`);
    categoryLabel.type='button'; categoryLabel.dataset.channelId = category.id;
    categoryLabel.setAttribute('aria-expanded', String(!collapsed));
    categoryLabel.title = 'Kliknij: zwiń/rozwiń · Prawy przycisk: ustawienia';
    if (collapsed) group.classList.add('category-collapsed');
    categoryLabel.addEventListener('click',()=>{const hide=group.classList.toggle('category-collapsed');categoryLabel.textContent=`${hide?'▸':'▾'} ${category.name}`;categoryLabel.setAttribute('aria-expanded',String(!hide));localStorage.setItem(key,hide?'1':'0');});
    group.append(categoryLabel);
    const children = textChannels.filter(c => c.parent_id === category.id).sort(sortByPosition);
    if(collapsed&&children.some(c=>state.unread.has(c.id))){
      const marker=el('span','category-unread','●');marker.title='Nieprzeczytane wiadomości';categoryLabel.append(marker);
    }
    for (const channel of children) createChannel(channel, group);
    target.append(group);
  }
  if (!count) target.append(el('div', 'empty-channel', 'Brak dostępnych kanałów. Kliknij ↻ przy nazwie serwera, aby spróbować ponownie.'));
}
function showChatPlaceholder(title, message) {
  $('message-content').classList.add('hidden'); $('chat-placeholder').classList.remove('hidden');
  $('chat-placeholder').querySelector('h2').textContent = title;
  $('chat-placeholder').querySelector('p').textContent = message;
}
function showChatMessages() {
  $('chat-placeholder').classList.add('hidden'); $('message-content').classList.remove('hidden');
}
async function selectChannel(id, options = {}) {
  const channel = activeChannel(id);
  if (!channel || channel.type === 4) return;
  if (state.channelId === id && state.messages.has(id) && !options.around) return;
  const oldId = state.channelId;
  if (oldId && oldId !== id && state.messages.get(oldId)?.length > 500) {
    // Po przełączeniu kanału nie trzymamy ogromnej historii innych kanałów.
    state.messages.set(oldId, state.messages.get(oldId).slice(-250));
    state.hasOlder.set(oldId, true);
  }
  state.channelId = id;
  window.BotPanelV12?.onChannelSwitch?.(id);
  state.selectedReply = null; state.file = null;
  if (!window.BotPanelV12?.preserveUnread?.(id)) state.unread.delete(id);
  $('channel-title').textContent = channel.type === 1 ? dmLabel(channel) : channel.name;
  state.historyJump = !!options.around; state.highlightId = options.around || null;
  $('latest-button').classList.toggle('hidden', !options.around);
  $('channel-topic').textContent = channel.topic || '';
  document.querySelector('.chat-header-title .hash-symbol').textContent = channel.type === 1 ? '✉' : '#';
  renderChannels(); updateComposer();
  if (!state.dmView) chrome.storage.local.set({ selectedChannelId: id }).catch(() => {});
  if (NO_DIRECT_MESSAGES_TYPES.has(channel.type)) {
    state.messageGeneration += 1;
    showChatPlaceholder('Kanał forum / mediów', 'Na tego typu kanale wiadomości znajdują się w postach (wątkach). Wybierz aktywny wątek z listy kanałów.');
    return;
  }
  if (state.messages.has(id) && !options.around) { renderMessages(); scrollToBottom(); }
  await loadMessages(id, false, options.around || null);
}
async function loadMessages(id, older = false, around = null) {
  if (state.loadingMessages && older) return;
  if (!id || (older && !state.hasOlder.get(id))) return;
  if (!older) state.messageGeneration += 1;
  const generation = state.messageGeneration;
  const existing = state.messages.get(id) || [];
  const before = older && existing.length ? existing[0].id : null;
  state.loadingMessages = true;
  state.pauseOlder = true; // Unikamy ładowania kolejnych stron podczas przebudowy DOM.
  if (!older) showChatPlaceholder('Wczytywanie wiadomości…', 'Pobieranie historii z Discorda.');
  else {
    $('load-more-button').disabled = true;
    $('older-status').classList.remove('hidden');
  }
  try {
    const query = new URLSearchParams({ limit: '50' });
    if (before) query.set('before', before);
    if (around && !older) query.set('around', around);
    const batch = await api(`/channels/${id}/messages?${query}`);
    if (id !== state.channelId || generation !== state.messageGeneration) return;
    if (!Array.isArray(batch)) throw new Error('Discord nie zwrócił listy wiadomości.');
    // Przy pobraniu wokół wyniku wyszukiwania może być mniej niż 50 wpisów,
    // mimo że istnieje wcześniejsza historia. Pierwsze przewinięcie sprawdzi to osobno.
    state.hasOlder.set(id, !!(around && batch.length) || batch.length === 50);
    const combined = older ? [...batch.reverse(), ...existing] : batch.reverse();
    const unique = new Map(combined.map(message => [message.id, message]));
    // Nie przycinamy najstarszych wiadomości: poprzednie slice(-350) psuło przewijanie.
    state.messages.set(id, [...unique.values()]);
    rememberMessageMembers(batch);
    const scroller = $('message-scroller');
    const oldHeight = scroller.scrollHeight;
    const oldTop = scroller.scrollTop;
    renderMessages();
    if (older) {
      scroller.scrollTop = oldTop + scroller.scrollHeight - oldHeight;
    } else if (around) {
      requestAnimationFrame(() => {
        if (id !== state.channelId) return;
        const row = [...$('messages').children].find(node => node.dataset.messageId === around);
        if (row) row.scrollIntoView({ block: 'center', behavior: 'instant' });
        else toast('Nie udało się znaleźć wskazanej wiadomości w pobranym fragmencie.', true);
      });
    } else scrollToBottom();
    if (!older) window.BotPanelV12?.onMessagesLoaded?.(id, batch);
    if (!state.contentIntent && batch.some(m => !m.content && !m.embeds?.length && !m.attachments?.length)) {
      showBanner('Część treści wiadomości jest ukryta: włącz Message Content Intent dla bota w Discord Developer Portal i ponownie zaloguj się z zaznaczoną opcją.');
    }
  } catch (err) {
    if (id !== state.channelId || generation !== state.messageGeneration) return;
    if (!older && existing.length) { renderMessages(); toast(err.message, true); }
    else if (!older) showChatPlaceholder('Brak dostępu do wiadomości', err.message);
    else toast(err.message, true);
  } finally {
    if (id === state.channelId && generation === state.messageGeneration) state.loadingMessages = false;
    $('load-more-button').disabled = false;
    $('older-status').classList.add('hidden');
    // Przeglądarka może dopiero po renderze wysłać programowy event scroll.
    // Wznawiamy auto-doczytywanie po dwóch klatkach, już po ustaleniu pozycji.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (id === state.channelId && generation === state.messageGeneration) state.pauseOlder = false;
    }));
  }
}
function scrollToBottom() { const target = $('message-scroller'); requestAnimationFrame(() => { target.scrollTop = target.scrollHeight; }); }
function addIncomingMessage(message) {
  rememberMessageMembers([message]);
  const list = state.messages.get(message.channel_id);
  if (list) {
    const idx = list.findIndex(m => m.id === message.id);
    if (idx >= 0) list[idx] = message;
    else list.push(message);
    // Zachowujemy doczytaną historię bieżącego kanału; zwalniamy ją po zmianie kanału.
  }
  if (message.channel_id === state.channelId) {
    if (!list) state.messages.set(message.channel_id, [message]);
    const scroller = $('message-scroller');
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 170;
    renderMessages(); if (nearBottom) scrollToBottom();
    if (message.author?.id !== state.me?.id) window.BotPanelV12?.onIncomingCurrent?.(message);
  } else if (state.channels.some(c => c.id === message.channel_id) || state.dmChannels.has(message.channel_id)) {
    state.unread.add(message.channel_id); renderChannels(); window.BotPanelV12?.onUnread?.(message.channel_id);
  }
}
function updateIncomingMessage(update) {
  const list = state.messages.get(update.channel_id);
  if (!list) return;
  const msg = list.find(m => m.id === update.id);
  if (!msg) return;
  Object.assign(msg, update);
  rememberMessageMembers([msg]);
  if (update.channel_id === state.channelId) renderMessages();
}
function removeIncomingMessage(channelId, messageId) {
  const list = state.messages.get(channelId);
  if (!list) return;
  const idx = list.findIndex(m => m.id === messageId);
  if (idx === -1) return;
  list.splice(idx, 1);
  if (channelId === state.channelId) renderMessages();
}
function adjustReaction(data, amount) {
  const msg = state.messages.get(data?.channel_id)?.find(m => m.id === data.message_id);
  if (!msg || !data.emoji) return;
  msg.reactions ||= [];
  let react = msg.reactions.find(r => r.emoji?.id === data.emoji.id && r.emoji?.name === data.emoji.name);
  if (!react && amount > 0) { react = { count: 0, me: false, emoji: data.emoji }; msg.reactions.push(react); }
  if (!react) return;
  react.count = Math.max(0, (react.count || 0) + amount);
  if (data.user_id === state.me?.id) react.me = amount > 0;
  if (!react.count) msg.reactions = msg.reactions.filter(r => r !== react);
  if (data.channel_id === state.channelId) renderMessages();
}

// Dane członków z API wiadomości mają pierwszeństwo. Gdy brak member w starych
// wiadomościach, pobieramy pojedyncze profile z ograniczeniem liczby żądań.
function rememberMessageMembers(messages) {
  for (const message of messages || []) {
    const id = message.author?.id;
    if (!id || !/^\d{16,22}$/.test(id)) continue;
    if (message.member) state.memberCache.set(id, message.member);
  }
}
function getMessageMember(message) { return message.member || state.memberCache.get(message.author?.id) || null; }
function displayAuthor(message) {
  const member = getMessageMember(message);
  return member?.nick || message.author?.global_name || message.author?.username || 'Użytkownik';
}
function cacheMissingMembers(list) {
  if (!state.guildId || !state.token) return;
  let count = 0;
  // Pobieramy tylko brakujących autorów z maksymalnie 50 ostatnich wpisów.
  for (const message of list.slice(-50).reverse()) {
    const id = message.author?.id;
    if (!id || !/^\d{16,22}$/.test(id) || message.webhook_id || message.member || state.memberCache.has(id) || state.memberMissing.has(id)) continue;
    state.memberMissing.add(id);
    state.memberQueue.push({ guildId: state.guildId, userId: id });
    if (++count >= 12) break;
  }
  if (state.memberQueue.length && !state.memberRunner) state.memberRunner = setTimeout(fetchNextMember, 450);
}
async function fetchNextMember() {
  state.memberRunner = null;
  const item = state.memberQueue.shift();
  if (!item || !state.token) return;
  try {
    const member = await api(`/guilds/${item.guildId}/members/${item.userId}`);
    if (item.guildId === state.guildId && member) {
      state.memberCache.set(item.userId, member);
      if (state.channelId) renderMessages();
    }
  } catch (_) { /* członek opuścił serwer lub nie ma dostępu */ }
  if (state.memberQueue.length) state.memberRunner = setTimeout(fetchNextMember, 700);
}
function messageContext() {
  return { roles: state.roles, channels: state.channels, getMember: id => state.memberCache.get(id), openUser: id => openProfile(id), openChannel: id => window.PanelPlus?.jumpChannel(id), openRole: id => window.PanelPlus?.showRole(id) };
}
function resolveRoleStyle(message) {
  const member = getMessageMember(message);
  const roles = (member?.roles || []).map(id => state.roles.get(id)).filter(Boolean)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || String(b.id).localeCompare(String(a.id)));
  // Discord wybiera pierwszą rolę z kolorem, niekoniecznie najwyższą rolę.
  for (const role of roles) {
    const primary = role.colors?.primary_color ?? role.color ?? 0;
    if (!Number.isInteger(primary) || primary <= 0 || primary > 0xffffff) continue;
    const color = value => '#' + value.toString(16).padStart(6, '0');
    const secondary = role.colors?.secondary_color;
    if (Number.isInteger(secondary) && secondary > 0 && secondary <= 0xffffff) {
      return { gradient: `linear-gradient(90deg, ${color(primary)}, ${color(secondary)})` };
    }
    return { color: color(primary) };
  }
  return null;
}
function setMessageAvatar(holder, message) {
  const member = getMessageMember(message);
  const avatar = member?.avatar;
  const user = message.author;
  if (!avatar || !user?.id || !state.guildId) return setAvatar(holder, user, 80);
  holder.replaceChildren();
  const image = el('img');
  image.src = `https://cdn.discordapp.com/guilds/${state.guildId}/users/${user.id}/avatars/${avatar}.${avatar.startsWith('a_') ? 'gif' : 'png'}?size=80`;
  image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
  image.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover';
  image.addEventListener('error', () => setAvatar(holder, user, 80), { once: true });
  holder.append(image);
}

function makeMessageActions(message) {
  const actions=el('div','message-actions');
  const button=(label,title,fn)=>{const x=el('button','',label);x.type='button';x.title=title;x.setAttribute('aria-label',title);x.addEventListener('click',e=>{e.stopPropagation();fn(e);});actions.append(x);};
  button('↩','Odpowiedz',()=>{state.selectedReply=message;updateComposer();$('message-input').focus();});
  button('☺','Dodaj reakcję',()=>{if(window.PanelPlus?.reactionPicker)window.PanelPlus.reactionPicker(message);else promptReaction(message);});
  // Manage Messages permits deletion of other authors' messages, not just the bot's own.
  const mayDelete=message.author?.id===state.me?.id || (!state.dmView && !!state.channelPermissions.get(message.channel_id)?.manageMessages);
  if(mayDelete)button('🗑','Usuń wiadomość',()=>deleteMessage(message));
  button('⋯','Więcej opcji',event=>window.BotPanelV11?.messageMore?.(event,message));
  return actions;
}
function makeReactionButton(message, reaction) {
  const emoji = reaction.emoji || {};
  const button = el('button', `reaction-item${reaction.me ? ' mine' : ''}`);
  button.type = 'button'; button.title = reaction.me ? 'Usuń swoją reakcję' : 'Dodaj reakcję';
  if (emoji.id && /^\d{16,22}$/.test(String(emoji.id))) {
    const image = el('img', 'reaction-emoji');
    image.alt = `:${emoji.name || 'emoji'}:`; image.title = image.alt;
    image.src = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=32&quality=lossless`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(document.createTextNode(image.alt)), { once: true });
    button.append(image);
  } else button.append(el('span', '', emoji.name || '❔'));
  button.append(el('span', 'reaction-count', String(reaction.count || 0)));
  button.addEventListener('click', () => toggleReaction(message, emoji, !!reaction.me));
  return button;
}
function renderMessages() {
  if (!state.channelId) return;
  showChatMessages();
  const target = $('messages'); target.replaceChildren();
  const list = state.messages.get(state.channelId) || [];
  // Ręczny przycisk pozostaje jako awaryjny sposób ładowania historii.
  $('load-more-button').classList.toggle('hidden', !state.hasOlder.get(state.channelId));
  if (!list.length) { target.append(el('div', 'empty-channel', 'Na tym kanale nie ma jeszcze wiadomości. Możesz napisać pierwszą.')); return; }
  const fragment = document.createDocumentFragment();
  let previousMessage=null;
  for (const message of list) {
    const row = el('article', `message-row${message.id === state.highlightId ? ' search-highlight' : ''}`); row.dataset.messageId = message.id;
    const prior=previousMessage;
    const joined=!!(prior && prior.author?.id===message.author?.id &&
      Math.abs(new Date(message.timestamp)-new Date(prior.timestamp))<5*60*1000 &&
      !message.message_reference && ![6,7,18,19,20,21].includes(message.type));
    row.classList.toggle('message-grouped',joined);
    row.title=joined?`Wysłano: ${new Date(message.timestamp).toLocaleString('pl-PL')}`:'';
    row.dataset.clock=new Date(message.timestamp).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
    const avatar = el('div', 'avatar message-avatar profile-link'); setMessageAvatar(avatar, message);
    avatar.title = 'Otwórz profil'; avatar.addEventListener('click', () => openProfile(message.author?.id)); row.append(avatar);
    const main = el('div', 'message-main');
    if (message.message_reference) {
      const reference = message.referenced_message;
      const replyText = reference?.author?.username ? `${displayAuthor(reference)}: ${String(reference.content || (reference.sticker_items?.length ? 'Naklejka' : '(załącznik)')).slice(0, 70)}` : 'Odpowiedź na wiadomość';
      main.append(el('div', 'message-reply', `↪ ${replyText}`));
    }
    const head = el('div', 'message-head');
    const name = el('span', `message-name profile-link${message.author?.bot ? ' bot-name' : ''}`);
    name.title = 'Otwórz profil'; name.addEventListener('click', () => openProfile(message.author?.id));
    const nameText = el('span', 'message-author-text', displayAuthor(message));
    const colors = resolveRoleStyle(message);
    if (colors?.gradient) { nameText.style.backgroundImage = colors.gradient; nameText.classList.add('gradient-name'); }
    else if (colors?.color) nameText.style.color = colors.color;
    name.append(nameText);
    if (message.author?.bot) name.append(el('span', 'bot-badge', 'BOT'));
    head.append(name, el('span', 'message-time', timeString(message.timestamp)));
    main.append(head);
    const content = el('div', 'message-text');
    if (message.content) BotMessageRenderer.appendFormatted(content, message.content, message, messageContext());
    if (content.childNodes.length) main.append(content);
    if (message.attachments?.length) {
      const holder = el('div', 'message-attachments');
      message.attachments.forEach(a => { const node = BotMessageRenderer.attachmentNode(a); if (node) holder.append(node); });
      if (holder.childNodes.length) main.append(holder);
    }
    if (message.sticker_items?.length || message.stickers?.length) {
      const stickers = el('div', 'discord-stickers');
      for (const sticker of (message.sticker_items?.length ? message.sticker_items : message.stickers).slice(0, 3)) stickers.append(BotMessageRenderer.stickerNode(sticker));
      main.append(stickers);
    }
    if (message.embeds?.length) message.embeds.slice(0, 5).forEach(e => BotMessageRenderer.addEmbed(main, e, messageContext()));
    if (message.message_snapshots?.length) {
      for (const snapshot of message.message_snapshots.slice(0, 2)) {
        const node = BotMessageRenderer.snapshotNode(snapshot, messageContext());
        if (node) main.append(node);
      }
    }
    if (message.poll) main.append(BotMessageRenderer.pollNode(message.poll));
    if (message.edited_timestamp) head.append(el('span', 'message-edited', '(edytowano)'));
    if (message.reactions?.length) {
      const reactions = el('div', 'reaction-list');
      for (const reaction of message.reactions) reactions.append(makeReactionButton(message, reaction));
      main.append(reactions);
    }
    if(message.pinned){const pin=el('span','message-pin','📌 Przypięta');main.prepend(pin);}
    row.append(main, makeMessageActions(message)); fragment.append(row);
    previousMessage=message;
  }
  target.append(fragment);
  cacheMissingMembers(list);
  window.PanelPlus?.decorateMessages?.();
}

function updateComposer() {
  const channel = activeChannel();
  const canSend = !!channel && !NO_DIRECT_MESSAGES_TYPES.has(channel.type) && !!state.token && (channel.type === 1 || !!state.channelPermissions.get(channel.id)?.send);
  const input = $('message-input'); input.disabled = !canSend;
  $('attach-button').disabled = !canSend || state.sending;
  $('send-button').disabled = !canSend || state.sending || (!input.value.trim() && !state.file);
  input.placeholder = !channel ? 'Wybierz kanał…' : NO_DIRECT_MESSAGES_TYPES.has(channel.type) ? 'Wybierz wątek, aby napisać wiadomość' : canSend ? (channel.type === 1 ? `Wiadomość prywatna do ${dmLabel(channel)}` : `Napisz na #${channel.name}`) : 'Brak uprawnienia do wysyłania wiadomości';
  $('char-counter').textContent = `${input.value.length}/2000`;
  $('reply-banner').classList.toggle('hidden', !state.selectedReply);
  $('reply-label').textContent = state.selectedReply ? `Odpowiadasz: ${state.selectedReply.author?.global_name || state.selectedReply.author?.username || 'Użytkownik'} — ${String(state.selectedReply.content || '(załącznik)').slice(0, 90)}` : '';
  $('file-banner').classList.toggle('hidden', !state.file);
  $('file-label').textContent = state.file ? `📎 ${state.file.name} (${(state.file.size / 1024 / 1024).toFixed(2)} MB)` : '';
}
async function sendMessage() {
  const id = state.channelId;
  const text = $('message-input').value.trim();
  const file = state.file;
  const reply = state.selectedReply;
  if (!id || state.sending || (!text && !file)) return;
  if (text.length > 2000) { toast('Wiadomość nie może mieć więcej niż 2000 znaków.', true); return; }
  state.sending = true; updateComposer();
  const payload = { allowed_mentions: { parse: [], replied_user: false } };
  if (text) payload.content = text;
  if (reply) payload.message_reference = { message_id: reply.id, channel_id: id, fail_if_not_exists: false };
  try {
    let response;
    if (file) {
      const body = new FormData();
      payload.attachments = [{ id: 0, filename: file.name }];
      body.append('payload_json', JSON.stringify(payload));
      body.append('files[0]', file, file.name);
      response = await api(`/channels/${id}/messages`, { method: 'POST', body });
    } else response = await api(`/channels/${id}/messages`, { method: 'POST', body: JSON.stringify(payload) });
    if (state.channelId === id) {
      if ($('message-input').value.trim() === text) $('message-input').value = '';
      if (state.file === file) state.file = null;
      if (state.selectedReply === reply) state.selectedReply = null;
      $('attachment-input').value = '';
      addIncomingMessage(response);
      scrollToBottom(); $('message-input').focus();
    } else {
      addIncomingMessage(response);
    }
  } catch (err) { toast(`Nie wysłano wiadomości: ${err.message}`, true); }
  finally { state.sending = false; updateComposer(); }
}
function beginEdit(message) {
  state.editingMessage = { id: message.id, channelId: message.channel_id };
  $('edit-text').value = message.content || '';
  $('edit-dialog').showModal(); $('edit-text').focus();
}
async function submitEdit() {
  const target = state.editingMessage;
  const text = $('edit-text').value.trim();
  if (!target || !text) { toast('Wiadomość nie może być pusta.', true); return; }
  $('edit-dialog').close();
  try {
    const updated = await api(`/channels/${target.channelId}/messages/${target.id}`, {
      method: 'PATCH', body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } })
    });
    updateIncomingMessage(updated);
    toast('Wiadomość została edytowana.');
  } catch (err) { toast(`Nie udało się edytować: ${err.message}`, true); }
  finally { state.editingMessage = null; }
}
async function deleteMessage(message) {
  if (!confirm('Na pewno usunąć tę wiadomość?')) return;
  try {
    await api(`/channels/${message.channel_id}/messages/${message.id}`, { method: 'DELETE' });
    removeIncomingMessage(message.channel_id, message.id);
    toast('Usunięto wiadomość.');
  } catch (err) { toast(`Nie można usunąć: ${err.message}`, true); }
}
function encodeEmoji(emoji) {
  const text = String(emoji?.id ? `${emoji.name}:${emoji.id}` : emoji?.name || '').trim();
  return encodeURIComponent(text);
}
async function toggleReaction(message, emoji, mine) {
  const method = mine ? 'DELETE' : 'PUT';
  try {
    await api(`/channels/${message.channel_id}/messages/${message.id}/reactions/${encodeEmoji(emoji)}/@me`, { method });
    // Gateway EVENT uzupełni licznik. W razie braku eventu aktualizujemy lokalnie.
    if (state.ws?.readyState !== WebSocket.OPEN) adjustReaction({ channel_id: message.channel_id, message_id: message.id, emoji, user_id: state.me.id }, mine ? -1 : 1);
  } catch (err) { toast(`Nie można zmienić reakcji: ${err.message}`, true); }
}
async function promptReaction(message) {
  const raw = prompt('Podaj emoji, np. 👍 lub <:nazwa:123456789012345678>:');
  if (!raw?.trim()) return;
  const match = raw.trim().match(/^<a?:([\w]+):(\d+)>$/);
  const emoji = match ? { name: match[1], id: match[2] } : { name: raw.trim(), id: null };
  await toggleReaction(message, emoji, false);
}


// Wyszukiwanie jest wykonywane na serwerze Discorda, a nie przez masowe
// pobieranie historii. API obsługuje maksymalnie 25 wyników na stronę.
function updateSearchChannelOptions() {
  const select = $('search-channel');
  const chosen = select.value;
  select.replaceChildren(new Option('Cały serwer', ''));
  const channels = state.channels.filter(c => !NO_DIRECT_MESSAGES_TYPES.has(c.type) && c.type !== 4);
  channels.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  for (const channel of channels) select.add(new Option(`# ${channel.name}`, channel.id));
  select.value = channels.some(c => c.id === chosen) ? chosen : '';
}
function setSearchPanel(open) {
  $('search-panel').classList.toggle('hidden', !open);
  $('open-search-button').classList.toggle('active', open);
  window.PanelPlus?.onSearchVisibilityChange?.(open);
  if (open) {
    updateSearchChannelOptions();
    $('search-text').focus();
  }
}
function snowflakeAt(timestamp) {
  // Discord Snowflake: (ms since 2015-01-01 UTC) << 22.
  return String((BigInt(Math.max(1420070400000, timestamp)) - 1420070400000n) << 22n);
}
function searchRequestParams() {
  const content = $('search-text').value.trim();
  const author = $('search-author').value.trim();
  const channelId = $('search-channel').value;
  const hasType = $('search-has').value;
  const after = $('search-after').value;
  const before = $('search-before').value;
  if (author && !/^\d{16,22}$/.test(author)) throw Error('ID autora powinno zawierać 16–22 cyfry.');
  if (!content && !author && !channelId && !hasType && !after && !before) {
    throw Error('Wpisz treść albo ustaw przynajmniej jeden filtr.');
  }
  if (after && before && after > before) throw Error('Data „od” musi być wcześniejsza niż „do”.');
  const params = new URLSearchParams({ limit: '25' });
  if (content) params.set('content', content);
  if (author) params.set('author_id', author);
  if (channelId) params.set('channel_id', channelId);
  if (hasType) params.set('has', hasType);
  if (after) params.set('min_id', snowflakeAt(new Date(after + 'T00:00:00').getTime() - 1));
  if (before) params.set('max_id', snowflakeAt(new Date(before + 'T00:00:00').getTime() + 86400000));
  const order = $('search-order').value;
  if (order === 'relevance') params.set('sort_by', 'relevance');
  else { params.set('sort_by', 'timestamp'); params.set('sort_order', order === 'asc' ? 'asc' : 'desc'); }
  return params;
}
function appendSearchSnippet(target, content, needle) {
  const sample = String(content || '').slice(0, 320);
  if (!needle || !sample) { target.textContent = sample || '(Bez tekstu / załącznik)'; return; }
  const pos = sample.toLocaleLowerCase('pl').indexOf(needle.toLocaleLowerCase('pl'));
  if (pos < 0) { target.textContent = sample; return; }
  target.append(document.createTextNode(sample.slice(0, pos)));
  target.append(el('mark', '', sample.slice(pos, pos + needle.length)));
  target.append(document.createTextNode(sample.slice(pos + needle.length)));
}
function renderSearchResults(items, append) {
  const target = $('search-results');
  if (!append) target.replaceChildren();
  if (!items.length && !append) {
    target.append(el('div', 'search-empty', 'Brak wyników dla wybranych filtrów.'));
    return;
  }
  for (const message of items) {
    const channel = state.channels.find(c => c.id === message.channel_id) || state.searchThreads.get(message.channel_id);
    const row = el('button', 'search-result'); row.type = 'button';
    row.title = 'Przejdź do wiadomości';
    const head = el('div', 'search-result-head');
    const author = el('span', 'search-result-author', displayAuthor(message));
    const style = resolveRoleStyle(message);
    if (style?.gradient) { author.classList.add('gradient-name'); author.style.backgroundImage = style.gradient; }
    else if (style?.color) author.style.color = style.color;
    head.append(author);
    head.append(el('span', 'search-result-date', timeString(message.timestamp)));
    row.append(head, el('div', 'search-result-channel', `# ${channel?.name || message.channel_id}`));
    const snippet = el('div', 'search-result-text');
    const text = message.content || (message.sticker_items?.length ? `Naklejka: ${message.sticker_items.map(s => s.name).join(', ')}` : message.attachments?.length ? `📎 ${message.attachments.map(a => a.filename).join(', ')}` : '(Embed / wiadomość bez tekstu)');
    appendSearchSnippet(snippet, text, $('search-text').value.trim());
    row.append(snippet);
    row.addEventListener('click', () => goToSearchMessage(message));
    target.append(row);
  }
}
async function runSearch(append = false, page = null) {
  if (!state.guildId || state.searchBusy) return;
  if (!append && page === null) {
    try { state.searchParams = searchRequestParams(); }
    catch (err) { $('search-description').textContent = err.message; return; }
    if (page === null) state.searchOffset = 0;
    state.searchTotal = 0;
    state.searchGeneration++;
    $('search-results').replaceChildren();
    state.searchThreads.clear();
  }
  if (!state.searchParams) return;
  if (page !== null) state.searchOffset = Math.max(0, Math.min(399, page)) * 25;
  const generation = state.searchGeneration;
  const guild = state.guildId;
  const offset = state.searchOffset;
  const params = new URLSearchParams(state.searchParams);
  params.set('offset', String(offset));
  state.searchBusy = true;
  $('search-submit').disabled = true;
  $('search-more-button').disabled = true;
  $('search-description').textContent = 'Wyszukiwanie w Discordzie…';
  try {
    let data;
    for (let tries = 0; tries < 3; tries++) {
      data = await api(`/guilds/${guild}/messages/search?${params}`);
      if (guild !== state.guildId || generation !== state.searchGeneration) return;
      if (data?.code !== 110000) break;
      if (tries === 2) throw Error('Discord nadal indeksuje wiadomości. Spróbuj wyszukać ponownie za chwilę.');
      $('search-description').textContent = 'Discord indeksuje wiadomości…';
      await delay(Math.min(5000, Math.max(1000, Number(data.retry_after || 2) * 1000)));
    }
    if (!data || !Array.isArray(data.messages)) throw Error('Discord zwrócił nieznany format wyników.');
    for (const thread of data.threads || []) state.searchThreads.set(thread.id, thread);
    const matches = data.messages.flat().filter(m => m?.id && m?.channel_id);
    renderSearchResults(matches, false);
    state.searchTotal = Number(data.total_results || 0);
    state.searchOffset = offset + 25;
    const hasNext = !!matches.length && state.searchOffset < Math.min(state.searchTotal, 10000);
    $('search-more-button').classList.add('hidden');
    window.BotPanelV12?.updatePagination?.(offset / 25, state.searchTotal, !!matches.length);
    $('search-description').textContent = `${state.searchTotal.toLocaleString('pl-PL')} wyników · strona ${Math.floor(offset / 25) + 1}${data.doing_deep_historical_index ? ' · trwa indeksowanie starszej historii' : ''}`;
  } catch (err) {
    if (guild !== state.guildId || generation !== state.searchGeneration) return;
    $('search-description').textContent = `Błąd wyszukiwania: ${err.message}`;
    $('search-more-button').classList.add('hidden');
    window.BotPanelV12?.updatePagination?.(offset / 25, 0, false);
  } finally {
    state.searchBusy = false;
    $('search-submit').disabled = false;
    $('search-more-button').disabled = false;
  }
}
async function goToSearchMessage(message) {
  if (!state.guildId || !message?.channel_id || !message?.id) return;
  if (!state.channels.some(c => c.id === message.channel_id)) {
    const thread = state.searchThreads.get(message.channel_id);
    if (thread && [10, 11, 12].includes(thread.type)) {
      state.channels.push(thread);
      const parentPerms = state.channelPermissions.get(thread.parent_id);
      state.channelPermissions.set(thread.id, parentPerms ? { ...parentPerms } : { view: true, history: true, send: false });
      renderChannels(); updateSearchChannelOptions();
    } else {
      toast('Kanał tej wiadomości nie jest dostępny na liście bota. Spróbuj odświeżyć kanały.', true);
      return;
    }
  }
  setSearchPanel(false);
  await selectChannel(message.channel_id, { around: message.id });
}
function onMessageScroll() {
  const scroller = $('message-scroller');
  if (scroller.scrollTop > 170 || state.loadingMessages || state.pauseOlder || !state.channelId || !state.hasOlder.get(state.channelId)) return;
  if (NO_DIRECT_MESSAGES_TYPES.has(activeChannel()?.type)) return;
  loadMessages(state.channelId, true).catch(err => toast(err.message, true));
}

// ===== v1.6: proces zarządzany przez kartę, DM, profile, audyt, serwer =====
function startNativeBridge() {
  $('extension-id').textContent = chrome.runtime.id || 'Sprawdź chrome://extensions';
  try {
    const port = chrome.runtime.connectNative('com.discordbotpanel.bridge');
    state.nativePort = port;
    port.onMessage.addListener(message => {
      if (message?.type === 'ready') { state.nativeReady = true; state.nativeError = null; }
      else if (message?.type === 'error') { state.nativeError = message.message; state.nativeReady = false; }
    });
    port.onDisconnect.addListener(() => {
      state.nativeReady = false;
      state.nativeError = chrome.runtime.lastError?.message || 'Połączenie z natywnym pomocnikiem zostało zakończone.';
      state.nativePort = null;
    });
    port.postMessage({ type: 'ping' });
  } catch (error) { state.nativeError = error.message; }
}
function activeChannel(id = state.channelId) {
  return state.channels.find(c => c.id === id) || (state.dmView ? state.dmChannels.get(id) : null);
}
function dmLabel(dm) {
  const person = dm?.recipients?.[0] || dm?.recipient;
  return person?.global_name || person?.username || dm?.name || 'Prywatna rozmowa';
}
function updateModeControls() {
  const guild = !!state.guildId && !state.dmView;
  $('open-search-button').classList.toggle('hidden', !guild);
  $('audit-open-button').classList.toggle('hidden', !guild);
  $('settings-open-button').classList.toggle('hidden', !guild);
  $('refresh-channels-button').classList.toggle('hidden', !guild);
  $('new-dm-button').classList.add('hidden');
  $('dm-sidebar-actions')?.classList.toggle('hidden', !state.dmView);
  $('dm-home').classList.toggle('active', state.dmView);
}
async function restoreDmChannels() {
  try {
    const key = `botpanel_dm_${state.me.id}`;
    const items = (await chrome.storage.local.get(key))[key];
    state.dmChannels.clear();
    for (const item of Array.isArray(items) ? items.slice(0, 50) : []) {
      if (/^\d{16,22}$/.test(String(item?.id || '')) && item.type === 1) state.dmChannels.set(item.id, item);
    }
  } catch (_) { /* local settings unavailable */ }
}
function persistDmChannels() {
  if (!state.me?.id) return;
  const list = [...state.dmChannels.values()].slice(-50).map(channel => ({
    id: channel.id, type: 1, recipient: channel.recipient || channel.recipients?.[0] || null
  }));
  chrome.storage.local.set({ [`botpanel_dm_${state.me.id}`]: list }).catch(() => {});
}
function rememberDmChannel(channel) {
  if (!channel?.id || channel.type !== 1) return;
  const old = state.dmChannels.get(channel.id) || {};
  const recipient = channel.recipient || channel.recipients?.find(p => p.id !== state.me?.id) || old.recipient;
  state.dmChannels.delete(channel.id);
  state.dmChannels.set(channel.id, { ...old, ...channel, recipient, name: dmLabel({recipient}) });
  persistDmChannels();
}
function rememberIncomingDm(message) {
  if (!message.channel_id || message.guild_id || !message.author) return;
  const known = state.dmChannels.get(message.channel_id);
  if (known) return;
  const user = message.author?.id !== state.me?.id ? message.author : null;
  if (!user) return;
  rememberDmChannel({id: message.channel_id, type: 1, recipient:user});
  if (state.dmView) renderChannels();
}
function renderDmList(target) {
  target.replaceChildren();
  const label = el('div','dm-list-heading','PRYWATNE ROZMOWY'); target.append(label);
  const dms = [...state.dmChannels.values()].reverse();
  for (const dm of dms) {
    const btn = el('button',`channel-entry${state.channelId === dm.id ? ' active' : ''}`);
    btn.type='button';btn.title=dmLabel(dm);
    const ava = el('span','dm-entry-avatar');setAvatar(ava,dm.recipient || dm.recipients?.[0],40);
    btn.append(ava, el('span','entry-name',dmLabel(dm)));
    if (state.unread.has(dm.id)) btn.append(el('span','unread-marker'));
    btn.addEventListener('click',()=>selectChannel(dm.id));
    target.append(btn);
  }
  if (!dms.length) target.append(el('div','empty-channel','Brak zapisanych rozmów. Kliknij +, aby otworzyć DM po ID użytkownika.'));
}
function selectDmHome() {
  state.dmView = true; state.guildId = null; state.channelId = null; state.channels = [];
  state.searchGeneration++; state.messageGeneration++;
  state.memberCache.clear(); state.roles.clear();
  state.selectedReply = null; state.file = null; state.historyJump = false;
  setSearchPanel(false); $('guild-title').textContent = 'Wiadomości prywatne';
  $('channel-title').textContent = 'Wiadomości prywatne'; $('channel-topic').textContent = '';
  document.querySelector('.chat-header-title .hash-symbol').textContent = '✉';
  updateModeControls(); renderGuilds(); renderChannels(); updateComposer();
  showChatPlaceholder('Wiadomości prywatne', 'Wybierz rozmowę lub kliknij +, aby otworzyć nową.');
}
async function startDm(userId) {
  if (!/^\d{16,22}$/.test(String(userId || ''))) { toast('Niepoprawne ID użytkownika.',true);return; }
  if (userId === state.me?.id) { toast('Nie możesz otworzyć DM z samym sobą.',true);return; }
  try {
    const dm = await api('/users/@me/channels',{method:'POST',body:JSON.stringify({recipient_id:userId})});
    if (dm?.type !== 1 || !dm.id) throw Error('Discord nie udostępnił prywatnej rozmowy.');
    rememberDmChannel(dm);
    selectDmHome();
    await selectChannel(dm.id);
    $('dm-dialog').close(); $('profile-dialog').close();
  } catch (err) { toast('Nie można otworzyć DM: '+err.message,true); }
}
function snowflakeDate(id) {
  try { return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toLocaleDateString('pl-PL'); }
  catch (_) { return 'brak danych'; }
}
async function openProfile(id) {
  if (!id || !/^\d{16,22}$/.test(String(id)) || !state.token) return;
  state.profileUser = null;
  state.profileMember = null;
  state.profileGuildId = state.guildId;
  $('profile-name').textContent = 'Pobieranie profilu…';
  $('profile-username').textContent = '';
  $('profile-details').textContent = '';
  $('profile-roles').replaceChildren();
  $('profile-dm').disabled = true;
  if (!$('profile-dialog').open) $('profile-dialog').showModal();
  const guildId = state.guildId;
  try {
    const [user, member] = await Promise.all([
      api(`/users/${id}`),
      guildId ? api(`/guilds/${guildId}/members/${id}`).catch(()=>null) : Promise.resolve(null)
    ]);
    if (!$('profile-dialog').open) return;
    state.profileUser = user;
    state.profileMember = member;
    state.profileGuildId = guildId;
    $('profile-name').textContent = member?.nick || user.global_name || user.username || 'Użytkownik';
    $('profile-username').textContent = `@${user.username || '?'} · ID: ${id}`;
    setAvatar($('profile-avatar'),user,128);
    const banner = $('profile-banner'); banner.style.backgroundImage = '';
    if (user.banner) banner.style.backgroundImage = `url(https://cdn.discordapp.com/banners/${id}/${user.banner}.${user.banner.startsWith('a_')?'gif':'png'}?size=600)`;
    else if (Number.isInteger(user.accent_color)) banner.style.background = `#${user.accent_color.toString(16).padStart(6,'0')}`;
    else banner.style.background = 'linear-gradient(120deg,#5057b0,#293047)';
    $('profile-details').replaceChildren(
      el('div','',`Konto utworzone: ${snowflakeDate(id)}`),
      ...(member?.joined_at ? [el('div','',`Na serwerze od: ${new Date(member.joined_at).toLocaleDateString('pl-PL')}`)] : []),
      el('div','',user.bot?'Konto bota':'Konto użytkownika')
    );
    for (const roleId of member?.roles || []) {
      const role = state.roles.get(roleId);
      if (!role) continue;
      const chip = el('span','profile-role',role.name);
      if (role.color) chip.style.borderColor=`#${role.color.toString(16).padStart(6,'0')}`;
      $('profile-roles').append(chip);
    }
    $('profile-dm').disabled = user.id === state.me?.id;
  } catch (err) { $('profile-name').textContent='Nie udało się pobrać profilu'; $('profile-details').textContent=err.message; }
}
const AUDIT_ACTIONS = {1:'Aktualizacja serwera',10:'Utworzono kanał',11:'Zmieniono kanał',12:'Usunięto kanał',13:'Zmieniono uprawnienia kanału',14:'Dodano nadpisanie uprawnień',15:'Usunięto nadpisanie uprawnień',20:'Wyrzucono użytkownika',21:'Usunięto blokadę',22:'Zablokowano użytkownika',23:'Usunięto blokadę użytkownika',24:'Zmieniono dane użytkownika',25:'Zmieniono rolę użytkownika',26:'Przeniesiono uczestnika',27:'Rozłączono uczestnika',28:'Dodano timeout',30:'Utworzono rolę',31:'Zmieniono rolę',32:'Usunięto rolę',40:'Utworzono zaproszenie',41:'Zmieniono zaproszenie',42:'Usunięto zaproszenie',72:'Usunięto wiadomość',73:'Masowo usunięto wiadomości',74:'Przypięto wiadomość',75:'Odpięto wiadomość',80:'Utworzono webhook',81:'Zmieniono webhook',82:'Usunięto webhook',100:'Utworzono wątek',101:'Zmieniono wątek',102:'Usunięto wątek',110:'Zmieniono automod',140:'Utworzono wydarzenie',141:'Zmieniono wydarzenie',142:'Usunięto wydarzenie'};
async function openAudit() {
  if (!state.guildId) return;
  state.auditBefore=null; $('audit-items').replaceChildren();
  $('audit-dialog').showModal(); await loadAudit(false);
}
async function loadAudit(more=false) {
  if (!state.guildId || state.auditBusy) return;
  state.auditBusy=true; $('audit-more').disabled=true;
  const guildId=state.guildId;
  if (!more) $('audit-items').append(el('div','empty-channel','Pobieranie dziennika…'));
  try {
    const query = new URLSearchParams({limit:'40'});
    if (more && state.auditBefore) query.set('before',state.auditBefore);
    const data=await api(`/guilds/${guildId}/audit-logs?${query}`);
    if (guildId!==state.guildId) return;
    const entries=Array.isArray(data?.audit_log_entries)?data.audit_log_entries:[];
    if (!more) $('audit-items').replaceChildren();
    const users=new Map((data.users||[]).map(u=>[u.id,u]));
    for (const entry of entries) {
      const author=users.get(entry.user_id);
      const display=author?.global_name||author?.username||entry.user_id||'System';
      const item=el('div','audit-item');
      item.append(el('div','audit-item-title',AUDIT_ACTIONS[entry.action_type]||`Zdarzenie #${entry.action_type}`));
      item.append(el('div','audit-item-note',`${display} → obiekt ${entry.target_id || 'nieznany'}`));
      if (entry.reason) item.append(el('div','audit-item-note',`Powód: ${entry.reason}`));
      if (entry.changes?.length) {
        const detail=entry.changes.slice(0,5).map(c=>`${c.key}: ${JSON.stringify(c.old_value??'—').slice(0,100)} → ${JSON.stringify(c.new_value??'—').slice(0,100)}`).join('\n');
        item.append(el('div','audit-item-note',detail));
      }
      item.append(el('div','audit-item-date',snowflakeDate(entry.id)));
      $('audit-items').append(item);
    }
    if (!entries.length && !more) $('audit-items').append(el('div','empty-channel','Dziennik jest pusty lub niedostępny.'));
    if (entries.length) state.auditBefore=entries[entries.length-1].id;
    $('audit-more').classList.toggle('hidden',entries.length<40);
  } catch (err) { $('audit-items').replaceChildren(el('div','empty-channel',err.message));$('audit-more').classList.add('hidden'); }
  finally {state.auditBusy=false;$('audit-more').disabled=false;}
}
let loadedGuildSettings=null;
async function openServerSettings() {
  if (!state.guildId) return;
  const id=state.guildId;
  $('server-dialog').showModal();
  $('server-settings-info').textContent='Pobieranie ustawień…';
  $('server-save').disabled=true;
  try {
    const guild=await api(`/guilds/${id}`);
    if (id!==state.guildId) return;
    loadedGuildSettings=guild;
    $('server-name-input').value=guild.name||'';
    $('server-description-input').value=guild.description||'';
    $('server-verification-input').value=String(guild.verification_level||0);
    $('server-settings-info').textContent=`Serwer: ${guild.id} · właściciel: ${guild.owner_id || 'brak danych'} · boost: poziom ${guild.premium_tier ?? 0}`;
    $('server-save').disabled=false;
  } catch (err) { $('server-settings-info').textContent=err.message; }
}
async function saveServerSettings() {
  if (!state.guildId || !loadedGuildSettings) return;
  const name=$('server-name-input').value.trim();
  const description=$('server-description-input').value.trim();
  const verification_level=Number($('server-verification-input').value);
  if (name.length<2||name.length>100||description.length>1024||![0,1,2,3,4].includes(verification_level)) {toast('Niepoprawne ustawienia.',true);return;}
  const patch={};
  if (name!==loadedGuildSettings.name) patch.name=name;
  if (description!==(loadedGuildSettings.description||'')) patch.description=description||null;
  if (verification_level!==loadedGuildSettings.verification_level) patch.verification_level=verification_level;
  if (!Object.keys(patch).length) { $('server-dialog').close();toast('Brak zmian.');return; }
  $('server-save').disabled=true;
  try {
    const guild=await api(`/guilds/${state.guildId}`,{method:'PATCH',body:JSON.stringify(patch)});
    state.guilds.set(guild.id,{...state.guilds.get(guild.id),...guild});
    loadedGuildSettings=guild;renderGuilds();$('guild-title').textContent=guild.name;
    $('server-dialog').close();toast('Zapisano ustawienia serwera.');
  } catch (err) { toast('Nie zapisano ustawień: '+err.message,true); }
  finally { $('server-save').disabled=false; }
}
function initNewFeatures() {
  startNativeBridge(); updateModeControls();
  $('dm-home').addEventListener('click',selectDmHome);
  $('new-dm-button').addEventListener('click',()=>{$('dm-user-id').value='';$('dm-dialog').showModal();});
  $('dm-create-button').addEventListener('click',()=>{$('dm-user-id').value='';$('dm-dialog').showModal();});
  $('dm-form').addEventListener('submit',event=>{event.preventDefault();startDm($('dm-user-id').value.trim());});
  $('profile-dm').addEventListener('click',()=>{if(state.profileUser?.id)startDm(state.profileUser.id);});
  $('audit-open-button').addEventListener('click',openAudit);
  $('audit-more').addEventListener('click',()=>loadAudit(true));
  $('settings-open-button').addEventListener('click',openServerSettings);
  $('server-form').addEventListener('submit',event=>{event.preventDefault();saveServerSettings();});
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click',()=>$(button.dataset.close).close());
}

async function init() {
  $('login-form').addEventListener('submit', event => {
    event.preventDefault();
    login($('token-input').value, { remember: $('remember-token').checked, contentIntent: $('content-intent').checked });
  });
  $('token-visibility').addEventListener('click', () => { $('token-input').type = $('token-input').type === 'password' ? 'text' : 'password'; });
  $('logout-button').addEventListener('click', ()=>{ if(confirm('Wylogować bota z panelu i usunąć zapisany token?')) logout(); });
  $('presence-open-button').addEventListener('click', openPresenceSettings);
  $('cancel-presence').addEventListener('click', () => $('presence-dialog').close());
  $('presence-form').addEventListener('submit', event => {
    event.preventDefault();
    savePresenceSettings().catch(err => toast(`Błąd zapisu statusu: ${err.message}`, true));
  });
  $('refresh-button').addEventListener('click', () => { if (state.channelId && !NO_DIRECT_MESSAGES_TYPES.has(activeChannel()?.type)) loadMessages(state.channelId, false); });
  $('refresh-channels-button').addEventListener('click', () => {
    if (!state.guildId) return;
    $('channel-list').replaceChildren(el('div', 'empty-channel', 'Odświeżanie kanałów…'));
    loadChannels(state.guildId).catch(err => toast(err.message, true));
  });
  $('load-more-button').addEventListener('click', () => { if (state.channelId) loadMessages(state.channelId, true); });
  $('message-scroller').addEventListener('scroll', onMessageScroll, { passive: true });
  $('open-search-button').addEventListener('click', () => setSearchPanel($('search-panel').classList.contains('hidden')));
  $('close-search-button').addEventListener('click', () => setSearchPanel(false));
  $('search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(false); });
  $('search-more-button').addEventListener('click', () => runSearch(true));
  $('latest-button').addEventListener('click', () => {
    state.historyJump = false; state.highlightId = null;
    $('latest-button').classList.add('hidden');
    if (state.channelId) loadMessages(state.channelId, false);
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
      if (!$('app-view').classList.contains('hidden')) { event.preventDefault(); setSearchPanel(true); }
    } else if (event.key === 'Escape' && !$('search-panel').classList.contains('hidden')) setSearchPanel(false);
  });
  $('rail-help').addEventListener('click', () => {
    alert('Discord Bot Panel\n\n0. Jednorazowo uruchom INSTALUJ-AUTOSTART.bat z ID rozszerzenia.\n1. Wklej token własnego bota.\n2. Bot musi należeć do serwera.\n3. W Discord Developer Portal → Bot włącz Message Content Intent, aby widzieć treść wiadomości.\n4. Nadaj botowi uprawnienia View Channel, Read Message History i Send Messages.\n\nRozszerzenie działa tylko, gdy karta jest otwarta. Nie korzysta z tokenów kont użytkowników.');
  });
  $('message-form').addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
  $('message-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); }
  });
  $('message-input').addEventListener('input', () => {
    const input = $('message-input'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    updateComposer();
  });
  $('attach-button').addEventListener('click', () => { if (!state.sending && state.channelId) $('attachment-input').click(); });
  $('attachment-input').addEventListener('change', () => {
    const file = $('attachment-input').files?.[0];
    if (file && file.size > 24 * 1024 * 1024) { toast('Maksymalny rozmiar pliku w tym panelu to 24 MB.', true); $('attachment-input').value = ''; return; }
    state.file = file || null; updateComposer();
  });
  $('cancel-reply').addEventListener('click', () => { state.selectedReply = null; updateComposer(); });
  $('cancel-file').addEventListener('click', () => { state.file = null; $('attachment-input').value = ''; updateComposer(); });
  $('cancel-edit').addEventListener('click', () => $('edit-dialog').close());
  $('edit-form').addEventListener('submit', event => { event.preventDefault(); submitEdit(); });
  window.addEventListener('online', () => { if (state.token && !state.ws && !state.reconnectId) connectGateway(!!state.sessionId); });
  window.addEventListener('beforeunload', () => { clearGateway(); try { state.nativePort?.disconnect(); } catch (_) {} });
  initNewFeatures();
  // Najpierw sesja (ulotna), potem jawnie zapamiętany token.
  try {
    const [session, local] = await Promise.all([
      chrome.storage.session.get(['botToken', 'useContentIntent']),
      chrome.storage.local.get(['botToken', 'botPresenceStatus', 'botActivityType', 'botActivityName'])
    ]);
    if (PRESENCE_STATUSES.has(local.botPresenceStatus)) state.presenceStatus = local.botPresenceStatus;
    if (ACTIVITY_TYPES.has(Number(local.botActivityType))) state.activityType = Number(local.botActivityType);
    if (typeof local.botActivityName === 'string') state.activityName = local.botActivityName.slice(0, 128);
    updatePresenceDisplay();
    const token = session.botToken || local.botToken;
    if (token) {
      const remember = !!local.botToken;
      $('remember-token').checked = remember;
      $('content-intent').checked = session.useContentIntent !== false;
      await login(token, { remember, contentIntent: session.useContentIntent !== false });
    }
  } catch (_) { /* użytkownik może zalogować się ręcznie */ }
}
init();
