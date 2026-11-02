'use strict';
// Bez innerHTML: treści Discorda są niesprawdzonymi danymi wejściowymi.
(function () {
  const E = (tag, className = '', text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const safeUrl = raw => {
    try { const value = new URL(raw); return ['http:', 'https:'].includes(value.protocol) ? value.href : null; }
    catch (_) { return null; }
  };
  const safeAsset = raw => {
    try {
      const url = new URL(raw);
      const host = url.hostname;
      return url.protocol === 'https:' && (host === 'cdn.discordapp.com' || host === 'media.discordapp.net' || host.endsWith('.discordapp.net')) ? url.href : null;
    } catch (_) { return null; }
  };
  function appendText(node, text) { if (text) node.append(document.createTextNode(text)); }
  function timeLabel(raw, style) {
    const time = new Date(Number(raw) * 1000);
    if (!Number.isFinite(time.getTime())) return null;
    const formats = {
      t: { hour: '2-digit', minute: '2-digit' }, T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
      d: { day: '2-digit', month: '2-digit', year: 'numeric' }, D: { day: 'numeric', month: 'long', year: 'numeric' },
      f: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
      F: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    };
    if (style === 'R') {
      const seconds = Math.round((time.getTime() - Date.now()) / 1000);
      const abs = Math.abs(seconds);
      const unit = abs < 60 ? 'second' : abs < 3600 ? 'minute' : abs < 86400 ? 'hour' : abs < 604800 ? 'day' : abs < 2629800 ? 'week' : abs < 31557600 ? 'month' : 'year';
      const divisor = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 }[unit];
      return new Intl.RelativeTimeFormat('pl', { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
    }
    return new Intl.DateTimeFormat('pl-PL', formats[style] || formats.f).format(time);
  }
  function tokenNode(token, message, context) {
    let match;
    if ((match = /^<a?:([\w-]{1,40}):(\d{16,22})>$/.exec(token))) {
      const animated = token.startsWith('<a:');
      const img = E('img', 'discord-emoji');
      img.src = `https://cdn.discordapp.com/emojis/${match[2]}.${animated ? 'gif' : 'webp'}?size=48&quality=lossless`;
      img.alt = `:${match[1]}:`; img.title = img.alt; img.loading = 'lazy';
      img.addEventListener('error', () => img.replaceWith(document.createTextNode(img.alt)), { once: true });
      return img;
    }
    if ((match = /^<@!?([0-9]{16,22})>$/.exec(token))) {
      const user = (message.mentions || []).find(u => u.id === match[1]);
      const member = context.getMember?.(match[1]);
      const label = member?.nick || user?.member?.nick || user?.global_name || user?.username || match[1];
      const node = E('button', 'discord-mention pp-mention-link', '@' + label); node.type='button'; node.title='Otwórz profil użytkownika'; node.addEventListener('click', () => context.openUser?.(match[1])); return node;
    }
    if ((match = /^<@&(\d{16,22})>$/.exec(token))) {
      const role = context.roles?.get(match[1]);
      const node = E('button', 'discord-mention pp-mention-link', '@' + (role?.name || match[1])); node.type='button'; node.title='Pokaż rolę'; node.addEventListener('click', () => context.openRole?.(match[1])); return node;
    }
    if ((match = /^<#(\d{16,22})>$/.exec(token))) {
      const channel = context.channels?.find(c => c.id === match[1]);
      const node = E('button', 'discord-mention pp-mention-link', '#' + (channel?.name || match[1])); node.type='button'; node.title='Przejdź do kanału'; node.addEventListener('click', () => context.openChannel?.(match[1])); return node;
    }
    if ((match = /^<t:(\d{1,13})(?::([tTdDfFR]))?>$/.exec(token))) {
      const value = timeLabel(match[1], match[2]);
      if (value) { const span = E('time', 'discord-timestamp', value); span.title = new Date(Number(match[1]) * 1000).toLocaleString('pl-PL'); return span; }
    }
    if ((match = /^<\/([\w-]{1,32}):\d{16,22}>$/.exec(token))) return E('span', 'discord-command', `/${match[1]}`);
    if (/^https?:\/\//i.test(token)) {
      const url = safeUrl(token);
      if (url) { const a = E('a', '', token); a.href = url; a.rel = 'noopener noreferrer'; a.target = '_blank'; return a; }
    }
    return document.createTextNode(token);
  }
  // Limity wejścia ograniczają zapętlenia przy nietypowych delimiterach.
  function inline(container, input, message = {}, context = {}, depth = 0) {
    const text = String(input || '');
    if (depth > 7 || text.length > 12000) { appendText(container, text); return; }
    const pattern = /\\([\\*_~|`>])|(<a?:[\w-]{1,40}:\d{16,22}>|<@!?\d{16,22}>|<@&\d{16,22}>|<#\d{16,22}>|<t:\d{1,13}(?::[tTdDfFR])?>|<\/[\w-]{1,32}:\d{16,22}>|https?:\/\/[^\s<>"']+)|\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)]+)\)|(`{1,2})([^`\n]+?)\5|(\*\*\*|___|\*\*|__|\*|_|~~|\|\|)/g;
    let pos = 0, matches = 0, match;
    while ((match = pattern.exec(text)) && matches++ < 2200) {
      const start = match.index;
      appendText(container, text.slice(pos, start));
      if (match[1]) appendText(container, match[1]);
      else if (match[2]) {
        // Nie łącz interpunkcji po adresie z linkiem.
        if (/^https?:/i.test(match[2])) {
          const url = match[2].replace(/[.,;!?]+$/, '');
          container.append(tokenNode(url, message, context));
          appendText(container, match[2].slice(url.length));
        } else container.append(tokenNode(match[2], message, context));
      } else if (match[3]) {
        const href = safeUrl(match[4]);
        if (href) { const a = E('a', 'discord-masked-link', match[3]); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; container.append(a); }
        else appendText(container, match[0]);
      } else if (match[5]) container.append(E('code', 'discord-inline-code', match[6]));
      else if (match[7]) {
        const delim = match[7];
        const end = text.indexOf(delim, pattern.lastIndex);
        if (end > pattern.lastIndex) {
          const names = { '***': 'strong-em', '___': 'strong-em', '**': 'strong', '__': 'underline', '*': 'em', '_': 'em', '~~': 'strike', '||': 'spoiler' };
          const kind = names[delim];
          let element;
          if (kind === 'spoiler') {
            element = E('button', 'discord-spoiler'); element.type = 'button'; element.setAttribute('aria-label', 'Pokaż ukryty tekst');
            element.addEventListener('click', () => { const open = element.classList.toggle('revealed'); element.setAttribute('aria-label', open ? 'Ukryj tekst' : 'Pokaż ukryty tekst'); });
          } else if (kind === 'strong-em') element = E('strong', 'discord-strong-em');
          else element = E(({ strong: 'strong', em: 'em', underline: 'u', strike: 's' })[kind]);
          if (kind === 'strong-em') { const inner = E('em'); inline(inner, text.slice(pattern.lastIndex, end), message, context, depth + 1); element.append(inner); }
          else inline(element, text.slice(pattern.lastIndex, end), message, context, depth + 1);
          container.append(element); pattern.lastIndex = end + delim.length;
        } else appendText(container, delim);
      }
      pos = pattern.lastIndex;
    }
    appendText(container, text.slice(pos));
  }
  function appendFormatted(container, content, message, context) {
    // Kod blokowy i cytaty mają odrębny układ. Reszta zachowuje białe znaki.
    const source = String(content || '').replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      const fence = /^\s*(`{3,})([\w+#.-]*)\s*$/.exec(line);
      if (fence) {
        const body = [];
        i++;
        while (i < lines.length && !new RegExp('^\\s*' + fence[1] + '\\s*$').test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) i++;
        const pre = E('pre', 'discord-codeblock');
        if (fence[2]) pre.append(E('span', 'discord-code-language', fence[2]));
        pre.append(E('code', '', body.join('\n'))); container.append(pre);
        continue;
      }
      const quote = /^\s*(?:>\s?|>>>\s?)(.*)$/.exec(line);
      if (quote) {
        const block = E('blockquote', 'discord-quote');
        const all = line.trim().startsWith('>>>');
        const parts = [quote[1]];
        i++;
        if (all) { parts.push(...lines.slice(i)); i = lines.length; }
        else while (i < lines.length && /^\s*>\s?/.test(lines[i])) parts.push(lines[i++].replace(/^\s*>\s?/, ''));
        inline(block, parts.join('\n'), message, context); container.append(block);
        if (i < lines.length) container.append(document.createTextNode('\n'));
        continue;
      }
      const header = /^(#{1,3})\s+(.+)$/.exec(line);
      const subtext = /^\s*[-*]\s+(.+)$/.exec(line);
      if (header) { const h = E('div', `discord-heading discord-heading-${header[1].length}`); inline(h, header[2], message, context); container.append(h); }
      else if (subtext) { const item = E('div', 'discord-list-item'); item.append(E('span', 'discord-bullet', '•')); inline(item, subtext[1], message, context); container.append(item); }
      else if (/^\s*---+\s*$/.test(line)) container.append(E('hr', 'discord-horizontal-rule'));
      else inline(container, line, message, context);
      i++;
      if (i < lines.length) container.append(document.createTextNode('\n'));
    }
  }
  function stickerNode(item) {
    const box = E('div', 'discord-sticker');
    if (!/^\d{16,22}$/.test(String(item.id || ''))) return box;
    const name = String(item.name || 'Naklejka');
    if (item.format_type === 3) {
      const fallback = E('div', 'discord-sticker-lottie', '✦');
      fallback.title = `${name} — format Lottie; podgląd animacji niedostępny`;
      fallback.append(E('span', '', name));
      box.append(fallback);
      return box;
    }
    const src = item.format_type === 4
      ? `https://media.discordapp.net/stickers/${item.id}.gif`
      : `https://cdn.discordapp.com/stickers/${item.id}.png`;
    const image = E('img', 'discord-sticker-image'); image.src = src; image.alt = `Naklejka: ${name}`; image.title = name; image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(E('div', 'discord-sticker-lottie', `Naklejka: ${name}`)), { once: true });
    box.append(image); return box;
  }
  function addEmbed(parent, embed, context) {
    const card = E('section', 'embed-card discord-rich-embed');
    if (Number.isInteger(embed.color) && embed.color > 0 && embed.color <= 0xffffff) card.style.borderLeftColor = '#' + embed.color.toString(16).padStart(6, '0');
    if (embed.author?.name) card.append(E('div', 'embed-author', embed.author.name));
    if (embed.provider?.name) card.append(E('div', 'embed-provider', embed.provider.name));
    const href = safeUrl(embed.url || '');
    if (embed.title) {
      const title = E(href ? 'a' : 'strong', 'embed-title', embed.title);
      if (href) { title.href = href; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
      card.append(title);
    }
    if (embed.description) { const desc = E('div', 'embed-description'); appendFormatted(desc, embed.description, {}, context); card.append(desc); }
    if (Array.isArray(embed.fields) && embed.fields.length) {
      const fields = E('div', 'embed-fields');
      for (const field of embed.fields.slice(0, 25)) {
        const fieldNode = E('div', `embed-field${field.inline ? ' inline' : ''}`);
        fieldNode.append(E('strong', '', field.name));
        const value = E('div'); appendFormatted(value, field.value, {}, context); fieldNode.append(value); fields.append(fieldNode);
      }
      card.append(fields);
    }
    const imageUrl = safeAsset(embed.image?.proxy_url || embed.image?.url || embed.thumbnail?.proxy_url || embed.thumbnail?.url || '');
    if (imageUrl) { const image = E('img', 'embed-image'); image.src = imageUrl; image.loading = 'lazy'; image.alt = 'Obraz z osadzonej wiadomości'; card.append(image); }
    if (embed.footer?.text) card.append(E('div', 'embed-footer', embed.footer.text));
    if (card.childNodes.length) parent.append(card);
  }
  function attachmentNode(attachment) {
    const url = safeAsset(attachment.url || '');
    if (!url) return null;
    const name = String(attachment.filename || 'Załącznik');
    const type = String(attachment.content_type || '');
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(name)) {
      const link = E('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const img = E('img', 'attachment-image'); img.src = url; img.loading = 'lazy'; img.alt = name; link.append(img);
      return link;
    }
    if (type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) {
      const wrap = E('div', 'discord-media-wrap');
      const video = E('video', 'attachment-video'); video.src = url; video.controls = true; video.preload = 'none';
      wrap.append(video); const link = E('a', 'discord-media-caption', `↗ ${name}`); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; wrap.append(link); return wrap;
    }
    if (type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|flac)$/i.test(name)) {
      const wrap = E('div', 'discord-media-wrap');
      wrap.append(E('div', 'discord-media-caption', `♫ ${name}`));
      const audio = E('audio'); audio.src = url; audio.controls = true; audio.preload = 'none'; wrap.append(audio); return wrap;
    }
    const a = E('a', 'attachment-link', `📎 ${name}`); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function pollNode(poll) {
    const box = E('section', 'discord-poll');
    const question = String(poll?.question?.text || 'Ankieta');
    box.append(E('strong', 'discord-poll-question', question));
    const counts = new Map((poll.results?.answer_counts || []).map(a => [a.id, Number(a.count || 0)]));
    const sum = Math.max(0, ...counts.values());
    for (const answer of (poll.answers || []).slice(0, 15)) {
      const value = counts.get(answer.answer_id) || 0;
      const row = E('div', 'discord-poll-answer');
      const bar = E('div', 'discord-poll-progress'); bar.style.width = `${sum ? Math.round(value / sum * 100) : 0}%`;
      row.append(bar);
      const label = E('span', 'discord-poll-label');
      const emoji = answer.poll_media?.emoji;
      if (emoji?.name) label.append(document.createTextNode(`${emoji.name} `));
      label.append(document.createTextNode(answer.poll_media?.text || `Opcja ${answer.answer_id}`));
      row.append(label, E('span', 'discord-poll-votes', String(value))); box.append(row);
    }
    const total = poll.results?.answer_counts?.reduce((v, x) => v + Number(x.count || 0), 0);
    box.append(E('div', 'discord-poll-footer', `${Number(total || 0)} głosów · podgląd tylko do odczytu`));
    return box;
  }
  function snapshotNode(data, context) {
    const snap = data?.message;
    if (!snap) return null;
    const box = E('div', 'discord-snapshot');
    box.append(E('div', 'discord-snapshot-title', '↪ Przekazana wiadomość'));
    if (snap.content) {
      const content = E('div', 'message-text');
      appendFormatted(content, snap.content, snap, context); box.append(content);
    }
    for (const item of (snap.sticker_items || []).slice(0, 3)) box.append(stickerNode(item));
    for (const attachment of (snap.attachments || []).slice(0, 4)) { const node = attachmentNode(attachment); if (node) box.append(node); }
    for (const embed of (snap.embeds || []).slice(0, 2)) addEmbed(box, embed, context);
    return box;
  }
  return void (window.BotMessageRenderer = { appendFormatted, stickerNode, attachmentNode, addEmbed, pollNode, snapshotNode, safeAsset, timeLabel });
})();
