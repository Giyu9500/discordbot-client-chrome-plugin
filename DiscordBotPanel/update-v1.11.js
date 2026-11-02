'use strict';
/* v1.11: Discord-like member management, staged permissions, assets and message menus.
   Every destructive action requires explicit confirmation; never run mass moderation from here. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sid = id => /^\d{16,22}$/.test(String(id||''));
  const memberLabel = m => m.nick||m.user?.global_name||m.user?.username||m.user?.id||'Użytkownik';
  const memberStore={guildId:null,items:[],byId:new Map(),after:null,complete:false,busy:false,request:0,selfHighest:0};
  const dirty={active:false};
  const adminGuard=()=>!dirty.active||confirm('Masz niezapisane zmiany. Odrzucić je?');
  function markDirty(){dirty.active=true;let b=$('v11-unsaved');if(b)b.classList.remove('hidden');}
  function resetDirty(){dirty.active=false;let b=$('v11-unsaved');if(b)b.classList.add('hidden');}
  function footer(save,cancel){
    const bar=document.createElement('div');bar.id='v11-unsaved';bar.className='v11-unsaved hidden';
    bar.innerHTML='<strong>Masz niezapisane zmiany!</strong><div><button type="button" id="v11-cancel">Anuluj</button><button type="button" id="v11-save">Zapisz zmiany</button></div>';
    $('admin-content').append(bar);
    bar.querySelector('#v11-save').addEventListener('click',save);
    bar.querySelector('#v11-cancel').addEventListener('click',()=>{resetDirty();cancel();});
    return bar;
  }
  // One single message popover. Visible only on request, always closes on outside/Esc.
  let menu=null;
  function hideMenu(){if(menu)menu.remove();menu=null;}
  function messageMore(event,message){
    if(menu?.dataset.id===message.id){hideMenu();return;}
    hideMenu();menu=document.createElement('div');menu.className='v11-message-menu';menu.dataset.id=message.id;
    const make=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',e=>{e.stopPropagation();hideMenu();Promise.resolve().then(fn).catch(e=>toast(e.message,true));});menu.append(b);};
    if(message.author?.id===state.me?.id)make('✎ Edytuj wiadomość',()=>beginEdit(message));
    make('🔗 Kopiuj link do wiadomości',()=>navigator.clipboard.writeText(`https://discord.com/channels/${state.dmView?'@me':state.guildId}/${message.channel_id}/${message.id}`).then(()=>toast('Skopiowano link.')));
    if(!state.dmView){
      make(message.pinned?'↗ Odepnij wiadomość':'📌 Przypnij wiadomość',()=>window.PanelPlus?.togglePin?.(message));
      make('☷ Utwórz wątek',()=>window.PanelPlus?.threadFromMessage?.(message));
      make('☑ Zaznacz wiadomości',()=>window.PanelPlus?.startBulk?.());
    }
    make('Kopiuj ID wiadomości',()=>navigator.clipboard.writeText(message.id).then(()=>toast('Skopiowano ID.')));
    document.body.append(menu);
    const rect=event.currentTarget?.getBoundingClientRect?.()||{left:event.clientX,top:event.clientY,bottom:event.clientY};
    menu.style.left=Math.max(8,Math.min(window.innerWidth-menu.offsetWidth-8,rect.left-menu.offsetWidth+30))+'px';
    menu.style.top=Math.max(8,Math.min(window.innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';
  }
  document.addEventListener('pointerdown',e=>{if(menu&&!e.target.closest('.v11-message-menu')&&!e.target.closest('.message-actions'))hideMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideMenu();});

  function renderMemberList(){
    const node=$('v11-member-results');if(!node)return;
    const q=($('v11-member-query')?.value||'').trim().toLocaleLowerCase('pl');
    const role=$('v11-role-filter')?.value||'';
    const filtered=memberStore.items.filter(m=>{
      const u=m.user||{};
      return(!role||(role==='no_roles'?!(m.roles||[]).length:(m.roles||[]).includes(role)))&&
      (!q||[m.nick,u.global_name,u.username,u.id].some(x=>String(x||'').toLocaleLowerCase('pl').includes(q)));
    });
    node.replaceChildren();
    if(!filtered.length){node.textContent=memberStore.busy?'Wczytywanie członków…':'Nie znaleziono użytkowników w pobranych danych.';return;}
    for(const m of filtered.slice(0,1500)){
      const b=document.createElement('button');b.type='button';b.className='v11-member-item';
      const u=m.user;const avatar=u.avatar?`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_')?'gif':'png'}?size=64`:null;
      b.innerHTML=`${avatar?`<img src="${avatar}" alt="">`:'<span class="v11-member-avatar">👤</span>'}<span><strong>${esc(memberLabel(m))}</strong><small>@${esc(u.username||'?')} · ${esc((m.roles||[]).map(id=>adminState.roles.find(r=>r.id===id)?.name).filter(Boolean).join(', ')||'Bez dodatkowych ról')}</small></span>`;
      b.addEventListener('click',()=>openProfile(u.id));node.append(b);
    }
    const counter=$('v11-member-count');if(counter)counter.textContent=`Wyświetlono ${Math.min(filtered.length,1500)} z ${memberStore.items.length} pobranych osób${memberStore.complete?' (pełna lista)':''}`;
  }
  async function loadMemberPage(force=false){
    if(memberStore.busy||memberStore.complete&&!force)return;
    const guild=admGuild();if(force||memberStore.guildId!==guild){memberStore.guildId=guild;memberStore.items=[];memberStore.byId=new Map();memberStore.after=null;memberStore.complete=false;}
    const seq=++memberStore.request;memberStore.busy=true;
    const next=$('v11-member-more');if(next){next.disabled=true;next.textContent='Pobieranie…';}
    try{
      const q=`?limit=1000${memberStore.after?'&after='+memberStore.after:''}`;
      const page=await api(`/guilds/${guild}/members${q}`);
      if(seq!==memberStore.request||guild!==admGuild())return;
      if(!Array.isArray(page))throw Error('Discord nie zwrócił listy członków.');
      for(const m of page){if(m?.user?.id&&!memberStore.byId.has(m.user.id)){memberStore.items.push(m);memberStore.byId.set(m.user.id,m);}}
      const cursor=page.at(-1)?.user?.id;
      memberStore.complete=page.length<1000||!cursor||cursor===memberStore.after;
      memberStore.after=cursor||null;
      renderMemberList();
    }catch(e){let node=$('v11-member-status');if(node)node.textContent=`Nie można pobrać listy: ${e.message}. Sprawdź Server Members Intent.`;}
    finally{memberStore.busy=false;if(next){next.disabled=memberStore.complete;next.textContent=memberStore.complete?'Wczytano wszystkich':'Wczytaj kolejnych 1000';}renderMemberList();}
  }
  admMembers=async function(){
    resetDirty();
    if(memberStore.guildId!==admGuild()){
      memberStore.guildId=null;memberStore.complete=false;memberStore.selfHighest=0;
      // Bot role hierarchy is a server-side bound; keep high roles read-only.
      await api(`/guilds/${admGuild()}/members/${state.me.id}`).then(self=>{
        memberStore.selfHighest=Math.max(0,...(self.roles||[]).map(id=>adminState.roles.find(r=>r.id===id)?.position||0));
      }).catch(()=>{});
    }
    admSetContent(`<div class="v11-section-head"><h2>Członkowie serwera</h2><p>Członkowie są ładowani automatycznie. Kliknij osobę, aby zarządzać jej nickiem i rolami.</p></div>
      <div class="v11-member-filters"><label>Wyszukaj użytkownika<input id="v11-member-query" type="search" placeholder="Nick, nazwa konta lub ID"></label><label>Filtr roli<select id="v11-role-filter"><option value="">Wszystkie role</option><option value="no_roles">Bez dodatkowych ról</option>${admSortedRoles().filter(r=>r.id!==admGuild()).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label></div>
      <div id="v11-member-count" class="v11-muted"></div><div id="v11-member-results" class="v11-member-results"></div><div id="v11-member-status" class="v11-muted"></div><button class="adm-btn subtle" id="v11-member-more">Wczytaj kolejnych 1000</button>`);
    $('v11-member-query').addEventListener('input',renderMemberList);$('v11-role-filter').addEventListener('change',renderMemberList);
    $('v11-member-more').addEventListener('click',()=>loadMemberPage());
    $('v11-member-results').addEventListener('scroll', e=>{
      const box=e.currentTarget;if(!memberStore.complete&&!memberStore.busy&&box.scrollTop+box.clientHeight>=box.scrollHeight-240)loadMemberPage();
    },{passive:true});
    renderMemberList();
    if(memberStore.guildId!==admGuild()||!memberStore.items.length&&!memberStore.complete)loadMemberPage(true);
  };
  function getAssignableRoles(){return admSortedRoles().filter(r=>r.id!==admGuild()&&!r.managed&&r.position<memberStore.selfHighest);}
  function editableMember(m,container,opts={}){
    const guild=admGuild();const uid=m.user.id,originalRoles=new Set(m.roles||[]),roles=getAssignableRoles();
    const id=opts.prefix||'v11-edit';
    container.innerHTML=`<div class="v11-section-head"><h2>${esc(memberLabel(m))}</h2><p>@${esc(m.user.username)} · ID ${uid}</p></div>
    <div class="v11-edit-member"><label>Nick na serwerze<input id="${id}-nick" maxlength="32" value="${esc(m.nick||'')}"></label>
    <h3>Role użytkownika</h3><div class="v11-role-selector">${roles.map(r=>`<label><input type="checkbox" data-role-id="${r.id}" ${originalRoles.has(r.id)?'checked':''}><i style="background:#${Number(r.color||0).toString(16).padStart(6,'0')}"></i>${esc(r.name)}</label>`).join('')}</div>
    <p class="v11-muted">Discord ogranicza edycję ról do tych poniżej najwyższej roli bota. Role zarządzane przez integracje są zachowywane.</p></div>`;
    const nick=container.querySelector('#'+id+'-nick');const checks=[...container.querySelectorAll('[data-role-id]')];
    const initialNick=m.nick||'';
    const changes=()=>nick.value!==initialNick||checks.some(x=>x.checked!==originalRoles.has(x.dataset.roleId));
    container.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{if(changes())markDirty();else resetDirty();}));
    const run=async()=>{
      const targetNick=nick.value.trim();if(targetNick.length>32)return toast('Nick jest za długi.',true);
      const targetRoles=new Set([...originalRoles].filter(rid=>!roles.some(r=>r.id===rid)));
      checks.forEach(x=>{if(x.checked)targetRoles.add(x.dataset.roleId);});
      const payload={};if(targetNick!==initialNick)payload.nick=targetNick||null;
      if([...targetRoles].sort().join()!==[...originalRoles].sort().join())payload.roles=[...targetRoles];
      if(!Object.keys(payload).length){resetDirty();return toast('Nie ma zmian.');}
      const btn=container.querySelector('#v11-save')||$('v11-save');if(btn)btn.disabled=true;
      try{const fresh=await api(`/guilds/${guild}/members/${uid}`,{method:'PATCH',body:JSON.stringify(payload)});
        if(fresh?.user)memberStore.byId.set(uid,fresh);
        const found=memberStore.items.findIndex(x=>x.user?.id===uid);if(found>=0)memberStore.items[found]=fresh;
        if(state.memberCache)state.memberCache.set(uid,fresh||{...m,nick:targetNick,roles:payload.roles||m.roles});
        toast('Zapisano nick i role.');resetDirty();renderMessages();if(opts.done)opts.done(fresh||m);else admMemberDetail(fresh||m);
      }catch(e){toast('Nie zapisano zmian: '+e.message,true);}finally{if(btn)btn.disabled=false;}
    };
    return {save:run,cancel:()=>{nick.value=initialNick;checks.forEach(x=>x.checked=originalRoles.has(x.dataset.roleId));resetDirty();}};
  }
  admMemberDetail=function(member){
    resetDirty();admSetContent(`<div class="v11-member-detail"><button id="v11-back-members" class="adm-btn subtle">← Członkowie</button><div id="v11-member-editor"></div><div id="v11-member-moderation"><h3>Moderacja</h3><p class="v11-muted">Kary są wykonywane od razu po osobnym potwierdzeniu, nie przez „Zapisz zmiany”.</p><button id="v11-moderate" class="adm-btn danger">Timeout / Kick / Ban…</button></div></div>`);
    const form=editableMember(member,$('v11-member-editor'),{done:admMemberDetail});
    footer(form.save,form.cancel);
    $('v11-back-members').addEventListener('click',()=>{if(!adminGuard())return;resetDirty();admMembers();});
    $('v11-moderate').addEventListener('click',()=>window.PanelPlus?.moderateOne?.(member.user.id));
  };

  // Staged channel overwrites across several roles/users. A single Save action applies all changed targets.
  let permissionDraft=null;
  function permEntry(over){return {id:over.id,type:Number(over.type),allow:String(over.allow||0),deny:String(over.deny||0)};}
  admChannelPermissions=function(){
    const channel=admChannel();if(!channel)return;resetDirty();
    const source=channel.permission_overwrites||[];
    const rows=new Map(source.map(o=>[o.id,permEntry(o)]));
    const roleMap=new Map(adminState.roles.map(r=>[r.id,r]));
    const sourceSnapshot=JSON.stringify([...rows.values()].sort((a,b)=>a.id.localeCompare(b.id)));
    let current=admGuild();let deleted=new Set();
    const c=channel;
    const targetLabel=id=>roleMap.get(id)?.name||(memberStore.byId.get(id)?memberLabel(memberStore.byId.get(id)):'Użytkownik '+id);
    const ensure=id=>{if(!rows.has(id))rows.set(id,{id,type:roleMap.has(id)?0:1,allow:'0',deny:'0'});return rows.get(id);};
    ensure(current);
    const options=()=>[...new Set([admGuild(),...rows.keys()])].map(id=>`<button type="button" class="v11-perm-person${id===current?' active':''}" data-id="${id}">${esc(targetLabel(id))}</button>`).join('');
    admSetContent(`<div class="v11-section-head"><h2>Uprawnienia kanału</h2><p>${esc(c.name)} — ustawienia nadpisywane dla ról i członków. Wszystkie zmiany zapisujesz na końcu.</p></div>
      <div class="v11-sync-banner">${c.parent_id?'🔁 Kanał należy do kategorii '+esc(adminState.channels.find(x=>x.id===c.parent_id)?.name||''):'Kanał nie ma kategorii'}<button id="v11-perm-sync" class="adm-btn subtle" ${c.parent_id?'':'disabled'}>Synchronizuj z kategorią</button></div>
      <label class="v11-private-toggle"><strong>🔒 Kanał prywatny</strong><input type="checkbox" id="v11-private"><span>Ukryj kanał przed @everyone (odmów wyświetlania).</span></label>
      <details class="v11-perm-advanced" open><summary>Uprawnienia zaawansowane</summary><div class="v11-perm-split"><aside><div class="v11-perm-add"><input id="v11-perm-find" placeholder="Dodaj rolę lub użytkownika" autocomplete="off"><div id="v11-perm-suggest" class="v11-suggest hidden"></div></div><div id="v11-perm-targets"></div></aside><div id="v11-perm-options"></div></div></details>`);
    const targetList=$('v11-perm-targets'),grid=$('v11-perm-options');
    const refreshTargets=()=>{targetList.innerHTML=options();targetList.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{collect();current=btn.dataset.id;render();}));};
    const grouped=[['Ogólne',['VIEW_CHANNEL','CREATE_INSTANT_INVITE','MANAGE_CHANNELS','MANAGE_ROLES']],['Tekstowe',['SEND_MESSAGES','READ_MESSAGE_HISTORY','ADD_REACTIONS','EMBED_LINKS','ATTACH_FILES','MANAGE_MESSAGES','MENTION_EVERYONE']],['Wątki',['SEND_MESSAGES_IN_THREADS','CREATE_PUBLIC_THREADS','CREATE_PRIVATE_THREADS','MANAGE_THREADS']],['Głosowe',['CONNECT','SPEAK','STREAM','MUTE_MEMBERS','MOVE_MEMBERS','DEAFEN_MEMBERS']]];
    const htmlOptions=(over)=>{const allow=admBits(over.allow),deny=admBits(over.deny);
      return grouped.map(([title,keys])=>`<section class="v11-perm-group"><h3>${title}</h3>${ADMIN_CHANNEL_PERMISSIONS.filter(([name])=>keys.includes(name)).map(([name,label,bit])=>{
       const value=(allow&admBit(bit))?'allow':(deny&admBit(bit))?'deny':'inherit';
       return `<div class="v11-perm-row"><div><strong>${esc(label)}</strong><small>${name==='VIEW_CHANNEL'?'Pozwala członkowi zobaczyć kanał.':name==='MANAGE_CHANNELS'?'Pozwala zmieniać nazwę i ustawienia kanału.':'Zmienia to uprawnienie tylko dla wybranej roli lub osoby.'}</small></div><div class="v11-perm-choices" data-bit="${bit}" data-value="${value}"><button type="button" data-choice="deny" title="Odmów" class="${value==='deny'?'active deny':''}">✕</button><button type="button" data-choice="inherit" title="Dziedzicz" class="${value==='inherit'?'active inherit':''}">/</button><button type="button" data-choice="allow" title="Zezwól" class="${value==='allow'?'active allow':''}">✓</button></div></div>`;}).join('')}</section>`).join('');
    };
    const collect=()=>{const previous=ensure(current);let allow=admBits(previous.allow),deny=admBits(previous.deny);
      for(const e of grid.querySelectorAll('.v11-perm-choices')){const bit=admBit(e.dataset.bit);allow&=~bit;deny&=~bit;if(e.dataset.value==='allow')allow|=bit;if(e.dataset.value==='deny')deny|=bit;}
      previous.allow=String(allow);previous.deny=String(deny);
    };
    const changed=()=>{const now=[...rows.values()].filter(x=>!deleted.has(x.id)&&((x.allow!=='0'||x.deny!=='0')||source.some(o=>o.id===x.id))).sort((a,b)=>a.id.localeCompare(b.id));return JSON.stringify(now)!==sourceSnapshot;};
    const render=()=>{refreshTargets();grid.innerHTML=`<div class="v11-target-heading">${esc(targetLabel(current))}</div>`+htmlOptions(ensure(current));
      for(const group of grid.querySelectorAll('.v11-perm-choices'))group.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
        group.dataset.value=btn.dataset.choice;group.querySelectorAll('button').forEach(x=>x.className=x.dataset.choice===btn.dataset.choice?'active '+btn.dataset.choice:'');collect();markDirty();
        if(current===admGuild()&&group.dataset.bit==='10')$('v11-private').checked=group.dataset.value==='deny';
      }));
      $('v11-private').checked=Boolean(admBits(ensure(admGuild()).deny)&admBit(10));
    };
    $('v11-private').addEventListener('change',()=>{collect();const ov=ensure(admGuild());const bit=admBit(10);let allow=admBits(ov.allow)&~bit,deny=admBits(ov.deny)&~bit;if($('v11-private').checked)deny|=bit;ov.allow=String(allow);ov.deny=String(deny);if(current===admGuild())render();markDirty();});
    const search=$('v11-perm-find'),suggest=$('v11-perm-suggest');let timer,version=0;
    search.addEventListener('input',()=>{const value=search.value.trim();suggest.replaceChildren();if(value.length<1){suggest.classList.add('hidden');return;}
      const local=admSortedRoles().filter(r=>r.name.toLowerCase().includes(value.toLowerCase())).slice(0,15).map(r=>({id:r.id,label:'Rola: '+r.name}));
      const cached=memberStore.items.filter(m=>[m.nick,m.user?.global_name,m.user?.username,m.user?.id].some(x=>String(x||'').toLowerCase().includes(value.toLowerCase()))).slice(0,12).map(m=>({id:m.user.id,label:'Użytkownik: '+memberLabel(m)}));
      function draw(items){suggest.replaceChildren();suggest.classList.remove('hidden');for(const item of items){const btn=document.createElement('button');btn.textContent=item.label;btn.type='button';btn.addEventListener('click',()=>{collect();deleted.delete(item.id);ensure(item.id);current=item.id;search.value='';suggest.classList.add('hidden');render();markDirty();});suggest.append(btn);}if(!items.length)suggest.textContent='Brak wyników.';}
      draw([...local,...cached]);
      clearTimeout(timer);const my=++version;
      if(value.length>=2&&!sid(value))timer=setTimeout(async()=>{try{const found=await api(`/guilds/${admGuild()}/members/search?query=${encodeURIComponent(value.slice(0,64))}&limit=25`);if(my!==version||!search.isConnected)return;const extra=(found||[]).filter(m=>m.user?.id).map(m=>({id:m.user.id,label:'Użytkownik: '+memberLabel(m)}));draw([...new Map([...local,...cached,...extra].map(x=>[x.id,x])).values()]);}catch{}},350);
      else if(sid(value))draw([...local,...cached,{id:value,label:'Użytkownik: '+value}]);
    });
    $('v11-perm-sync').addEventListener('click',()=>{const cat=adminState.channels.find(x=>x.id===c.parent_id);if(!cat)return;if(!confirm('Zastąpić przygotowane uprawnienia uprawnieniami kategorii? Zmiana będzie wykonana dopiero po kliknięciu „Zapisz zmiany”.'))return;rows.clear();deleted=new Set(source.map(x=>x.id));for(const o of cat.permission_overwrites||[]){rows.set(o.id,permEntry(o));deleted.delete(o.id);}current=admGuild();ensure(current);render();markDirty();});
    render();footer(async()=>{
      collect();const proposed=[...rows.values()].filter(x=>!deleted.has(x.id)&&((x.allow!=='0'||x.deny!=='0')||source.some(o=>o.id===x.id)));
      const oldMap=new Map(source.map(x=>[x.id,permEntry(x)]));let count=0;const saveBtn=$('v11-save');saveBtn.disabled=true;
      try{
        const removed=[...oldMap.keys()].filter(id=>!proposed.some(o=>o.id===id));
        for(const id of removed){await api(`/channels/${c.id}/permissions/${id}`,{method:'DELETE'});count++;}
        for(const o of proposed){const before=oldMap.get(o.id);if(before?.allow===o.allow&&before?.deny===o.deny&&before?.type===o.type)continue;
          await api(`/channels/${c.id}/permissions/${o.id}`,{method:'PUT',body:JSON.stringify({allow:o.allow,deny:o.deny,type:o.type})});count++;
        }
        const fresh=await api(`/channels/${c.id}`);adminState.channels=adminState.channels.map(x=>x.id===c.id?fresh:x);resetDirty();toast(`Zapisano zmiany uprawnień: ${count} operacji.`);admChannelPermissions();
        if(state.guildId===admGuild())loadChannels(admGuild()).catch(()=>{});
      }catch(e){toast('Nie wszystkie zmiany mogły zostać zapisane: '+e.message,true);/* Keep the unsaved view */}
      finally{if(saveBtn.isConnected)saveBtn.disabled=false;}
    },()=>admChannelPermissions());
  };

  // Emoji and sticker management. Sticker uploads use multipart/form-data; emojis use data URI JSON.
  async function fileData(file){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Nie można wczytać pliku.'));r.onload=()=>resolve(r.result);r.readAsDataURL(file);});}
  function assetsStatus(message,error=false){const node=$('v11-asset-status');if(node){node.textContent=message;node.classList.toggle('error',error);}else toast(message,error);}
  admEmojis=async function(){
    resetDirty();const guild=admGuild();
    const res=await Promise.allSettled([api(`/guilds/${guild}/emojis`),api(`/guilds/${guild}/stickers`)]);
    const emojis=res[0].status==='fulfilled'?res[0].value:[],stickers=res[1].status==='fulfilled'?res[1].value:[];
    admSetContent(`<div class="v11-section-head"><h2>Emoji i naklejki</h2><p>Prześlij plik, zmień nazwę, zobacz podgląd lub usuń zasób serwera. Operacje zapisywane są po kliknięciu odpowiedniego przycisku i potwierdzeniu.</p></div>
      <div class="v11-assets-upload"><label>Dodaj emoji (PNG, JPEG, GIF lub WebP, do 256 KiB)<input type="file" id="v11-emoji-file" accept="image/png,image/jpeg,image/gif,image/webp"></label><input id="v11-emoji-name" placeholder="Nazwa emoji" maxlength="32"><button id="v11-emoji-upload" class="adm-btn">Dodaj emoji</button></div>
      <div class="v11-assets-upload"><label>Dodaj naklejkę (PNG, APNG lub JSON Lottie)<input type="file" id="v11-sticker-file" accept=".png,.apng,.json,image/png,application/json"></label><input id="v11-sticker-name" placeholder="Nazwa naklejki" maxlength="30"><input id="v11-sticker-description" placeholder="Opis" maxlength="100"><input id="v11-sticker-tags" placeholder="Powiązane emoji, np. 🐸" maxlength="100"><button id="v11-sticker-upload" class="adm-btn">Dodaj naklejkę</button></div>
      <div id="v11-asset-status" class="v11-muted"></div><h3>Emoji (${emojis.length})</h3><div class="v11-assets-grid" id="v11-emojis"></div><h3>Naklejki (${stickers.length})</h3><div class="v11-assets-grid" id="v11-stickers"></div>`);
    function addCard(asset,kind){const box=document.createElement('div');box.className='v11-asset';const preview=document.createElement('div');preview.className='v11-asset-preview';
      if(kind==='emoji'||asset.format_type===1||asset.format_type===2){const img=document.createElement('img');img.alt=asset.name;img.src=kind==='emoji'?`https://cdn.discordapp.com/emojis/${asset.id}.${asset.animated?'gif':'png'}?size=160`:`https://cdn.discordapp.com/stickers/${asset.id}.png?size=160`;preview.append(img);}
      else{preview.innerHTML='<span>◈</span><small>Animacja Lottie<br>Podgląd niedostępny offline</small>';}
      const name=document.createElement('strong');name.textContent=asset.name;
      const actions=document.createElement('div');actions.className='v11-asset-actions';
      const edit=document.createElement('button');edit.textContent=kind==='emoji'?'Zmień nazwę':'Edytuj';
      edit.addEventListener('click',async()=>{const newName=prompt('Nowa nazwa:',asset.name);if(newName===null||newName===asset.name)return;try{let body={name:newName};
       if(kind==='sticker'){
        const description=prompt('Opis naklejki:',asset.description||'');if(description===null)return;
        const tags=prompt('Powiązane emoji:',asset.tags||'🙂');if(tags===null)return;
        body={name:newName,description,tags};
       }
       await api(`/guilds/${guild}/${kind==='emoji'?'emojis':'stickers'}/${asset.id}`,{method:'PATCH',body:JSON.stringify(body)});toast('Zmieniono nazwę.');admEmojis();}catch(e){assetsStatus(e.message,true);}});
      const remove=document.createElement('button');remove.textContent='Usuń';remove.className='danger';remove.addEventListener('click',async()=>{
       if(!confirm(`Nieodwracalnie usunąć ${kind==='emoji'?'emoji':'naklejkę'} „${asset.name}” z serwera?`))return;
       try{await api(`/guilds/${guild}/${kind==='emoji'?'emojis':'stickers'}/${asset.id}`,{method:'DELETE'});toast('Usunięto.');admEmojis();}catch(e){assetsStatus(e.message,true);}});
      actions.append(edit,remove);box.append(preview,name,actions);return box;
    }
    for(const e of emojis)$('v11-emojis').append(addCard(e,'emoji'));
    for(const e of stickers)$('v11-stickers').append(addCard(e,'sticker'));
    $('v11-emoji-upload').addEventListener('click',async()=>{
      const file=$('v11-emoji-file').files?.[0],name=$('v11-emoji-name').value.trim();if(!file||!name)return assetsStatus('Wybierz plik i podaj nazwę.',true);
      if(file.size>256*1024)return assetsStatus('Emoji jest za duże — maksymalnie 256 KiB.',true);
      const btn=$('v11-emoji-upload');btn.disabled=true;
      try{await api(`/guilds/${guild}/emojis`,{method:'POST',body:JSON.stringify({name,image:await fileData(file)})});toast('Dodano emoji.');admEmojis();}catch(e){assetsStatus(e.message,true);}finally{btn.disabled=false;}
    });
    $('v11-sticker-upload').addEventListener('click',async()=>{
      const file=$('v11-sticker-file').files?.[0],name=$('v11-sticker-name').value.trim(),description=$('v11-sticker-description').value.trim(),tags=$('v11-sticker-tags').value.trim();
      if(!file||!name||!description||!tags)return assetsStatus('Uzupełnij plik, nazwę, opis i powiązane emoji.',true);
      if(file.size>512*1024)return assetsStatus('Naklejka jest za duża — limit 512 KiB.',true);
      const body=new FormData();body.append('name',name);body.append('description',description);body.append('tags',tags);body.append('file',file);
      const btn=$('v11-sticker-upload');btn.disabled=true;try{await api(`/guilds/${guild}/stickers`,{method:'POST',body});toast('Dodano naklejkę.');admEmojis();}catch(e){assetsStatus(e.message,true);}finally{btn.disabled=false;}
    });
  };

  // Extend the same profile everywhere: channel messages, roster and server settings.
  const baseProfile=openProfile;
  openProfile=async function(userId){
    await baseProfile(userId);
    if(!sid(userId)||!state.guildId||!$('profile-dialog').open||state.profileUser?.id!==userId)return;
    const details=$('profile-details');details.querySelector('.v11-profile-tools')?.remove();
    const tools=document.createElement('div');tools.className='v11-profile-tools';
    const manage=document.createElement('button');manage.className='adm-btn subtle';manage.textContent='⚙ Zarządzaj rolami i nickiem';
    manage.addEventListener('click',async()=>{
      const guild=state.guildId;const member=await api(`/guilds/${guild}/members/${userId}`).catch(e=>{toast(e.message,true);return null;});if(!member)return;
      $('profile-dialog').close();await admOpen('server',null,'members');admMemberDetail(member);
    });
    tools.append(manage);details.append(tools);
  };
  // Shared Save / Cancel bar for existing basic forms. No change goes to Discord before Save.
  function wrapAdminForm(original,buttonId){return function(...args){
    resetDirty();const result=original.apply(this,args);
    const oldSave=$(buttonId);if(!oldSave)return result;
    oldSave.classList.add('hidden');
    const content=$('admin-content');let snapshot;
    const controls=()=>[...content.querySelectorAll('input,textarea,select')].filter(x=>!x.disabled&&x.type!=='file');
    const collect=()=>controls().map(x=>x.type==='checkbox'?x.checked:x.value);
    snapshot=collect();
    const update=()=>{if(JSON.stringify(collect())!==JSON.stringify(snapshot))markDirty();else resetDirty();};
    content.addEventListener('input',update);content.addEventListener('change',update);
    footer(()=>oldSave.click(),()=>{controls().forEach((x,i)=>{
      if(x.type==='checkbox')x.checked=snapshot[i];else x.value=snapshot[i];
    });resetDirty();});
    return result;
  };}
  admOverview=wrapAdminForm(admOverview,'as-save');
  admSafety=wrapAdminForm(admSafety,'sa-save');
  admChannelOverview=wrapAdminForm(admChannelOverview,'ch-save');
  // Role editor has its own list and buttons; only the current role is staged.
  const previousRoleView=admRoles;
  admRoles=function(...args){resetDirty();const result=previousRoleView.apply(this,args);
    const save=$('ar-save');if(!save)return result;
    save.classList.add('hidden');const content=$('admin-content');
    const controls=()=>[...content.querySelectorAll('input')].filter(x=>!x.disabled&&x.type!=='hidden');
    const snapshot=controls().map(x=>x.type==='checkbox'?x.checked:x.value);
    const update=()=>{const now=controls().map(x=>x.type==='checkbox'?x.checked:x.value);if(JSON.stringify(now)!==JSON.stringify(snapshot))markDirty();else resetDirty();};
    content.addEventListener('input',update);content.addEventListener('change',update);
    footer(()=>save.click(),()=>{controls().forEach((x,i)=>{if(x.type==='checkbox')x.checked=snapshot[i];else x.value=snapshot[i];});resetDirty();});
    return result;
  };
  // Block accidental exit from settings when there are draft changes.
  const nativeClose=admClose;admClose=function(){if(!adminGuard())return;resetDirty();nativeClose();};
  window.BotPanelV11={messageMore,adminGuard,resetDirty,markDirty};
})();
