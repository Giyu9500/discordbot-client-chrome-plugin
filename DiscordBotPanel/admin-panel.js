'use strict';
/* Discord Bot Panel 1.7 – ustawienia serwera i kanałów, bot API only. */
const adminState = { mode: 'server', section: 'overview', guildId: null, channelId: null, channelTab: 'overview', guild: null, roles: [], channels: [], roleId: null, loaded: 0, busy: false, bansAfter: null };
const ADMIN_PERMISSIONS = [
  ['VIEW_CHANNEL','Wyświetlanie kanałów',10],['SEND_MESSAGES','Wysyłanie wiadomości',11],
  ['READ_MESSAGE_HISTORY','Historia wiadomości',16],['ADD_REACTIONS','Dodawanie reakcji',6],
  ['EMBED_LINKS','Osadzanie linków',14],['ATTACH_FILES','Załączanie plików',15],
  ['MANAGE_MESSAGES','Zarządzanie wiadomościami',13],['MANAGE_CHANNELS','Zarządzanie kanałami',4],
  ['MANAGE_ROLES','Zarządzanie rolami',28],['MANAGE_WEBHOOKS','Zarządzanie webhookami',29],
  ['CREATE_INSTANT_INVITE','Tworzenie zaproszeń',0],['MENTION_EVERYONE','Wzmianki @everyone',17],
  ['CONNECT','Dołączanie do głosu',20],['SPEAK','Mówienie',21],
  ['STREAM','Wideo/stream',9],['MUTE_MEMBERS','Wyciszanie głosowe',22],
  ['DEAFEN_MEMBERS','Wyciszanie dźwięku',23],['MOVE_MEMBERS','Przenoszenie użytkowników',24],
  ['SEND_MESSAGES_IN_THREADS','Wysyłanie w wątkach',38],['MANAGE_THREADS','Zarządzanie wątkami',34],
  ['CREATE_PUBLIC_THREADS','Tworzenie publicznych wątków',35],['CREATE_PRIVATE_THREADS','Tworzenie prywatnych wątków',36],
  ['MANAGE_GUILD','Zarządzanie serwerem',5],['KICK_MEMBERS','Wyrzucanie członków',1],
  ['BAN_MEMBERS','Banowanie członków',2],['MODERATE_MEMBERS','Nakładanie timeoutów',40],
  ['VIEW_AUDIT_LOG','Dziennik audytu',7],['ADMINISTRATOR','Administrator',3]
];
const ADMIN_CHANNEL_PERMISSIONS = ADMIN_PERMISSIONS.filter(p => !['ADMINISTRATOR','KICK_MEMBERS','BAN_MEMBERS','MANAGE_GUILD','VIEW_AUDIT_LOG','MODERATE_MEMBERS'].includes(p[0]));
const ADM_SECTIONS = [
  ['overview','Przegląd serwera'],['safety','Bezpieczeństwo'],['channels','Kanały'],
  ['roles','Role i uprawnienia'],['members','Członkowie'],
  ['bans','Bany'],['mass','Akcje masowe'],['automod','Automatyczna moderacja'],['history','Historia moderacji'],['audit','Dziennik audytu'],
  ['invites','Zaproszenia'],['emojis','Emoji i naklejki']
];
const ADM_TYPE = {0:'Kanał tekstowy',2:'Kanał głosowy',4:'Kategoria',5:'Ogłoszenia',13:'Scena',15:'Forum',16:'Media'};
const admEscape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const admId = x => /^\d{16,22}$/.test(String(x || ''));
const admEl = id => document.getElementById(id);
const admValue = id => admEl(id)?.value ?? '';
const admChecked = id => !!admEl(id)?.checked;
const admBit = n => 1n << BigInt(n);
const admBits = n => {try{return BigInt(n||'0')}catch{return 0n}};
const admJSON = (method, data) => ({method,body:JSON.stringify(data)});
const admOption = (value,text,selected=false) => `<option value="${admEscape(value)}"${selected?' selected':''}>${admEscape(text)}</option>`;
const admField = (id,label,value='',type='text',attributes='') => `<label class="adm-field"><span>${admEscape(label)}</span><input id="${id}" type="${type}" value="${admEscape(value)}" ${attributes}></label>`;
const admSelect = (id,label,choices,value) => `<label class="adm-field"><span>${admEscape(label)}</span><select id="${id}">${choices.map(x=>admOption(x[0],x[1],String(x[0])===String(value))).join('')}</select></label>`;
const admCheckbox = (id,label,yes) => `<label class="adm-check"><input type="checkbox" id="${id}" ${yes?'checked':''}><span>${admEscape(label)}</span></label>`;
const admButton = (label,id,kind='primary',extra='') => `<button type="button" id="${id}" class="adm-btn ${kind}" ${extra}>${admEscape(label)}</button>`;
const admNote = text => `<p class="adm-note">${admEscape(text)}</p>`;
const admCard = (title,body) => `<section class="adm-card"><h2>${admEscape(title)}</h2>${body}</section>`;
function admWarn(err){toast(err?.message||String(err),true);}
function admLoading(msg='Wczytywanie…'){admEl('admin-content').innerHTML=`<div class="adm-loading">${admEscape(msg)}</div>`;}
function admSetContent(html){admEl('admin-content').innerHTML=html;}
function admMessage(e){admSetContent(admCard('Nie udało się pobrać danych',`<div class="adm-error">${admEscape(e.message||String(e))}</div>${admButton('Spróbuj ponownie','adm-retry')}`));admEl('adm-retry')?.addEventListener('click',()=>admRender());}
function admBusyButton(id,busy=true){const b=admEl(id);if(b)b.disabled=busy;}
function admBind(id,fn,event='click'){admEl(id)?.addEventListener(event,fn);}
function admGuild(){return adminState.guildId;}
function admChannel(){return adminState.channels.find(c=>c.id===adminState.channelId)||state.channels.find(c=>c.id===adminState.channelId);}
function admSortedRoles(){return [...adminState.roles].sort((a,b)=>(b.position||0)-(a.position||0));}
function admCopy(value){navigator.clipboard.writeText(value).then(()=>toast('Skopiowano do schowka.')).catch(()=>toast('Nie udało się skopiować.',true));}
function admSetHead(){
  const isChannel=adminState.mode==='channel';const c=admChannel();
  admEl('admin-server-name').textContent=adminState.guild?.name||state.guilds.get(admGuild())?.name||'Serwer';
  admEl('admin-eyebrow').textContent=isChannel?'USTAWIENIA KANAŁU':'USTAWIENIA SERWERA';
  const names={overview:'Przegląd',safety:'Bezpieczeństwo',roles:'Role',channels:'Kanały',members:'Członkowie',bans:'Bany',invites:'Zaproszenia',audit:'Dziennik audytu',emojis:'Emoji i naklejki',permissions:'Uprawnienia',tags:'Tagi forum',mass:'Akcje masowe',automod:'Automatyczna moderacja',history:'Historia moderacji'};
  admEl('admin-title').textContent=isChannel?(names[adminState.channelTab]||'Kanał'):names[adminState.section];
  const nav=admEl('admin-navigation'); nav.replaceChildren();
  const items=isChannel?[['overview','Przegląd'],['permissions','Uprawnienia'],['invites','Zaproszenia'],...(c?.type===15||c?.type===16?[['tags','Tagi forum']]:[])]:ADM_SECTIONS;
  const grouped={overview:'PODSTAWY',safety:'PODSTAWY',roles:'CZŁONKOWIE',members:'CZŁONKOWIE',channels:'KANAŁY',bans:'MODERACJA',mass:'MODERACJA',automod:'MODERACJA',history:'MODERACJA',audit:'MODERACJA',invites:'ZASOBY',emojis:'ZASOBY'};
  let currentGroup='';
  for(const [id,title] of items){
   if(!isChannel&&grouped[id]!==currentGroup){currentGroup=grouped[id];nav.append(el('div','admin-nav-heading',currentGroup));}
   const b=el('button','admin-nav-item'+((isChannel?adminState.channelTab:adminState.section)===id?' active':''),title);b.type='button';b.addEventListener('click',()=>{if(window.PanelPlus?.massRunning?.()){toast('Zatrzymaj akcję masową, zanim zmienisz zakładkę.',true);return;}if(window.BotPanelV11&&!window.BotPanelV11.adminGuard())return;window.BotPanelV11?.resetDirty();if(isChannel){adminState.channelTab=id;}else{adminState.section=id;}admRender();});nav.append(b);}
  if(isChannel){const back=el('button','admin-nav-item admin-nav-back','← Ustawienia serwera');back.addEventListener('click',()=>{if(window.BotPanelV11&&!window.BotPanelV11.adminGuard())return;window.BotPanelV11?.resetDirty();adminState.mode='server';adminState.section='channels';admRender();});nav.prepend(back);}
}
async function admLoadGuild(refresh=false){
 const guildId=admGuild();if(!guildId||!state.token)throw Error('Brak połączenia z botem.');
 if(refresh||!adminState.guild||!adminState.roles.length||!adminState.channels.length){
  const [g,r,c]=await Promise.all([api(`/guilds/${guildId}`),api(`/guilds/${guildId}/roles`),api(`/guilds/${guildId}/channels`)]);
  if(guildId!==admGuild())throw Error('Zmieniono serwer.');
  adminState.guild=g;adminState.roles=r;adminState.channels=c;
 }
}
async function admOpen(mode='server',channelId=null,section='overview'){
 if(!admEl('admin-view').classList.contains('hidden')&&window.BotPanelV11&&!window.BotPanelV11.adminGuard())return;
 window.BotPanelV11?.resetDirty();
 if(!state.guildId||state.dmView){toast('Wybierz serwer.',true);return;}
 const changed=adminState.guildId!==state.guildId;adminState.guildId=state.guildId;
 if(changed){adminState.guild=null;adminState.roles=[];adminState.channels=[];adminState.roleId=null;}
 adminState.mode=mode;adminState.channelId=mode==='channel'?channelId:null;adminState.section=section;adminState.channelTab='overview';
 admEl('admin-view').classList.remove('hidden');admLoading();await admRender();
}
function admClose(){if(window.PanelPlus?.massRunning?.()){toast('Najpierw zatrzymaj akcję masową.',true);return;}admEl('admin-view').classList.add('hidden');admContextHide();}
async function admRender(){
 const serial=++adminState.loaded;admSetHead();admLoading();
 try{
   await admLoadGuild();if(serial!==adminState.loaded||admEl('admin-view').classList.contains('hidden'))return;
   admSetHead();
   if(adminState.mode==='channel')await admRenderChannel();
   else await ({overview:admOverview,safety:admSafety,roles:admRoles,channels:admChannels,members:admMembers,bans:admBans,invites:admInvites,audit:admAudit,emojis:admEmojis,mass:()=>window.PanelPlus.massSettings(),automod:()=>window.PanelPlus.autoModSettings(),history:()=>window.PanelPlus.historySettings()}[adminState.section]||admOverview)();
 }catch(e){if(serial===adminState.loaded)admMessage(e);}
}
async function admRefresh(){await admLoadGuild(true);if(state.guildId===admGuild())loadChannels(state.guildId).catch(admWarn);await admRender();}
function admLinkChannels(selected='',nullable=true){return [[nullable?'':'','— Brak —'],...adminState.channels.filter(c=>[0,2,4,5,13].includes(c.type)&&c.type!==4).map(c=>[c.id,`# ${c.name}`])].filter(x=>x[0]||nullable);}
function admCategoryOptions(value='',allowNone=true){return [...(allowNone?[['','Bez kategorii']]:[]),...adminState.channels.filter(c=>c.type===4).map(c=>[c.id,c.name])];}
function admOverview(){
 const g=adminState.guild;
 const html=admCard('Informacje o serwerze',
  `<div class="adm-form-grid">${admField('as-name','Nazwa serwera',g.name,'text','minlength="2" maxlength="100"')}${admField('as-locale','Język serwera',g.preferred_locale||'pl','text','maxlength="20"')}</div>`+
  `<label class="adm-field"><span>Opis serwera</span><textarea id="as-description" maxlength="1024" rows="3">${admEscape(g.description||'')}</textarea></label>`+
  `<div class="adm-form-grid">${admSelect('as-afk-channel','Kanał AFK',[['','Brak'],...adminState.channels.filter(c=>c.type===2).map(c=>[c.id,c.name])],g.afk_channel_id||'')}`+
  `${admSelect('as-afk-timeout','Limit nieaktywności AFK',[[60,'1 minuta'],[300,'5 minut'],[900,'15 minut'],[1800,'30 minut'],[3600,'60 minut']],g.afk_timeout||300)}</div>`+
  `<div class="adm-form-grid">${admSelect('as-system-channel','Kanał komunikatów systemowych',admLinkChannels(),g.system_channel_id||'')}`+
  `${admSelect('as-notifications','Domyślne powiadomienia',[[0,'Wszystkie wiadomości'],[1,'Tylko wzmianki']],g.default_message_notifications??1)}</div>`+
  `<div class="adm-form-grid">${admSelect('as-filter','Filtr treści multimedialnych',[[0,'Wyłączony'],[1,'Osoby bez ról'],[2,'Wszyscy członkowie']],g.explicit_content_filter??0)}`+
  `${admSelect('as-verification','Weryfikacja',[[0,'Brak'],[1,'Niska'],[2,'Średnia'],[3,'Wysoka'],[4,'Najwyższa']],g.verification_level??0)}</div>`+
  admCheckbox('as-no-join','Wstrzymaj zaproszenia (jeśli serwer obsługuje tę funkcję)',(g.features||[]).includes('INVITES_DISABLED'))+
  admNote(`ID: ${g.id} · właściciel: ${g.owner_id||'—'} · poziom boost: ${g.premium_tier||0}`)+
  admButton('Zapisz ustawienia serwera','as-save'));
 admSetContent(html);
 admBind('as-save',async()=>{
  const body={name:admValue('as-name').trim(),description:admValue('as-description').trim()||null,
  preferred_locale:admValue('as-locale').trim(),afk_channel_id:admValue('as-afk-channel')||null,afk_timeout:Number(admValue('as-afk-timeout')),
  system_channel_id:admValue('as-system-channel')||null,default_message_notifications:Number(admValue('as-notifications')),
  explicit_content_filter:Number(admValue('as-filter')),verification_level:Number(admValue('as-verification'))};
  if(body.name.length<2||body.name.length>100||body.preferred_locale.length>20){toast('Niepoprawne ustawienia.',true);return;}
  const wants=admChecked('as-no-join');const flags=new Set(g.features||[]);if(wants)flags.add('INVITES_DISABLED');else flags.delete('INVITES_DISABLED');
  if(wants!==(g.features||[]).includes('INVITES_DISABLED'))body.features=[...flags];
  for(const [k,v] of Object.entries(body))if(JSON.stringify(v)===JSON.stringify(g[k]))delete body[k];
  if(!Object.keys(body).length){toast('Nie ma zmian do zapisania.');return;}
  admBusyButton('as-save');try{const newG=await api(`/guilds/${admGuild()}`,admJSON('PATCH',body));adminState.guild=newG;state.guilds.set(newG.id,{...state.guilds.get(newG.id),...newG});renderGuilds();admEl('guild-title').textContent=newG.name;toast('Ustawienia zapisane.');admRender();}catch(e){admWarn(e);}finally{admBusyButton('as-save',false);}
 });
}
function admSafety(){
 const g=adminState.guild;
 admSetContent(admCard('Ochrona i moderacja',
  admNote('Ustawienia poniżej modyfikują prawdziwy serwer. Mechanizm Discord AutoMod ma odrębne reguły i nie jest tutaj konfigurowany.')+
  `<div class="adm-form-grid">${admSelect('sa-verification','Poziom weryfikacji',[[0,'Brak'],[1,'Niska'],[2,'Średnia'],[3,'Wysoka'],[4,'Najwyższa']],g.verification_level??0)}${admSelect('sa-filter','Filtr multimediów',[[0,'Wyłączony'],[1,'Członkowie bez ról'],[2,'Wszyscy członkowie']],g.explicit_content_filter??0)}</div>`+
  `${admSelect('sa-alert','Kanał alertów bezpieczeństwa',admLinkChannels(),g.safety_alerts_channel_id||'')}`+
  admCheckbox('sa-raid','Wyłącz alerty o rajdach', (g.features||[]).includes('RAID_ALERTS_DISABLED'))+
  admButton('Zapisz bezpieczeństwo','sa-save')));
 admBind('sa-save',async()=>{const f=new Set(g.features||[]);const want=admChecked('sa-raid');if(want)f.add('RAID_ALERTS_DISABLED');else f.delete('RAID_ALERTS_DISABLED');const body={verification_level:+admValue('sa-verification'),explicit_content_filter:+admValue('sa-filter'),safety_alerts_channel_id:admValue('sa-alert')||null};if(want!==(g.features||[]).includes('RAID_ALERTS_DISABLED'))body.features=[...f];for(const[k,v]of Object.entries(body))if(JSON.stringify(v)===JSON.stringify(g[k]))delete body[k];if(!Object.keys(body).length)return toast('Brak zmian.');admBusyButton('sa-save');try{adminState.guild=await api(`/guilds/${admGuild()}`,admJSON('PATCH',body));toast('Zapisano ustawienia bezpieczeństwa.');admRender();}catch(e){admWarn(e);}finally{admBusyButton('sa-save',false);}});
}
function admRoles(){
 const roles=admSortedRoles(), g=admGuild();
 if(!roles.some(r=>r.id===adminState.roleId))adminState.roleId=roles.find(r=>r.id!==g)?.id||g;
 const r=roles.find(r=>r.id===adminState.roleId);
 const rolePermissionGroups=[
  ['Ogólne i administracyjne', ['ADMINISTRATOR','MANAGE_GUILD','MANAGE_ROLES','MANAGE_CHANNELS','VIEW_AUDIT_LOG','MANAGE_WEBHOOKS','CREATE_INSTANT_INVITE']],
  ['Członkowie i moderacja', ['KICK_MEMBERS','BAN_MEMBERS','MODERATE_MEMBERS']],
  ['Kanały tekstowe', ['VIEW_CHANNEL','SEND_MESSAGES','READ_MESSAGE_HISTORY','ADD_REACTIONS','EMBED_LINKS','ATTACH_FILES','MANAGE_MESSAGES','MENTION_EVERYONE']],
  ['Wątki', ['SEND_MESSAGES_IN_THREADS','MANAGE_THREADS','CREATE_PUBLIC_THREADS','CREATE_PRIVATE_THREADS']],
  ['Kanały głosowe', ['CONNECT','SPEAK','STREAM','MUTE_MEMBERS','DEAFEN_MEMBERS','MOVE_MEMBERS']]
 ];
 const permissionList=rolePermissionGroups.map(([group,names])=>`<section class="adm-perm-section"><h4>${admEscape(group)}</h4><div class="adm-perm-grid">${ADMIN_PERMISSIONS.filter(([name])=>names.includes(name)).map(([name,label,bit])=>admCheckbox('ar-perm-'+bit,label,Boolean(admBits(r?.permissions)&admBit(bit)))).join('')}</div></section>`).join('');
 admSetContent(`<div class="adm-split"><aside class="adm-list-col"><div class="adm-row-line"><strong>Role (${roles.length})</strong>${admButton('+','ar-create','subtle')}</div><div id="ar-list" class="adm-item-list">${roles.map(x=>`<button type="button" class="adm-list-item${x.id===r?.id?' active':''}" data-role="${x.id}"><span class="adm-role-dot" style="background:${x.color?'#'+Number(x.color).toString(16).padStart(6,'0'):'#92959b'}"></span>${admEscape(x.name)}${x.managed?' 🔒':''}</button>`).join('')}</div></aside>
 <div class="adm-split-main">${r?admCard(`Edytuj rolę: ${r.name}`,
  admField('ar-name','Nazwa roli',r.name,'text',r.id===g?'disabled':'maxlength="100"')+
  `<div class="adm-form-grid">${admField('ar-color','Kolor roli',`#${Number(r.color||0).toString(16).padStart(6,'0')}`,'color',r.id===g?'disabled':'')}${admField('ar-position','Pozycja (tylko do wglądu)',r.position,'number','disabled')}</div>`+
  admCheckbox('ar-hoist','Pokazuj osobno członków z tą rolą',r.hoist)+admCheckbox('ar-mention','Zezwól na wzmiankowanie roli',r.mentionable)+
  `<h3>Uprawnienia roli</h3><p class="adm-note">Zmiany nie działają, dopóki nie klikniesz „Zapisz rolę”. Uważaj na uprawnienie Administrator.</p><div class="adm-perm-sections">${permissionList}</div>`+
  admNote(r.id===g?'Edytujesz uprawnienia @everyone.':r.managed?'Ta rola jest zarządzana przez integrację i nie można jej edytować.':'Bot może modyfikować wyłącznie role poniżej swojej najwyższej roli.')+
  `<div class="adm-actions">${admButton('Zapisz rolę','ar-save','primary',r.managed?'disabled':'')}${r.id!==g&&!r.managed?admButton('Usuń rolę','ar-delete','danger'):''}</div>`):''}</div></div>`);
 document.querySelectorAll('[data-role]').forEach(x=>x.addEventListener('click',()=>{if(window.BotPanelV11&&!window.BotPanelV11.adminGuard())return;window.BotPanelV11?.resetDirty();adminState.roleId=x.dataset.role;admRoles();}));
 admBind('ar-create',async()=>{try{const created=await api(`/guilds/${g}/roles`,admJSON('POST',{name:'nowa rola',permissions:'0',color:0}));adminState.roles.push(created);adminState.roleId=created.id;state.roles.set(created.id,created);toast('Utworzono rolę.');admRoles();}catch(e){admWarn(e);}});
 admBind('ar-save',async()=>{if(!r||r.managed)return;let p=admBits(r.permissions);for(const[,label,bit]of ADMIN_PERMISSIONS){if(admChecked('ar-perm-'+bit))p|=admBit(bit);else p&=~admBit(bit);}const color=Number.parseInt(admValue('ar-color').slice(1),16);const body={name:admValue('ar-name').trim(),color,permissions:String(p),hoist:admChecked('ar-hoist'),mentionable:admChecked('ar-mention')};if(r.id===g){delete body.name;delete body.color;}if(r.id!==g&&(!body.name||body.name.length>100))return toast('Nazwa musi mieć 1–100 znaków.',true);if((p&admBit(3))&&!(admBits(r.permissions)&admBit(3))&&!confirm('UWAGA: Uprawnienie Administrator pozwala ominąć większość ograniczeń. Czy na pewno chcesz je nadać tej roli?'))return;admBusyButton('ar-save');try{const updated=await api(`/guilds/${g}/roles/${r.id}`,admJSON('PATCH',body));adminState.roles=adminState.roles.map(x=>x.id===updated.id?updated:x);state.roles.set(updated.id,updated);toast('Zapisano rolę.');admRoles();}catch(e){admWarn(e);}finally{admBusyButton('ar-save',false);}});
 admBind('ar-delete',async()=>{if(!r||r.id===g||r.managed||!confirm(`Trwale usunąć rolę „${r.name}”?`))return;try{await api(`/guilds/${g}/roles/${r.id}`,{method:'DELETE'});adminState.roles=adminState.roles.filter(x=>x.id!==r.id);state.roles.delete(r.id);adminState.roleId=null;toast('Usunięto rolę.');admRoles();}catch(e){admWarn(e);}});
}
function admChannels(){
 const list=[...adminState.channels].sort((a,b)=>(a.position||0)-(b.position||0));
 admSetContent(admCard('Kanały serwera',
  `<div class="adm-actions">${admButton('+ Utwórz kanał','ac-create')}${admButton('Odśwież listę','ac-reload','subtle')}</div>`+
  `<div class="adm-item-list">${list.map(c=>`<button class="adm-list-item" data-open-channel="${c.id}"><span>${admEscape({0:'#',2:'🔊',4:'⌄',5:'📢',13:'🎙',15:'▤',16:'▧'}[c.type]||'#')} ${admEscape(c.name)}</span><small>${admEscape(ADM_TYPE[c.type]||'Wątek')} · ⚙</small></button>`).join('')}</div>`));
 document.querySelectorAll('[data-open-channel]').forEach(x=>x.addEventListener('click',()=>{adminState.mode='channel';adminState.channelId=x.dataset.openChannel;adminState.channelTab='overview';admRender();}));
 admBind('ac-create',()=>admCreateChannel());admBind('ac-reload',async()=>{try{await admRefresh();}catch(e){admWarn(e);}});
}
function admCreateChannel(parentId=''){
 adminState.mode='server';adminState.section='channels';admSetHead();
 admSetContent(admCard('Nowy kanał',admField('cc-name','Nazwa kanału','','text','maxlength="100"')+
 admSelect('cc-type','Typ kanału',[[0,'Tekstowy'],[2,'Głosowy'],[4,'Kategoria'],[5,'Ogłoszenia'],[13,'Scena'],[15,'Forum'],[16,'Media']],0)+
 admSelect('cc-category','Kategoria',admCategoryOptions(),parentId)+
 admNote('Dostępność niektórych typów zależy od funkcji danego serwera. Kategoria nie może mieć kategorii nadrzędnej.')+
 `<div class="adm-actions">${admButton('Utwórz','cc-submit')}${admButton('Anuluj','cc-cancel','subtle')}</div>`));
 admBind('cc-submit',async()=>{const name=admValue('cc-name').trim(),type=+admValue('cc-type');if(name.length<1||name.length>100)return toast('Nazwa musi mieć 1–100 znaków.',true);const body={name,type};if(type!==4&&admValue('cc-category'))body.parent_id=admValue('cc-category');admBusyButton('cc-submit');try{const c=await api(`/guilds/${admGuild()}/channels`,admJSON('POST',body));adminState.channels.push(c);toast('Utworzono kanał.');if(state.guildId===admGuild())await loadChannels(admGuild());adminState.mode='channel';adminState.channelId=c.id;adminState.channelTab='overview';admRender();}catch(e){admWarn(e);}finally{admBusyButton('cc-submit',false);}});
 admBind('cc-cancel',()=>admRender());
}
function admChannelOverview(){
 const c=admChannel();if(!c)throw Error('Kanał nie jest już dostępny.');
 const voice=[2,13].includes(c.type),text=[0,5,15,16].includes(c.type);
 let fields=admField('ch-name','Nazwa kanału',c.name,'text','maxlength="100"');
 if(text)fields+=`<label class="adm-field"><span>Temat kanału</span><textarea id="ch-topic" rows="3" maxlength="${[15,16].includes(c.type)?4096:1024}">${admEscape(c.topic||'')}</textarea></label>`;
 if(c.type!==4)fields+=admSelect('ch-parent','Kategoria nadrzędna',admCategoryOptions(),c.parent_id||'');
 if(text)fields+=`<div class="adm-form-grid">${admField('ch-slowmode','Tryb powolny — sekundy (0–21600)',c.rate_limit_per_user||0,'number','min="0" max="21600"')}${admSelect('ch-archive','Domyślny czas archiwizacji wątków',[[60,'1 godzina'],[1440,'1 dzień'],[4320,'3 dni'],[10080,'7 dni']],c.default_auto_archive_duration||1440)}</div>`;
 if(c.type!==4)fields+=admCheckbox('ch-nsfw','Kanał dla osób pełnoletnich (NSFW)',!!c.nsfw);
 if(voice)fields+=`<div class="adm-form-grid">${admField('ch-bitrate','Przepływność dźwięku (kb/s)',Math.round((c.bitrate||64000)/1000),'number','min="8" max="384"')}${admField('ch-userlimit','Limit użytkowników (0 = brak)',c.user_limit||0,'number','min="0" max="99"')}</div>`;
 if(c.type===15||c.type===16)fields+=`<div class="adm-form-grid">${admField('ch-threadslow','Tryb powolny wątków (sekundy)',c.default_thread_rate_limit_per_user||0,'number','min="0" max="21600"')}${admSelect('ch-sort','Domyślna kolejność',[[0,'Ostatnia aktywność'],[1,'Data utworzenia']],c.default_sort_order??0)}</div>`;
 admSetContent(admCard(`${ADM_TYPE[c.type]||'Kanał'}: ${c.name}`,fields+admNote(`ID: ${c.id} · Typ: ${c.type} · Zmiany zostaną zapisane na prawdziwym serwerze.`)+
 `<div class="adm-actions">${admButton('Zapisz zmiany','ch-save')}${admButton('Skopiuj ID','ch-copy','subtle')}${admButton('Duplikuj kanał','ch-clone','subtle')}${admButton('Usuń kanał','ch-delete','danger')}</div>`));
 admBind('ch-save',async()=>{const name=admValue('ch-name').trim();if(!name||name.length>100)return toast('Niepoprawna nazwa.',true);const patch={name};if(text){patch.topic=admValue('ch-topic')||null;patch.rate_limit_per_user=Number(admValue('ch-slowmode'));patch.default_auto_archive_duration=Number(admValue('ch-archive'));}if(c.type!==4){patch.parent_id=admValue('ch-parent')||null;patch.nsfw=admChecked('ch-nsfw');}if(voice){patch.bitrate=Number(admValue('ch-bitrate'))*1000;patch.user_limit=Number(admValue('ch-userlimit'));}if([15,16].includes(c.type)){patch.default_thread_rate_limit_per_user=Number(admValue('ch-threadslow'));patch.default_sort_order=Number(admValue('ch-sort'));}if(patch.rate_limit_per_user<0||patch.rate_limit_per_user>21600||patch.user_limit>99)return toast('Wartość wykracza poza limit.',true);for(const [k,v] of Object.entries(patch))if(JSON.stringify(v)===JSON.stringify(c[k]??null))delete patch[k];if(!Object.keys(patch).length)return toast('Brak zmian.');admBusyButton('ch-save');try{const updated=await api(`/channels/${c.id}`,admJSON('PATCH',patch));adminState.channels=adminState.channels.map(x=>x.id===c.id?updated:x);toast('Zapisano kanał.');if(state.guildId===admGuild())await loadChannels(admGuild());admRender();}catch(e){admWarn(e);}finally{admBusyButton('ch-save',false);}});
 admBind('ch-copy',()=>admCopy(c.id));admBind('ch-clone',()=>admCloneChannel(c));admBind('ch-delete',()=>admDeleteChannel(c));
}
async function admCloneChannel(c){
 const name=prompt('Nazwa duplikatu kanału:',`${c.name}-kopia`);if(name===null)return;const v=name.trim();if(!v||v.length>100)return toast('Nieprawidłowa nazwa.',true);
 const body={name:v,type:c.type,position:c.position,parent_id:c.parent_id||null,permission_overwrites:c.permission_overwrites||[]};
 for(const key of ['topic','nsfw','rate_limit_per_user','bitrate','user_limit','default_auto_archive_duration','default_thread_rate_limit_per_user','available_tags'])if(c[key]!=null)body[key]=c[key];
 try{const copy=await api(`/guilds/${admGuild()}/channels`,admJSON('POST',body));toast('Utworzono kopię kanału.');adminState.channels.push(copy);if(state.guildId===admGuild())await loadChannels(admGuild());adminState.mode='channel';adminState.channelId=copy.id;adminState.channelTab='overview';admRender();}catch(e){admWarn(e);}
}
async function admDeleteChannel(c){
 if(!confirm(`Czy na pewno trwale usunąć kanał „${c.name}”? Wiadomości na tym kanale zostaną utracone.`))return;
 if(prompt(`Aby potwierdzić, wpisz dokładnie: ${c.name}`)!==c.name)return;
 try{await api(`/channels/${c.id}`,{method:'DELETE'});adminState.channels=adminState.channels.filter(x=>x.id!==c.id);toast('Kanał został usunięty.');adminState.mode='server';adminState.section='channels';if(state.guildId===admGuild())await loadChannels(admGuild());admRender();}catch(e){admWarn(e);}
}
function admChannelPermissions(){
 const c=admChannel();if(!c)return;
 const ids=new Map([[admGuild(),{name:'@everyone',type:0}],...admSortedRoles().filter(r=>r.id!==admGuild()).map(r=>[r.id,{name:r.name,type:0}])]);
 const overwriteChoices=[...ids].map(([id,r])=>[id,r.name]);
 admSetContent(admCard('Nadpisania uprawnień kanału',
 admNote('Przy każdej opcji możesz wybrać Zezwól, Odmów lub Dziedzicz. Edycja zachowuje pozostałe niezmieniane bity uprawnień. Administrator zawsze pomija nadpisania kanałowe.')+
 admSelect('cp-target','Rola lub użytkownik',overwriteChoices,admGuild())+
 `<div class="adm-form-grid">${admField('cp-user','Dodaj użytkownika po ID','','text','placeholder="ID użytkownika"')}${admButton('Wybierz użytkownika','cp-add-user','subtle')}</div>`+
 `<div id="cp-grid" class="adm-permissions-tristate"></div>`+
 `<div class="adm-actions">${admButton('Zapisz uprawnienia','cp-save')}${admButton('Usuń nadpisanie','cp-clear','danger')}</div>`));
 const refreshGrid=()=>{
  const id=admValue('cp-target');const over=(c.permission_overwrites||[]).find(x=>x.id===id);const allow=admBits(over?.allow),deny=admBits(over?.deny);
  const groups=[['Podstawowe',['VIEW_CHANNEL','SEND_MESSAGES','READ_MESSAGE_HISTORY','ADD_REACTIONS','EMBED_LINKS','ATTACH_FILES','MENTION_EVERYONE','CREATE_INSTANT_INVITE']],['Zarządzanie',['MANAGE_MESSAGES','MANAGE_CHANNELS','MANAGE_ROLES','MANAGE_WEBHOOKS']],['Wątki',['SEND_MESSAGES_IN_THREADS','MANAGE_THREADS','CREATE_PUBLIC_THREADS','CREATE_PRIVATE_THREADS']],['Głos',['CONNECT','SPEAK','STREAM','MUTE_MEMBERS','DEAFEN_MEMBERS','MOVE_MEMBERS']]];
  admEl('cp-grid').innerHTML=groups.map(([group,names])=>`<section class="adm-perm-section"><h4>${admEscape(group)}</h4>${ADMIN_CHANNEL_PERMISSIONS.filter(([name])=>names.includes(name)).map(([name,label,bit])=>{
    const value=(allow&admBit(bit))?'allow':(deny&admBit(bit))?'deny':'neutral';
    return `<div class="adm-tri-row"><span>${admEscape(label)}</span><div class="adm-tri-buttons" role="group" aria-label="${admEscape(label)}"><select data-bit="${bit}" class="adm-hidden-select" aria-label="${admEscape(label)}"><option value="neutral" ${value==='neutral'?'selected':''}>Dziedzicz</option><option value="allow" ${value==='allow'?'selected':''}>Zezwól</option><option value="deny" ${value==='deny'?'selected':''}>Odmów</option></select><button type="button" data-state="neutral" class="${value==='neutral'?'active':''}" title="Dziedzicz" aria-pressed="${value==='neutral'}">/</button><button type="button" data-state="allow" class="${value==='allow'?'active':''}" title="Zezwól" aria-pressed="${value==='allow'}">✓</button><button type="button" data-state="deny" class="${value==='deny'?'active':''}" title="Odmów" aria-pressed="${value==='deny'}">✕</button></div></div>`;}).join('')}</section>`).join('');
  admEl('cp-grid').querySelectorAll('.adm-tri-buttons button').forEach(b=>b.addEventListener('click',()=>{
   const group=b.closest('.adm-tri-buttons'),sel=group.querySelector('select');sel.value=b.dataset.state;
   group.querySelectorAll('button').forEach(x=>{const selected=x===b;x.classList.toggle('active',selected);x.setAttribute('aria-pressed',String(selected));});
  }));
 };
 admBind('cp-target',refreshGrid,'change');refreshGrid();
 admBind('cp-add-user',()=>{const id=admValue('cp-user').trim();if(!admId(id))return toast('Wpisz prawidłowe ID użytkownika.',true);if(![...admEl('cp-target').options].some(x=>x.value===id))admEl('cp-target').add(new Option(`Użytkownik ${id}`,id));admEl('cp-target').value=id;refreshGrid();});
 admBind('cp-save',async()=>{const id=admValue('cp-target');const role=ids.has(id);const existing=(c.permission_overwrites||[]).find(x=>x.id===id);let allow=admBits(existing?.allow),deny=admBits(existing?.deny);for(const select of admEl('cp-grid').querySelectorAll('[data-bit]')){const bit=admBit(select.dataset.bit);allow&=~bit;deny&=~bit;if(select.value==='allow')allow|=bit;if(select.value==='deny')deny|=bit;}admBusyButton('cp-save');try{await api(`/channels/${c.id}/permissions/${id}`,admJSON('PUT',{type:role?0:1,allow:String(allow),deny:String(deny)}));const newC=await api(`/channels/${c.id}`);adminState.channels=adminState.channels.map(x=>x.id===c.id?newC:x);toast('Zapisano uprawnienia kanału.');admChannelPermissions();if(state.guildId===admGuild())loadChannels(admGuild()).catch(admWarn);}catch(e){admWarn(e);}finally{admBusyButton('cp-save',false);}});
 admBind('cp-clear',async()=>{const id=admValue('cp-target');if(!(c.permission_overwrites||[]).some(x=>x.id===id))return toast('Brak nadpisania do usunięcia.');if(!confirm('Usunąć wszystkie nadpisania dla tej roli lub osoby na tym kanale?'))return;try{await api(`/channels/${c.id}/permissions/${id}`,{method:'DELETE'});const newC=await api(`/channels/${c.id}`);adminState.channels=adminState.channels.map(x=>x.id===c.id?newC:x);toast('Przywrócono uprawnienia dziedziczone.');admChannelPermissions();}catch(e){admWarn(e);}});
}
async function admListInvites(channelId=null){
 const path=channelId?`/channels/${channelId}/invites`:`/guilds/${admGuild()}/invites`;
 const out=await api(path);if(!Array.isArray(out))return [];
 return out;
}
async function admInvites(channelId=null){
 const isChannel=!!channelId;
 const list=await admListInvites(channelId);
 admSetContent(admCard(isChannel?'Zaproszenia kanału':'Zaproszenia serwera',
  `<div class="adm-item-list">${list.length?list.map(x=>`<div class="adm-data-row"><div><strong>${admEscape(x.code)}</strong><small>${admEscape(x.channel?.name||'Kanał')} · użyć: ${x.uses??'—'} / ${x.max_uses||'∞'} · wygasa: ${x.expires_at?new Date(x.expires_at).toLocaleString('pl-PL'):'nigdy'}</small></div><div class="adm-row-actions"><button class="adm-btn subtle" data-copy-invite="${admEscape(x.code)}">Kopiuj</button><button class="adm-btn danger" data-revoke-invite="${admEscape(x.code)}">Usuń</button></div></div>`).join(''):'<p class="adm-note">Nie znaleziono zaproszeń.</p>'}</div>`+
 (isChannel?`<h3>Nowe zaproszenie</h3><div class="adm-form-grid">${admSelect('ci-expire','Wygasa po',[[0,'Nigdy'],[1800,'30 minut'],[3600,'1 godzina'],[21600,'6 godzin'],[43200,'12 godzin'],[86400,'1 dzień'],[604800,'7 dni']],86400)}${admField('ci-uses','Maks. liczba użyć (0 = bez limitu)',0,'number','min="0" max="100"')}</div>${admCheckbox('ci-temp','Tymczasowe członkostwo',false)}${admButton('Utwórz zaproszenie','ci-create')}`:'')
 ));
 document.querySelectorAll('[data-copy-invite]').forEach(b=>b.addEventListener('click',()=>admCopy(`https://discord.gg/${b.dataset.copyInvite}`)));
 document.querySelectorAll('[data-revoke-invite]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Unieważnić to zaproszenie?'))return;try{await api(`/invites/${encodeURIComponent(b.dataset.revokeInvite)}`,{method:'DELETE'});toast('Zaproszenie unieważnione.');admInvites(channelId).catch(admWarn);}catch(e){admWarn(e);}}));
 admBind('ci-create',async()=>{const max_age=+admValue('ci-expire'),max_uses=+admValue('ci-uses');if(max_uses<0||max_uses>100)return toast('Limit musi wynosić 0–100.',true);try{const inv=await api(`/channels/${channelId}/invites`,admJSON('POST',{max_age,max_uses,temporary:admChecked('ci-temp'),unique:true}));toast('Utworzono zaproszenie.');admCopy(`https://discord.gg/${inv.code}`);admInvites(channelId).catch(admWarn);}catch(e){admWarn(e);}});
}
async function admRenderChannel(){
 const c=admChannel();if(!c)throw Error('Nie znaleziono kanału.');
 if(adminState.channelTab==='overview')admChannelOverview();
 else if(adminState.channelTab==='permissions')admChannelPermissions();
 else if(adminState.channelTab==='invites')await admInvites(c.id);
 else if(adminState.channelTab==='tags')admForumTags();
}
function admForumTags(){
 const c=admChannel();if(![15,16].includes(c?.type))return admChannelOverview();
 const tags=c.available_tags||[];
 admSetContent(admCard('Tagi forum',admNote('Twórz lub usuwaj tagi dostępne podczas zakładania wątków.')+
 `<div class="adm-item-list">${tags.map((t,i)=>`<div class="adm-data-row"><strong>${admEscape(t.name)}</strong>${admButton('Usuń','tag-delete-'+i,'danger')}</div>`).join('')||'<p class="adm-note">Brak tagów.</p>'}</div>`+
 admField('tag-new','Nazwa nowego tagu','','text','maxlength="20"')+
 admCheckbox('tag-moderated','Tag tylko dla moderatorów',false)+admButton('Dodaj tag','tag-add')));
 tags.forEach((t,i)=>admBind('tag-delete-'+i,async()=>{if(!confirm(`Usunąć tag „${t.name}”?`))return;await admSaveTags(c,tags.filter(x=>x.id!==t.id));}));
 admBind('tag-add',async()=>{const name=admValue('tag-new').trim();if(!name||name.length>20)return toast('Tag musi mieć 1–20 znaków.',true);if(tags.length>=20)return toast('Osiągnięto limit tagów.',true);await admSaveTags(c,[...tags.map(t=>({id:t.id,name:t.name,moderated:!!t.moderated,emoji_id:t.emoji_id,emoji_name:t.emoji_name})),{name,moderated:admChecked('tag-moderated')}]);});
}
async function admSaveTags(c,tags){try{const updated=await api(`/channels/${c.id}`,admJSON('PATCH',{available_tags:tags}));adminState.channels=adminState.channels.map(x=>x.id===c.id?updated:x);toast('Tagi zaktualizowane.');admForumTags();}catch(e){admWarn(e);}}
async function admMembers(){
 admSetContent(admCard('Członkowie serwera',admNote('Wyszukiwanie po ID działa bez pobierania całego serwera. Szukanie po nazwie może wymagać uprzywilejowanego Members Intent w panelu Discord Developer Portal.')+
 admField('am-query','Nazwa użytkownika lub ID','','search','placeholder="Nazwa lub identyfikator"')+
 admButton('Znajdź członka','am-search')+`<div id="am-results" class="adm-item-list"></div>`));
 admBind('am-search',async()=>{const q=admValue('am-query').trim();if(!q)return;admEl('am-results').textContent='Wyszukiwanie…';try{let members;if(admId(q)){members=[await api(`/guilds/${admGuild()}/members/${q}`)];}else{members=await api(`/guilds/${admGuild()}/members/search?query=${encodeURIComponent(q.slice(0,64))}&limit=50`);}admRenderMemberResults(members||[]);}catch(e){admEl('am-results').textContent=e.message;}});
 admBind('am-query',e=>{if(e.key==='Enter'){e.preventDefault();admEl('am-search').click();}},'keydown');
}
function admRenderMemberResults(members){const target=admEl('am-results');target.replaceChildren();if(!members.length){target.textContent='Nie znaleziono osób.';return;}
 for(const member of members){if(!member.user)continue;const button=el('button','adm-list-item',`${member.nick||member.user.global_name||member.user.username}  ·  ${member.user.id}`);button.addEventListener('click',()=>admMemberDetail(member));target.append(button);}
}
function admMemberDetail(member){
 const user=member.user,uid=user.id,roles=admSortedRoles().filter(r=>r.id!==admGuild());
 admSetContent(admCard(`Członek: ${member.nick||user.global_name||user.username}`,
 admNote(`ID: ${uid} · dołączył: ${member.joined_at?new Date(member.joined_at).toLocaleString('pl-PL'):'—'}`)+
 admField('md-nick','Nick na serwerze',member.nick||'','text','maxlength="32"')+
 admButton('Zapisz nick','md-nick-save')+
 `<h3>Role członka</h3><div class="adm-perm-grid">${roles.map(r=>admCheckbox('md-role-'+r.id,r.name,(member.roles||[]).includes(r.id))).join('')}</div>`+
 `<div class="adm-actions">${admButton('Zapisz role','md-role-save')}${admButton('Wyrzuć z serwera','md-kick','danger')}${admButton('Wróć do wyszukiwania','md-back','subtle')}</div>`));
 admBind('md-back',()=>admMembers());
 admBind('md-nick-save',async()=>{try{await api(`/guilds/${admGuild()}/members/${uid}`,admJSON('PATCH',{nick:admValue('md-nick').trim()||null}));toast('Zmieniono nick.');}catch(e){admWarn(e);}});
 admBind('md-role-save',async()=>{const added=roles.filter(r=>admChecked('md-role-'+r.id)&&!(member.roles||[]).includes(r.id)),removed=roles.filter(r=>!admChecked('md-role-'+r.id)&&(member.roles||[]).includes(r.id));if(!added.length&&!removed.length)return toast('Brak zmian.');if(!confirm(`Zastosować ${added.length} nadań i ${removed.length} odebrań ról dla tej osoby?`))return;admBusyButton('md-role-save');try{for(const r of added)await api(`/guilds/${admGuild()}/members/${uid}/roles/${r.id}`,{method:'PUT'});for(const r of removed)await api(`/guilds/${admGuild()}/members/${uid}/roles/${r.id}`,{method:'DELETE'});const fresh=await api(`/guilds/${admGuild()}/members/${uid}`);toast('Zmieniono role członka.');admMemberDetail(fresh);}catch(e){admWarn(e);}finally{admBusyButton('md-role-save',false);}});
 admBind('md-kick',async()=>{if(!confirm(`Wyrzucić ${user.username} z serwera?`))return;try{await api(`/guilds/${admGuild()}/members/${uid}`,{method:'DELETE'});toast('Wyrzucono członka.');admMembers();}catch(e){admWarn(e);}});
}
async function admBans(){
 const bans=await api(`/guilds/${admGuild()}/bans?limit=100`);
 admSetContent(admCard('Zbanowani użytkownicy',admNote('Lista pokazuje maksymalnie 100 pierwszych rekordów. Banowanie i odbanowanie wymaga uprawnienia BAN_MEMBERS.')+
 `<div class="adm-form-grid">${admField('ban-id','ID użytkownika do zbanowania','','text','placeholder="ID użytkownika"')}${admField('ban-reason','Powód (opcjonalnie)','','text','maxlength="512"')}</div>`+
 admButton('Zbanuj użytkownika','ban-create','danger')+
 `<div class="adm-item-list">${(bans||[]).map((b,i)=>`<div class="adm-data-row" data-ban-user="${admEscape(b.user?.id||'')}" data-ban-reason="${admEscape(b.reason||'Bez powodu')}">${b.user?.avatar?`<img class="v12-banned-avatar" src="https://cdn.discordapp.com/avatars/${admEscape(b.user.id)}/${admEscape(b.user.avatar)}.${String(b.user.avatar).startsWith('a_')?'gif':'png'}?size=64" alt="">`:''}<div><strong>${admEscape(b.user?.global_name||b.user?.username||b.user?.id)}</strong><small>${admEscape(b.user?.id)} · ${admEscape(b.reason||'Bez powodu')}</small></div>${admButton('Odbanuj','ban-remove-'+i,'subtle')}</div>`).join('')||'<p class="adm-note">Brak zbanowanych użytkowników.</p>'}</div>`));
 admBind('ban-create',async()=>{const id=admValue('ban-id').trim();if(!admId(id))return toast('Nieprawidłowe ID.',true);if(!confirm(`Zbanować użytkownika ${id}?`))return;try{await api(`/guilds/${admGuild()}/bans/${id}`,admJSON('PUT',{delete_message_seconds:0,reason:admValue('ban-reason').slice(0,512)}));toast('Użytkownik został zbanowany.');admBans().catch(admWarn);}catch(e){admWarn(e);}});
 (bans||[]).forEach((b,i)=>admBind('ban-remove-'+i,async()=>{if(!confirm(`Odbanować ${b.user?.username||b.user?.id}?`))return;try{await api(`/guilds/${admGuild()}/bans/${b.user.id}`,{method:'DELETE'});toast('Użytkownik odbanowany.');admBans().catch(admWarn);}catch(e){admWarn(e);}}));
}
async function admAudit(){
 const out=await api(`/guilds/${admGuild()}/audit-logs?limit=50`);
 const users=new Map((out.users||[]).map(u=>[u.id,u]));
 admSetContent(admCard('Dziennik audytu',admNote('50 najnowszych działań administratorów i moderatorów. Wszystkie wpisy pochodzą z Discord API.')+
 `<div class="adm-item-list">${(out.audit_log_entries||[]).map(x=>`<div class="adm-data-row"><div><strong>${admEscape(AUDIT_ACTIONS[x.action_type]||'Zdarzenie #'+x.action_type)}</strong><small>${admEscape(users.get(x.user_id)?.username||x.user_id||'System')} · obiekt: ${admEscape(x.target_id||'—')} · ${admEscape(x.reason||'Bez powodu')}</small></div><small>${admEscape(snowflakeDate(x.id))}</small></div>`).join('')||'<p class="adm-note">Brak wpisów.</p>'}</div>`));
}
async function admEmojis(){
 const results=await Promise.allSettled([api(`/guilds/${admGuild()}/emojis`),api(`/guilds/${admGuild()}/stickers`)]);
 const emojis=results[0].status==='fulfilled'?results[0].value:[];const stickers=results[1].status==='fulfilled'?results[1].value:[];
 admSetContent(admCard('Emoji i naklejki',admNote('Podgląd zasobów serwera. Ich dodawanie i przesyłanie wymaga osobnej obsługi plików, dlatego tutaj pozostają tylko do odczytu.')+
 `<h3>Emoji (${emojis.length})</h3><div class="adm-asset-grid">${emojis.map(x=>`<div class="adm-asset"><img src="https://cdn.discordapp.com/emojis/${admEscape(x.id)}.${x.animated?'gif':'png'}?size=64" alt=""><span>${admEscape(x.name)}</span></div>`).join('')||'Brak emoji.'}</div>`+
 `<h3>Naklejki (${stickers.length})</h3><div class="adm-asset-grid">${stickers.map(x=>`<div class="adm-asset"><span>◈</span><span>${admEscape(x.name)}</span></div>`).join('')||'Brak naklejek.'}</div>`));
}
function admContextHide(){admEl('channel-context').classList.add('hidden');}
function admContextShow(event,channel){
 event.preventDefault();event.stopPropagation();if(!state.guildId||state.dmView)return;
 const menu=admEl('channel-context');menu.replaceChildren();
 const options=[
 ...(channel.type!==4?[['# Otwórz kanał',()=>selectChannel(channel.id)],['✓ Oznacz jako przeczytane',()=>{state.unread.delete(channel.id);renderChannels();toast('Kanał oznaczony jako przeczytany w panelu.');}]]:[]),
 ['⚙ Edytuj kanał',()=>admOpen('channel',channel.id)],
 ['🔐 Uprawnienia',async()=>{await admOpen('channel',channel.id);adminState.channelTab='permissions';admRender();}],
 ['📋 Kopiuj ID',()=>admCopy(channel.id)],
 ['🔗 Kopiuj link',()=>admCopy(`https://discord.com/channels/${state.guildId}/${channel.id}`)],
 ...(channel.type===4?[['＋ Utwórz kanał w kategorii',async()=>{await admOpen('server',null,'channels');admCreateChannel(channel.id);}]]:[]),
 ['⧉ Duplikuj kanał',async()=>{await admOpen('channel',channel.id);admCloneChannel(channel);}],
 ['🗑 Usuń kanał',async()=>{await admOpen('channel',channel.id);admDeleteChannel(channel);}]
 ];
 for(const [title,fn]of options){const b=el('button','channel-context-item',title);b.setAttribute('role','menuitem');b.addEventListener('click',()=>{admContextHide();Promise.resolve(fn()).catch(admWarn);});menu.append(b);}
 menu.classList.remove('hidden');const width=230,height=options.length*38+15;menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-height-8))+'px';
}
function admInit(){
 admBind('admin-close',admClose);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){
  const popup=document.querySelector('.v12-ban-popup');
  if(popup){popup.remove();e.preventDefault();e.stopImmediatePropagation();return;}
  if(document.getElementById('profile-dialog')?.open)return;
  admContextHide();if(!admEl('admin-view').classList.contains('hidden')){e.stopImmediatePropagation();admClose();}
 }},true);
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#channel-context'))admContextHide();});
 window.addEventListener('scroll',admContextHide,true);
 admEl('channel-list').addEventListener('contextmenu',e=>{const node=e.target.closest('[data-channel-id]');if(!node||!admEl('channel-list').contains(node))return;const channel=state.channels.find(c=>c.id===node.dataset.channelId);if(channel)admContextShow(e,channel);});
 // Przycisk "Serwer" w nagłówku otwiera teraz pełnoekranowy panel zamiast starego dialogu.
 const btn=admEl('settings-open-button');if(btn){const replacement=btn.cloneNode(true);btn.replaceWith(replacement);replacement.addEventListener('click',()=>admOpen());}
 // Menu administracyjne po PPM na ikonie serwera i jego nazwie.
 admEl('guild-list').addEventListener('contextmenu',e=>{const button=e.target.closest('.guild-button');if(!button)return;e.preventDefault();const id=[...admEl('guild-list').querySelectorAll('.guild-button')].indexOf(button);const guild=[...state.guilds.values()].sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'pl'))[id];if(guild){selectGuild(guild.id);setTimeout(()=>admOpen(),150);}});
}
admInit();
