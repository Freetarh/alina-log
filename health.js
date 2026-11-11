/* Alinas sundhedskalender.
   Sources (reviewed November 2026):
   https://www.sst.dk/boernevaccination
   https://www.sundhed.dk/borger/patienthaandbogen/boern/illustrationer/praesentationer/boerneundersoegelser-oversigt/
   Bookings are NEVER inferred from the recommendations.
*/
(function(){
"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const BIRTH="2026-10-06",birth=new Date(BIRTH+"T12:00:00");
const day=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const dstr=s=>new Date(s+"T12:00:00");
const date=s=>new Date(s).toLocaleDateString("da-DK",{day:"numeric",month:"short",year:"numeric"});
const time=s=>new Date(s).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
const localDateTime=s=>{const d=new Date(s);return day(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
const monthFrom=(base,offset)=>{const d=new Date(base.getFullYear(),base.getMonth()+offset,1,12);d.setDate(Math.min(base.getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return d;};
const offsetDate=(months,days)=>{const d=monthFrom(birth,months||0);if(days)d.setDate(d.getDate()+days);return day(d);};
const standards=[
 {key:"exam-5w",title:"5-ugers børneundersøgelse",kind:"doctor",days:35,detail:"Forebyggende undersøgelse hos egen læge. Ingen rutinevaccination."},
 {key:"vax-3m",title:"3-måneders vaccination",kind:"vaccination",months:3,detail:"DiTeKiPol-Hib og pneumokok. Vaccination hos egen læge."},
 {key:"exam-vax-5m",title:"5-måneders undersøgelse og vaccination",kind:"combined",months:5,detail:"Forebyggende børneundersøgelse samt DiTeKiPol-Hib og pneumokok."},
 {key:"exam-vax-12m",title:"12-måneders undersøgelse og vaccination",kind:"combined",months:12,detail:"Forebyggende børneundersøgelse samt DiTeKiPol-Hib og pneumokok."},
 {key:"mfr-15m",title:"15-måneders MFR-vaccination",kind:"vaccination",months:15,detail:"Første MFR-vaccination mod mæslinger, fåresyge og røde hunde."},
 {key:"exam-2y",title:"2-års børneundersøgelse",kind:"doctor",months:24,detail:"Forebyggende børneundersøgelse hos egen læge."},
 {key:"exam-3y",title:"3-års børneundersøgelse",kind:"doctor",months:36,detail:"Forebyggende børneundersøgelse hos egen læge."},
 {key:"exam-mfr-4y",title:"4-års undersøgelse og MFR",kind:"combined",months:48,detail:"Forebyggende børneundersøgelse og anden MFR-vaccination."},
 {key:"exam-vax-5y",title:"5-års undersøgelse og vaccination",kind:"combined",months:60,detail:"Forebyggende børneundersøgelse og revaccination mod difteri, stivkrampe, kighoste og polio."},
 {key:"hpv-12y-1",title:"12-års HPV-vaccination, 1. dosis",kind:"vaccination",months:144,detail:"HPV-vaccination. Tidspunkt for anden dosis aftales efter den første."},
 {key:"hpv-12y-2",title:"HPV-vaccination, 2. dosis",kind:"vaccination",months:150,detail:"Vejledende ca. 6 måneder efter første dosis, men mindst 5 måneder imellem. Aftal det præcise tidspunkt med lægen."}
];
const kindLabels={doctor:"Lægeundersøgelse",vaccination:"Vaccination",combined:"Undersøgelse + vaccination",health_visitor:"Sundhedsplejerske",followup:"Opfølgende kontrol",other:"Andet"};
let api=null,rows=[],selected=null,filter="next",loading=false,epoch=0,last=0,active=false;
const ctx=()=>api?.getState()||{};
function expected(template,records){
 if(template.key==="hpv-12y-2"){
  const first=records.find(x=>x.milestone_key==="hpv-12y-1");
  if(first?.completed_on)return day(monthFrom(dstr(first.completed_on),6));
  if(first?.booked_start)return day(monthFrom(new Date(first.booked_start),6));
 }
 return offsetDate(template.months,template.days);
}
function aggregate(records=rows){
 const byKey=new Map(records.filter(x=>x.milestone_key).map(x=>[x.milestone_key,x]));
 const official=standards.map(t=>{
  const stored=byKey.get(t.key)||{};
  return {...stored,template:t,milestone_key:t.key,title:t.title,visit_kind:t.kind,
   expected_on:expected(t,records),detail:t.detail,standard:true};
 });
 const custom=records.filter(x=>!x.milestone_key).map(x=>({...x,standard:false,detail:""}));
 return [...official,...custom].sort((a,b)=>{
  const aa=a.booked_start?day(new Date(a.booked_start)):(a.expected_on||"9999-12-31");
  const bb=b.booked_start?day(new Date(b.booked_start)):(b.expected_on||"9999-12-31");
  return aa.localeCompare(bb)||a.title.localeCompare(b.title,"da");
 });
}
function nextSummary(records=rows){
 const all=aggregate(records).filter(x=>!x.completed_on);
 const x=all[0];if(!x)return null;
 const due=x.booked_start?day(new Date(x.booked_start)):x.expected_on;
 const today=day(new Date());
 return {key:x.milestone_key||x.id,title:x.title,booked:Boolean(x.booked_start),
  when:due,dateLabel:due?date(due+"T12:00:00"):"Dato ikke angivet",
  needsReview:Boolean(due&&due<today&&!x.booked_start),isStandard:x.standard};
}
function note(message,isError=false){
 const n=$("health-notice");if(n){n.textContent=message;n.classList.toggle("error",isError);}
}
function root(){
 $("health-module").innerHTML=
 '<div class="panel health-intro"><div class="sectionhead"><h2>Alinas sundhedskalender</h2><button class="btn soft" data-health-refresh type="button">Opdater</button></div>'+
 '<p class="fineprint">Vejledende datoer er beregnet fra fødslen 6. oktober 2026. Det er <strong>ikke</strong> bookede tider. Bestil selv tid hos lægen og markér først en vaccination som gennemført, når den faktisk er givet.</p>'+
 '<div id="health-summary" class="health-summary"></div><div class="health-filters">'+
 '<button type="button" data-health-filter="next" class="health-filter is-active" aria-pressed="true">Aktuelle og kommende</button>'+
 '<button type="button" data-health-filter="all" class="health-filter" aria-pressed="false">Hele forløbet</button></div>'+
 '<div id="health-list" class="health-list"></div>'+
 '<div class="health-extra-actions"><button type="button" class="btn soft" data-health-add="health_visitor">+ Sundhedsplejerske</button>'+
 '<button type="button" class="btn soft" data-health-add="followup">+ Ekstra kontrol</button>'+
 '<button type="button" class="btn soft" data-health-add="other">+ Anden aftale</button></div>'+
 '<p id="health-notice" class="section-notice" role="status"></p></div>'+
 '<details id="health-editor" class="panel health-editor">'+
 '<summary id="health-editor-summary">Registrér eller rediger besøg <span aria-hidden="true">›</span></summary>'+
 '<div class="health-editor-content"><form id="health-form"><div class="field"><label for="health-title">Besøg</label><input id="health-title" maxlength="120" required></div>'+
 '<div class="form-grid"><div class="field"><label for="health-kind">Type</label><select id="health-kind">'+
 Object.entries(kindLabels).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join("")+'</select></div>'+
 '<div class="field"><label for="health-expected">Vejledende eller ønsket dato</label><input id="health-expected" type="date"></div></div>'+
 '<div class="field"><label for="health-booked">Faktisk booket dato og tidspunkt</label><input id="health-booked" type="datetime-local"><p class="help">Udfyld kun hvis I har bestilt en tid. Aftalen kommer ikke i familiekalenderen, før I vælger det.</p></div>'+
 '<div class="form-grid"><div class="field"><label for="health-length">Varighed i minutter</label><input id="health-length" type="number" min="10" max="240" step="5" value="30"></div>'+
 '<div class="field"><label for="health-completed">Gennemført den</label><input id="health-completed" type="date"><p class="help">Lad feltet være tomt, indtil besøget har fundet sted.</p></div></div>'+
 '<div class="field"><label for="health-notes">Egne noter (valgfrit)</label><textarea id="health-notes" maxlength="2000" rows="3" placeholder="Fx besked fra sundhedsplejersken eller spørgsmål til lægen"></textarea></div>'+
 '<p class="fineprint">Noter deles med familiens medlemmer i dashboardet. Undlad følsomme oplysninger, som I ikke ønsker at dele.</p>'+
 '<div class="row"><button type="submit" class="btn primary" id="health-save">Gem registrering</button>'+
 '<button type="button" class="btn soft" id="health-cancel">Annuller</button></div></form></div></details>'+
 '<div class="panel health-sources"><h2>Officielle kilder</h2>'+
 '<p class="fineprint">Programmet kan ændres. Brug altid den aktuelle information fra sundhedsmyndighederne, og følg eventuelle individuelle anvisninger fra lægen.</p>'+
 '<div class="health-source-links"><a href="https://www.sst.dk/boernevaccination" rel="noopener" target="_blank">Sundhedsstyrelsen: vaccinationer</a>'+
 '<a href="https://www.sundhed.dk/borger/patienthaandbogen/boern/illustrationer/praesentationer/boerneundersoegelser-oversigt/" rel="noopener" target="_blank">Sundhed.dk: børneundersøgelser</a>'+
 '<a href="https://www.sundhed.dk/borger/patienthaandbogen/boern/undersoegelser/besoeg-af-sundhedsplejersken/" rel="noopener" target="_blank">Sundhed.dk: sundhedsplejen</a></div></div>';
}
function stamp(value){
 if(!value)return "Tidspunkt ikke angivet";
 return date(value)+" kl. "+time(value);
}
function status(item){
 if(item.completed_on)return {text:"Gennemført",type:"done",detail:date(item.completed_on+"T12:00:00")};
 if(item.booked_start)return {text:"Booket",type:"booked",detail:stamp(item.booked_start)};
 const expectedOn=item.expected_on;
 if(!expectedOn)return {text:"Ikke booket",type:"pending",detail:"Dato endnu ikke fastlagt"};
 const today=day(new Date());
 return {text:"Vejledende",type:"pending",detail:date(expectedOn+"T12:00:00")+(expectedOn<today?" · kontrollér om gennemført":"")};
}
function draw(){
 if(!$("health-list"))return;
 const all=aggregate(),done=all.filter(x=>x.completed_on).length,custom=rows.filter(x=>!x.milestone_key).length;
 $("health-summary").innerHTML='<div><strong>'+done+'</strong><span>registreret gennemført</span></div>'+
 '<div><strong>'+standards.length+'</strong><span>standardbesøg</span></div>'+
 '<div><strong>'+custom+'</strong><span>egne besøg</span></div>';
 for(const btn of $("health-module").querySelectorAll("[data-health-filter]")){
  const on=btn.dataset.healthFilter===filter;btn.classList.toggle("is-active",on);btn.setAttribute("aria-pressed",String(on));
 }
 const upcoming=all.filter(x=>!x.completed_on);
 const featured=upcoming.slice(0,6);
 // Include newly added family-specific visits even without a known date.
 for(const extra of upcoming.filter(x=>!x.standard&&!featured.includes(x)).slice(0,3))featured.push(extra);
 const activeRows=filter==="next"?featured:all;
 const target=$("health-list");
 target.innerHTML=activeRows.length?activeRows.map(x=>{
  const st=status(x);
  const when=x.expected_on?date(x.expected_on+"T12:00:00"):"Dato ikke angivet";
  const key=x.standard?x.milestone_key:x.id;
  const linked=Boolean(x.calendar_event_id);
  return '<article class="health-visit" data-health-key="'+safe(key)+'">'+
    '<div class="health-visit-top"><div><span class="health-category">'+safe(kindLabels[x.visit_kind]||kindLabels.other)+'</span>'+
    '<h3>'+safe(x.title)+'</h3></div><span class="health-tag '+st.type+'">'+st.text+'</span></div>'+
    '<div class="health-visit-meta"><span><strong>Forventet:</strong> '+safe(when)+'</span>'+
    '<span><strong>'+(x.completed_on?"Gennemført:":x.booked_start?"Booket:":"Status:")+'</strong> '+safe(st.detail)+'</span></div>'+
    (x.detail?'<p class="health-description">'+safe(x.detail)+'</p>':"")+
    (x.notes?'<p class="health-description"><strong>Notat:</strong> '+safe(x.notes)+'</p>':"")+
    '<div class="health-actions"><button type="button" class="tiny-btn" data-health-edit="'+safe(key)+'">'+(x.booked_start?"Ret tid / noter":"Angiv tid / noter")+'</button>'+
    (x.completed_on?'<button type="button" class="tiny-btn" data-health-toggle="'+safe(key)+'">Fortryd gennemført</button>':
    '<button type="button" class="tiny-btn" data-health-toggle="'+safe(key)+'">Markér gennemført</button>')+
    (x.booked_start&&!linked?'<button type="button" class="tiny-btn" data-health-calendar="'+safe(key)+'">Til familiekalender</button>':"")+
    (linked?'<span class="health-linked">I familiekalenderen</span><button type="button" class="tiny-btn" data-health-unlink="'+safe(key)+'">Fjern derfra</button>':"")+
    (!x.standard?'<button type="button" class="tiny-btn" data-health-delete="'+safe(key)+'">Slet</button>':"")+
    '</div></article>';
 }).join(""):'<div class="empty">Alle viste besøg er markeret som gennemført.</div>';
 if(filter==="next"&&all.filter(x=>!x.completed_on).length>activeRows.length){
  target.innerHTML+='<button class="btn soft health-more" type="button" data-health-filter="all">Se hele sundhedsforløbet</button>';
 }
}
function byKey(key){return aggregate().find(x=>String(x.standard?x.milestone_key:x.id)===String(key));}
function blankForm(kind="other"){
 selected=null;$("health-form").reset();$("health-kind").disabled=false;$("health-title").disabled=false;
 $("health-expected").disabled=false;$("health-length").value=30;$("health-kind").value=kind;
 $("health-editor-summary").textContent="Nyt sundhedsbesøg";
 if(kind==="health_visitor")$("health-title").value="Besøg af sundhedsplejerske";
 if(kind==="followup")$("health-title").value="Opfølgende kontrol";
 $("health-editor").open=true;$("health-editor").scrollIntoView({behavior:"smooth",block:"start"});
}
function edit(key){
 const x=byKey(key);if(!x)return;
 selected=x;
 $("health-editor-summary").textContent="Ret: "+x.title;
 $("health-form").reset();
 $("health-title").value=x.title;$("health-title").disabled=x.standard;
 $("health-kind").value=x.visit_kind;$("health-kind").disabled=x.standard;
 $("health-expected").value=x.expected_on||"";$("health-expected").disabled=x.standard;
 $("health-booked").value=x.booked_start?localDateTime(x.booked_start):"";
 const minutes=x.booked_start&&x.booked_end?Math.round((Date.parse(x.booked_end)-Date.parse(x.booked_start))/60000):30;
 $("health-length").value=Math.max(10,Math.min(240,minutes||30));
 $("health-completed").value=x.completed_on||"";$("health-notes").value=x.notes||"";
 $("health-editor").open=true;$("health-editor").scrollIntoView({behavior:"smooth",block:"start"});
}
function closeEditor(){
 selected=null;$("health-editor").open=false;$("health-editor-summary").textContent="Registrér eller rediger besøg";
 $("health-form").reset();
}
async function load(force=false){
 const {family}=ctx();if(!family||loading||(!force&&Date.now()-last<30000))return;
 const generation=epoch;loading=true;
 try{
  const {data,error}=await api.client.from("family_health_visits").select("*").eq("family_id",family.id).order("expected_on",{ascending:true}).limit(150);
  if(error)throw error;
  if(generation!==epoch||ctx().family?.id!==family.id)return;
  rows=data||[];last=Date.now();draw();
 }catch(e){if(generation===epoch)note("Kunne ikke hente sundhedskalenderen: "+(e?.message||String(e)),true);}
 finally{if(generation===epoch)loading=false;}
}
async function persist(item,fields){
 const {family,user}=ctx();if(!family||!user)throw new Error("Log ind for at gemme.");
 const record={...fields,updated_at:new Date().toISOString()};
 if(item?.id){
  const res=await api.client.from("family_health_visits").update(record).eq("family_id",family.id).eq("id",item.id).select("id").single();
  if(res.error)throw res.error;
  return res.data.id;
 }
 const base={...record,family_id:family.id,created_by:user.id};
 if(item?.standard)base.milestone_key=item.milestone_key;
 const saved=await api.client.from("family_health_visits").insert(base).select("id").single();
 if(saved.error){
  // A second family member may have created this standard row in the meantime.
  if(item?.standard&&saved.error.code==="23505"){
   const found=await api.client.from("family_health_visits").select("id").eq("family_id",family.id)
    .eq("milestone_key",item.milestone_key).maybeSingle();
   if(found.error||!found.data)throw found.error||saved.error;
   const retry=await api.client.from("family_health_visits").update(record).eq("family_id",family.id)
    .eq("id",found.data.id).select("id").single();
   if(retry.error)throw retry.error;
   return retry.data.id;
  }
  throw saved.error;
 }
 return saved.data.id;
}
function savedFields(item){
 const actual=$("health-booked").value,minutes=Number($("health-length").value);
 if(!Number.isFinite(minutes)||minutes<10||minutes>240)throw new Error("Varigheden skal være mellem 10 og 240 minutter.");
 if(actual&&!Number.isFinite(Date.parse(actual)))throw new Error("Kontrollér tidspunktet.");
 if(item?.calendar_event_id&&!actual)throw new Error("Fjern først den tilknyttede aftale fra familiekalenderen, før tidspunktet slettes.");
 const start=actual?new Date(actual):null;
 if(start&&start.getTime()<new Date(BIRTH+"T00:00:00").getTime())throw new Error("Tidspunktet kan ikke ligge før Alinas fødsel.");
 const title=item?.standard?item.title:$("health-title").value.trim();
 if(!title||title.length>120)throw new Error("Angiv et besøg på højst 120 tegn.");
 const done=$("health-completed").value;
 if(done&&done>day(new Date()))throw new Error("Et besøg kan ikke være gennemført i fremtiden.");
 return {
  title,visit_kind:item?.standard?item.visit_kind:$("health-kind").value,
  expected_on:item?.standard?item.expected_on:($("health-expected").value||null),
  booked_start:start?start.toISOString():null,
  booked_end:start?new Date(start.getTime()+minutes*60000).toISOString():null,
  completed_on:done||null,
  notes:$("health-notes").value.trim().slice(0,2000)
 };
}
async function syncEvent(item,fields){
 if(!item?.calendar_event_id)return {ok:true};
 const {family}=ctx();
 const update={
  title:"Alina · "+fields.title,starts_at:fields.booked_start,ends_at:fields.booked_end,
  updated_at:new Date().toISOString(),google_dirty:true
 };
 const saved=await api.client.from("family_events").update(update).eq("family_id",family.id)
  .eq("id",item.calendar_event_id).select("id");
 if(saved.error)throw saved.error;
 if(!saved.data?.length)throw new Error("Den tilknyttede kalenderaftale kunne ikke opdateres.");
 const google=await window.GoogleCalendarModule?.syncLocal(item.calendar_event_id);
 return {ok:!google?.error,error:google?.error||""};
}
async function save(e){
 e.preventDefault();const btn=$("health-save");btn.disabled=true;
 const item=selected;
 try{
  const fields=savedFields(item);
  const id=await persist(item,fields);
  let warning="";
  if(item?.calendar_event_id){
   try{const result=await syncEvent(item,fields);if(!result.ok)warning=" Aftalen i familiekalenderen er opdateret, men synkronisering med Google fejlede: "+result.error;}
   catch(error){warning=" Sundhedsregistreringen er gemt, men kalenderaftalen kunne ikke opdateres: "+(error?.message||String(error));}
  }
  closeEditor();await load(true);
  note("Besøget er gemt."+warning,Boolean(warning));
  api?.refreshHome?.();
 }catch(err){note("Kunne ikke gemme: "+(err?.message||String(err)),true);}
 finally{btn.disabled=false;}
}
async function toggle(key){
 const item=byKey(key);if(!item)return;
 const completed_on=item.completed_on?null:day(new Date());
 if(completed_on&&!confirm("Markér \""+item.title+"\" som gennemført? Brug kun dette, hvis besøget eller vaccinationen faktisk har fundet sted."))return;
 try{
  await persist(item,{
   title:item.title,visit_kind:item.visit_kind,expected_on:item.expected_on,
   booked_start:item.booked_start||null,booked_end:item.booked_end||null,
   completed_on,notes:item.notes||""
  });
  await load(true);note(completed_on?"Besøget er registreret som gennemført.":"Markeringen som gennemført er fjernet.");
  api?.refreshHome?.();
 }catch(e){note("Kunne ikke opdatere besøget: "+(e?.message||String(e)),true);}
}
async function addToCalendar(key){
 const item=byKey(key),{family,user}=ctx();if(!item||!family||!user)return;
 if(!item.id){note("Gem først besøget med en booket tid.",true);return;}
 if(!item.booked_start||!item.booked_end){note("Angiv først det tidspunkt, I faktisk har booket.",true);return;}
 if(item.calendar_event_id){note("Besøget findes allerede i familiekalenderen.");return;}
 if(!confirm("Tilføj \""+item.title+"\" til den FÆLLES familiekalender? Titel og tidspunkt kan også blive sendt til jeres tilknyttede Google-familiekalender. Egne noter sendes ikke med."))return;
 let created=null;
 try{
  const {data,error}=await api.client.from("family_events").insert({
   family_id:family.id,created_by:user.id,title:"Alina · "+item.title,
   details:"Booket via sundhedskalenderen.",starts_at:item.booked_start,ends_at:item.booked_end,
   kind:"appointment",visibility:"family",show_on_family_calendar:true,google_dirty:true
  }).select("id").single();
  if(error)throw error;created=data.id;
  const linked=await api.client.from("family_health_visits").update({calendar_event_id:created,updated_at:new Date().toISOString()})
   .eq("family_id",family.id).eq("id",item.id).select("id");
  if(linked.error||!linked.data?.length)throw linked.error||new Error("Kunne ikke forbinde sundhedsbesøget til aftalen.");
  const sync=await window.GoogleCalendarModule?.syncLocal(created);
  await load(true);
  note(sync?.error?"Tilføjet i familiekalenderen. Google-synkronisering fejlede: "+sync.error:
    sync?.synced?"Tilføjet i familiekalenderen og Google.":"Tilføjet i familiekalenderen.",Boolean(sync?.error));
  api?.refreshHome?.();api?.refreshCalendar?.();
 }catch(e){
  // Cleanup only an unlinked newly-created event; never delete a successfully linked event.
  if(created){
   const check=await api.client.from("family_health_visits").select("calendar_event_id").eq("family_id",family.id).eq("id",item.id).maybeSingle();
   if(!check.error&&check.data?.calendar_event_id!==created){
    await api.client.from("family_events").delete().eq("family_id",family.id).eq("id",created);
   }
  }
  note("Kunne ikke tilføje kalenderaftalen: "+(e?.message||String(e)),true);
 }
}
async function unlinkCalendar(key){
 const item=byKey(key),{family}=ctx();if(!item?.calendar_event_id||!family)return;
 if(!confirm("Fjern denne aftale fra den fælles familiekalender og eventuelt Google? Sundhedsregistreringen bevares."))return;
 try{
  const id=item.calendar_event_id;
  const res=await api.client.from("family_events").select("id,google_event_id").eq("family_id",family.id).eq("id",id).maybeSingle();
  if(res.error)throw res.error;
  if(res.data?.google_event_id){
   const remote=await window.GoogleCalendarModule?.deleteLocal(id);
   if(!remote?.synced)throw new Error(remote?.error||"Google-kopien kunne ikke slettes. Prøv igen.");
  }
  if(res.data){
   const removed=await api.client.from("family_events").delete().eq("family_id",family.id).eq("id",id);
   if(removed.error)throw removed.error;
  }
  await load(true);note("Aftalen er fjernet fra familiekalenderen. Sundhedsbesøget er bevaret.");
  api?.refreshHome?.();api?.refreshCalendar?.();
 }catch(e){note("Kunne ikke fjerne aftalen: "+(e?.message||String(e)),true);}
}
async function deleteOwn(key){
 const item=byKey(key),{family}=ctx();if(!item||item.standard||!family)return;
 if(item.calendar_event_id){note("Fjern først besøget fra familiekalenderen, før du sletter registreringen.",true);return;}
 if(!confirm("Slet den ekstra sundhedsregistrering \""+item.title+"\" fra begge telefoner?"))return;
 const res=await api.client.from("family_health_visits").delete().eq("family_id",family.id).eq("id",item.id);
 if(res.error){note("Kunne ikke slette: "+res.error.message,true);return;}
 await load(true);note("Den ekstra registrering er slettet.");api?.refreshHome?.();
}
function click(e){
 const btn=e.target.closest("button");if(!btn)return;
 if(btn.hasAttribute("data-health-refresh")){void load(true);return;}
 if(btn.dataset.healthFilter){filter=btn.dataset.healthFilter;draw();return;}
 if(btn.dataset.healthAdd){blankForm(btn.dataset.healthAdd);return;}
 if(btn.dataset.healthEdit){edit(btn.dataset.healthEdit);return;}
 if(btn.dataset.healthToggle){void toggle(btn.dataset.healthToggle);return;}
 if(btn.dataset.healthCalendar){void addToCalendar(btn.dataset.healthCalendar);return;}
 if(btn.dataset.healthUnlink){void unlinkCalendar(btn.dataset.healthUnlink);return;}
 if(btn.dataset.healthDelete){void deleteOwn(btn.dataset.healthDelete);}
}
function init(options){
 api=options;root();
 $("health-module").addEventListener("click",click);
 $("health-form").addEventListener("submit",save);
 $("health-cancel").addEventListener("click",closeEditor);
 draw();
}
function onView(view){active=view==="sundhed";if(active)void load(true);}
function refresh(){if(active&&$("view-sundhed").classList.contains("active"))void load();}
function reset(){
 epoch++;rows=[];selected=null;last=0;loading=false;active=false;filter="next";
 if(api){closeEditor();draw();note("");}
}
window.HealthModule={init,onView,refresh,reset,standards,expected,aggregate,nextSummary};
})();