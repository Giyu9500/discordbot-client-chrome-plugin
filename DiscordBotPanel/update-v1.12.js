'use strict';
/* Version 1.12: focused UI and API additions; no external dependencies. */
(() => {
  const $ = id => document.getElementById(id);
  const escape = val => String(val ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid = v => /^\d{16,22}$/.test(String(v||''));
  const storage = (name) => `v12_${name}_${state.me?.id||'anonymous'}`;
  const save = (key,value) => chrome.storage.local.set({[storage(key)]:value}).catch(()=>{});
  const load = async (key,defaultValue) => {try {const item=await chrome.storage.local.get(storage(key));return item[storage(key)]??defaultValue;}catch{return defaultValue;}};
  const create = (tag,cls,text) => {const e=document.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=text;return e;};
  const readLast = new Map();let bannerChannel=null,readReady=false,latestKnown=null;
  let lastProfilePointer={x:Math.round(innerWidth/2),y:110}, profilePositionPending=false;
  const presences=state.memberPresences;
  function setReadBanner(enabled){const box=$('v12-unread-banner');if(!box)return;box.classList.toggle('hidden',!enabled);}
  function markRead(channelId=state.channelId){
    if(!channelId)return;
    const list=state.messages.get(channelId)||[];
    const newest=list.at(-1)?.id||readLast.get(channelId)||null;
    if(newest)readLast.set(channelId,newest);
    state.unread.delete(channelId);if(bannerChannel===channelId)bannerChannel=null;
    setReadBanner(false);renderChannels();
    save('read_markers',Object.fromEntries(readLast));
    save('unread', [...state.unread]);
    chrome.storage.local.set({[`bp_unread_${state.me?.id}`]:[...state.unread]}).catch(()=>{});
  }
  async function restoreReadMarkers(){
    const saved=await load('read_markers',{});
    for(const [channel,id] of Object.entries(saved||{}))if(valid(channel)&&valid(id))readLast.set(channel,id);
    readReady=true;
    if(state.channelId && state.messages.has(state.channelId))onMessagesLoaded(state.channelId,state.messages.get(state.channelId));
  }
  function onChannelSwitch(id){bannerChannel=state.unread.has(id)?id:null;setReadBanner(!!bannerChannel);const ch=state.channels.find(c=>c.id===id)||state.dmChannels.get(id);$('v12-invite')?.classList.toggle('hidden', !state.guildId||state.dmView||!ch||ch.type===1);}
  function onMessagesLoaded(id,batch){
    if(id!==state.channelId||!readReady)return;
    const newest=state.messages.get(id)?.at(-1)?.id;
    const old=readLast.get(id);
    if(newest && old && BigInt(newest)>BigInt(old)) {state.unread.add(id);bannerChannel=id;}
    else if(newest && !old && !state.unread.has(id)){readLast.set(id,newest);save('read_markers',Object.fromEntries(readLast));}
    if(state.unread.has(id)) bannerChannel=id;
    setReadBanner(bannerChannel===id);
  }
  function onUnread(channel){save('unread',[...state.unread]);}
  function onIncomingCurrent(message){
    if(message.channel_id!==state.channelId)return;
    if(!bannerChannel){const old=readLast.get(message.channel_id);if(old)bannerChannel=message.channel_id;}
    if(bannerChannel){state.unread.add(message.channel_id);setReadBanner(true);}
  }
  function forceMarkRead(){markRead();scrollToBottom();}
  function updatePagination(page,total,hasResults){
    const node=$('v12-search-pages');if(!node)return;
    node.replaceChildren();const count=Math.max(0,Math.min(400,Math.ceil(total/25)));
    if(!count)return;
    const button=(label,target,disabled=false,current=false)=>{
      const b=create('button','v12-page'+(current?' current':''),label);b.type='button';b.disabled=disabled;
      b.addEventListener('click',()=>{if(target!==page)runSearch(true,target).then(()=>{$('search-results').scrollTop=0;});});node.append(b);
    };
    button('‹',page-1,page===0);
    const pages=new Set([0,count-1,...Array.from({length:5},(_,i)=>page+i-2).filter(i=>i>=0&&i<count)]);
    let prev=-2;for(const i of [...pages].sort((a,b)=>a-b)){if(i>prev+1)node.append(create('span','v12-page-ellipsis','…'));button(String(i+1),i,false,i===page);prev=i;}
    button('›',page+1,page>=count-1 || !hasResults);
    node.append(create('span','v12-page-count',`Strona ${page+1} z ${count}`));
  }
  function setupInvite(){
    const btn=$('v12-invite');btn.addEventListener('click',()=>{
      if(!state.guildId||!state.channelId||state.dmView)return toast('Wybierz kanał serwera.',true);
      const old=$('v12-invite-modal');if(old){old.remove();return;}
      const box=create('div','v12-invite-pop');box.id='v12-invite-modal';
      box.innerHTML=`<strong>Zaproś osoby</strong><p>Utwórz zaproszenie do tego kanału</p><label>Ważność<select id="v12-invite-age"><option value="3600">1 godzina</option><option value="21600">6 godzin</option><option value="43200">12 godzin</option><option value="86400" selected>1 dzień</option><option value="604800">7 dni</option><option value="0">Bezterminowo</option></select></label><label>Limit użyć<select id="v12-invite-uses"><option value="0">Bez limitu</option><option value="1">1 raz</option><option value="5">5 razy</option><option value="10">10 razy</option><option value="25">25 razy</option><option value="100">100 razy</option></select></label><button type="button" class="primary-button" id="v12-create-invite">Utwórz i skopiuj link</button>`;
      document.body.append(box);
      const anchor=btn.getBoundingClientRect();box.style.left=Math.max(10,Math.min(innerWidth-320,anchor.left))+'px';box.style.top=Math.min(innerHeight-280,anchor.bottom+8)+'px';
      box.querySelector('#v12-create-invite').addEventListener('click',async()=>{
        const b=$('v12-create-invite');b.disabled=true;
        try{const invite=await api(`/channels/${state.channelId}/invites`,{method:'POST',body:JSON.stringify({max_age:+$('v12-invite-age').value,max_uses:+$('v12-invite-uses').value,unique:true})});
          await navigator.clipboard.writeText('https://discord.gg/'+invite.code);toast('Skopiowano zaproszenie.');box.remove();}
        catch(e){toast('Nie można utworzyć zaproszenia: '+e.message,true);b.disabled=false;}
      });
    });
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('#v12-invite,#v12-invite-modal'))$('v12-invite-modal')?.remove();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')$('v12-invite-modal')?.remove();});
  }
  function setupProfile(){
    document.addEventListener('pointerdown',e=>{
      const possible=e.target.closest('.pp-roster-member,.message-avatar,.message-author,.profile-link,.v12-person,.search-result-author');
      if(possible){lastProfilePointer={x:e.clientX,y:e.clientY};profilePositionPending=true;}
      if($('profile-dialog')?.open && !e.target.closest('#profile-dialog') && !possible && (!window.BotPanelV121 || window.BotPanelV121.canCloseProfile())){$('profile-dialog').close();}
    },true);
    const original=openProfile;
    openProfile=async function(...args){
      await original(...args);
      const dialog=$('profile-dialog');if(!dialog.open)return;
      // Convert the modal into a native non-modal profile popover.
      if(dialog.matches(':modal')){dialog.close();dialog.show();}
      const x=Math.max(8,Math.min(innerWidth-378,lastProfilePointer.x+18));
      const y=Math.max(8,Math.min(innerHeight-dialog.offsetHeight-12,lastProfilePointer.y-25));
      dialog.style.position='fixed';dialog.style.margin='0';dialog.style.left=x+'px';dialog.style.top=y+'px';
      dialog.classList.add('v12-profile-popover');profilePositionPending=false;
    };
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && $('profile-dialog')?.open && (!window.BotPanelV121 || window.BotPanelV121.canCloseProfile()))$('profile-dialog').close();});
  }
  let inPresenceLogin=false;
  function setupPresence(){
    $('v12-presence-intent').addEventListener('change',e=>{
      state.presenceIntent=e.target.checked;
      chrome.storage.local.set({v12_presence_enabled:state.presenceIntent}).catch(()=>{});
    });
    chrome.storage.local.get('v12_presence_enabled').then(v=>{
      state.presenceIntent=v.v12_presence_enabled !== false;
      $('v12-presence-intent').checked=state.presenceIntent;
    });
    // User changes login toggle before a Gateway connection: session respects selected value.
    $('login-form').addEventListener('submit',()=>{state.presenceIntent=$('v12-presence-intent').checked;state.presenceFallback=false;},true);
    const base=handleGatewayEvent;
    handleGatewayEvent=function(type,data){
      base(type,data);
      if(type==='PRESENCE_UPDATE'&&data.guild_id===state.guildId){
        refreshPresenceRows();
      }
      if(type==='GUILD_CREATE' && data.id===state.guildId && Array.isArray(data.presences))refreshPresenceRows();
    };
  }
  function presenceLine(p){
    if(!p)return null;
    const activity=(p.activities||[]).find(a=>a.type===4)|| (p.activities||[]).find(a=>a.type!==4);
    if(!activity)return null;
    if(activity.type===4)return activity.state||activity.name||null;
    const verb={0:'Gra w',1:'Streamuje',2:'Słucha',3:'Ogląda',5:'Rywalizuje w'}[activity.type]||'Aktywność';
    return `${verb} ${activity.name||''}`.trim();
  }
  function refreshPresenceRows(){
    const roster=$('pp-member-results');if(!roster)return;
    // Existing role grouping is retained; only offline members move into the final group.
    const sections=[...roster.querySelectorAll('.pp-roster-group')];
    let offline=roster.querySelector('.v12-offline-group');
    if(offline)offline.remove();
    offline=create('section','pp-roster-group v12-offline-group');
    const title=create('div','pp-roster-group-title','OFFLINE');offline.append(title);
    let count=0;
    for(const section of sections){
      if(section.classList.contains('v12-offline-group'))continue;
      for(const person of [...section.querySelectorAll('.pp-roster-member')]){
        const match=(person.title||'').match(/\b\d{16,22}\b/);
        const uid=person.dataset.userId||match?.[0];
        const pr=presences.get(uid);
        if(!state.presenceIntent||!pr){person.classList.add('v12-presence-unknown');continue;}
        let status=pr.status||'offline';if(!['online','idle','dnd'].includes(status))status='offline';
        const ava=person.querySelector('.pp-member-avatar');if(ava){let dot=ava.querySelector('.v12-presence-dot');if(!dot){dot=create('i','v12-presence-dot');ava.append(dot);}dot.dataset.status=status;}
        const line=presenceLine(pr);let lineNode=person.querySelector('.v12-activity');if(lineNode)lineNode.remove();
        if(line && status!=='offline'){lineNode=create('small','v12-activity',line);lineNode.title=line;person.querySelector('.pp-member-meta')?.append(lineNode);}
        if(status==='offline'){offline.append(person);count++;}
      }
    }
    if(count){title.textContent=`OFFLINE — ${count}`;roster.append(offline);}
  }
  // Roster is rendered by enhancements.js; that module calls refreshPresenceRows directly.
  if(typeof renderMemberPanel==='function'){
    const baseRoster=renderMemberPanel;
    renderMemberPanel=function(...args){baseRoster(...args);
      // Match cached rows to IDs by unique labels without guessing status.
      const section=$('pp-member-results');if(!section)return;
      for(const row of section.querySelectorAll('.pp-roster-member')){
        const name=row.querySelector('.pp-member-meta strong')?.textContent;
        if(!name)continue;
        const item=typeof members==='object' ? members.items.find(m=>(m.nick||m.user?.global_name||m.user?.username||m.user?.id)===name):null;
        if(item)row.dataset.userId=item.user.id;
      }
      refreshPresenceRows();
    };
  }
  function onDocReady(){
    setupInvite();setupProfile();setupPresence();
    $('v12-read-now').addEventListener('click',forceMarkRead);
    $('message-scroller').addEventListener('wheel',e=>{if(e.deltaY>0&&bannerChannel===state.channelId)forceMarkRead();},{passive:true});
    $('message-scroller').addEventListener('touchstart',e=>{latestKnown=e.touches[0]?.clientY;},{passive:true});
    $('message-scroller').addEventListener('touchmove',e=>{if(latestKnown!=null&&e.touches[0]?.clientY<latestKnown-18&&bannerChannel===state.channelId)forceMarkRead();},{passive:true});
    const baseSend=sendMessage;
    sendMessage=async function(...args){const channel=state.channelId,old=$('message-input').value,hasFile=!!state.file;const res=await baseSend(...args);if(channel && ((old && !$('message-input').value) || (hasFile && !state.file)))markRead(channel);return res;};
    let currentUser='';setInterval(()=>{if(state.me?.id && state.me.id!==currentUser){currentUser=state.me.id;readReady=false;readLast.clear();restoreReadMarkers();}},900);
  }
  window.BotPanelV12={onChannelSwitch,onMessagesLoaded,onUnread,onIncomingCurrent,preserveUnread:id=>state.unread.has(id),updatePagination,markRead,refreshPresenceRows};
  onDocReady();
})();
