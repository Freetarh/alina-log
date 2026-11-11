/* Google Calendar UI. All OAuth tokens are managed by the Supabase Edge Function. */
(function(){
'use strict';
let api=null, status=null, calendars=[],events=[], hiddenIds=new Set(), selectedCalendar='primary';
let loading=false,lastSharedSync=0,viewActive=false,familyPersonalEvents=[],hiddenKeywords=[];
const $=id=>document.getElementById(id);
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const day=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const clock=d=>d.toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'});
const state=()=>api?.getState()||{};
const errorText=e=>e?.message||String(e||'Ukendt fejl');
function notice(message,isError=false){if(!$('google-message'))return;$('google-message').textContent=message;$('google-message').classList.toggle('error',isError);}
async function call(action,options={}){
 if(!api?.client)throw new Error('Familielogin er ikke klar.');
 const {data,error}=await api.client.functions.invoke('google-calendar',{body:{action,...options}});
 if(error){
  let message=errorText(error);
  try{const info=await error.context?.json?.();if(info?.error)message=info.error;}catch{}
  throw new Error(message);
 }
 if(data?.error)throw new Error(data.error);
 return data||{};
}
function connectedUI(){
 const active=!!status?.connected,configured=!!status?.configured;
 $('google-connect').classList.toggle('hidden',!configured||active);
 $('google-disconnect').classList.toggle('hidden',!active);
 $('google-connected-options').classList.toggle('hidden',!active);
 $('google-setup').classList.toggle('hidden',configured);
 const text=active?'Forbundet: '+status.email:(configured?'Ingen Google-konto forbundet.':'Google-forbindelsen mangler Google Cloud-opsætning.');
 $('google-connection-label').textContent=text;
 $('google-shared-label').textContent=status?.shared?
  ('Fælles kalender: '+status.shared.name+(status.shared.owned_by_me?' · administreres af dig':' · administreres af din partner'))
  :'Ingen fælles Google-kalender valgt.';
 $('google-shared-select-wrap').classList.toggle('hidden',!active||Boolean(status?.shared&&!status.shared.owned_by_me));
 $('google-sync-shared').disabled=!status?.shared;
 $('google-sync-shared').classList.toggle('hidden',!status?.shared);
 $('google-google-account-hint').textContent=active?'Dine Google-aftaler deles kun, hvis du aktivt slår deling til. Enkeltstående aftaler kan skjules.':'';
 $('google-share-personal').checked=Boolean(status?.sharing?.enabled);
}
async function refreshStatus(){
 if(!state().family)return;
 try{
  status=await call('status');connectedUI();
  if(status.connected)await loadCalendars();
  else{events=[];calendars=[];renderPersonal();$('google-calendars').innerHTML='';}
  await loadFamilyPersonalEvents();
 }catch(e){notice('Kunne ikke hente status: '+errorText(e),true);}
}
async function loadCalendars(){
 if(!status?.connected)return;
 try{
  const data=await call('calendars');
  calendars=data.calendars||[];
  const choices=calendars.filter(c=>c.access_role!=='freeBusyReader'&&(!status.shared||c.id!==status.shared.calendar_id));
  const cached=status.sharing?.enabled?status.sharing.calendar_id:(localStorage.getItem('family-personal-google-calendar-'+(state().user?.id||''))||'primary');
  selectedCalendar=choices.some(c=>c.id===cached)?cached:(choices.find(c=>c.primary)?.id||choices[0]?.id||'primary');
  $('google-calendars').innerHTML=choices.map(c=>'<option value="'+escapeText(c.id)+'"'+(c.id===selectedCalendar?' selected':'')+'>'+escapeText(c.name)+(c.primary?' (primær)':'')+'</option>').join('');
  if(choices.length===0){selectedCalendar='primary';}
  $('google-share-personal').checked=Boolean(status.sharing?.enabled&&status.sharing.calendar_id===selectedCalendar);
  const sharedChoices=calendars.filter(c=>!c.primary&&c.writable);
  $('google-shared-select').innerHTML='<option value="">Vælg en separat kalender</option>'+sharedChoices.map(c=>'<option value="'+escapeText(c.id)+'">'+escapeText(c.name)+'</option>').join('');
  if(status.shared?.owned_by_me)$('google-shared-select').value=status.shared.calendar_id;
  await loadPersonalEvents();
 }catch(e){notice('Kunne ikke hente Google-kalendere: '+errorText(e),true);}
}
async function refreshHidden(){
 const userId=state().user?.id;if(!userId)return;
 const {data,error}=await api.client.from('google_hidden_events').select('event_id,calendar_id').eq('user_id',userId).eq('calendar_id',selectedCalendar);
 if(error)throw error;
 hiddenIds=new Set((data||[]).map(x=>x.event_id));
}
async function loadKeywordFilters(){
 const uid=state().user?.id;if(!uid)return;
 const {data,error}=await api.client.from('google_calendar_filters').select('hidden_keywords')
   .eq('user_id',uid).eq('calendar_id',selectedCalendar).maybeSingle();
 if(error)throw error;
 hiddenKeywords=(data?.hidden_keywords||[]).map(x=>String(x).trim()).filter(Boolean);
 $('google-hide-keywords').value=hiddenKeywords.join(', ');
}
function isKeywordHidden(e){
 const name=String(e.summary||'').toLowerCase();
 return hiddenKeywords.some(word=>name.includes(word.toLowerCase()));
}
async function saveKeywordFilters(){
 const uid=state().user?.id;if(!uid)return;
 const raw=$('google-hide-keywords').value;
 const words=[...new Set(raw.split(/[,\n;]/).map(x=>x.trim()).filter(Boolean))];
 if(words.length>20||words.join(',').length>800){notice('Du kan gemme højst 20 nøgleord og maksimalt 800 tegn.',true);return;}
 try{
  const {error}=await api.client.from('google_calendar_filters').upsert({
   user_id:uid,calendar_id:selectedCalendar,hidden_keywords:words,updated_at:new Date().toISOString()
  },{onConflict:'user_id,calendar_id'});
  if(error)throw error;
  hiddenKeywords=words;renderPersonal();await loadFamilyPersonalEvents();
  notice('Nøgleordsfilteret er gemt.');
 }catch(e){notice('Kunne ikke gemme filter: '+errorText(e),true);}
}

async function loadPersonalEvents(){
 if(!status?.connected||!viewActive||!$('google-show-personal').checked)return;
 if(loading)return;
 loading=true;
 $('google-personal-list').innerHTML='<div class="empty">Henter dine Google-aftaler…</div>';
 try{
  await Promise.all([refreshHidden(),loadKeywordFilters()]);
  const data=await call('events',{calendar_id:selectedCalendar,day:$('calendar-day').value});
  if(!status?.connected)return;
  events=data.events||[];renderPersonal();
 }catch(e){$('google-personal-list').innerHTML='<div class="empty">'+escapeText(errorText(e))+'</div>';}
 finally{loading=false;}
}
function renderPersonal(){
 const target=$('google-personal-list');
 if(!target)return;
 if(!status?.connected||!$('google-show-personal').checked){
  target.innerHTML='<div class="empty">Dine Google-aftaler er skjult i visningen.</div>';return;
 }
 const selectedDay=$('calendar-day').value,showHidden=$('google-show-hidden').checked;
 const filtered=events.filter(e=>e.all_day?e.starts_at.slice(0,10)===selectedDay:day(new Date(e.starts_at))===selectedDay)
  .filter(e=>showHidden||(!hiddenIds.has(e.id)&&!isKeywordHidden(e)));
 $('google-personal-count').textContent=filtered.length+' personlige Google-aftaler';
 if(!filtered.length){target.innerHTML='<div class="empty">Ingen Google-aftaler vises denne dag.</div>';return;}
 target.innerHTML=filtered.map(e=>{
  const hidden=hiddenIds.has(e.id),byKeyword=isKeywordHidden(e);
  const d=new Date(e.starts_at);
  const when=e.all_day?'Hele dagen':clock(d);
  return '<div class="calendar-item"><div class="calendar-body"><div class="calendar-title">'+escapeText(e.summary)+'</div>'+
   '<div class="calendar-meta">'+escapeText(when)+' · Kun din Google-konto</div>'+
   (hidden?'<span class="pill-tag">Skjult manuelt</span>':'')+
   (byKeyword?'<span class="pill-tag">Skjult af nøgleord</span>':'')+'</div>'+
   (byKeyword?'<div class="calendar-actions"><span class="subtle small">Ret nøgleordsfilteret for at vise</span></div>':
   '<div class="calendar-actions"><button type="button" class="tiny-btn" data-google-hide="'+escapeText(e.id)+'">'+(hidden?'Vis':'Skjul')+'</button></div>')+'</div>';
 }).join('');
}
async function toggleHidden(eventId){
 const uid=state().user?.id;if(!uid)return;
 try{
  const isHidden=hiddenIds.has(eventId);
  const query=isHidden?
    api.client.from('google_hidden_events').delete().eq('user_id',uid).eq('calendar_id',selectedCalendar).eq('event_id',eventId):
    api.client.from('google_hidden_events').insert({user_id:uid,calendar_id:selectedCalendar,event_id:eventId});
  const {error}=await query;if(error)throw error;
  if(isHidden)hiddenIds.delete(eventId);else hiddenIds.add(eventId);
  renderPersonal();await loadFamilyPersonalEvents();
 }catch(e){notice('Kunne ikke ændre synlighed: '+errorText(e),true);}
}

async function loadFamilyPersonalEvents(){
 if(!viewActive||!state().family||!status?.configured)return;
 try{
  const result=await call('family-events',{day:$('calendar-day').value});
  familyPersonalEvents=result.events||[];
  renderFamilyPersonalEvents();
  if(result.unavailable)notice('En delt Google-kalender kunne ikke hentes. Ejeren kan muligvis skulle forbinde sin konto igen.',true);
 }catch(e){$('google-family-list').innerHTML='<div class="empty">'+escapeText(errorText(e))+'</div>';}
}
function renderFamilyPersonalEvents(){
 const target=$('google-family-list');if(!target)return;
 const currentDay=$('calendar-day').value,me=state().user?.id;
 const items=familyPersonalEvents.filter(e=>e.all_day?e.starts_at.slice(0,10)===currentDay:day(new Date(e.starts_at))===currentDay);
 $('google-family-count').textContent=items.length+' delte Google-aftaler';
 if(!items.length){target.innerHTML='<div class="empty">Ingen Google-aftaler er delt med familien på denne dato.</div>';return;}
 target.innerHTML=items.map(e=>{
  const when=e.all_day?'Hele dagen':clock(new Date(e.starts_at));
  const label=e.source_user_id===me?'Delt fra din Google-kalender':'Delt fra din partners Google-kalender';
  return '<div class="calendar-item"><div class="calendar-body"><div class="calendar-title">'+escapeText(e.summary)+'</div><div class="calendar-meta">'+escapeText(when)+' · '+escapeText(label)+'</div></div></div>';
 }).join('');
}
async function setPersonalShare(enable,calendarId=selectedCalendar){
 const u=state().user,f=state().family;if(!u||!f)return false;
 if(enable&&!confirm('Du deler nu alle aftaler fra den valgte Google-kalender med din partner, undtagen skjulte aftaler og aftaler markeret private i Google. Fortsæt?'))return false;
 try{
  const {error}=await api.client.from('google_personal_share_settings').upsert({
   user_id:u.id,family_id:f.id,calendar_id:calendarId,share_enabled:enable,updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error)throw error;
  status.sharing={enabled:enable,calendar_id:calendarId};
  $('google-share-personal').checked=enable;
  notice(enable?'Din valgte Google-kalender deles nu med familien.':'Deling af din personlige Google-kalender er slået fra.');
  await loadFamilyPersonalEvents();
  return true;
 }catch(e){notice('Kunne ikke ændre Google-deling: '+errorText(e),true);return false;}
}

async function syncShared(force=false){
 if(!status?.shared||!state().family||loading)return;
 if(!force&&Date.now()-lastSharedSync<5*60*1000)return;
 lastSharedSync=Date.now();
 $('google-sync-shared').disabled=true;
 notice('Synkroniserer fælles Google-kalender…');
 try{
  const result=await call('sync-shared');
  notice('Google synkroniseret: '+result.imported+' nye, '+result.updated+' opdaterede og '+(result.removed||0)+' fjernede aftaler.');
  api?.reloadCalendar?.();
 }catch(e){lastSharedSync=0;notice('Synkronisering fejlede: '+errorText(e),true);}
 finally{$('google-sync-shared').disabled=false;}
}
async function connect(){
 try{
  notice('Forbereder forbindelse til Google…');
  const result=await call('authorize');
  if(!result.url?.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'))throw new Error('Ugyldig Google-adresse.');
  window.location.assign(result.url);
 }catch(e){notice('Kunne ikke starte Google-login: '+errorText(e),true);}
}
async function disconnect(){
 if(!confirm('Fjern din Google-forbindelse fra familiedashboardet? Eksisterende familieaftaler bliver ikke slettet.'))return;
 try{
  await call('disconnect');status=null;events=[];hiddenIds=new Set();
  await refreshStatus();notice('Din Google-konto er frakoblet.');
 }catch(e){notice(errorText(e),true);}
}
async function setShared(){
 const id=$('google-shared-select').value;
 if(!id)return notice('Vælg først en separat Google-kalender.',true);
 const c=calendars.find(x=>x.id===id);
 if(!c||c.primary)return notice('Den primære kalender kan ikke være familiens fælles kalender.',true);
 if(!confirm('Alle aftaler fra "'+c.name+'" vil blive vist for begge i familiedashboardet. Fortsæt kun, hvis kalenderen ikke indeholder private oplysninger.'))return;
 try{
  await call('set-shared',{calendar_id:id});
  await refreshStatus();await syncShared(true);notice('Den fælles Google-kalender er tilsluttet.');
 }catch(e){notice('Kunne ikke vælge fælles kalender: '+errorText(e),true);}
}
// Health visits can create shared events before the Calendar tab has been opened.
async function ensureSharedStatus(){
 if(status?.shared||!state().family)return;
 status=await call('status');
 connectedUI();
}
async function syncLocal(id){
 try{
  await ensureSharedStatus();
  if(!status?.shared)return {synced:false};
  return await call('push-family',{id});
 }catch(e){return {synced:false,error:errorText(e)};}
}
async function deleteLocal(id){
 try{
  await ensureSharedStatus();
  if(!status?.shared)return {synced:false};
  return await call('delete-family',{id});
 }catch(e){return {synced:false,error:errorText(e)};}
}
function onCalendarView(){
 viewActive=true;
 void refreshStatus().then(()=>{if(status?.shared)void syncShared(false);});
}
function onDateChange(){
 if(viewActive&&status?.connected)void loadPersonalEvents();
 if(viewActive)void loadFamilyPersonalEvents();
}
function init(options){
 api=options;
 const returned=new URL(window.location.href);
 const query=returned.searchParams.get('google_calendar');
 if(query){
  returned.searchParams.delete('google_calendar');
  window.history.replaceState(null,'',returned.pathname+returned.search+returned.hash);
  const messages={connected:'Google-kontoen er forbundet.',cancelled:'Google-login blev afbrudt.',expired:'Google-login udløb. Prøv igen.',"setup-required":'Google-opsætningen mangler.',"google-error":'Google kunne ikke tilsluttes.',"refresh-required":'Google returnerede ikke den nødvendige adgang. Prøv igen.'};
  notice(messages[query]||'Google-login er afsluttet.');
 }
 $('google-connect').addEventListener('click',()=>void connect());
 $('google-disconnect').addEventListener('click',()=>void disconnect());
 $('google-status-refresh').addEventListener('click',()=>void refreshStatus());
 $('google-show-personal').addEventListener('change',()=>{if($('google-show-personal').checked)void loadPersonalEvents();else renderPersonal();});
 $('google-show-hidden').addEventListener('change',renderPersonal);
 $('google-save-filters').addEventListener('click',()=>void saveKeywordFilters());
 $('google-share-personal').addEventListener('change',async()=>{
   const requested=$('google-share-personal').checked;
   const ok=await setPersonalShare(requested);
   if(!ok)$('google-share-personal').checked=Boolean(status?.sharing?.enabled);
 });
 $('google-calendars').addEventListener('change',async()=>{
  const next=$('google-calendars').value;
  if(status?.sharing?.enabled){
    const ok=await setPersonalShare(false,status.sharing.calendar_id);
    if(!ok){$('google-calendars').value=selectedCalendar;return;}
  }
  selectedCalendar=next;
  localStorage.setItem('family-personal-google-calendar-'+(state().user?.id||''),selectedCalendar);
  $('google-share-personal').checked=false;
  void loadPersonalEvents();
 });
 $('google-personal-list').addEventListener('click',e=>{
  const el=e.target.closest('[data-google-hide]');
  if(el)void toggleHidden(el.dataset.googleHide);
 });
 $('google-shared-save').addEventListener('click',()=>void setShared());
 $('google-sync-shared').addEventListener('click',()=>void syncShared(true));
 connectedUI();renderPersonal();
}
function reset(){
 status=null;calendars=[];events=[];familyPersonalEvents=[];hiddenIds=new Set();hiddenKeywords=[];selectedCalendar='primary';viewActive=false;loading=false;lastSharedSync=0;
 if(api){notice('');$('google-hide-keywords').value='';connectedUI();renderPersonal();renderFamilyPersonalEvents();}
}
window.GoogleCalendarModule={init,onCalendarView,onDateChange,reset,syncLocal,deleteLocal};
})();