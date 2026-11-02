'use strict';
/* v1.12.1 — single compact user profile, staged role editor and popover fixes. */
(() => {
  const $ = id => document.getElementById(id);
  const card = $('profile-dialog');
  if (!card) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const validId = value => /^\d{16,22}$/.test(String(value || ''));
  const color = role => {
    const n = Number(role?.colors?.primary_color ?? role?.color ?? 0);
    return Number.isFinite(n) && n > 0 ? '#' + n.toString(16).padStart(6, '0') : '#888b98';
  };
  const make = (tag, cls, label) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (label != null) node.textContent = label;
    return node;
  };
  const action = (label, cls, click) => {
    const button = make('button', 'v121-action ' + (cls || ''), label);
    button.type = 'button';
    button.addEventListener('click', click);
    return button;
  };
  let serial = 0, context = null, anchor = null, roleCache = new Map(), highest = 0, mayManage = false;
  const dirty = () => !!context && (
    context.nick !== context.originalNick ||
    [...context.selected].some(id => !context.original.has(id)) ||
    [...context.original].some(id => !context.selected.has(id))
  );
  function closeRoleMenu() { $('v121-picker')?.remove(); }
  function discardDraft() { if (context) { context.selected = new Set(context.original); context.nick = context.originalNick; } }
  function canCloseProfile() {
    if (!dirty()) { closeRoleMenu(); return true; }
    const ok = confirm('Masz niezapisane zmiany ról lub nicku. Odrzucić je?');
    if (ok) { discardDraft(); closeRoleMenu(); }
    return ok;
  }
  window.BotPanelV121 = { canCloseProfile };

  // The same profile is used by chat messages, mentions, member grid, roster and search.
  document.addEventListener('pointerdown', event => {
    const candidate = event.target.closest('.v11-member-item,.v12-person,.pp-roster-member,.message-avatar,.message-name,.profile-link,.search-result-author');
    if (candidate) anchor = candidate;
    // Inside the user card but outside the role chooser -> close only the chooser.
    if (card.open && $('v121-picker') && !event.target.closest('#v121-picker,#v121-plus')) closeRoleMenu();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('v121-picker')) {
      event.preventDefault(); event.stopImmediatePropagation(); closeRoleMenu();
    }
  }, true);
  card.addEventListener('close', () => { context = null; closeRoleMenu(); });

  function position() {
    if (!card.open) return;
    // Measure after content has been rendered; keep every button within the viewport.
    const w = card.offsetWidth, h = card.offsetHeight, edge = 9;
    let x = (innerWidth - w) / 2, y = (innerHeight - h) / 2;
    if (anchor?.isConnected) {
      const r = anchor.getBoundingClientRect();
      x = r.right + 12 + w <= innerWidth - edge ? r.right + 12 : r.left - w - 12;
      y = r.top - 55;
    }
    card.style.left = Math.round(Math.max(edge, Math.min(innerWidth - w - edge, x))) + 'px';
    card.style.top = Math.round(Math.max(edge, Math.min(innerHeight - h - edge, y))) + 'px';
    card.style.margin = '0'; card.style.position = 'fixed';
  }
  addEventListener('resize', () => { if (card.open) position(); });

  function rolesArray() {
    return [...roleCache.values()].filter(role => role.id !== context?.guild).sort((a,b) => (b.position||0)-(a.position||0));
  }
  function mayEditRole(role) {
    return !!(context && mayManage && !context.targetProtected && role && !role.managed && role.id !== context.guild && role.position < highest);
  }
  function roleList() {
    const container = $('profile-roles');
    const existingPicker = $('v121-picker');
    if (existingPicker) existingPicker.remove();
    container.replaceChildren();
    const heading = make('div', 'v121-role-heading', 'ROLE');
    container.append(heading);
    const chips = make('div', 'v121-role-chips');
    for (const rid of [...context.selected].sort((a,b) => (roleCache.get(b)?.position||0)-(roleCache.get(a)?.position||0))) {
      const role = roleCache.get(rid);
      if (!role) continue;
      const chip = make('span', 'v121-role-chip');
      const dot = make('i', 'v121-role-dot'); dot.style.background = color(role);
      chip.append(dot, make('span', '', role.name));
      chip.style.setProperty('--chip-color',color(role));
      chips.append(chip);
    }
    if (!context.member) chips.append(make('span','v121-empty','Brak danych ról w tej rozmowie'));
    else if (!context.selected.size) chips.append(make('span','v121-empty','Brak dodatkowych ról'));
    if (context.member && mayManage && !context.targetProtected) {
      const plus = action('+','v121-plus', e => { e.stopPropagation(); if ($('v121-picker')) closeRoleMenu(); else rolePicker(); });
      plus.id = 'v121-plus'; plus.title = 'Dodaj lub odbierz role'; plus.setAttribute('aria-label','Zarządzaj rolami');
      chips.append(plus);
    }
    container.append(chips);
    if (existingPicker) container.append(existingPicker);
    updateDraftBar();
  }
  function rolePicker() {
    if (!context) return;
    const pop = make('div', 'v121-picker'); pop.id = 'v121-picker';
    pop.append(make('strong','v121-picker-title','Role użytkownika'));
    const input = make('input', 'v121-picker-search'); input.type = 'search'; input.placeholder = 'Wyszukaj rolę...';
    const list = make('div', 'v121-picker-list');
    function render() {
      list.replaceChildren();
      const q = input.value.toLocaleLowerCase('pl').trim();
      const matched = rolesArray().filter(r=>r.name.toLocaleLowerCase('pl').includes(q));
      for (const r of matched) {
        const item = make('label','v121-picker-row');
        const check = make('input'); check.type = 'checkbox'; check.checked = context.selected.has(r.id);
        check.disabled = !mayEditRole(r);
        const dot = make('i','v121-role-dot'); dot.style.background = color(r);
        item.append(check, dot, make('span','',r.name));
        if (check.disabled) { item.classList.add('locked'); item.title = 'Bot nie może zmieniać tej roli (uprawnienia/hierarchia).'; }
        check.addEventListener('change', () => {
          if (check.checked) context.selected.add(r.id); else context.selected.delete(r.id);
          roleList(); // The role menu stays open; no other click is required.
        });
        list.append(item);
      }
      if (!matched.length) list.append(make('div','v121-empty','Brak ról o takiej nazwie'));
    }
    input.addEventListener('input',render);
    pop.append(input,list);
    $('profile-roles').append(pop);
    render(); input.focus();
    requestAnimationFrame(position);
  }
  function updateDraftBar() {
    const footer = $('v121-draft-bar'); if (!footer || !context) return;
    footer.classList.toggle('hidden',!dirty());
  }
  function editor() {
    const slot = $('v121-editor'); if (!slot) return;
    const open = slot.classList.contains('hidden');
    slot.classList.toggle('hidden',!open);
    if (!open) return;
    closeRoleMenu();
    slot.replaceChildren();
    const label = make('label','','Nick na serwerze');
    const input = make('input','v121-nick'); input.value = context.nick; input.maxLength = 32;
    input.placeholder = 'Nick serwerowy';
    input.addEventListener('input', () => { context.nick=input.value; updateDraftBar(); });
    label.append(input);
    slot.append(label);
    requestAnimationFrame(position);
    input.focus();
  }
  function buildActions(user) {
    const footer = card.querySelector('.profile-content > .dialog-actions');
    const dm = action('✉ DM','v121-dm',()=>{
      if (!canCloseProfile()) return;
      startDm(user.id);
    });
    dm.id='profile-dm'; dm.title='Napisz prywatnie';
    const manage=action('⚙ Zarządzaj','',editor);
    manage.disabled = !context.member || !mayManage || context.targetProtected;
    if (manage.disabled) manage.title='Brak uprawnień do zarządzania tym użytkownikiem';
    const moderate=action('⚖ Moderuj','',()=>{if(!canCloseProfile())return;card.close();window.PanelPlus?.moderateOne?.(user.id);});
    const history=action('◷ Historia','',()=>{if(!canCloseProfile())return;card.close();if(typeof showUserHistory==='function')showUserHistory(user.id);});
    footer.replaceChildren(manage,moderate,history,dm);
    footer.classList.add('v121-actions');
  }
  async function saveDraft() {
    if (!dirty()) return;
    const ctx = context, member = ctx.member;
    if (!member || !ctx.guild || !mayManage || ctx.targetProtected) return toast('Nie można zmienić tego użytkownika.',true);
    if (ctx.nick.length > 32) return toast('Nick może mieć maksymalnie 32 znaki.',true);
    const payload = {};
    if (ctx.nick !== ctx.originalNick) payload.nick = ctx.nick.trim() || null;
    const changed = [...new Set([...ctx.original,...ctx.selected])].filter(id => ctx.original.has(id) !== ctx.selected.has(id));
    if (changed.some(id => !mayEditRole(roleCache.get(id)))) return toast('Nie można modyfikować chronionej roli.',true);
    if (changed.length) payload.roles = [...ctx.selected];
    const button = $('v121-save'); button.disabled = true;
    try {
      const result = await api(`/guilds/${ctx.guild}/members/${ctx.user.id}`, {method:'PATCH',body:JSON.stringify(payload)});
      if (ctx !== context) return;
      const updated = result?.user ? result : {...member,roles:payload.roles||member.roles,nick:payload.nick??member.nick};
      ctx.member = updated; state.profileMember = updated;
      ctx.original = new Set(updated.roles||ctx.selected);
      ctx.selected = new Set(ctx.original);
      ctx.originalNick = updated.nick||''; ctx.nick = ctx.originalNick;
      state.memberCache.set(ctx.user.id,updated);
      $('profile-name').textContent=updated.nick||ctx.user.global_name||ctx.user.username;
      $('v121-editor').classList.add('hidden');
      roleList();updateDraftBar();closeRoleMenu();
      if (typeof renderMessages==='function')renderMessages();
      if (typeof renderMemberPanel==='function')renderMemberPanel();
      toast('Zapisano zmiany użytkownika.');requestAnimationFrame(position);
    } catch(err) {toast('Nie zapisano zmian: '+err.message,true);}
    finally { button.disabled=false; }
  }
  // Replace the older, multi-row profile renderer; no extra button inherited from v1.11.
  openProfile = async function(userId) {
    if (!validId(userId) || !state.token) return;
    if (card.open && !canCloseProfile()) return;
    const seq = ++serial, guild = state.guildId;
    context = null; closeRoleMenu();
    $('profile-name').textContent='Pobieranie profilu…';
    $('profile-username').textContent=''; $('profile-details').replaceChildren();
    $('profile-roles').replaceChildren();
    $('profile-avatar').textContent='…';
    if (!card.open) card.show();
    card.classList.add('v12-profile-popover','v121-profile');
    card.querySelector('.profile-content > .dialog-actions').replaceChildren();
    position();
    try {
      const [user, member] = await Promise.all([
        api(`/users/${userId}`),
        guild ? api(`/guilds/${guild}/members/${userId}`).catch(()=>null) : Promise.resolve(null)
      ]);
      if (seq !== serial || !card.open) return;
      const source = adminState.guildId===guild && adminState.roles.length ? adminState.roles : [...state.roles.values()];
      if (guild && !source.length) {
        try {const loaded=await api(`/guilds/${guild}/roles`);if (seq!==serial||!card.open) return;roleCache=new Map(loaded.map(r=>[r.id,r]));}
        catch {roleCache=new Map();}
      } else roleCache=new Map(source.map(r=>[r.id,r]));
      state.profileUser=user;state.profileMember=member;state.profileGuildId=guild;
      context={guild,user,member,original:new Set(member?.roles||[]),selected:new Set(member?.roles||[]),nick:member?.nick||'',originalNick:member?.nick||'',targetProtected:false};
      $('profile-name').textContent=member?.nick||user.global_name||user.username||'Użytkownik';
      $('profile-username').textContent=`@${user.username||'?'} · ID: ${userId}`;
      setAvatar($('profile-avatar'),user,128);
      const banner=$('profile-banner'); banner.style.backgroundImage='';
      if (user.banner && /^[a-zA-Z0-9_]+$/.test(user.banner)) {
        banner.style.background=`center / cover url("https://cdn.discordapp.com/banners/${userId}/${user.banner}.${user.banner.startsWith('a_')?'gif':'png'}?size=600")`;
      } else banner.style.background=Number.isInteger(user.accent_color)?'#'+user.accent_color.toString(16).padStart(6,'0'):'linear-gradient(115deg,#5d66b8,#303447)';
      $('profile-details').replaceChildren(
        make('div','',`Konto utworzone: ${snowflakeDate(userId)}`),
        ...(member?.joined_at?[make('div','',`Na serwerze od: ${new Date(member.joined_at).toLocaleDateString('pl-PL')}`)]:[]),
        make('div','',user.bot?'Konto bota':'Konto użytkownika')
      );
      const [self, memberRoles] = await Promise.all([
        guild&&state.me?.id?api(`/guilds/${guild}/members/${state.me.id}`).catch(()=>null):Promise.resolve(null),
        Promise.resolve(member?.roles||[])
      ]);
      if (seq !== serial||!card.open)return;
      highest=Math.max(0,...(self?.roles||[]).map(id=>roleCache.get(id)?.position||0));
      const perms=(self?.roles||[]).reduce((acc,id)=>acc|BigInt(roleCache.get(id)?.permissions||0),BigInt(roleCache.get(guild)?.permissions||0));
      mayManage=!!self && (perms & ((1n<<28n)|(1n<<3n)))!==0n;
      const top=Math.max(0,...memberRoles.map(id=>roleCache.get(id)?.position||0));
      context.targetProtected = !guild || !member || userId===state.me?.id || top>=highest;
      const details=$('profile-details');
      details.querySelector('.v11-profile-tools')?.remove();
      roleList();
      let editorSlot=$('v121-editor'); if(!editorSlot){editorSlot=make('div','v121-editor hidden');editorSlot.id='v121-editor';}
      editorSlot.replaceChildren();editorSlot.classList.add('hidden');
      $('profile-roles').after(editorSlot);
      let draftBar=$('v121-draft-bar');if(!draftBar){draftBar=make('div','v121-draft-bar hidden');draftBar.id='v121-draft-bar';}
      draftBar.replaceChildren(make('span','','Masz niezapisane zmiany'));
      draftBar.append(action('Anuluj','v121-cancel',()=>{discardDraft();closeRoleMenu();editorSlot.classList.add('hidden');roleList();}),action('Zapisz zmiany','v121-save',saveDraft));
      draftBar.querySelector('.v121-save').id='v121-save';
      $('profile-roles').after(editorSlot,draftBar);
      buildActions(user);updateDraftBar();
      $('profile-dm').disabled=user.id===state.me?.id;
      requestAnimationFrame(position);
    } catch(err) {if(seq!==serial)return;$('profile-name').textContent='Nie udało się pobrać profilu';$('profile-details').textContent=err.message;requestAnimationFrame(position);}
  };
  // Role accents in settings follow the actual primary color returned by Discord.
  const syncRoleColor=()=>{
    for(const element of document.querySelectorAll('.v12-role-entry')){
      const r=adminState.roles.find(role=>role.id===element.dataset.role);
      if (!r) continue;
      const draft=element.style.getPropertyValue('--role-accent');
      if (r.colors?.primary_color != null && /^#000000$/i.test(draft.trim())) element.style.setProperty('--role-accent',color(r));
    }
  };
  new MutationObserver(syncRoleColor).observe($('admin-content'),{childList:true,subtree:true});
})();
