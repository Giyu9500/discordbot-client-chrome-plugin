'use strict';
/* Administrative views for Discord Bot Panel 1.12. */
(() => {
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const color=r=>'#'+Number(r.colors?.primary_color ?? r.color ?? 0).toString(16).padStart(6,'0');
 const pickColor=s=>/^#[0-9a-f]{6}$/i.test(s)?s.toUpperCase():null;
 const sort=(a,b)=>(b.position||0)-(a.position||0)||String(b.id).localeCompare(String(a.id));
 const notify=e=>toast(e?.message||String(e),true);
 let roleWorkspace=null;
 let channelWorkspace=null;
 const groups=[
  ['Ogólne i administracja',['VIEW_CHANNEL','CREATE_INSTANT_INVITE','ADMINISTRATOR','MANAGE_GUILD','MANAGE_ROLES','MANAGE_CHANNELS','VIEW_AUDIT_LOG','MANAGE_WEBHOOKS']],
  ['Moderacja',['KICK_MEMBERS','BAN_MEMBERS','MODERATE_MEMBERS']],
  ['Wiadomości',['SEND_MESSAGES','READ_MESSAGE_HISTORY','ADD_REACTIONS','EMBED_LINKS','ATTACH_FILES','MANAGE_MESSAGES','MENTION_EVERYONE']],
  ['Wątki',['SEND_MESSAGES_IN_THREADS','MANAGE_THREADS','CREATE_PUBLIC_THREADS','CREATE_PRIVATE_THREADS']],
  ['Głos',['CONNECT','SPEAK','STREAM','MUTE_MEMBERS','DEAFEN_MEMBERS','MOVE_MEMBERS']]
 ];
 const toolbar=(name,kind)=>`<div class="v12-savebar hidden" id="v12-${kind}-bar"><strong>Masz niezapisane zmiany</strong><div><button type="button" id="v12-${kind}-cancel">Anuluj</button><button type="button" class="v12-save-btn" id="v12-${kind}-save">Zapisz zmiany</button></div></div>`;
 function dirty(workspace,kind){const visible=!!(workspace&&(JSON.stringify(workspace.order)!==JSON.stringify(workspace.originalOrder)||[...(workspace.drafts||new Map()).keys()].some(id=>changedRole(id))));const bar=$(`v12-${kind}-bar`);if(bar)bar.classList.toggle('hidden',!visible);if(visible)window.BotPanelV11?.markDirty();else window.BotPanelV11?.resetDirty();return !!visible;}
 function roleInit(){
  const id=admGuild();
  if(roleWorkspace?.guild===id)return roleWorkspace;
  const rs=admSortedRoles();
  roleWorkspace={guild:id,originalOrder:rs.map(r=>r.id),order:rs.map(r=>r.id),drafts:new Map(),highest:0,loading:true};
  api(`/guilds/${id}/members/${state.me.id}`).then(self=>{
   if(roleWorkspace?.guild!==id)return;
   roleWorkspace.highest=Math.max(0,...(self.roles||[]).map(rid=>adminState.roles.find(r=>r.id===rid)?.position||0));
  }).catch(()=>{}).finally(()=>{if(roleWorkspace?.guild===id){roleWorkspace.loading=false;for(const btn of document.querySelectorAll('.v12-role-entry')){const r=adminState.roles.find(x=>x.id===btn.dataset.role);btn.draggable=!!r&&!r.managed&&r.id!==id&&r.position<roleWorkspace.highest;}}});
  return roleWorkspace;
 }
 function currentRoleDraft(role){const w=roleInit();if(!w.drafts.has(role.id))w.drafts.set(role.id,{name:role.name,color:color(role),hoist:!!role.hoist,mentionable:!!role.mentionable,permissions:String(role.permissions||0)});return w.drafts.get(role.id);}
 function changedRole(id){const r=adminState.roles.find(x=>x.id===id),d=roleWorkspace.drafts.get(id);
  if(!r||!d)return false;return d.name!==r.name||d.color.toLowerCase()!==color(r).toLowerCase()||d.hoist!==!!r.hoist||d.mentionable!==!!r.mentionable||d.permissions!==String(r.permissions||0);
 }
 function roleRender(){
  const w=roleInit();const roles=new Map(adminState.roles.map(r=>[r.id,r]));
  if(!roles.has(adminState.roleId))adminState.roleId=w.order.find(id=>id!==admGuild())||admGuild();
  const role=roles.get(adminState.roleId),d=role?currentRoleDraft(role):null;
  const rows=w.order.map(id=>{
   const r=roles.get(id);if(!r)return '';
   const editable=!r.managed&&r.id!==admGuild()&&!w.loading&&r.position<w.highest;
   const raw=w.drafts.get(id)?.color||color(r);
   const c=raw.toLowerCase()==='#000000'?'#898c9b':raw;
   return `<button type="button" class="v12-role-entry ${id===adminState.roleId?'active':''}" data-role="${id}" draggable="${editable}" style="--role-accent:${esc(c)}"><i class="v12-role-dot"></i><span>${esc(w.drafts.get(id)?.name||r.name)}</span>${r.managed?' <small>🔒</small>':''}<b title="Przeciągnij, aby zmienić pozycję">⋮⋮</b></button>`;
  }).join('');
  const perms=groups.map(([name,ids])=>`<section class="v12-role-perms"><h3>${name}</h3>${ADMIN_PERMISSIONS.filter(p=>ids.includes(p[0])).map(([key,title,bit])=>`<label class="v12-toggle-row"><span>${esc(title)}</span><input type="checkbox" data-perm-bit="${bit}" ${d && (BigInt(d.permissions)&(1n<<BigInt(bit)))?'checked':''}></label>`).join('')}</section>`).join('');
  admSetContent(`<div class="v12-admin-split"><aside class="v12-role-sidebar"><div class="v12-section-title"><strong>Role (${w.order.length})</strong><button type="button" id="v12-add-role">＋</button></div><p class="v12-small">Przeciągnij role poniżej najwyższej roli bota.</p><div class="v12-role-list" id="v12-role-list">${rows}</div></aside><section class="v12-role-detail"><h2>${esc(role?.name||'Wybierz rolę')}</h2><div class="v12-panel"><label class="v12-field">Nazwa roli<input id="v12-role-name" maxlength="100" value="${esc(d?.name||'')}" ${role?.id===admGuild()?'disabled':''}></label><label class="v12-field">Kolor roli<div class="v12-color-row"><input id="v12-role-picker" type="color" value="${esc(d?.color||'#000000')}" ${role?.id===admGuild()?'disabled':''}><input id="v12-role-hex" maxlength="7" spellcheck="false" value="${esc(d?.color||'#000000')}" ${role?.id===admGuild()?'disabled':''} placeholder="#5865F2"></div></label></div><div class="v12-panel"><h3>Wyświetlanie roli</h3><label class="v12-switch-line"><span><strong>Pokazuj członków osobno</strong><small>Osobna grupa na liście członków.</small></span><input id="v12-role-hoist" type="checkbox" ${d?.hoist?'checked':''}></label><label class="v12-switch-line"><span><strong>Zezwól na wzmiankowanie roli</strong><small>Pozwól użytkownikom oznaczać tę rolę.</small></span><input id="v12-role-mention" type="checkbox" ${d?.mentionable?'checked':''}></label></div><div class="v12-panel"><h3>Uprawnienia roli</h3>${perms}</div>${role?.managed?'<p class="v12-small">Rola zarządzana przez integrację — nie można jej edytować.</p>':''}${role?.id!==admGuild()&&!role?.managed?'<button type="button" class="v12-delete-role" id="v12-role-delete">Usuń rolę</button>':''}</section></div>${toolbar('role','role')}`);
  const collect=()=>{
   if(!role||role.managed)return;
   d.name=$('v12-role-name').value;d.hoist=$('v12-role-hoist').checked;d.mentionable=$('v12-role-mention').checked;
   const hex=pickColor($('v12-role-hex').value);if(hex)d.color=hex;
   let value=BigInt(role.permissions||0);
   for(const check of document.querySelectorAll('[data-perm-bit]')){const flag=1n<<BigInt(check.dataset.permBit);if(check.checked)value|=flag;else value&=~flag;}
   d.permissions=String(value);w.drafts.set(role.id,d);if(!changedRole(role.id))w.drafts.delete(role.id);
   dirty(w,'role');
  };
  for(const input of document.querySelectorAll('.v12-role-detail input'))input.addEventListener('input',()=>{
   if(input.id==='v12-role-picker')$('v12-role-hex').value=input.value.toUpperCase();
   if(input.id==='v12-role-hex'&&pickColor(input.value))$('v12-role-picker').value=input.value;
   collect();
  });
  document.querySelectorAll('.v12-role-entry').forEach(b=>{
   b.addEventListener('click',()=>{collect();adminState.roleId=b.dataset.role;roleRender();});
   b.addEventListener('dragstart',e=>{if(b.draggable!==true){e.preventDefault();return;}e.dataTransfer.setData('text/plain','role:'+b.dataset.role);e.dataTransfer.effectAllowed='move';b.classList.add('dragging');});
   b.addEventListener('dragend',()=>b.classList.remove('dragging'));
   b.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('text/plain')){e.preventDefault();b.classList.add('drop-target');}});
   b.addEventListener('dragleave',()=>b.classList.remove('drop-target'));
   b.addEventListener('drop',e=>{
    e.preventDefault();b.classList.remove('drop-target');const src=e.dataTransfer.getData('text/plain').replace('role:','');const dst=b.dataset.role;
    if(src===dst||!w.order.includes(src)||!w.order.includes(dst))return;
    const source=roles.get(src),target=roles.get(dst);
    if(source.managed||target.managed||source.id===admGuild()||target.id===admGuild()||(!w.loading&&(source.position>=w.highest||target.position>=w.highest))){return toast('Nie można przenieść tej roli ze względu na hierarchię bota.',true);}
    collect();const next=w.order.filter(id=>id!==src);next.splice(next.indexOf(dst),0,src);w.order=next;roleRender();
   });
  });
  $('v12-role-delete')?.addEventListener('click',async()=>{
   if(dirty(w,'role'))return toast('Najpierw zapisz albo anuluj przygotowane zmiany.',true);
   if(!confirm(`Usunąć rolę „${role.name}”? Nie można tego cofnąć.`))return;
   try{await api(`/guilds/${admGuild()}/roles/${role.id}`,{method:'DELETE'});adminState.roles=adminState.roles.filter(r=>r.id!==role.id);state.roles.delete(role.id);roleWorkspace=null;adminState.roleId=null;toast('Usunięto rolę.');roleRender();}catch(err){notify(err);}
  });
  $('v12-add-role').addEventListener('click',async()=>{
   if(dirty(w,'role'))return toast('Najpierw zapisz albo anuluj przygotowane zmiany.',true);
   try{const role=await api(`/guilds/${admGuild()}/roles`,{method:'POST',body:JSON.stringify({name:'nowa rola',permissions:'0',color:0})});adminState.roles.push(role);state.roles.set(role.id,role);roleWorkspace=null;adminState.roleId=role.id;roleRender();}
   catch(e){notify(e);}
  });
  $('v12-role-cancel').addEventListener('click',()=>{roleWorkspace=null;window.BotPanelV11?.resetDirty();roleRender();});
  $('v12-role-save').addEventListener('click',async()=>{
   collect();for(const item of w.drafts.values())if(!item.name.trim()||item.name.length>100)return toast('Nazwa roli musi zawierać 1–100 znaków.',true);
   const btn=$('v12-role-save');btn.disabled=true;
   try{
    const rolesToSave=[...w.drafts.entries()].filter(([id])=>changedRole(id));
    for(const [id,draft] of rolesToSave){const r=roles.get(id);if(!r||r.managed)continue;
     const props={permissions:draft.permissions,hoist:draft.hoist,mentionable:draft.mentionable};
     if(id!==admGuild()){if(!w.loading && r.position>=w.highest)throw Error('Hierarchia bota nie pozwala edytować tej roli.');props.name=draft.name;props.color=Number.parseInt(draft.color.slice(1),16);}
     if((BigInt(props.permissions)&8n)&&!(BigInt(r.permissions||0)&8n)&&!confirm('Nadać tej roli uprawnienia Administrator?')){btn.disabled=false;return;}
     const result=await api(`/guilds/${admGuild()}/roles/${id}`,{method:'PATCH',body:JSON.stringify(props)});
     adminState.roles=adminState.roles.map(rr=>rr.id===id?result:rr);state.roles.set(id,result);w.drafts.delete(id);
    }
    if(JSON.stringify(w.order)!==JSON.stringify(w.originalOrder)){
     const ordered=w.order.map(id=>roles.get(id)).filter(Boolean);
     const positions=[...ordered].map(r=>r.position).sort((a,b)=>b-a);
     const changes=ordered.filter((r,i)=>r.id!==admGuild()&&r.position!==positions[i]).map(r=>({id:r.id,position:positions[ordered.indexOf(r)]}));
     if(changes.length)adminState.roles=await api(`/guilds/${admGuild()}/roles`,{method:'PATCH',body:JSON.stringify(changes)});
    }
    for(const r of adminState.roles)state.roles.set(r.id,r);
    roleWorkspace=null;window.BotPanelV11?.resetDirty();toast('Zapisano zmiany ról i ich kolejność.');roleRender();
   }catch(e){notify(e);toast('Jeśli część zmian została wykonana, odśwież role przed ponowną próbą.',true);}finally{btn.disabled=false;}
  });
  dirty(w,'role');
 }
 admRoles=roleRender;

 function channelTreeInit(){
  const guild=admGuild();if(channelWorkspace?.guild===guild)return channelWorkspace;
  const channels=[...adminState.channels].filter(c=>![10,11,12].includes(c.type));
  const categories=channels.filter(c=>c.type===4).sort((a,b)=>(a.position||0)-(b.position||0));
  const others=channels.filter(c=>c.type!==4);
  const buckets=[{id:'root',label:'BEZ KATEGORII',items:others.filter(c=>!c.parent_id||!categories.some(cat=>cat.id===c.parent_id)).sort((a,b)=>(a.position||0)-(b.position||0)).map(c=>c.id)},
   ...categories.map(c=>({id:c.id,label:c.name,items:others.filter(x=>x.parent_id===c.id).sort((a,b)=>(a.position||0)-(b.position||0)).map(x=>x.id)}))];
  channelWorkspace={guild,original:JSON.stringify(buckets),buckets,categoryId:null};return channelWorkspace;
 }
 function channelRender(){
  const workspace=channelTreeInit();const byId=new Map(adminState.channels.map(c=>[c.id,c]));
  const rows=workspace.buckets.map(bucket=>`<section class="v12-channel-category" data-bucket="${bucket.id}">
   <div class="v12-category-head" draggable="${bucket.id!=='root'}" data-category="${bucket.id}"><span>⌄ ${esc(bucket.label)}</span>${bucket.id==='root'?'':'<b>⋮⋮</b>'}</div>
   <div class="v12-channel-bucket" data-bucket="${bucket.id}">${bucket.items.map(id=>{
    const c=byId.get(id);if(!c)return '';
    return `<button type="button" class="v12-channel-entry" draggable="true" data-channel="${id}" title="Przeciągnij, aby zmienić miejsce"><span class="v12-channel-icon">${esc(CHANNEL_ICONS[c.type]||'#')}</span><span>${esc(c.name)}</span><b>⋮⋮</b></button>`;
   }).join('')}</div></section>`).join('');
  admSetContent(`<div class="v12-section-head"><h2>Kanały serwera</h2><p>Kategorie i kanały ułożone tak samo jak na serwerze. Przeciągnij, aby zmienić pozycję albo kategorię. Dopiero „Zapisz zmiany” wyśle kolejność do Discorda.</p><div class="v12-head-buttons"><button type="button" id="v12-new-channel">＋ Utwórz kanał</button></div></div><div id="v12-channel-list" class="v12-channel-list">${rows}</div>${toolbar('channel','channel')}`);
  const update=()=>{const bar=$('v12-channel-bar');const changed=JSON.stringify(workspace.buckets)!==workspace.original;bar?.classList.toggle('hidden',!changed);if(changed)window.BotPanelV11?.markDirty();else window.BotPanelV11?.resetDirty();};
  let dragged=null;
  const container=$('v12-channel-list');
  container.addEventListener('dragstart',e=>{
   const c=e.target.closest('[data-channel]'),cat=e.target.closest('[data-category]');
   if(c)dragged={kind:'channel',id:c.dataset.channel};else if(cat&&cat.dataset.category!=='root')dragged={kind:'category',id:cat.dataset.category};
   if(!dragged){e.preventDefault();return;}e.dataTransfer.setData('text/plain',dragged.kind+':'+dragged.id);e.dataTransfer.effectAllowed='move';
   e.target.classList.add('dragging');
  });
  container.addEventListener('dragend',()=>{dragged=null;for(const el of container.querySelectorAll('.dragging,.drop-target'))el.classList.remove('dragging','drop-target');});
  container.addEventListener('dragover',e=>{if(!dragged)return;const target=e.target.closest(dragged.kind==='channel'?'.v12-channel-entry,.v12-category-head,.v12-channel-bucket':'.v12-category-head');if(target){e.preventDefault();target.classList.add('drop-target');}});
  container.addEventListener('dragleave',e=>{const el=e.target.closest('.drop-target');el?.classList.remove('drop-target');});
  container.addEventListener('drop',e=>{
   if(!dragged)return;e.preventDefault();
   const item=e.target.closest('.v12-channel-entry');const targetCat=e.target.closest('.v12-channel-category');if(!targetCat)return;
   const bucket=workspace.buckets.find(b=>b.id===targetCat.dataset.bucket);if(!bucket)return;
   if(dragged.kind==='category'){
    const moved=workspace.buckets.find(b=>b.id===dragged.id);if(!moved||moved.id==='root'||bucket.id==='root'||moved===bucket)return;
    workspace.buckets=workspace.buckets.filter(b=>b!==moved);workspace.buckets.splice(workspace.buckets.indexOf(bucket),0,moved);
   } else {
    const value=dragged.id;if(!byId.has(value))return;
    for(const b of workspace.buckets)b.items=b.items.filter(id=>id!==value);
    const idx=item?bucket.items.indexOf(item.dataset.channel):-1;
    bucket.items.splice(idx<0?bucket.items.length:idx,0,value);
   }
   channelRender();update();
  });
  for(const row of container.querySelectorAll('[data-channel]'))row.addEventListener('click',()=>{
   if(JSON.stringify(workspace.buckets)!==workspace.original)return toast('Najpierw zapisz lub anuluj przesunięcia kanałów.',true);
   adminState.mode='channel';adminState.channelId=row.dataset.channel;adminState.channelTab='overview';admRender();
  });
  $('v12-new-channel').addEventListener('click',()=>{
   if(JSON.stringify(workspace.buckets)!==workspace.original)return toast('Najpierw zapisz lub anuluj przesunięcia.',true);
   admCreateChannel();
  });
  $('v12-channel-cancel').addEventListener('click',()=>{channelWorkspace=null;window.BotPanelV11?.resetDirty();channelRender();});
  $('v12-channel-save').addEventListener('click',async()=>{
   const btn=$('v12-channel-save');btn.disabled=true;
   const original=JSON.parse(workspace.original);
   const parents=new Map(original.flatMap(b=>b.items.map(id=>[id,b.id==='root'?null:b.id])));
   try{
    // Discord accepts at most one parent_id change per PATCH request.
    for(const bucket of workspace.buckets){
     const parentId=bucket.id==='root'?null:bucket.id;
     for(const id of bucket.items)if(parents.get(id)!==parentId){
      await api(`/guilds/${admGuild()}/channels`,{method:'PATCH',body:JSON.stringify([{id,parent_id:parentId}])});
     }
    }
    // Send all final bucket positions only after parent changes complete.
    const payload=[];
    for(let i=1;i<workspace.buckets.length;i++)payload.push({id:workspace.buckets[i].id,position:i-1});
    for(const bucket of workspace.buckets)bucket.items.forEach((id,index)=>payload.push({id,position:index}));
    if(payload.length)await api(`/guilds/${admGuild()}/channels`,{method:'PATCH',body:JSON.stringify(payload)});
    adminState.channels=await api(`/guilds/${admGuild()}/channels`);
    if(state.guildId===admGuild())await loadChannels(admGuild());
    channelWorkspace=null;window.BotPanelV11?.resetDirty();toast('Zapisano układ kanałów i kategorii.');channelRender();
   }catch(err){notify(err);toast('Niektóre przesunięcia mogły zostać zapisane. Odśwież kanały przed kolejną próbą.',true);}finally{btn.disabled=false;}
  });
  update();
 }
 admChannels=channelRender;

 // The existing member loader and staged role editor remain in charge of network requests.
 const oldMembers=admMembers;
 admMembers=async function(){const result=await oldMembers(...arguments);document.getElementById('v11-member-results')?.classList.add('v12-members-grid');return result;};

 // Ban detail popovers behave like the other compact popovers.
 document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('.v12-ban-popup,.v12-banned-icon'))document.querySelector('.v12-ban-popup')?.remove();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.v12-ban-popup')?.remove();});
 // Keep ban actions from the existing implementation; reformat only their output.
 const oldBans=admBans;
 admBans=async function(){
   await oldBans(...arguments);
   const list=$('admin-content')?.querySelector('.adm-item-list');if(!list)return;
   list.classList.add('v12-bans-grid');
   for(const row of list.querySelectorAll('.adm-data-row')){
    const text=row.querySelector('strong')?.textContent||'Użytkownik';
    row.title=text;
    row.classList.add('v12-banned-icon');
    row.querySelector('small')?.classList.add('v12-ban-details');
    row.querySelector('.adm-btn')?.setAttribute('title','Odbanuj');
    row.addEventListener('click',e=>{if(e.target.closest('button'))return;const name=row.querySelector('strong')?.textContent||row.dataset.banUser;
     const prev=document.querySelector('.v12-ban-popup');
     if(prev?.dataset.userId===row.dataset.banUser){prev.remove();return;}
     prev?.remove();
     const pop=document.createElement('div');pop.className='v12-ban-popup';pop.dataset.userId=row.dataset.banUser;
     pop.innerHTML=`<h3>${esc(name)}</h3><p>ID: ${esc(row.dataset.banUser)}</p><p>Powód bana: ${esc(row.dataset.banReason||'Brak')}</p>`;
     document.body.append(pop);const pos=row.getBoundingClientRect();
     const x=pos.right+10+pop.offsetWidth<innerWidth-8?pos.right+10:pos.left-pop.offsetWidth-10;
     pop.style.left=Math.max(8,Math.min(innerWidth-pop.offsetWidth-8,x))+'px';
     pop.style.top=Math.max(8,Math.min(innerHeight-pop.offsetHeight-8,pos.top))+'px';
    });
   }
 };

 const auditActions={
  1:['⚙','Serwer'],10:['#','Kanał utworzony'],11:['#','Kanał zmieniony'],12:['🗑','Kanał usunięty'],
  13:['🔐','Uprawnienia kanału'],14:['🔐','Uprawnienia kanału'],15:['🔐','Uprawnienia kanału'],
  20:['⚒','Wyrzucenie'],21:['👥','Usunięcie nieaktywnych'],22:['⛔','Ban'],23:['✓','Odbanowanie'],
  24:['👤','Członek zmieniony'],25:['👥','Role członka'],30:['🛡','Rola utworzona'],31:['🛡','Rola zmieniona'],32:['🗑','Rola usunięta'],
  72:['🗑','Wiadomości'],73:['🗑','Usunięcie zbiorowe'],74:['📌','Przypięcie'],75:['📌','Odpięcie'],
  140:['🛡','AutoMod'],141:['🛡','AutoMod'],142:['🛡','AutoMod']
 };
 async function showAudit(before='',type='',actor='',pageIndex=1){
  const guild=admGuild();
  const q=new URLSearchParams({limit:'50'});if(before)q.set('before',before);if(type)q.set('action_type',type);if(actor)q.set('user_id',actor);
  const data=await api(`/guilds/${guild}/audit-logs?${q}`);
  if(guild!==admGuild()||adminState.section!=='audit')return;
  const users=new Map((data.users||[]).map(u=>[u.id,u]));
  const roles=new Map((data.roles||adminState.roles).map(r=>[r.id,r.name]));
  const channels=new Map(adminState.channels.map(c=>[c.id,'#'+c.name]));
  const entries=data.audit_log_entries||[];
  const formatTime=id=>new Date(Number((BigInt(id)>>22n)+1420070400000n)).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const target=id=>users.get(id)?.global_name||users.get(id)?.username||roles.get(id)||channels.get(id)||id||'—';
  const rows=entries.map(entry=>{
   const [icon,label]=auditActions[entry.action_type]||['☷','Działanie '+entry.action_type];
   const user=users.get(entry.user_id);const actorName=user?.global_name||user?.username||entry.user_id||'System';
   const changes=(entry.changes||[]).map(c=>`${c.key}: ${JSON.stringify(c.old_value??'—')} → ${JSON.stringify(c.new_value??'—')}`).join('\n');
   return `<details class="v12-audit-item"><summary><span class="v12-audit-icon">${icon}</span><span class="v12-audit-desc"><strong>${esc(actorName)}</strong> · ${esc(label)} · <b>${esc(target(entry.target_id))}</b></span><time>${esc(formatTime(entry.id))}</time></summary><div class="v12-audit-expanded">${entry.reason?`<p>Powód: ${esc(entry.reason)}</p>`:''}${changes?`<pre>${esc(changes)}</pre>`:''}<small>Wykonawca: ${esc(entry.user_id||'System')} · Cel: ${esc(entry.target_id||'—')}</small></div></details>`;
  }).join('');
  admSetContent(`<div class="v12-section-head"><h2>Dziennik audytu</h2><p>Kompaktowy widok zdarzeń serwera. Szczegóły po kliknięciu wpisu.</p></div><div class="v12-audit-filters"><label>Typ zdarzenia<select id="v12-audit-type"><option value="">Wszystkie działania</option>${Object.entries(auditActions).map(([id,item])=>`<option value="${id}" ${type===id?'selected':''}>${esc(item[1])}</option>`).join('')}</select></label><label>Wykonawca<select id="v12-audit-actor"><option value="">Wszyscy</option>${[...users.values()].map(user=>`<option value="${user.id}" ${actor===user.id?'selected':''}>${esc(user.global_name||user.username)}</option>`).join('')}</select></label></div><div class="v12-audit-list">${rows||'<p class="v12-small">Brak wpisów audytu dla wybranych filtrów.</p>'}</div><div class="v12-audit-footer"><button id="v12-audit-reload">Odśwież</button><span>Strona ${pageIndex} · ${entries.length} wpisów</span><button id="v12-audit-next" ${entries.length<50?'disabled':''}>Starsze wpisy →</button></div>`);
  $('v12-audit-type').addEventListener('change',()=>showAudit('',$('v12-audit-type').value,$('v12-audit-actor').value,1).catch(notify));
  $('v12-audit-actor').addEventListener('change',()=>showAudit('',$('v12-audit-type').value,$('v12-audit-actor').value,1).catch(notify));
  $('v12-audit-reload').addEventListener('click',()=>showAudit('',type,actor,1).catch(notify));
  $('v12-audit-next').addEventListener('click',()=>showAudit(entries.at(-1)?.id,type,actor,pageIndex+1).catch(notify));
 }
 admAudit=()=>showAudit().catch(notify);
 // A confirmed navigation away from an editor discards its local draft.
 document.addEventListener('click',e=>{
   if(!e.target.closest('#admin-navigation .admin-nav-item'))return;
   setTimeout(()=>{
     if(adminState.mode!=='server'||adminState.section!=='roles')roleWorkspace=null;
     if(adminState.mode!=='server'||adminState.section!=='channels')channelWorkspace=null;
   },0);
 },true);
 const oldClose=admClose;
 admClose=function(...args){oldClose(...args);if($('admin-view')?.classList.contains('hidden')){roleWorkspace=null;channelWorkspace=null;}};
})();
