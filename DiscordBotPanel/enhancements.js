'use strict';
/* Discord Bot Panel 1.10: client-side enhancements. No private user tokens. */
(function(){
const $p=id=>document.getElementById(id);
const mk=(tag,cls='',label='')=>{const x=document.createElement(tag);if(cls)x.className=cls;if(label)x.textContent=label;return x;};
const enc=x=>encodeURIComponent(String(x||''));
const sid=x=>/^\d{16,22}$/.test(String(x||''));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settings={protectedUsers:[],protectedRoles:[],alerts:false};
const mass={busy:false,stop:false,candidates:[],excluded:[],complete:false,guildId:null};
const members={guildId:null,items:[],after:null,complete:false,busy:false};
let memberDock=null;
let showMembersPreference=true, preferenceUser=null, preferenceInFlight=false, switchingGuild=false;
let composerPopover=null, composerPopoverType='';
function setupChatBodyLayout(){
 const chat=document.querySelector('.chat-area');
 if(chat.querySelector('.chat-body-layout'))return;
 const layout=mk('div','chat-body-layout');layout.id='chat-body-layout';
 const main=mk('div','chat-body-main');main.id='chat-body-main';
 chat.insertBefore(layout,$p('warning-banner'));
 for(const id of ['warning-banner','message-scroller','latest-button'])main.append($p(id));
 main.append(chat.querySelector('.composer-zone'));
 layout.append(main);
}
function shouldDisplayMembers(){
 return !switchingGuild&&!!state.guildId&&!state.dmView&&!$p('app-view').classList.contains('hidden')&&$p('search-panel').classList.contains('hidden');
}
async function loadMemberVisibility(){
 const id=state.me?.id;if(!id||preferenceUser===id||preferenceInFlight)return;
 preferenceInFlight=true;const preference=await getLocal(`bp_members_open_${id}`,true);
 preferenceInFlight=false;
 if(state.me?.id!==id)return;
 preferenceUser=id;showMembersPreference=preference!==false;syncMemberDock();
}
function syncMemberDock(){
 if(!showMembersPreference||!shouldDisplayMembers()){closeMemberDock();return;}
 if(memberDock&&!memberDock.classList.contains('hidden')&&members.guildId===idGuild())return;
 if(memberDock&&!memberDock.classList.contains('hidden'))closeMemberDock();
 openMemberPanel().catch(warn);
}
function toggleMemberPreference(){
 if(!state.guildId||state.dmView)return;
 showMembersPreference=!showMembersPreference;
 if(state.me?.id)storeLocal({[`bp_members_open_${state.me.id}`]:showMembersPreference});
 syncMemberDock();
}
function onSearchVisibilityChange(open){
 if(open){closeMemberDock();closeDrawer();hideComposerPopover();}
 else syncMemberDock();
}

const selection=new Set();
let bulkMode=false, panelType='', panel=null, menu=null, draftKey='',logQueue=[];
const idGuild=()=>state.guildId;
const storageKey=id=>`botpanel_plus_${state.me?.id||'bot'}_${id}`;
const historyKey=id=>`botpanel_modlog_${state.me?.id||'bot'}_${id}`;
const idValid=id=>sid(id);
const utc=t=>new Date(t).toLocaleString('pl-PL');
function warn(e){toast(e?.message||String(e),true);}
function button(text,callback,cls='pp-button'){const b=mk('button',cls,text);b.type='button';b.addEventListener('click',callback);return b;}
function out(msg){const node=$p('pp-output');if(node)node.textContent=msg;}
function section(title,desc=''){const box=mk('section','pp-box');box.append(mk('h3','',title));if(desc)box.append(mk('p','pp-hint',desc));return box;}
function field(label,id,opts={}){const wrap=mk('label','pp-field');wrap.append(mk('span','',label));const x=mk(opts.type==='select'?'select':opts.type==='textarea'?'textarea':'input');x.id=id;if(x.tagName==='INPUT')x.type=opts.type||'text';if(opts.value!=null)x.value=String(opts.value);if(opts.placeholder)x.placeholder=opts.placeholder;if(opts.maxlength)x.maxLength=opts.maxlength;if(opts.min!=null)x.min=opts.min;if(opts.max!=null)x.max=opts.max;if(opts.options)for(const [value,name] of opts.options){const opt=mk('option','',name);opt.value=value;x.append(opt);}if(opts.value!=null)x.value=String(opts.value);wrap.append(x);return wrap;}
function storeLocal(obj){return chrome.storage.local.set(obj).catch(()=>{});}
async function getLocal(key,def){try{const result=await chrome.storage.local.get(key);return result[key]??def;}catch{return def;}}
async function loadPrefs(){const found=await getLocal(storageKey(idGuild()),{});settings.protectedUsers=Array.isArray(found.protectedUsers)?found.protectedUsers.filter(sid):[];settings.protectedRoles=Array.isArray(found.protectedRoles)?found.protectedRoles.filter(sid):[];settings.alerts=!!found.alerts;updateAlertButton();}
async function savePrefs(){if(!idGuild())return;await storeLocal({[storageKey(idGuild())]:{protectedUsers:settings.protectedUsers,protectedRoles:settings.protectedRoles,alerts:settings.alerts}});}
async function appendHistory(list,guild=idGuild()){if(!guild||!list?.length)return;const key=historyKey(guild);const old=await getLocal(key,[]);await storeLocal({[key]:[...list,...(Array.isArray(old)?old:[])].slice(0,1000)});}
function historyRows(rows){return (rows||[]).map(r=>`<div class="pp-history"><strong>${esc(r.action)}</strong> <span>${esc(utc(r.time))}</span><small>ID: ${esc(r.id||'—')} · ${esc(r.ok?'Wykonano':'Niepowodzenie')} · ${esc(r.reason||'Bez powodu')}${r.error?' · '+esc(r.error):''}</small></div>`).join('')||'<p class="pp-hint">Brak operacji zapisanych przez tę wtyczkę.</p>';}
function adminHtml(html){admSetContent(html);}
const actionNames={timeout:'Timeout',kick:'Kick',ban:'Ban'};
function boolCheck(v){return !!v;}
function auditHeader(reason){const text=String(reason||'Moderacja przez Discord Bot Panel').slice(0,300);return {'X-Audit-Log-Reason':encodeURIComponent(text)};}
async function moderationAction(guild,uid,kind,duration,reason){
  if(!sid(guild)||!sid(uid))throw Error('Niepoprawne ID.');
  const headers=auditHeader(reason);
  if(kind==='timeout'){
    const max=28*86400; if(duration<=0||duration>max)throw Error('Nieprawidłowy czas timeoutu.');
    const until=new Date(Date.now()+duration*1000).toISOString();
    return api(`/guilds/${guild}/members/${uid}`,{method:'PATCH',headers,body:JSON.stringify({communication_disabled_until:until})});
  }
  if(kind==='untimeout')return api(`/guilds/${guild}/members/${uid}`,{method:'PATCH',headers,body:JSON.stringify({communication_disabled_until:null})});
  if(kind==='kick')return api(`/guilds/${guild}/members/${uid}`,{method:'DELETE',headers});
  if(kind==='ban')return api(`/guilds/${guild}/bans/${uid}`,{method:'PUT',headers,body:JSON.stringify({delete_message_seconds:0})});
  throw Error('Nieznana akcja.');
}
async function resolveHierarchy(guild){
  const [self,roles,g]=await Promise.all([
    api(`/guilds/${guild}/members/${state.me.id}`),api(`/guilds/${guild}/roles`),api(`/guilds/${guild}`)
  ]);
  const byId=new Map(roles.map(r=>[r.id,r]));
  const highest=Math.max(0,...(self.roles||[]).map(id=>byId.get(id)?.position||0));
  return {highest,roles,byId,owner:g.owner_id};
}
function canModerateMember(item,hierarchy){
  const u=item.user;if(!u?.id||!sid(u.id))return false;
  if(u.id===state.me?.id||u.id===hierarchy.owner)return false;
  const roles=(item.roles||[]).map(id=>hierarchy.byId.get(id)).filter(Boolean);
  const memberHighest=Math.max(0,...roles.map(r=>r.position||0));
  return hierarchy.highest>0&&memberHighest<hierarchy.highest;
}
async function enumerateMembers(guild,onPage,limitTotal=30000){
  let after='',list=[],complete=false;
  while(list.length<limitTotal){
    if(mass.stop)throw Error('Anulowano przygotowanie listy.');
    const q=`?limit=1000${after?'&after='+after:''}`;
    const batch=await api(`/guilds/${guild}/members${q}`);
    if(!Array.isArray(batch))throw Error('Niepoprawna odpowiedź listy członków.');
    list.push(...batch);
    onPage?.(list.length);
    if(batch.length<1000){complete=true;break;}
    const next=batch[batch.length-1]?.user?.id;
    if(!sid(next)||next===after)throw Error('Paginacja członków zatrzymała się.');
    after=next;
  }
  return {list,complete};
}
function buildCandidatePreview(){
 const guild=idGuild(),kind=$p('pp-mass-action')?.value||'timeout',scope=$p('pp-mass-scope')?.value||'no_roles';
 const hierarchy=mass.hierarchy;
 const all=mass.members||[];
 const excluded=[];
 mass.candidates=all.filter(m=>{
  const id=m.user?.id;if(!canModerateMember(m,hierarchy)){excluded.push(m);return false;}
  if(settings.protectedUsers.includes(id)||(m.roles||[]).some(r=>settings.protectedRoles.includes(r))){excluded.push(m);return false;}
  if(m.user?.bot){excluded.push(m);return false;}
  if(scope==='no_roles'&&(m.roles||[]).length>0){excluded.push(m);return false;}
  return true;
 });
 mass.excluded=excluded;
 mass.guildId=guild;
 const div=$p('pp-mass-preview');if(!div)return;
 const names=mass.candidates.slice(0,80).map(m=>esc(m.nick||m.user?.global_name||m.user?.username||m.user?.id)).join(', ');
 div.innerHTML=`<strong>${mass.candidates.length} osób objętych akcją · ${excluded.length} pominiętych</strong><p>${names||'Nie znaleziono osób spełniających warunki.'}${mass.candidates.length>80?'…':''}</p><small>Filtr: ${scope==='no_roles'?'bez dodatkowych ról':'wszyscy możliwi do moderacji'}. Bot, właściciel serwera, osoby wyższe w hierarchii, wykluczone role/użytkownicy i inne boty są pomijane.</small>`;
 const go=$p('pp-mass-execute');if(go)go.disabled=!mass.complete||!mass.candidates.length;
 const confirmField=$p('pp-mass-confirm');if(confirmField){confirmField.value='';confirmField.placeholder=`Wpisz: WYKONAJ ${mass.candidates.length}`;}
}
async function massSettings(){
 const roles=adminState.roles.filter(r=>r.id!==admGuild()).sort((a,b)=>(b.position||0)-(a.position||0));
 adminHtml(`<div class="pp-intro"><strong>Jednorazowa moderacja antyraidowa</strong><p>Brak automatycznego działania w tle. Zanim wykonasz akcję, wczytaj pełną listę członków i sprawdź wynik filtrów.</p></div>`+
 `<div class="pp-two">${admCard('Działanie',
  admSelect('pp-mass-action','Akcja', [['timeout','Timeout'],['kick','Kick'],['ban','Ban']],'timeout')+
  admSelect('pp-mass-time','Czas timeoutu',[[600,'10 minut'],[3600,'1 godzina'],[86400,'1 dzień'],[604800,'7 dni'],[2419200,'28 dni']],3600)+
  admSelect('pp-mass-scope','Zasięg akcji',[['no_roles','Tylko osoby bez dodatkowych ról'],['all','Wszyscy, których bot może moderować']],'no_roles')+
  admField('pp-mass-reason','Powód','Ochrona antyraidowa','text','maxlength="300"')+
  admNote('Wybór „Wszyscy” jest dodatkowo zabezpieczony. Niewinni użytkownicy bez ról również mogą zostać objęci akcją.')+
  admButton('1. Pobierz i przeanalizuj członków','pp-mass-analyze','subtle'))}
 ${admCard('Lista chronionych',admNote('Oprócz hierarchii Discorda wyklucz dodatkowe role i konkretne osoby. Lista jest zapisywana lokalnie dla tego serwera.')+
 `<div class="pp-protected">${roles.map(r=>admCheckbox('pp-keep-'+r.id,r.name,settings.protectedRoles.includes(r.id))).join('')}</div>`+
 `<label class="adm-field"><span>Chronione identyfikatory użytkowników (po jednym w wierszu)</span><textarea id="pp-protected-users" rows="5">${esc(settings.protectedUsers.join('\n'))}</textarea></label>`+admButton('Zapisz wykluczenia','pp-save-protected'))}</div>`+
 admCard('Podgląd i wykonanie',`<div id="pp-mass-preview" class="pp-preview">Pobierz listę, aby zobaczyć osoby objęte akcją.</div><label class="adm-field"><span>Potwierdzenie — wpisz dokładnie wymagany tekst</span><input id="pp-mass-confirm" autocomplete="off" placeholder="Najpierw pobierz listę"></label><div class="adm-actions">${admButton('2. Wykonaj masową akcję','pp-mass-execute','danger','disabled')}${admButton('Zatrzymaj kolejne operacje','pp-mass-stop','subtle','disabled')}</div><pre id="pp-output" class="pp-log" aria-live="polite"></pre>`));
 admBind('pp-save-protected',async()=>{
  settings.protectedRoles=roles.filter(r=>admChecked('pp-keep-'+r.id)).map(r=>r.id);
  settings.protectedUsers=[...new Set(admValue('pp-protected-users').split(/[\s,;]+/).filter(Boolean))].filter(sid);
  await savePrefs();mass.complete=false;mass.candidates=[];$p('pp-mass-execute').disabled=true;$p('pp-mass-preview').textContent='Wykluczenia zapisane. Ponownie pobierz listę przed akcją.';toast('Zapisano ochronę członków.');
 });
 for(const id of ['pp-mass-action','pp-mass-scope','pp-mass-time'])admBind(id,()=>{if(id==='pp-mass-action')$p('pp-mass-time').closest('label').classList.toggle('hidden',admValue(id)!=='timeout');if(mass.complete)buildCandidatePreview();},'change');
 admBind('pp-mass-analyze',async()=>{
  if(mass.busy)return;mass.busy=true;mass.stop=false;mass.complete=false;mass.candidates=[];
  admBusyButton('pp-mass-analyze',true);$p('pp-mass-execute').disabled=true;
  const guild=admGuild();mass.guildId=guild;
  try{
   out('Sprawdzanie uprawnień i hierarchii…');
   mass.hierarchy=await resolveHierarchy(guild);
   if(!mass.hierarchy.highest)throw Error('Bot nie ma roli pozwalającej na moderację członków.');
   const result=await enumerateMembers(guild,n=>out(`Pobrano ${n} członków…`));
   if(guild!==idGuild())throw Error('W trakcie pobierania zmieniono serwer.');
   mass.members=result.list;mass.complete=result.complete;
   if(!result.complete)throw Error('Lista jest niepełna (limit 30 000). Masowa akcja została zablokowana.');
   buildCandidatePreview();out(`Pobrano ${result.list.length} członków. Sprawdź listę przed potwierdzeniem.`);
  }catch(e){mass.complete=false;$p('pp-mass-execute').disabled=true;out('Nie można przygotować akcji: '+e.message);warn(e);}
  finally{mass.busy=false;admBusyButton('pp-mass-analyze',false);}
 });
 admBind('pp-mass-stop',()=>{mass.stop=true;out('Żądanie zatrzymania — kończę bieżącą operację, nie wysyłam następnych.');});
 admBind('pp-mass-execute',async()=>{
  const guild=idGuild(),kind=admValue('pp-mass-action'),scope=admValue('pp-mass-scope');
  const candidates=[...mass.candidates],reason=admValue('pp-mass-reason').trim().slice(0,300)||'Masowa moderacja',duration=Number(admValue('pp-mass-time'));
  if(mass.busy||!mass.complete||guild!==mass.guildId||!candidates.length)return;
  if(admValue('pp-mass-confirm').trim()!==`WYKONAJ ${candidates.length}`)return toast('Niepoprawny tekst potwierdzenia.',true);
  if(scope==='all'&&!confirm('Wybrano WSZYSTKICH możliwych do ukarania członków, nie tylko uczestników raidu. Potwierdzasz?'))return;
  if(!confirm(`OSTATECZNE POTWIERDZENIE: ${actionNames[kind]} dla ${candidates.length} członków serwera?`))return;
  mass.busy=true;mass.stop=false;
  admBusyButton('pp-mass-execute',true);admBusyButton('pp-mass-stop',false);admBusyButton('pp-mass-analyze',true);
  let done=0,failed=0;const records=[];
  try{
   for(const person of candidates){
    if(mass.stop||guild!==state.guildId||!state.token)break;
    const id=person.user.id;
    try{await moderationAction(guild,id,kind,duration,reason);done++;records.push({id,action:actionNames[kind]+' (masowo)',reason,time:Date.now(),ok:true});}
    catch(e){failed++;records.push({id,action:actionNames[kind]+' (masowo)',reason,time:Date.now(),ok:false,error:String(e.message).slice(0,120)});}
    out(`${actionNames[kind]}: wykonano ${done}, błędy ${failed}, pozostało ${candidates.length-done-failed}.`);
    // Błędy 429 obsługuje api(); ograniczamy tempo także między udanymi żądaniami.
    await delay(600);
   }
  }finally{
   await appendHistory(records,guild);mass.busy=false;mass.complete=false;
   admBusyButton('pp-mass-stop',true);admBusyButton('pp-mass-analyze',false);
   out(`${mass.stop?'Przerwano.':'Zakończono.'} Wykonano: ${done}, nieudane: ${failed}. Pozostało: ${candidates.length-done-failed}. Raport zapisany lokalnie.`);
   if($p('pp-mass-execute'))$p('pp-mass-execute').disabled=true;
  }
 });
}
async function moderateOne(userId){
 if(!idGuild()||!sid(userId))return toast('Najpierw otwórz serwer.',true);
 const guild=idGuild();
 const dialog=mk('dialog','pp-dialog');dialog.innerHTML=`<form method="dialog"><h2>Moderacja użytkownika</h2><p class="pp-hint">${esc(userId)} — działanie na serwerze ${esc(state.guilds.get(guild)?.name||guild)}.</p><label class="pp-field"><span>Akcja</span><select id="pp-single-kind"><option value="timeout">Timeout</option><option value="untimeout">Zdejmij timeout</option><option value="kick">Kick</option><option value="ban">Ban</option></select></label><label class="pp-field"><span>Czas timeoutu</span><select id="pp-single-duration"><option value="600">10 minut</option><option value="3600">1 godzina</option><option value="86400">1 dzień</option><option value="604800">7 dni</option><option value="2419200">28 dni</option></select></label><label class="pp-field"><span>Powód</span><input id="pp-single-reason" maxlength="300" value="Moderacja z panelu"></label><div class="pp-dialog-actions"><button value="cancel">Anuluj</button><button id="pp-single-do" value="confirm" class="pp-danger">Wykonaj</button></div></form>`;
 document.body.append(dialog);dialog.showModal();
 const kind=dialog.querySelector('#pp-single-kind'),duration=dialog.querySelector('#pp-single-duration');
 kind.addEventListener('change',()=>duration.closest('label').classList.toggle('hidden',kind.value!=='timeout'));
 dialog.addEventListener('close',async()=>{
  if(dialog.returnValue!=='confirm'){dialog.remove();return;}
  const k=kind.value,d=Number(duration.value),reason=dialog.querySelector('#pp-single-reason').value.trim();dialog.remove();
  if(!confirm(`Wykonać ${k} wobec ${userId}?`))return;
  try{await moderationAction(guild,userId,k,d,reason);toast('Wykonano: '+k);await appendHistory([{id:userId,action:k,reason,time:Date.now(),ok:true}],guild);}
  catch(e){await appendHistory([{id:userId,action:k,reason,time:Date.now(),ok:false,error:e.message}],guild);warn(e);}
 });
}
async function historySettings(){
 const logs=await getLocal(historyKey(admGuild()),[]);
 adminHtml(admCard('Historia moderacji z panelu',admNote('Lokalne zapisy operacji wykonanych z tej wtyczki (maksymalnie 1000). Dziennik audytu Discorda pozostaje oddzielny. Na innym urządzeniu historia może być inna.')+
 admField('pp-history-filter','ID użytkownika lub akcja','','search','placeholder="Filtruj…"')+`<div id="pp-history-list">${historyRows(logs)}</div>`));
 admBind('pp-history-filter',()=>{const q=admValue('pp-history-filter').trim().toLowerCase();$p('pp-history-list').innerHTML=historyRows(logs.filter(x=>`${x.id} ${x.action} ${x.reason}`.toLowerCase().includes(q)));},'input');
}
async function showUserHistory(uid){const logs=await getLocal(historyKey(idGuild()),[]);showDrawer('Historia moderacji',view=>{view.append(mk('p','pp-hint',`Operacje z tego panelu dla użytkownika ${uid}.`));const content=mk('div');content.innerHTML=historyRows(logs.filter(r=>r.id===uid));view.append(content);});}
// Official Discord AutoMod rules. Kept separate from the existing bot's own AutoMod config.
async function autoModSettings(){
 const guild=admGuild();
 let rules=[];
 try{rules=await api(`/guilds/${guild}/auto-moderation/rules`);}catch(e){adminHtml(admCard('Discord AutoMod',`<p class="adm-error">${esc(e.message)}</p>${admNote('Wymagane zarządzanie serwerem. Reguły tego panelu należą do oficjalnego AutoMod Discorda, nie do automodu działającego w bocie.')}`));return;}
 const kind={1:'Blokada wiadomości',2:'Alert do kanału',3:'Timeout'};
 adminHtml(admCard('Reguły automatycznej moderacji Discorda',admNote('Oficjalny Discord AutoMod. Nie zmienia ustawień automodu Twojego bota na IceHost.')+
 `<div class="pp-rule-list">${rules.map((r,i)=>`<div class="pp-rule"><div><strong>${esc(r.name)}</strong><small>${r.enabled?'Aktywna':'Wyłączona'} · Wyzwalacz: ${esc(r.trigger_type)} · ${esc((r.actions||[]).map(x=>kind[x.type]||x.type).join(', '))}</small></div><div class="adm-actions">${admButton(r.enabled?'Wyłącz':'Włącz','pp-rule-toggle-'+i,'subtle')}${admButton('Edytuj słowa','pp-rule-edit-'+i,'subtle',r.trigger_type===1?'':'disabled')}${admButton('Usuń','pp-rule-del-'+i,'danger')}</div></div>`).join('')||'<p class="pp-hint">Nie ma jeszcze reguł.</p>'}</div>`)+
 admCard('Nowa reguła blokady słów',admField('pp-am-name','Nazwa','Blokada wyrażeń','text','maxlength="100"')+
 `<label class="adm-field"><span>Słowa lub frazy (po jednej w linii, maks. 1000)</span><textarea id="pp-am-words" rows="6" placeholder="przykładowe niedozwolone słowo"></textarea></label>`+
 admCheckbox('pp-am-enabled','Włącz regułę natychmiast',true)+admButton('Utwórz regułę','pp-am-create')));
 for(const [i,r] of rules.entries()){
  admBind('pp-rule-toggle-'+i,async()=>{try{await api(`/guilds/${guild}/auto-moderation/rules/${r.id}`,{method:'PATCH',body:JSON.stringify({enabled:!r.enabled})});toast('Zmieniono stan reguły.');autoModSettings();}catch(e){warn(e);}});
  admBind('pp-rule-del-'+i,async()=>{if(!confirm(`Nieodwracalnie usunąć regułę „${r.name}”?`))return;try{await api(`/guilds/${guild}/auto-moderation/rules/${r.id}`,{method:'DELETE'});toast('Usunięto regułę.');autoModSettings();}catch(e){warn(e);}});
  admBind('pp-rule-edit-'+i,()=>{
   const words=prompt('Słowa/frazy oddzielone przecinkiem:',(r.trigger_metadata?.keyword_filter||[]).join(', '));if(words===null)return;
   const filtered=words.split(',').map(w=>w.trim()).filter(Boolean).slice(0,1000);if(!filtered.length)return;
   api(`/guilds/${guild}/auto-moderation/rules/${r.id}`,{method:'PATCH',body:JSON.stringify({trigger_metadata:{...r.trigger_metadata,keyword_filter:filtered}})}).then(()=>{toast('Zapisano regułę.');autoModSettings();}).catch(warn);
  });
 }
 admBind('pp-am-create',async()=>{const name=admValue('pp-am-name').trim();const wordList=admValue('pp-am-words').split('\n').map(v=>v.trim()).filter(Boolean).slice(0,1000);
  if(!name||!wordList.length)return toast('Podaj nazwę i przynajmniej jedno wyrażenie.',true);
  try{await api(`/guilds/${guild}/auto-moderation/rules`,{method:'POST',body:JSON.stringify({name,event_type:1,trigger_type:1,trigger_metadata:{keyword_filter:wordList},actions:[{type:1}],enabled:admChecked('pp-am-enabled')})});toast('Utworzono regułę AutoMod.');autoModSettings();}catch(e){warn(e);}
 });
}
function showDrawer(title,fill){
 if(!panel){panel=mk('aside','pp-drawer');panel.id='pp-drawer';document.querySelector('.chat-area').append(panel);}
 panel.replaceChildren();panel.classList.remove('hidden');document.querySelector('.chat-area').classList.toggle('pp-members-open',title==='Członkowie serwera');
 const head=mk('header','pp-drawer-head');head.append(mk('strong','',title),button('✕',()=>closeDrawer(),'pp-close'));panel.append(head);
 const content=mk('div','pp-drawer-body');panel.append(content);fill(content);panelType=title;
 return content;
}
function closeDrawer(){panel?.classList.add('hidden');document.querySelector('.chat-area')?.classList.remove('pp-members-open');panelType='';}
async function fetchMemberBatch(){
 if(members.busy||members.complete||!idGuild()||members.guildId!==idGuild())return;
 members.busy=true;const guild=members.guildId;
 try{
  const batch=await api(`/guilds/${guild}/members?limit=1000${members.after?'&after='+members.after:''}`);
  if(guild!==idGuild())return;
  members.items.push(...batch);members.after=batch[batch.length-1]?.user?.id||null;members.complete=batch.length<1000;
  renderMemberPanel();
 }catch(e){showMemberError(e);}
 finally{members.busy=false;}
}
function showMemberError(e){const area=$p('pp-member-results');if(area)area.textContent='Nie można pobrać członków. Włącz Guild Members Intent w Discord Developer Portal. '+e.message;}
function memberRole(member){
 const roles=(member.roles||[]).map(id=>state.roles.get(id)).filter(Boolean).sort((a,b)=>(b.position||0)-(a.position||0));
 return roles;
}
function renderMemberPanel(){
 const area=$p('pp-member-results');if(!area||members.guildId!==idGuild())return;
 const q=($p('pp-member-search')?.value||'').trim().toLowerCase();area.replaceChildren();
 const roles=[...state.roles.values()].filter(r=>r.id!==idGuild()&&r.hoist).sort((a,b)=>(b.position||0)-(a.position||0));
 const groups=new Map([...roles.map(r=>[r.id,{name:r.name,role:r,people:[]}]),['other',{name:'Pozostali członkowie',role:null,people:[]}]]);
 for(const member of members.items){
  const user=member.user;if(!user?.id)continue;
  const name=member.nick||user.global_name||user.username||user.id;
  if(q&&!`${name} ${user.username} ${user.id}`.toLowerCase().includes(q))continue;
  const decorated=memberRole(member);
  const group=decorated.find(r=>r.hoist&&groups.has(r.id));
  groups.get(group?.id||'other').people.push({member,name,roles:decorated});
 }
 let rendered=0;
 for(const group of groups.values()){
  if(!group.people.length)continue;
  group.people.sort((a,b)=>a.name.localeCompare(b.name,'pl'));
  const section=mk('section','pp-roster-group');
  section.append(mk('div','pp-roster-group-title',`${group.name.toUpperCase()} — ${group.people.length}`));
  for(const {member,name,roles:decorated} of group.people){
   if(rendered>=800)break;
   rendered++;
   const row=button('',()=>openProfile(member.user.id),'pp-member pp-roster-member');row.title=`${name} · Otwórz profil`;row.dataset.userId=member.user.id;
   const avatar=mk('div','avatar pp-member-avatar');setAvatar(avatar,member.user,48);row.append(avatar);
   const meta=mk('div','pp-member-meta');const strong=mk('strong','',name);
   const color=decorated.find(r=>r.color>0);if(color)strong.style.color='#'+Number(color.color).toString(16).padStart(6,'0');
   meta.append(strong);row.append(meta);section.append(row);
  }
  area.append(section);
  if(rendered>=800)break;
 }
 if(!rendered)area.append(mk('p','pp-hint','Brak pasujących członków.'));
 if(rendered>=800)area.append(mk('p','pp-hint','Wyświetlono 800 osób. Użyj wyszukiwarki, aby zawęzić listę.'));
 window.BotPanelV12?.refreshPresenceRows?.();
 const counter=$p('pp-member-counter');if(counter)counter.textContent=`Pobrano ${members.items.length} ${members.complete?'z całego serwera':'· możesz wczytać więcej'}`;
 const load=$p('pp-member-more');if(load){load.disabled=members.complete||members.busy;load.classList.toggle('hidden',members.complete);}
}
function closeMemberDock(){
 if(memberDock)memberDock.classList.add('hidden');
 $p('pp-members-button')?.setAttribute('aria-pressed','false');
}
async function openMemberPanel(){
 if(!idGuild()||state.dmView)return;
 if(memberDock&&!memberDock.classList.contains('hidden')){closeMemberDock();return;}
 const guild=idGuild();
 if(!memberDock){memberDock=mk('aside','pp-member-dock');memberDock.id='pp-member-dock';memberDock.setAttribute('aria-label','Członkowie serwera');$p('chat-body-layout').append(memberDock);}
 memberDock.replaceChildren();memberDock.classList.remove('hidden');$p('pp-members-button')?.setAttribute('aria-pressed','true');
 const header=mk('header','pp-member-dock-head');header.append(mk('strong','','Członkowie'),button('✕',closeMemberDock,'pp-close'));memberDock.append(header);
 const search=field('','pp-member-search',{type:'search',placeholder:'Szukaj członka…'});search.classList.add('pp-roster-search');memberDock.append(search);
 const content=mk('div','pp-roster-scroll');memberDock.append(content);
 const results=mk('div','pp-members-list');results.id='pp-member-results';content.append(results);
 const footer=mk('footer','pp-member-dock-foot');const info=mk('small','pp-hint');info.id='pp-member-counter';footer.append(info);
 const more=button('Wczytaj więcej',()=>fetchMemberBatch(),'pp-button');more.id='pp-member-more';footer.append(more);memberDock.append(footer);
 search.querySelector('input').addEventListener('input',renderMemberPanel);
 if(members.guildId!==guild){members.guildId=guild;members.items=[];members.after=null;members.complete=false;}
 if(!members.items.length)await fetchMemberBatch();else renderMemberPanel();
}
async function jumpChannel(id){
 if(!idGuild()||state.dmView||!sid(id))return;
 if(!state.channels.some(c=>c.id===id)){
  try{const channel=await api(`/channels/${id}`);if(channel.guild_id!==idGuild())return toast('Ten kanał jest na innym serwerze.',true);
   if(!state.channels.some(c=>c.id===id))state.channels.push(channel);
  }catch(e){warn(e);return;}
 }
 const channel=state.channels.find(c=>c.id===id);
 if(channel?.type===4)return admOpen('channel',id);
 if([15,16].includes(channel?.type))return openThreads(channel.id);
 await selectChannel(id);
 closeDrawer();
}
function showRole(id){
 const role=state.roles.get(id);
 if(!role)return toast('Ta rola nie jest dostępna w panelu.',true);
 showDrawer('Rola na serwerze',body=>{
  body.append(mk('h3','',role.name),mk('p','pp-hint',`ID: ${role.id} · Pozycja: ${role.position} · Uprawnienia: ${role.permissions}`));
  if(role.color){const swatch=mk('div','pp-role-color');swatch.style.background='#'+role.color.toString(16).padStart(6,'0');body.append(swatch);}
  body.append(button('Otwórz zarządzanie rolami',()=>{closeDrawer();admOpen('server',null,'roles');}));
 });
}
// Threads and forum posts, including archived public threads.
async function openThreads(parentId=idGuild()&&!state.dmView?state.channelId:null){
 if(!idGuild())return;
 const guild=idGuild();
 const parent=state.channels.find(c=>c.id===parentId);
 showDrawer('Wątki i posty',body=>{
  const choices=mk('select','pp-control');choices.id='pp-thread-parent';
  const available=state.channels.filter(c=>[0,5,15,16].includes(c.type));
  for(const c of available){const op=mk('option','',`# ${c.name}`);op.value=c.id;choices.append(op);}
  if(parent&&available.some(c=>c.id===parent.id))choices.value=parent.id;
  body.append(mk('p','pp-hint','Wątki aktywne i publiczne archiwalne. Do zakładania nowych postów na forach potrzebne jest uprawnienie do wysyłania wiadomości.'));
  body.append(choices,button('Odśwież wątki',()=>listThreads(choices.value),'pp-button'));
  const create=section('Utwórz wątek / post');create.append(field('Tytuł','pp-thread-name',{placeholder:'Nazwa wątku',maxlength:100}),field('Pierwsza wiadomość (dla forum)','pp-thread-content',{type:'textarea',placeholder:'Treść posta'}));
  create.append(button('Utwórz',()=>createThread(choices.value),'pp-button'));body.append(create);
  const container=mk('div','pp-thread-list');container.id='pp-thread-list';body.append(container);
  choices.addEventListener('change',()=>listThreads(choices.value));
  listThreads(choices.value);
 });
}
async function listThreads(parent){
 const target=$p('pp-thread-list');if(!target||!sid(parent))return;
 target.textContent='Pobieranie wątków…';
 try{
  const [active,archived]=await Promise.all([
   api(`/guilds/${idGuild()}/threads/active`),api(`/channels/${parent}/threads/archived/public?limit=50`).catch(()=>({threads:[]}))
  ]);
  if(!$p('pp-thread-list'))return;
  const a=(active.threads||[]).filter(t=>t.parent_id===parent);
  const list=[...a,...(archived.threads||[])].filter((t,i,arr)=>arr.findIndex(v=>v.id===t.id)===i);
  target.replaceChildren();
  for(const thread of list){const row=button(`${thread.thread_metadata?.archived?'◷':'#'} ${thread.name}`,async()=>{
    try{if(!state.channels.some(c=>c.id===thread.id))state.channels.push(thread);await selectChannel(thread.id);closeDrawer();}catch(e){warn(e);}
   },'pp-thread-entry');target.append(row);}
  if(!list.length)target.textContent='Brak wątków w wybranym kanale.';
 }catch(e){target.textContent='Błąd: '+e.message;}
}
async function createThread(parentId){
 const channel=state.channels.find(c=>c.id===parentId);const name=$p('pp-thread-name')?.value.trim();const content=$p('pp-thread-content')?.value.trim();
 if(!channel||!name||name.length>100)return toast('Podaj nazwę i kanał.',true);
 let body;
 if([15,16].includes(channel.type)){
  if(!content)return toast('Post na forum wymaga pierwszej wiadomości.',true);
  body={name,auto_archive_duration:1440,message:{content,allowed_mentions:{parse:[]}}};
 }else body={name,type:12,invitable:false,auto_archive_duration:1440};
 try{const thread=await api(`/channels/${parentId}/threads`,{method:'POST',body:JSON.stringify(body)});if(thread?.id){state.channels.push(thread);renderChannels();await selectChannel(thread.id);closeDrawer();toast('Utworzono wątek.');}else throw Error('Brak wątku w odpowiedzi.');}
 catch(e){warn(e);}
}
async function threadFromMessage(message){
 if(!idGuild()||!sid(message?.id))return;
 const name=prompt('Nazwa nowego wątku:',String(message.content||'Nowy wątek').slice(0,85));if(!name?.trim())return;
 try{const t=await api(`/channels/${message.channel_id}/messages/${message.id}/threads`,{method:'POST',body:JSON.stringify({name:name.trim().slice(0,100),auto_archive_duration:1440})});state.channels.push(t);renderChannels();await selectChannel(t.id);toast('Utworzono wątek.');}
 catch(e){warn(e);}
}
// Pinned messages: Discord v10 2026 endpoints.
async function openPins(){
 if(!state.channelId)return;
 const channel=state.channelId;
 showDrawer('Przypięte wiadomości',body=>{body.append(mk('p','pp-hint','Wszystkie przypięte wiadomości w bieżącym kanale.'));const list=mk('div');list.id='pp-pins-list';body.append(list);});
 const list=$p('pp-pins-list');list.textContent='Pobieranie…';
 try{
  let before='',count=0,hasMore=true;
  list.replaceChildren();
  while(hasMore&&count<300&&channel===state.channelId){
   const query=`?limit=50${before?'&before='+enc(before):''}`;
   const response=await api(`/channels/${channel}/messages/pins${query}`);
   const items=response.items||[];
   for(const pin of items){
    const message=pin.message||pin;
    if(!sid(message.id))continue;
    const entry=mk('div','pp-pin-item');entry.append(mk('strong','',message.author?.global_name||message.author?.username||'Użytkownik'));
    entry.append(mk('p','',String(message.content||'Załącznik lub naklejka').slice(0,220)));
    entry.append(button('Przejdź',async()=>{closeDrawer();await selectChannel(channel,{around:message.id});},'pp-button'));
    list.append(entry);count++;
   }
   hasMore=!!response.has_more;
   before=items[items.length-1]?.pinned_at;
   if(!before||items.length===0)break;
  }
  if(!count)list.textContent='Brak przypiętych wiadomości.';
  if(hasMore)list.append(mk('p','pp-hint','Wyświetlono 300 najnowszych przypiętych wiadomości.'));
 }catch(e){list.textContent='Błąd: '+e.message;}
}
async function togglePin(message){
 const next=!message.pinned;try{
  await api(`/channels/${message.channel_id}/messages/pins/${message.id}`,{method:next?'PUT':'DELETE'});
  message.pinned=next;renderMessages();toast(next?'Przypięto wiadomość.':'Odpięto wiadomość.');
 }catch(e){warn(e);}
}
// Reaction picker and full reaction member list.
async function selectEmojiFor(message){
 showDrawer('Dodaj reakcję',async body=>{
  body.append(mk('p','pp-hint','Kliknij emoji, aby dodać reakcję.'));
  const grid=mk('div','pp-emoji-grid');body.append(grid);
  for(const item of '👍 ❤️ 😂 😮 😢 🔥 💯 🎉 ✅ ❌ 👀 🤔 😎 🙏 🤝 🫡 🥳 💀'.split(' '))grid.append(button(item,()=>toggleReaction(message,{name:item},false).then(()=>closeDrawer()),'pp-emoji-option'));
  if(!idGuild())return;
  try{
   const emojis=await api(`/guilds/${idGuild()}/emojis`);
   if(!panel||panelType!=='Dodaj reakcję')return;
   for(const item of emojis.slice(0,200)){
    const node=button('',()=>toggleReaction(message,{name:item.name,id:item.id,animated:item.animated},false).then(()=>closeDrawer()),'pp-emoji-option');
    const img=mk('img');img.alt=item.name;img.title=item.name;img.src=`https://cdn.discordapp.com/emojis/${item.id}.${item.animated?'gif':'webp'}?size=48`;
    node.append(img);grid.append(node);
   }
  }catch(_){/* public unicode emoji remain */}
 });
}
async function showReactionUsers(message,emoji){
 const name=emoji.id?`${emoji.name}:${emoji.id}`:emoji.name;
 showDrawer('Reakcja: '+(emoji.name||'emoji'),async body=>{
  const results=mk('div','pp-members-list');results.textContent='Pobieranie użytkowników…';body.append(results);
  try{
   const users=await api(`/channels/${message.channel_id}/messages/${message.id}/reactions/${enc(name)}?limit=100`);
   results.replaceChildren();
   for(const user of users){const b=button(user.global_name||user.username||user.id,()=>openProfile(user.id),'pp-member');results.append(b);}
   if(!users.length)results.textContent='Brak reakcji.';
   if(users.length===100)body.append(mk('p','pp-hint','Wyświetlono maksymalnie 100 użytkowników.'));
  }catch(e){results.textContent=e.message;}
 });
}
// Selection is limited to currently loaded messages: no silent deleting remote history.
function decorateMessages(){
 const target=$p('messages');if(!target)return;
 for(const row of target.querySelectorAll('.message-row')){
  if(row.dataset.ppDecorated)return;
  row.dataset.ppDecorated='1';
  const id=row.dataset.messageId;
  const msg=(state.messages.get(state.channelId)||[]).find(m=>m.id===id);
  if(!msg)continue;
  const cb=mk('input','pp-bulk-checkbox');cb.type='checkbox';cb.title='Zaznacz wiadomość';cb.checked=selection.has(id);
  cb.classList.toggle('hidden',!bulkMode);
  cb.addEventListener('change',()=>{if(cb.checked)selection.add(id);else selection.delete(id);refreshBulkBar();});
  row.prepend(cb);row.classList.toggle('pp-selected',selection.has(id));
  const acts=row.querySelector('.message-actions');if(acts){
   // v1.11: actions live in the compact three-dot menu, not the hover toolbar.
  }
  const reactionBtns=row.querySelectorAll('.reaction-item');
  (msg.reactions||[]).forEach((reaction,index)=>reactionBtns[index]?.addEventListener('contextmenu',e=>{e.preventDefault();showReactionUsers(msg,reaction.emoji);}));
 }
}
function startBulk(){
 if(!state.channelId||state.dmView)return toast('Zaznaczanie zbiorowe działa tylko na kanale serwera.',true);
 bulkMode=!bulkMode;selection.clear();
 refreshBulkBar();
 for(const x of $p('messages').querySelectorAll('.pp-bulk-checkbox'))x.classList.toggle('hidden',!bulkMode);
}
function refreshBulkBar(){
 let bar=$p('pp-bulk-bar');
 if(!bar){bar=mk('div','pp-bulk-bar');bar.id='pp-bulk-bar';$p('message-scroller').parentNode.append(bar);}
 bar.replaceChildren();bar.classList.toggle('hidden',!bulkMode);
 if(!bulkMode)return;
 bar.append(mk('strong','',`Zaznaczono ${selection.size} wiadomości`));
 bar.append(button('Usuń zaznaczone',()=>deleteSelected(),'pp-danger'));
 bar.append(button('Anuluj',()=>{bulkMode=false;selection.clear();refreshBulkBar();renderMessages();},'pp-button'));
}
async function deleteSelected(){
 const channel=state.channelId,guild=idGuild();if(!channel||!guild||!selection.size)return;
 const selected=(state.messages.get(channel)||[]).filter(m=>selection.has(m.id));
 if(!selected.length)return toast('Wybrane wiadomości nie są już w pamięci.',true);
 const recent=[],older=[];for(const msg of selected){
  const date=Number((BigInt(msg.id)>>22n)+1420070400000n);
  if(Date.now()-date<13.9*86400000)recent.push(msg.id);else older.push(msg.id);
 }
 if(!confirm(`Usunąć ${selected.length} wiadomości? ${recent.length} nowych zbiorczo i ${older.length} starszych pojedynczo. Operacja jest nieodwracalna.`))return;
 const log=[];let done=0,failed=0;
 for(let i=0;i<recent.length;i+=100){
  const batch=recent.slice(i,i+100);
  try{
   if(batch.length===1)await api(`/channels/${channel}/messages/${batch[0]}`,{method:'DELETE'});
   else await api(`/channels/${channel}/messages/bulk-delete`,{method:'POST',headers:auditHeader('Zbiorcze usuwanie wiadomości'),body:JSON.stringify({messages:batch})});
   done+=batch.length;for(const id of batch)removeIncomingMessage(channel,id);
  }catch(e){failed+=batch.length;log.push(e.message);}
 }
 for(const id of older){
  try{await api(`/channels/${channel}/messages/${id}`,{method:'DELETE'});done++;removeIncomingMessage(channel,id);}
  catch(e){failed++;log.push(e.message);}await delay(250);
 }
 bulkMode=false;selection.clear();refreshBulkBar();renderMessages();toast(`Usunięto ${done} wiadomości; błędy: ${failed}. ${log[0]||''}`,!!failed);
}
function popupMenu(event,actions){
 event.preventDefault();event.stopPropagation();
 if(!menu){menu=mk('div','pp-context');menu.id='pp-context';document.body.append(menu);}
 menu.replaceChildren();
 for(const item of actions){if(!item){menu.append(mk('hr'));continue;}
  menu.append(button(item[0],()=>{menu.classList.add('hidden');Promise.resolve().then(item[1]).catch(warn);},'pp-menu-item'));
 }
 menu.classList.remove('hidden');
 menu.style.left=Math.min(event.clientX,window.innerWidth-245)+'px';menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-8))+'px';
}
async function messageMenu(event,msg){
 popupMenu(event,[
 ['↩ Odpowiedz',()=>{state.selectedReply=msg;updateComposer();$p('message-input').focus();}],
 ['☺ Dodaj reakcję',()=>selectEmojiFor(msg)],
 ['👤 Otwórz profil',()=>openProfile(msg.author?.id)],
 ['☷ Nowy wątek',()=>threadFromMessage(msg)],
 ['📌 '+(msg.pinned?'Odepnij':'Przypnij'),()=>togglePin(msg)],
 null,
 ['☑ Zaznacz wiadomości',()=>{if(!bulkMode)startBulk();selection.add(msg.id);renderMessages();refreshBulkBar();}],
 ['🔗 Kopiuj link',()=>navigator.clipboard.writeText(`https://discord.com/channels/${idGuild()||'@me'}/${msg.channel_id}/${msg.id}`).then(()=>toast('Skopiowano link.'))],
 ['📋 Kopiuj ID',()=>navigator.clipboard.writeText(msg.id)],
 ...(msg.author?.id===state.me?.id?[['✎ Edytuj',()=>beginEdit(msg)]]:[]),
 ['⚠ Usuń wiadomość',()=>deleteMessage(msg)]
 ]);
}
function attachContextMenus(){
 $p('messages').addEventListener('contextmenu',e=>{
  if(e.target.closest('.reaction-item'))return;
  if(e.target.closest('.profile-link')){const userrow=e.target.closest('[data-message-id]');const usermsg=(state.messages.get(state.channelId)||[]).find(m=>m.id===userrow?.dataset.messageId);if(usermsg?.author?.id){popupMenu(e,[['👤 Profil użytkownika',()=>openProfile(usermsg.author.id)],['⚖ Moderuj',()=>moderateOne(usermsg.author.id)],['☷ Historia kar',()=>showUserHistory(usermsg.author.id)],['✉ Wiadomość prywatna',()=>startDm(usermsg.author.id)],['📋 Kopiuj ID',()=>navigator.clipboard.writeText(usermsg.author.id)]]);return;}}
  const row=e.target.closest('[data-message-id]');if(!row)return;
  const msg=(state.messages.get(state.channelId)||[]).find(m=>m.id===row.dataset.messageId);
  if(msg)messageMenu(e,msg);
 });
 $p('guild-title').addEventListener('contextmenu',e=>{if(!idGuild())return;popupMenu(e,[['⚙ Ustawienia serwera',()=>admOpen()],['♙ Członkowie',toggleMemberPreference],['⚠ Akcje masowe',()=>admOpen('server',null,'mass')],['📋 Kopiuj ID',()=>navigator.clipboard.writeText(idGuild())]]);});
 document.addEventListener('pointerdown',e=>{if(menu&&!e.target.closest('#pp-context'))menu.classList.add('hidden');});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'){menu?.classList.add('hidden');closeDrawer();}});
}
// Editor 1.10: compact Discord-like input. Formatting syntax continues to work.
const commonEmoji='😀 😃 😁 😂 🤣 😎 ❤️ 👍 👀 ✅ ❌ 🎉 🔥 😭 🤔 💀 🙏 🫡 🥳 😊 😮 😢 🥰 👋 💯 🚀'.split(' ');
function hideComposerPopover(){
 if(composerPopover){composerPopover.remove();composerPopover=null;}
 composerPopoverType='';
 for(const id of ['composer-emoji-button','composer-sticker-button'])$p(id)?.setAttribute('aria-expanded','false');
}
function insertComposerText(text){
 const input=$p('message-input');if(input.disabled)return;
 input.setRangeText(text,input.selectionStart,input.selectionEnd,'end');
 input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
}
async function sendSticker(sticker){
 const channel=state.channelId,reply=state.selectedReply;
 if(!channel||state.sending||$p('message-input').disabled)return toast('Nie można wysłać naklejki na ten kanał.',true);
 const payload={sticker_ids:[sticker.id],allowed_mentions:{parse:[],replied_user:false}};
 if(reply)payload.message_reference={message_id:reply.id,channel_id:channel,fail_if_not_exists:false};
 state.sending=true;updateComposer();
 try{
  const result=await api(`/channels/${channel}/messages`,{method:'POST',body:JSON.stringify(payload)});
  if(state.channelId===channel){
   if(state.selectedReply===reply)state.selectedReply=null;
   addIncomingMessage(result);scrollToBottom();
  }else addIncomingMessage(result);
  hideComposerPopover();
 }catch(e){toast('Nie wysłano naklejki: '+e.message,true);}
 finally{state.sending=false;updateComposer();}
}
function createPickerItem(item,kind){
 const b=mk('button','composer-picker-item');
 if(kind==='unicode')b.textContent=item;
 else{
  if(kind==='sticker'&&item.format_type===3){
   const placeholder=mk('span','sticker-lottie-placeholder','▧');b.append(placeholder);
   b.title=`${item.name} (Lottie — bez podglądu)`;
  }else{
   const img=mk('img');img.loading='lazy';img.alt=item.name;
   const ext=kind==='sticker'&&item.format_type===4?'gif':kind==='sticker'?'png':item.animated?'gif':'webp';
   img.src=kind==='sticker'?`https://cdn.discordapp.com/stickers/${item.id}.${ext}`:`https://cdn.discordapp.com/emojis/${item.id}.${ext}?size=64`;
   b.append(img);
  }
  if(kind==='sticker')b.append(mk('span','composer-sticker-name',item.name));
  b.title=item.name;
 }
 b.type='button';b.dataset.pickerName=kind==='unicode'?item:String(item.name||'');
 b.addEventListener('click',()=>{
  if(kind==='sticker')sendSticker(item);
  else {insertComposerText(kind==='unicode'?item:`<${item.animated?'a':''}:${item.name}:${item.id}>`);hideComposerPopover();}
 });
 return b;
}
async function toggleComposerPicker(type){
 if(composerPopover&&composerPopoverType===type){hideComposerPopover();return;}
 hideComposerPopover();
 composerPopoverType=type;
 const picker=mk('div','composer-picker');picker.setAttribute('role','dialog');picker.setAttribute('aria-label',type==='emoji'?'Wybierz emoji':'Wybierz naklejkę');
 composerPopover=picker;
 const heading=mk('header','composer-picker-head');heading.append(mk('strong','',type==='emoji'?'Emoji':'Naklejki'),button('✕',hideComposerPopover,'pp-close'));
 const input=mk('input','composer-picker-search');input.type='search';input.placeholder=type==='emoji'?'Szukaj emoji…':'Szukaj naklejki…';input.setAttribute('aria-label',input.placeholder);
 const grid=mk('div','composer-picker-grid');grid.append(mk('p','composer-picker-hint','Wczytywanie…'));
 picker.append(heading,input,grid);
 $p('composer-zone-anchor')?.append(picker);
 if(!picker.isConnected)document.querySelector('.composer-zone').append(picker);
 $p(type==='emoji'?'composer-emoji-button':'composer-sticker-button').setAttribute('aria-expanded','true');
 const cards=[];
 if(type==='emoji')for(const e of commonEmoji)cards.push(createPickerItem(e,'unicode'));
 const draw=()=>{if(composerPopover!==picker)return;const term=input.value.toLocaleLowerCase('pl').trim();grid.replaceChildren();
  const filtered=cards.filter(el=>!term||String(el.dataset.pickerName||'').toLocaleLowerCase('pl').includes(term));
  grid.append(...filtered);
  if(!filtered.length)grid.append(mk('p','composer-picker-hint','Brak pasujących elementów.'));
 };
 input.addEventListener('input',draw);draw();
 if(!idGuild()){
  if(type==='sticker'){grid.replaceChildren(mk('p','composer-picker-hint','Naklejki serwerowe są dostępne po wybraniu kanału serwera.'));}
  return;
 }
 const guild=idGuild();
 try{
  const items=await api(type==='emoji'?`/guilds/${guild}/emojis`:`/guilds/${guild}/stickers`);
  if(composerPopover!==picker||guild!==idGuild())return;
  for(const item of Array.isArray(items)?items:[]){
   if(!/^\d{16,22}$/.test(String(item.id||''))||item.available===false)continue;
   cards.push(createPickerItem(item,type));
  }
  draw();
 }catch(e){if(composerPopover===picker){draw();grid.prepend(mk('p','composer-picker-hint',`Nie udało się pobrać ${type==='emoji'?'emoji':'naklejek'}: ${e.message}`));}}
}
function buildEditor(){
 const composer=document.querySelector('.composer');composer.id='composer-zone-anchor';
 $p('composer-emoji-button').addEventListener('click',()=>toggleComposerPicker('emoji'));
 $p('composer-sticker-button').addEventListener('click',()=>toggleComposerPicker('sticker'));
 document.addEventListener('pointerdown',e=>{
  if(composerPopover&&!e.target.closest('.composer-picker,#composer-emoji-button,#composer-sticker-button'))hideComposerPopover();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hideComposerPopover();});
}
function updateDraftKey(){return `bp_draft_${state.me?.id||'bot'}_${state.channelId||'none'}`;}
let draftTimer=null,lastChannel=null;
function startDraftTracking(){
 $p('message-input').addEventListener('input',()=>{
  const key=updateDraftKey();clearTimeout(draftTimer);
  const val=$p('message-input').value;
  draftTimer=setTimeout(()=>storeLocal({[key]:val.slice(0,2000)}),500);
 });
}
async function restoreDraft(){
 const chan=state.channelId;if(!chan||!state.token)return;
 const text=await getLocal(updateDraftKey(),'');
 if(state.channelId===chan){$p('message-input').value=String(text||'').slice(0,2000);updateComposer();}
}
function updateAlertButton(){const b=$p('pp-alerts-button');if(b){b.textContent=settings.alerts?'🔔 Zdarzenia':'♧ Zdarzenia';b.title='Włącz/wyłącz komunikaty o zdarzeniach serwera';}}
function handleEvents(type,data){
 if(data?.guild_id===members.guildId&&memberDock&&!memberDock.classList.contains('hidden')){
  if(type==='GUILD_MEMBER_REMOVE'&&data.user?.id){members.items=members.items.filter(m=>m.user?.id!==data.user.id);renderMemberPanel();}
  if((type==='GUILD_MEMBER_ADD'||type==='GUILD_MEMBER_UPDATE')&&data.user?.id){
   const i=members.items.findIndex(m=>m.user?.id===data.user.id);
   if(i>=0)members.items[i]={...members.items[i],...data};
   else if(type==='GUILD_MEMBER_ADD')members.items.push(data);
   renderMemberPanel();
  }
 }
 if(type==='GUILD_AUDIT_LOG_ENTRY_CREATE'&&settings.alerts&&data.guild_id===idGuild()){
  toast('Zdarzenie serwera: '+(AUDIT_ACTIONS[data.action_type]||'Akcja #'+data.action_type));
 }
 if(['GUILD_BAN_ADD','GUILD_BAN_REMOVE','GUILD_MEMBER_REMOVE','AUTO_MODERATION_ACTION_EXECUTION'].includes(type)&&settings.alerts&&data.guild_id===idGuild()){
  toast('Powiadomienie: '+({'GUILD_BAN_ADD':'Nowy ban','GUILD_BAN_REMOVE':'Odbanowanie','GUILD_MEMBER_REMOVE':'Członek opuścił serwer','AUTO_MODERATION_ACTION_EXECUTION':'Akcja AutoMod'}[type]||type));
 }
}
// Original methods continue to own Discord Gateway and REST; wrappers only enrich UI.
const originalSelectGuild=selectGuild;
selectGuild=async function(id){switchingGuild=true;serverMenuClose();closeMemberDock();hideComposerPopover();showSearchResultsMode(false);setSearchPanel(false);try{await originalSelectGuild(id);if(idGuild()===id){await loadPrefs();members.guildId=null;closeDrawer();}}finally{switchingGuild=false;syncMemberDock();}};
const originalSelectChannel=selectChannel;
selectChannel=async function(id,opts={}){
 if(state.channelId!==id){
  if(state.channelId&&state.me?.id){const oldDraft=`bp_draft_${state.me.id}_${state.channelId}`;clearTimeout(draftTimer);await storeLocal({[oldDraft]:$p('message-input').value.slice(0,2000)});}
  selection.clear();bulkMode=false;refreshBulkBar();
 }
 const changed=state.channelId!==id;
 const result=await originalSelectChannel(id,opts);
 if(changed&&state.channelId===id)await restoreDraft();
 return result;
};
const originalSendMessage=sendMessage;
sendMessage=async function(){
 const channel=state.channelId,old=$p('message-input').value;
 await originalSendMessage();
 if(channel&&$p('message-input').value!==old){await storeLocal({[`bp_draft_${state.me?.id||'bot'}_${channel}`]:''});}
};
const originalHandleGateway=handleGatewayEvent;
handleGatewayEvent=function(type,data){originalHandleGateway(type,data);handleEvents(type,data);
 if(type==='MESSAGE_CREATE'&&data.channel_id){setTimeout(()=>saveUnread(),300);}
};
const originalAddIncoming=addIncomingMessage;
addIncomingMessage=function(msg){originalAddIncoming(msg);saveUnread();};
function saveUnread(){if(!state.me?.id)return;const unread=[...state.unread].filter(sid).slice(0,1500);storeLocal({[`bp_unread_${state.me.id}`]:unread});}
async function restoreUnread(){const list=await getLocal(`bp_unread_${state.me?.id}`,[]);if(Array.isArray(list)){for(const id of list.filter(sid))state.unread.add(id);renderChannels();window.BotPanelV12?.onChannelSwitch?.(state.channelId);}}
const originalSelectDmHome=selectDmHome;
selectDmHome=function(){switchingGuild=true;serverMenuClose();hideComposerPopover();setSearchPanel(false);try{originalSelectDmHome();closeDrawer();closeMemberDock();}finally{switchingGuild=false;}};

function showSearchResultsMode(results){
 $p('search-panel')?.classList.toggle('search-show-results',!!results);
 $p('search-back-button')?.classList.toggle('hidden',!results);
}
const originalRunSearch=runSearch;
runSearch=async function(append=false){
 if(!append){try{searchRequestParams();showSearchResultsMode(true);}catch(_){showSearchResultsMode(false);}}
 return originalRunSearch(append);
};

// Menu na nazwie serwera. Operacje pozostają w tym samym miejscu co na Discordzie.
function serverMenuClose(){const menu=$p('server-menu');if(menu)menu.classList.add('hidden');$p('server-menu-toggle')?.setAttribute('aria-expanded','false');}
function openServerMenu(){
 const box=$p('server-menu');if(!box)return;
 if(!box.classList.contains('hidden'))return serverMenuClose();
 box.replaceChildren();const guild=!!idGuild()&&!state.dmView;
 const add=(label,fn,cls='')=>{const b=button(label,async()=>{serverMenuClose();try{await fn();}catch(e){warn(e);}},'server-menu-entry '+cls);b.setAttribute('role','menuitem');box.append(b);};
 if(guild){
  add('⚙  Ustawienia serwera',()=>admOpen('server',null,'overview'));
  add('↻  Odśwież kanały i czat',async()=>{const g=idGuild();await loadChannels(g);if(state.channelId)await loadMessages(state.channelId,false);toast('Odświeżono kanały i wiadomości.');});
  add('♙  Pokaż / ukryj członków',toggleMemberPreference);
  add('🛡  Akcje masowe',()=>admOpen('server',null,'mass'));
  add(settings.alerts?'🔔  Wyłącz powiadomienia':'♧  Włącz powiadomienia',async()=>{settings.alerts=!settings.alerts;await savePrefs();updateAlertButton();});
  add('▣  Kopiuj ID serwera',()=>navigator.clipboard.writeText(idGuild()));
 }else if(state.dmView){add('✉  Nowa wiadomość',()=>{$p('dm-user-id').value='';$p('dm-dialog').showModal();});}
 else add('Wybierz serwer z listy po lewej',()=>{});
 box.classList.remove('hidden');$p('server-menu-toggle').setAttribute('aria-expanded','true');
}
// Avoid creating visual-only data or status claims before real API replies.
function init(){
 setupChatBodyLayout();buildEditor();startDraftTracking();attachContextMenus();
 $p('search-back-button').addEventListener('click',()=>{showSearchResultsMode(false);$p('search-text').focus();});
 document.addEventListener('pointerdown',e=>{
  if(panel&&!panel.classList.contains('hidden')&&!panel.contains(e.target)&&!e.target.closest('#pp-pins-button,#pp-threads-button'))closeDrawer();
 });
 for(const id of ['profile-dialog']){
  const dialog=$p(id);dialog.addEventListener('click',e=>{
   if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();
  });
 }

 $p('server-menu-toggle').addEventListener('click',openServerMenu);
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.server-header'))serverMenuClose();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')serverMenuClose();});
 $p('pp-members-button').addEventListener('click',toggleMemberPreference);
 $p('pp-pins-button').addEventListener('click',()=>{if(panelType==='Przypięte wiadomości'&&!panel?.classList.contains('hidden'))closeDrawer();else openPins();});
 $p('pp-threads-button').addEventListener('click',()=>{if(panelType==='Wątki i posty'&&!panel?.classList.contains('hidden'))closeDrawer();else openThreads();});
 $p('pp-alerts-button').addEventListener('click',async()=>{settings.alerts=!settings.alerts;await savePrefs();updateAlertButton();toast(settings.alerts?'Włączono powiadomienia w panelu.':'Wyłączono powiadomienia.');});
 $p('profile-dialog').querySelector('.dialog-actions')?.prepend(button('⚖ Moderuj',()=>{const id=state.profileUser?.id;$p('profile-dialog').close();moderateOne(id);},'pp-button'));
 $p('profile-dialog').querySelector('.dialog-actions')?.prepend(button('Historia',()=>{const id=state.profileUser?.id;$p('profile-dialog').close();showUserHistory(id);},'pp-button'));
 const check=()=>{
  if(state.me?.id&&init.loggedBot!==state.me.id){init.loggedBot=state.me.id;restoreUnread();loadPrefs();loadMemberVisibility();}
  const visible=!!state.guildId&&!state.dmView;
  if(!visible)closeMemberDock();else if(preferenceUser===state.me?.id)syncMemberDock();
  for(const id of ['pp-members-button','pp-threads-button','pp-alerts-button'])$p(id).classList.toggle('hidden',!visible);
  $p('pp-pins-button').classList.toggle('hidden',!state.channelId||[2,4,13,15,16].includes(activeChannel()?.type));
 };
 setInterval(check,1100);check();
}
window.PanelPlus={init,closeMemberDock,onSearchVisibilityChange,massRunning:()=>mass.busy,massSettings,autoModSettings,historySettings,decorateMessages,jumpChannel,showRole,moderateOne,openMemberPanel,startBulk,togglePin,threadFromMessage,reactionPicker:selectEmojiFor};
init();
})();
