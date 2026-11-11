/* Additional family dashboard modules. Existing baby-log code remains in index.html. */
(function () {
'use strict';
let api=null, calendarEvents=[], eventEditing=null, loadingEvents=false;
const byId=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const day=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dateTime=d=>day(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const formatDay=d=>d.toLocaleDateString('da-DK',{day:'numeric',month:'short',year:'numeric'});
const formatTime=d=>d.toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'});
const context=()=>api?.getState()||{};
function renderWeights(){
 if(window.GrowthModule)return window.GrowthModule.renderWeights();
 const chart=byId('weight-plot');if(!chart)return;
 const records=(context().entries||[]).filter(e=>e.kind==='weight'&&Number.isFinite(Number(e.grams))&&Number.isFinite(Date.parse(e.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const filter=byId('weight-period').value;
 const cutoff=filter==='all'?-Infinity:Date.now()-Number(filter)*86400000;
 const pts=records.filter(e=>Date.parse(e.at)>=cutoff);
 const summary=byId('weight-summary'),list=byId('weight-list');
 if(!pts.length){
  chart.innerHTML='<div class="empty">Ingen vejninger i denne periode. Registrér en vægt for at starte kurven.</div>';
  summary.innerHTML='<div class="weight-stat"><span>Målinger</span><strong>0</strong></div>';
  list.innerHTML='';return;
 }
 const first=pts[0],last=pts[pts.length-1],delta=Number(last.grams)-Number(first.grams);
 summary.innerHTML='<div class="weight-stat"><span>Seneste vejning</span><strong>'+Number(last.grams).toLocaleString('da-DK')+' g</strong></div>'+
 '<div class="weight-stat"><span>Ændring i perioden</span><strong>'+(delta>0?'+':'')+delta.toLocaleString('da-DK')+' g</strong></div>';
 const W=620,H=270,L=59,R=18,T=22,B=40,minTime=Date.parse(first.at),maxTime=Date.parse(last.at);
 const nums=pts.map(e=>Number(e.grams)),lo=Math.min(...nums),hi=Math.max(...nums),pad=Math.max(80,(hi-lo)*.18);
 const minY=Math.max(0,lo-pad),maxY=hi+pad,span=maxY-minY||1;
 const x=t=>minTime===maxTime?W/2:L+(Date.parse(t)-minTime)/(maxTime-minTime)*(W-L-R);
 const y=n=>T+(maxY-n)/span*(H-T-B);
 let svg='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Alinas registrerede vægt over tid">';
 for(let i=0;i<=4;i++){const g=minY+(maxY-minY)*i/4,yy=y(g);svg+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#e0eae7"/><text x="'+(L-8)+'" y="'+(yy+4)+'" font-size="13" text-anchor="end" fill="#607781">'+Math.round(g)+'</text>';}
 if(pts.length>1)svg+='<polyline fill="none" stroke="#176e76" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+pts.map(p=>x(p.at).toFixed(2)+','+y(Number(p.grams)).toFixed(2)).join(' ')+'"/>';
 pts.forEach(p=>{svg+='<circle cx="'+x(p.at).toFixed(2)+'" cy="'+y(Number(p.grams)).toFixed(2)+'" r="4.7" fill="#176e76"><title>'+esc(formatDay(new Date(p.at)))+': '+Number(p.grams)+' g</title></circle>';});
 svg+='<text x="'+L+'" y="'+(H-11)+'" font-size="13" text-anchor="start" fill="#607781">'+esc(formatDay(new Date(first.at)))+'</text>';
 svg+='<text x="'+(W-R)+'" y="'+(H-11)+'" font-size="13" text-anchor="end" fill="#607781">'+esc(formatDay(new Date(last.at)))+'</text></svg>';
 chart.innerHTML=svg;
 list.innerHTML=pts.slice(-8).reverse().map(p=>'<div class="item"><div class="item-main"><div class="item-title">'+Number(p.grams).toLocaleString('da-DK')+' g</div><div class="item-sub">'+esc(formatDay(new Date(p.at)))+(p.note?' · '+esc(p.note):'')+'</div></div></div>').join('');
}
function clearCalendarForm(){
 eventEditing=null;byId('calendar-form').reset();byId('calendar-form-heading').textContent='Ny aftale';
 byId('calendar-submit').textContent='Gem aftale';byId('calendar-cancel').classList.add('hidden');
 byId('event-kind').value='appointment';byId('event-visibility').value='family';byId('event-visibility').querySelector('option[value="private"]').disabled=false;byId('event-family-visible').checked=true;
 const chosen=byId('calendar-day').value||day(new Date()),now=new Date(),begin=new Date(chosen+'T'+(chosen===day(now)?String(now.getHours()).padStart(2,'0'):'09')+':00:00');
 byId('event-start').value=dateTime(begin);byId('event-end').value=dateTime(new Date(begin.getTime()+3600000));
 byId('calendar-form-notice').textContent='';
}
function changeKindDefaults(){
 const special=byId('event-kind').value!=='appointment';
 byId('event-family-visible').checked=!special;
 byId('event-visibility').value=special?'private':'family';
}
function renderCalendar(){
 const dayValue=byId('calendar-day').value||day(new Date());
 const showHidden=byId('calendar-show-hidden').checked;
 const showPrivate=byId('calendar-show-private').checked;
 const candidates=calendarEvents.filter(e=>!e.google_removed_at&&day(new Date(e.starts_at))===dayValue);
 const visible=candidates.filter(e=>e.visibility==='private'?showPrivate:(e.show_on_family_calendar||showHidden));
 const target=byId('calendar-list');if(!target)return;
 byId('calendar-count').textContent=visible.length+' vises'+(candidates.length>visible.length?' · '+(candidates.length-visible.length)+' skjult':'');
 if(!visible.length){target.innerHTML='<div class="empty">Ingen synlige aftaler denne dag. Du kan vælge at vise skjulte eller private aftaler ovenfor.</div>';return;}
 const currentUser=context().user?.id;
 target.innerHTML=visible.map(e=>{
  const start=new Date(e.starts_at),end=new Date(e.ends_at),owner=e.created_by===currentUser||e.visibility==='family';
  const tags=(e.visibility==='private'?'<span class="pill-tag">Privat</span>':(!e.show_on_family_calendar?'<span class="pill-tag">Skjult fra overblik</span>':'<span class="pill-tag">Fælles</span>'));
  const type={appointment:'Aftale',reminder:'Påmindelse',medication:'Medicin / tilskud'}[e.kind]||'Aftale';
  return '<div class="calendar-item"><div class="calendar-body"><div class="calendar-title">'+esc(e.title)+'</div><div class="calendar-meta">'+(e.google_all_day?'Hele dagen':esc(formatTime(start))+'–'+esc(formatTime(end)))+' · '+type+'</div>'+
   (e.details?'<div class="calendar-meta">'+esc(e.details)+'</div>':'')+tags+'</div>'+
   (owner?'<div class="calendar-actions"><button type="button" class="tiny-btn" data-event-edit="'+esc(e.id)+'">Ret</button><button type="button" class="tiny-btn" data-event-delete="'+esc(e.id)+'">Slet</button></div>':'')+'</div>';
 }).join('');
}
async function refreshCalendar(){
 const {family}=context();if(!family||!api||loadingEvents)return;
 loadingEvents=true;
 try {
  const {data,error}=await api.client.from('family_events').select('id,family_id,created_by,title,details,starts_at,ends_at,kind,visibility,show_on_family_calendar,google_event_id,google_calendar_id,google_dirty,google_all_day,google_removed_at').eq('family_id',family.id).order('starts_at',{ascending:true}).limit(2000);
  if(error)throw error;
  if(context().family?.id!==family.id)return;
  calendarEvents=data||[];renderCalendar();
  byId('calendar-status').textContent='Familiekalenderen er synkroniseret med Supabase.';
 }catch(e){byId('calendar-status').textContent='Kunne ikke opdatere kalenderen: '+(e.message||String(e));}
 finally{loadingEvents=false;}
}
async function saveCalendar(e){
 e.preventDefault();const {user,family}=context();if(!user||!family)return;
 const title=byId('event-title').value.trim(),start=new Date(byId('event-start').value),end=new Date(byId('event-end').value);
 if(!title||title.length>120||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start){byId('calendar-form-notice').textContent='Kontrollér titel og start- og sluttidspunkt.';return;}
 const button=byId('calendar-submit');button.disabled=true;byId('calendar-form-notice').textContent='Gemmer…';
 const row={
  family_id:family.id,title,details:byId('event-details').value.trim().slice(0,500),
  starts_at:start.toISOString(),ends_at:end.toISOString(),kind:byId('event-kind').value,
  visibility:byId('event-visibility').value,show_on_family_calendar:byId('event-family-visible').checked,
  updated_at:new Date().toISOString(),
  google_dirty:byId('event-visibility').value==='family'&&byId('event-family-visible').checked
 };
 try{
  let query;
  if(eventEditing)query=api.client.from('family_events').update(row).eq('id',eventEditing).eq('family_id',family.id).select('id');
  else query=api.client.from('family_events').insert({...row,created_by:user.id}).select('id');
  const {data,error}=await query;if(error)throw error;if(!data?.length)throw new Error('Aftalen blev ikke gemt. Kontrollér adgang.');
  const googleSync=row.visibility==='family'&&row.show_on_family_calendar ?
    await window.GoogleCalendarModule?.syncLocal(data[0].id):null;
  byId('calendar-day').value=day(start);clearCalendarForm();await refreshCalendar();
  byId('calendar-form-notice').textContent=googleSync?.error?
    'Aftalen er gemt i familiedashboardet. Google-synkronisering fejlede: '+googleSync.error:
    googleSync?.synced?'Aftalen er gemt og synkroniseret til Google.':'Aftalen er gemt i familiedashboardet.';
 }catch(error){byId('calendar-form-notice').textContent='Kunne ikke gemme aftalen: '+(error.message||String(error));}
 finally{button.disabled=false;}
}
function handleCalendarList(e){
 const edit=e.target.closest('[data-event-edit]'),del=e.target.closest('[data-event-delete]');
 if(!edit&&!del)return;
 const id=edit?.dataset.eventEdit||del?.dataset.eventDelete;
 const event=calendarEvents.find(x=>x.id===id);if(!event||(event.created_by!==context().user?.id&&event.visibility!=='family'))return;
 if(edit){
  eventEditing=id;byId('calendar-form-heading').textContent='Ret aftale';byId('calendar-submit').textContent='Gem ændringer';byId('calendar-cancel').classList.remove('hidden');
  byId('event-title').value=event.title;byId('event-start').value=dateTime(new Date(event.starts_at));byId('event-end').value=dateTime(new Date(event.ends_at));
  byId('event-kind').value=event.kind;byId('event-details').value=event.details||'';byId('event-visibility').value=event.visibility;
  byId('event-family-visible').checked=event.show_on_family_calendar;byId('event-visibility').querySelector('option[value="private"]').disabled=event.created_by!==context().user?.id||Boolean(event.google_event_id);byId('calendar-form-notice').textContent='';
  byId('calendar-form').scrollIntoView({behavior:'smooth',block:'start'});return;
 }
 if(!confirm('Slet aftalen "'+event.title+'"'+(event.google_event_id?' både i dashboardet og på den fælles Google-kalender':'')+'?'))return;
 (async()=>{
  try{
   if(event.google_event_id){
    const result=await window.GoogleCalendarModule?.deleteLocal(id);
    if(!result?.synced)throw new Error(result?.error||'Kan ikke slette Google-kopien, før forbindelsen til den fælles Google-kalender er aktiv.');
   }
   const {error}=await api.client.from('family_events').delete().eq('id',id).eq('family_id',context().family.id);
   if(error)throw error;
   await refreshCalendar();
  }catch(error){byId('calendar-status').textContent='Kunne ikke slette: '+(error.message||String(error));}
 })();
}
function init(config){
 api=config;
 byId('calendar-day').value=day(new Date());
 clearCalendarForm();
 byId('weight-period').addEventListener('change',renderWeights);
 byId('calendar-day').addEventListener('change',()=>{clearCalendarForm();renderCalendar();window.GoogleCalendarModule?.onDateChange();});
 for(const [id,delta] of [['calendar-prev',-1],['calendar-next',1]]){
  byId(id).addEventListener('click',()=>{const d=new Date((byId('calendar-day').value||day(new Date()))+'T12:00:00');d.setDate(d.getDate()+delta);byId('calendar-day').value=day(d);clearCalendarForm();renderCalendar();window.GoogleCalendarModule?.onDateChange();});
 }
 byId('calendar-today').addEventListener('click',()=>{byId('calendar-day').value=day(new Date());clearCalendarForm();renderCalendar();window.GoogleCalendarModule?.onDateChange();});
 byId('calendar-show-hidden').addEventListener('change',renderCalendar);
 byId('calendar-show-private').addEventListener('change',renderCalendar);
 byId('event-kind').addEventListener('change',changeKindDefaults);
 byId('calendar-form').addEventListener('submit',saveCalendar);
 byId('calendar-cancel').addEventListener('click',clearCalendarForm);
 byId('calendar-list').addEventListener('click',handleCalendarList);
 byId('calendar-refresh').addEventListener('click',refreshCalendar);
 byId('weight-register').addEventListener('click',()=>{config.go('registrer');document.querySelector('[data-kind="weight"]')?.click();});
 renderWeights();renderCalendar();
}
function reset(){
 calendarEvents=[];eventEditing=null;loadingEvents=false;
 if(api){clearCalendarForm();renderCalendar();renderWeights();}
}
window.FamilyDashboard={init,refresh:()=>{renderWeights();void refreshCalendar();},onView:name=>{if(name==='kalender')void refreshCalendar();if(name==='vaegt')renderWeights();},beginNewEvent:()=>{if(api)clearCalendarForm();},reset};
})();