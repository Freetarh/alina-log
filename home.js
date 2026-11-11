/* Family home: a concise, actionable today view. No data is stored outside Supabase. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localDay=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const clock=d=>new Date(d).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
const dateLabel=d=>d.toLocaleDateString("da-DK",{weekday:"long",day:"numeric",month:"long"});
const weekdays=(d)=>d.toLocaleDateString("da-DK",{weekday:"long"});
const humanAge=()=>{
 const today=new Date(),age=Math.max(0,Math.round((Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())-Date.UTC(2026,9,6))/86400000));
 const remainder=age%7;return age<7?age+" "+(age===1?"dag":"dage"):Math.floor(age/7)+" "+(Math.floor(age/7)===1?"uge":"uger")+" og "+remainder+" "+(remainder===1?"dag":"dage");
};
let api=null,last=0,loading=false,epoch=0,data=null,status="";
const ctx=()=>api?.getState()||{};
function latestFeed(entries){
 return entries.filter(e=>(e.kind==="bottle"||e.kind==="breast")&&Number.isFinite(Date.parse(e.at)))
 .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
}
function render(){
 const root=$("home-glance");if(!root)return;
 const {entries=[]}=ctx(),now=new Date(),today=localDay(now),haveData=Boolean(data);
 const supplements=data?.supplements||[],doses=data?.doses||[],
 chores=data?.chores||[],groceries=data?.groceries||[],meals=data?.meals||[],events=data?.events||[];
 const nextEvents=events.filter(e=>Date.parse(e.starts_at)>=Date.now()-60000).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 const allEvents=[...events].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 const shownEvents=(nextEvents.length?nextEvents:allEvents).slice(0,2);
 const due=chores.filter(c=>!c.completed&&c.due_on<=today).sort((a,b)=>a.due_on.localeCompare(b.due_on));
 const shoppingCount=groceries.filter(x=>!x.checked).length;
 const dinner=meals.find(m=>m.meal_date===today&&m.meal_slot==="dinner");
 const nextHealth=window.HealthModule?.nextSummary(data?.health||[]);
 const lastFeed=latestFeed(entries),lastWeight=entries.filter(e=>e.kind==="weight"&&Number(e.grams)>0).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
 const recent=entries.filter(e=>Date.parse(e.at)>=Date.now()-86400000&&Date.parse(e.at)<=Date.now());
 const bottleMl=recent.filter(e=>e.kind==="bottle").reduce((s,e)=>s+Number(e.taken||0),0);
 const nursing=recent.filter(e=>e.kind==="breast").length;
 const supplementRows=supplements.map(p=>{
  const count=doses.filter(d=>d.supplement_id===p.id&&localDay(new Date(d.given_at))===today).length;
  const complete=p.daily_goal&&count>=p.daily_goal;
  return '<div class="home-check-row"><span class="home-status-icon '+(complete?"is-done":"")+'" aria-hidden="true">'+(complete?"✓":"•")+'</span>'+
   '<div class="item-main"><strong>'+esc(p.title)+'</strong><span class="home-secondary">'+count+(p.daily_goal?" af "+p.daily_goal:"")+" registreret i dag"+(p.daily_goal&&complete?" · Mål nået":"")+'</span></div></div>';
 }).join("");
 const eventLines=shownEvents.map(e=>{
  const tm=e.google_all_day?"Hele dagen":clock(e.starts_at);
  return '<div class="home-event-row"><span class="home-event-time">'+esc(tm)+'</span><span class="home-event-title">'+esc(e.title)+'</span></div>';
 }).join("");
 const lastMeal=lastFeed?(lastFeed.kind==="breast"?"Amning":'Flaske'+(Number(lastFeed.taken)>0?" · "+Number(lastFeed.taken)+" ml":""))+
   (localDay(new Date(lastFeed.at))===today?" kl. ":" "+new Date(lastFeed.at).toLocaleDateString("da-DK",{day:"numeric",month:"short"})+" kl. ")+clock(lastFeed.at):"Ikke registreret";
 const statLine='<span>'+bottleMl.toLocaleString("da-DK")+' ml flaske</span><span>'+nursing+" amninger</span>";
 const note=haveData?(last?"Opdateret "+clock(new Date(last)):""):("Henter dagens overblik…");
 root.innerHTML=
  '<section class="home-intro" aria-label="Dagens introduktion"><div><span class="home-eyebrow">Dagens overblik</span>'+
  '<h2>I dag</h2><p>'+esc(dateLabel(now))+' <span aria-hidden="true">·</span> Alina: '+esc(humanAge())+'</p></div>'+
  '<button type="button" class="home-refresh-btn" data-home-refresh aria-label="Opdater forside" title="Opdater forside">'+
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" width="21" height="21" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 5.5M20 4v7h-7"/></svg></button></section>'+
  '<div class="home-quick" aria-label="Hurtig registrering">'+
  '<button type="button" data-home-kind="breast"><span class="home-quick-ico">A</span>Amning</button>'+
  '<button type="button" data-home-kind="bottle"><span class="home-quick-ico">ml</span>Flaske</button>'+
  '<button type="button" data-home-kind="diaper"><span class="home-quick-ico">B</span>Ble</button>'+
  '<button type="button" data-home-new-event><span class="home-quick-ico">+</span>Aftale</button>'+
  '</div>'+
  '<section class="panel home-section" aria-label="Aftaler og huskeliste">'+
  '<div class="home-section-head"><h2>Dagens aftaler</h2><button type="button" data-home-go="kalender" class="home-text-action">Kalender <span aria-hidden="true">›</span></button></div>'+
  (haveData?(eventLines||'<p class="home-empty-note">Ingen fælles aftaler i dag.</p>'):'<p class="home-empty-note">Henter aftaler…</p>')+
  (haveData&&allEvents.length>2?'<p class="home-count-hint">'+allEvents.length+' aftaler i dag i alt</p>':"")+
  '<div class="home-divider"></div>'+
  '<div class="home-section-head"><h2>Husk i dag</h2><button type="button" data-home-go="tilskud" class="home-text-action">Tilskud <span aria-hidden="true">›</span></button></div>'+
  (haveData?(supplementRows||'<p class="home-empty-note">Ingen aktive tilskudsplaner.</p>'):'<p class="home-empty-note">Henter tilskud…</p>')+
  '<div class="home-check-row home-health-row"><span class="home-status-icon" aria-hidden="true">+</span>'+
  '<div class="item-main"><strong>Alinas sundhed</strong><span class="home-secondary">'+
  (nextHealth?esc(nextHealth.title)+' · '+esc(nextHealth.booked?'Booket '+nextHealth.dateLabel:
  'Vejledende '+nextHealth.dateLabel+(nextHealth.needsReview?' · kontrollér om gennemført':'')):"Alle standardbesøg er markeret gennemført")+
  '</span></div><button type="button" data-home-go="sundhed" class="home-text-action home-side-action">Åbn <span aria-hidden="true">›</span></button></div>'+
  '<div class="home-check-row home-chore-row"><span class="home-status-icon" aria-hidden="true">✓</span><div class="item-main"><strong>Rengøring</strong>'+
  '<span class="home-secondary">'+(haveData?(due.length?due.length+" opgaver skal klares"+(due[0]?.title?" · "+esc(due[0].title):""):"Ingen forfaldne opgaver"):"Henter opgaver…")+'</span></div>'+
  '<button type="button" data-home-go="rengoring" class="home-text-action home-side-action">Åbn <span aria-hidden="true">›</span></button></div>'+
  '</section>'+
  '<div class="home-card-grid">'+
  '<section class="home-mini-card"><div class="home-mini-title">Alina <button type="button" data-home-go="overblik" aria-label="Åbn Alinas log">›</button></div>'+
  '<strong>'+esc(lastMeal)+'</strong><p>Seneste måltid</p><div class="home-mini-foot">'+statLine+'</div>'+
  (lastWeight?'<div class="home-mini-foot">Seneste vægt: '+Number(lastWeight.grams).toLocaleString("da-DK")+' g</div>':"")+'</section>'+
  '<section class="home-mini-card"><div class="home-mini-title">Aftensmad <button type="button" data-home-go="madplan" aria-label="Åbn madplan">›</button></div>'+
  '<strong>'+(haveData?(dinner?esc(dinner.title):"Ikke planlagt"):"Henter…")+'</strong><p>'+esc(weekdays(now))+'</p>'+
  '<div class="home-mini-foot home-mini-link"><button type="button" data-home-go="indkob">Indkøb · '+(haveData?shoppingCount:"…")+' mangler <span aria-hidden="true">›</span></button></div></section>'+
  '</div>'+
  '<div class="home-foot"><span id="home-status" role="status">'+esc(status||note)+'</span><button type="button" data-home-go="moduler">Alle moduler <span aria-hidden="true">›</span></button></div>';
}
async function refresh(force=false){
 const {family}=ctx();
 if(!family||loading||(!force&&Date.now()-last<30000))return;
 const sequence=epoch;loading=true;status="";
 try{
  const start=new Date();start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const d=localDay(start);
  const requests=[
   api.client.from("family_supplements").select("id,title,daily_goal").eq("family_id",family.id).eq("active",true),
   api.client.from("family_supplement_doses").select("supplement_id,given_at").eq("family_id",family.id).gte("given_at",start.toISOString()).lt("given_at",end.toISOString()),
   api.client.from("family_chores").select("title,due_on,completed").eq("family_id",family.id).eq("completed",false).lte("due_on",d),
   api.client.from("family_groceries").select("checked").eq("family_id",family.id).eq("checked",false),
   api.client.from("family_meal_plan").select("meal_date,meal_slot,title").eq("family_id",family.id).eq("meal_date",d).eq("meal_slot","dinner"),
   api.client.from("family_health_visits").select("id,milestone_key,title,visit_kind,expected_on,booked_start,booked_end,completed_on,notes,calendar_event_id")
    .eq("family_id",family.id).limit(150),
   api.client.from("family_events").select("title,starts_at,google_all_day,visibility,show_on_family_calendar")
    .eq("family_id",family.id).eq("visibility","family").eq("show_on_family_calendar",true)
    .is("google_removed_at",null).gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString()).order("starts_at").limit(30)
  ];
  const all=await Promise.all(requests);
  for(const r of all)if(r.error)throw r.error;
  if(sequence!==epoch||ctx().family?.id!==family.id)return;
  data=Object.fromEntries(all.map((r,i)=>[["supplements","doses","chores","groceries","meals","health","events"][i],r.data||[]]));
  last=Date.now();
 }catch(e){
  if(sequence!==epoch)return;
  status="Kunne ikke opdatere alle oplysninger: "+(e?.message||String(e));
 }finally{
  if(sequence===epoch){loading=false;render();}
 }
}
function init(config){
 api=config;
 $("home-glance").addEventListener("click",e=>{
  const navigate=e.target.closest("[data-home-go]"),reload=e.target.closest("[data-home-refresh]"),quick=e.target.closest("[data-home-kind]"),newEvent=e.target.closest("[data-home-new-event]");
  if(navigate){api.go(navigate.dataset.homeGo);return;}
  if(newEvent){api.openEvent();return;}
  if(reload){void refresh(true);return;}
  if(quick)api.openEntry(quick.dataset.homeKind);
 });
 render();
}
function onView(name){if(name==="hjem"){render();void refresh(true);}}
function update(){if($("view-hjem")?.classList.contains("active")){render();void refresh();}}
function reset(){epoch++;data=null;last=0;loading=false;status="";if(api)render();}
window.HomeModule={init,onView,refresh:update,forceRefresh:()=>refresh(true),reset};
})();