/* Provisional family homepage. Summaries only: never overrides module data. */
(function(){
'use strict';
const $=id=>document.getElementById(id),esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const shortTime=d=>new Date(d).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
const weekdays=["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
let api=null,last=0,loading=false,data={};
const ctx=()=>api?.getState()||{};
function render(){
 const el=$("home-glance");if(!el)return;
 const {entries=[]}=ctx();
 const today=new Date(),ageDays=Math.max(0,Math.floor((Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())-Date.UTC(2026,9,6))/86400000));
 const lastEntry=entries.filter(e=>e.at&&Number.isFinite(Date.parse(e.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
 const labels={breast:"Amning",bottle:"Flaske",diaper:"Ble",weight:"Vejning"};
 const supplements=data.supplements||[],doses=data.doses||[],chores=data.chores||[],groceries=data.groceries||[],meals=data.meals||[],events=data.events||[];
 const dToday=iso(today),doseCount=id=>doses.filter(d=>d.supplement_id===id&&iso(new Date(d.given_at))===dToday).length;
 const supplementText=supplements.length?supplements.map(p=>{
  const count=doseCount(p.id);
  return esc(p.title)+": "+count+(p.daily_goal?" / "+p.daily_goal:"")+" registreret";
 }).join(" · "):"Registrér D-dråber og jern";
 const choreDue=chores.filter(c=>!c.completed&&c.due_on<=dToday).length;
 const groLeft=groceries.filter(i=>!i.checked).length;
 const dinner=meals.find(x=>x.meal_date===dToday&&x.meal_slot==="dinner");
 const visibleEvents=events.filter(x=>x.visibility==="family"&&x.show_on_family_calendar);
 el.innerHTML='<div class="panel home-today"><div class="sectionhead"><div><span class="module-label">Foreløbig forside</span><h2 style="margin:8px 0 0">I dag · '+esc(weekdays[today.getDay()])+'</h2></div><button type="button" class="btn soft" data-home-refresh>Opdater</button></div>'+
  '<p class="subtle small">Alina er '+Math.floor(ageDays/7)+' uger og '+(ageDays%7)+' dage. Dagens overblik samles fra jeres fælles moduler.</p>'+
  '<div class="home-stats">'+
  '<button type="button" data-home-go="kalender"><strong>'+visibleEvents.length+'</strong><span>Familieaftaler</span></button>'+
  '<button type="button" data-home-go="rengoring"><strong>'+choreDue+'</strong><span>Rengøringsopgaver der skal klares</span></button>'+
  '<button type="button" data-home-go="indkob"><strong>'+groLeft+'</strong><span>Varer mangler</span></button>'+
  '</div>'+
  '<div class="home-row"><div class="item-main"><strong>Alinas tilskud</strong><p>'+supplementText+'</p></div><button type="button" class="tiny-btn" data-home-go="tilskud">Åbn</button></div>'+
  '<div class="home-row"><div class="item-main"><strong>Aftensmad</strong><p>'+(dinner?esc(dinner.title):"Ikke planlagt endnu")+'</p></div><button type="button" class="tiny-btn" data-home-go="madplan">Åbn</button></div>'+
  '<div class="home-row"><div class="item-main"><strong>Seneste registrering for Alina</strong><p>'+(lastEntry?(esc(labels[lastEntry.kind]||"Log")+": "+shortTime(lastEntry.at)):"Ingen registrering")+'</p></div><button type="button" class="tiny-btn" data-home-go="overblik">Åbn</button></div>'+
  '<p id="home-status" class="section-notice" role="status"></p></div>';
}
async function refresh(force=false){
 const {family}=ctx();if(!family||loading||(!force&&Date.now()-last<60000))return;
 loading=true;
 try{
  const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
  const dToday=iso(start);
  const req=[
   api.client.from("family_supplements").select("id,title,daily_goal").eq("family_id",family.id).eq("active",true),
   api.client.from("family_supplement_doses").select("supplement_id,given_at").eq("family_id",family.id).gte("given_at",start.toISOString()).lt("given_at",end.toISOString()),
   api.client.from("family_chores").select("due_on,completed").eq("family_id",family.id).eq("completed",false).lte("due_on",dToday),
   api.client.from("family_groceries").select("checked").eq("family_id",family.id).eq("checked",false),
   api.client.from("family_meal_plan").select("meal_date,meal_slot,title").eq("family_id",family.id).eq("meal_date",dToday).eq("meal_slot","dinner"),
   api.client.from("family_events").select("starts_at,visibility,show_on_family_calendar").eq("family_id",family.id).eq("visibility","family").eq("show_on_family_calendar",true).gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString())
  ];
  const results=await Promise.all(req);
  for(const r of results)if(r.error)throw r.error;
  if(ctx().family?.id!==family.id)return;
  const fields=["supplements","doses","chores","groceries","meals","events"];
  data=Object.fromEntries(results.map((r,i)=>[fields[i],r.data||[]]));
  last=Date.now();render();
 }catch(e){render();if($("home-status"))$("home-status").textContent="Kunne ikke opdatere overblikket: "+e.message;}
 finally{loading=false;}
}
function init(config){
 api=config;const root=$("home-glance");
 root.addEventListener("click",e=>{
  const go=e.target.closest("[data-home-go]"),ref=e.target.closest("[data-home-refresh]");
  if(go)api.go(go.dataset.homeGo);if(ref)void refresh(true);
 });
 render();
}
function onView(v){if(v==="hjem")void refresh(true);}
function update(){if($("view-hjem")?.classList.contains("active")){render();void refresh();}}
function reset(){data={};last=0;loading=false;if(api)render();}
window.HomeModule={init,onView,refresh:update,reset};
})();