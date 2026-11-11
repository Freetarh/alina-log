/* Family supplement diary and shared household chores. Supabase is authoritative. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const day=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const human=d=>new Date(d).toLocaleDateString("da-DK",{day:"numeric",month:"short"});
const clock=d=>new Date(d).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
const datetime=d=>day(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
const daysAgo=(dateStr)=>Math.round((new Date(day(new Date())+"T12:00:00")-new Date(dateStr+"T12:00:00"))/86400000);
const labelSupplement={vitamin_d:"D-dråber",iron:"Jern"};
const note=(id,msg,error=false)=>{const el=$(id);if(el){el.textContent=msg;el.classList.toggle("error",Boolean(error));}};
let api=null,plans=[],doses=[],chores=[],history=[],choreEdit=null,showDone=false;
let loading={tilskud:false,rengoring:false},last={tilskud:0,rengoring:0},active="";
const ctx=()=>api?.getState()||{};
function rootSupp(){
 $("supplement-module").innerHTML=
  '<div class="panel"><div class="sectionhead"><h2>Alinas D-dråber og jern</h2><button class="btn soft" type="button" data-sup-refresh>Opdater</button></div>'+
  '<p class="fineprint">Registrér hvad I faktisk har givet, og hvornår. Angiv dosis og tidspunkt præcis som I har fået besked på af hospital eller sundhedsplejerske. Appen foreslår ikke en dosis.</p>'+
  '<div id="supplement-list"></div><p id="supplement-notice" class="section-notice" role="status"></p></div>'+
  '<div class="panel"><h2>Seneste registreringer</h2><div id="supplement-history"></div></div>';
}
function renderSupp(){
 if(!$("supplement-list"))return;
 const now=day(new Date());
 $("supplement-list").innerHTML=plans.length?plans.map(p=>{
  const today=doses.filter(d=>d.supplement_id===p.id&&day(new Date(d.given_at))===now);
  const goal=p.daily_goal?today.length+" af "+p.daily_goal:today.length+" registreret";
  const done=p.daily_goal&&today.length>=p.daily_goal;
  const time=p.schedule_time?String(p.schedule_time).slice(0,5):"Ikke angivet";
  return '<div class="house-card"><div class="row split"><h3>'+esc(p.title)+'</h3><span class="house-tag '+(done?"done":"")+'">'+goal+" i dag</span></div>"+
   '<p class="fineprint">'+(p.dose_instructions?"Aftalt dosis: "+esc(p.dose_instructions):"Dosis mangler – indsæt den præcise instruktion fra sundhedspersonalet.")+
   " · Tidspunkt: "+esc(time)+'</p>'+
   '<div class="house-inline"><input aria-label="Notat til dosis" id="sup-note-'+p.id+'" type="text" maxlength="240" placeholder="Notat (valgfrit)">'+
   '<button type="button" class="btn primary" data-sup-give="'+p.id+'" '+(!p.active?"disabled":"")+'>Givet nu</button></div>'+
   '<details class="house-details"><summary>Indstillinger og registrering på andet tidspunkt</summary>'+
   '<div class="form-grid"><div class="field"><label for="sup-goal-'+p.id+'">Antal pr. dag (valgfrit)</label><input type="number" id="sup-goal-'+p.id+'" min="1" max="5" value="'+(p.daily_goal||"")+'" placeholder="Ikke angivet"></div>'+
   '<div class="field"><label for="sup-clock-'+p.id+'">Planlagt tidspunkt</label><input type="time" id="sup-clock-'+p.id+'" value="'+time.replace("Ikke angivet","")+'"></div></div>'+
   '<div class="field"><label for="sup-instructions-'+p.id+'">Dosis/instruktion fra hospitalet</label><input type="text" id="sup-instructions-'+p.id+'" maxlength="240" value="'+esc(p.dose_instructions||"")+'" placeholder="Udfyld kun efter vejledning"></div>'+
   '<label class="house-check"><input type="checkbox" id="sup-active-'+p.id+'" '+(p.active?"checked":"")+'> Aktiv registrering</label>'+
   '<button type="button" class="btn soft" data-sup-plan="'+p.id+'">Gem indstillinger</button>'+
   '<div class="field" style="margin-top:14px"><label for="sup-manual-'+p.id+'">Registrér tidligere tidspunkt</label><input type="datetime-local" id="sup-manual-'+p.id+'" value="'+datetime(new Date())+'"></div>'+
   '<button type="button" class="btn" data-sup-manual="'+p.id+'">Registrér tidspunkt</button></details></div>';
 }).join(""):'<div class="empty">Tilskudsplanen indlæses…</div>';
 $("supplement-history").innerHTML=doses.length?doses.slice(0,30).map(d=>{
  const plan=plans.find(p=>p.id===d.supplement_id);
  return '<div class="item"><div class="item-main"><div class="item-title">'+esc(plan?.title||"Tilskud")+'</div><div class="item-sub">'+esc(human(d.given_at))+" kl. "+esc(clock(d.given_at))+(d.note?" · "+esc(d.note):"")+'</div></div><button type="button" class="tiny-btn" data-sup-delete="'+d.id+'">Fortryd</button></div>';
 }).join(""):'<div class="empty">Der er endnu ingen registreringer.</div>';
}
async function loadSupp(force=false){
 const {family}=ctx();if(!family||loading.tilskud||(!force&&Date.now()-last.tilskud<45000))return;
 loading.tilskud=true;
 try{
  let {data:p,error}=await api.client.from("family_supplements").select("id,code,title,dose_instructions,daily_goal,schedule_time,active").eq("family_id",family.id).order("code");
  if(error)throw error;
  if(!p||p.length<2){
   const missing=["vitamin_d","iron"].filter(k=>!p?.some(v=>v.code===k)).map(k=>({family_id:family.id,code:k,title:labelSupplement[k]}));
   if(missing.length){const result=await api.client.from("family_supplements").upsert(missing,{onConflict:"family_id,code"});if(result.error)throw result.error;}
   const res=await api.client.from("family_supplements").select("id,code,title,dose_instructions,daily_goal,schedule_time,active").eq("family_id",family.id).order("code");if(res.error)throw res.error;p=res.data;
  }
  const result=await api.client.from("family_supplement_doses").select("id,supplement_id,given_at,note,recorded_by").eq("family_id",family.id).order("given_at",{ascending:false}).limit(100);
  if(result.error)throw result.error;
  if(ctx().family?.id!==family.id)return;
  plans=p||[];doses=result.data||[];last.tilskud=Date.now();renderSupp();
 }catch(e){note("supplement-notice","Kunne ikke hente tilskud: "+e.message,true);}finally{loading.tilskud=false;}
}
async function give(planId,manual=false){
 const {family,user}=ctx();if(!family||!user)return;
 const p=plans.find(x=>x.id===planId);if(!p)return;
 const when=manual?new Date($("sup-manual-"+planId).value):new Date();
 if(!Number.isFinite(when.getTime())){note("supplement-notice","Kontrollér dato og tidspunkt.",true);return;}
 if(when.getTime()>Date.now()+60000){note("supplement-notice","Et tilskud kan ikke registreres som givet i fremtiden.",true);return;}
 const already=doses.some(d=>d.supplement_id===planId&&Math.abs(new Date(d.given_at).getTime()-when.getTime())<60000);
 if(already&&!confirm("Der findes en registrering inden for samme minut. Registrér alligevel?"))return;
 const button=$("[data-sup-give='"+planId+"']");if(button)button.disabled=true;
 try{
  const {error}=await api.client.from("family_supplement_doses").insert({
   family_id:family.id,supplement_id:planId,given_at:when.toISOString(),recorded_by:user.id,
   note:($("sup-note-"+planId)?.value||"").trim().slice(0,240)
  });
  if(error)throw error;await loadSupp(true);note("supplement-notice",p.title+" er registreret.");
 }catch(e){note("supplement-notice","Kunne ikke registrere: "+e.message,true);}
 finally{if(button)button.disabled=false;}
}
async function savePlan(id){
 const {family}=ctx();if(!family)return;
 const goalStr=$("sup-goal-"+id).value.trim(),daily_goal=goalStr?Number(goalStr):null;
 if(goalStr&&(!Number.isInteger(daily_goal)||daily_goal<1||daily_goal>5)){note("supplement-notice","Antal pr. dag skal være 1–5 eller stå tomt.",true);return;}
 const {error}=await api.client.from("family_supplements").update({
  daily_goal,schedule_time:$("sup-clock-"+id).value||null,
  dose_instructions:$("sup-instructions-"+id).value.trim().slice(0,240),
  active:$("sup-active-"+id).checked,updated_at:new Date().toISOString()
 }).eq("family_id",family.id).eq("id",id);
 if(error)note("supplement-notice","Kunne ikke gemme planen: "+error.message,true);
 else{await loadSupp(true);note("supplement-notice","Planen er gemt. Der udsendes endnu ikke push-påmindelser.");}
}
async function deleteDose(id){
 if(!confirm("Fjern denne registrering af tilskud?"))return;
 const {error}=await api.client.from("family_supplement_doses").delete().eq("id",id).eq("family_id",ctx().family.id);
 if(error)note("supplement-notice","Kunne ikke fjerne registreringen: "+error.message,true);
 else await loadSupp(true);
}
function suppClick(e){
 const b=e.target.closest("button");if(!b)return;
 if(b.hasAttribute("data-sup-refresh"))void loadSupp(true);
 if(b.dataset.supGive)void give(b.dataset.supGive);
 if(b.dataset.supManual)void give(b.dataset.supManual,true);
 if(b.dataset.supPlan)void savePlan(b.dataset.supPlan);
 if(b.dataset.supDelete)void deleteDose(b.dataset.supDelete);
}
function rootChores(){
 $("chores-module").innerHTML=
  '<div class="panel"><div class="sectionhead"><h2>Rengøringsplan</h2><button type="button" class="btn soft" data-chore-refresh>Opdater</button></div>'+
  '<p class="fineprint">Opgaverne er fælles. Vælg om de skal gentages, og hvem der står for dem.</p>'+
  '<div class="row split"><button type="button" class="btn soft" id="chore-templates">Tilføj forslag til rengøring</button><label class="house-check"><input id="chore-show-done" type="checkbox"> Vis afsluttede</label></div>'+
  '<div id="chore-list" class="house-stack"></div><p id="chore-notice" class="section-notice" role="status"></p></div>'+
  '<div class="panel"><h2 id="chore-form-title">Ny opgave</h2>'+
  '<form id="chore-form"><div class="field"><label for="chore-title">Opgave</label><input id="chore-title" maxlength="120" required placeholder="Fx Rengør badeværelse"></div>'+
  '<div class="form-grid"><div class="field"><label for="chore-due">Næste dato</label><input id="chore-due" type="date" required></div>'+
  '<div class="field"><label for="chore-repeat">Gentagelse</label><select id="chore-repeat"><option value="0">En gang</option><option value="1">Hver dag</option><option value="7">Hver uge</option><option value="14">Hver 14. dag</option><option value="30">Hver 30. dag</option></select></div></div>'+
  '<div class="field"><label for="chore-person">Ansvarlig</label><select id="chore-person"><option>Begge</option><option>Frederik</option><option>Batoul</option></select></div>'+
  '<div class="field"><label for="chore-details">Beskrivelse (valgfri)</label><input id="chore-details" maxlength="350" placeholder="Evt. fremgangsmåde"></div>'+
  '<div class="row"><button type="submit" class="btn primary" id="chore-save">Gem opgave</button><button type="button" class="btn hidden" id="chore-cancel">Annuller</button></div></form></div>'+
  '<div class="panel"><h2>Senest udført</h2><div id="chore-history"></div></div>';
 $("chore-due").value=day(new Date());
}

function dueLabel(dateText){
 const diff=-daysAgo(dateText);
 return diff<0?Math.abs(diff)+" dage forsinket":diff===0?"I dag":diff===1?"I morgen":human(dateText+"T12:00:00");
}
function recurLabel(n){return ({0:"En gang",1:"Dagligt",7:"Ugentligt",14:"Hver 14. dag",30:"Hver 30. dag"})[n]||("Hver "+n+". dag");}
function renderChores(){
 const current=ctx().user?.id;
 const arr=chores.filter(x=>showDone||!x.completed).sort((a,b)=>Number(a.completed)-Number(b.completed)||a.due_on.localeCompare(b.due_on));
 $("chore-list").innerHTML=arr.length?arr.map(c=>{
  const who=c.responsible||"Begge";
  return '<div class="house-card '+(c.completed?"house-muted":"")+'"><div class="row split"><h3>'+esc(c.title)+'</h3><span class="house-tag">'+(c.completed?"Afsluttet":esc(dueLabel(c.due_on)))+'</span></div>'+
   '<p class="fineprint">'+esc(recurLabel(c.repeat_days))+" · "+esc(who)+(c.details?" · "+esc(c.details):"")+'</p>'+
   '<div class="row">'+(c.completed?'<button type="button" class="btn soft" data-chore-reopen="'+c.id+'">Genåbn</button>':'<button type="button" class="btn primary" data-chore-done="'+c.id+'">Udført</button>')+
   '<button type="button" class="tiny-btn" data-chore-edit="'+c.id+'">Ret</button><button type="button" class="tiny-btn" data-chore-delete="'+c.id+'">Slet</button></div></div>';
 }).join(""):'<div class="empty">Ingen opgaver. Tilføj en selv eller brug forslagene.</div>';
 $("chore-history").innerHTML=history.length?history.slice(0,12).map(x=>{
  const c=chores.find(c=>c.id===x.chore_id);
  return '<div class="item"><div class="item-main"><div class="item-title">'+esc(c?.title||"Tidligere opgave")+'</div><div class="item-sub">'+esc(human(x.completed_at))+" · "+(x.completed_by===current?"Udført af dig":"Udført af den anden")+'</div></div></div>';
 }).join(""):'<div class="empty">Ingen udførte opgaver endnu.</div>';
}
async function loadChores(force=false){
 const {family}=ctx();if(!family||loading.rengoring||(!force&&Date.now()-last.rengoring<45000))return;
 loading.rengoring=true;
 try{
  const [c,h]=await Promise.all([
   api.client.from("family_chores").select("*").eq("family_id",family.id).order("due_on").limit(500),
   api.client.from("family_chore_history").select("id,chore_id,completed_at,completed_by").eq("family_id",family.id).order("completed_at",{ascending:false}).limit(50)
  ]);
  if(c.error)throw c.error;if(h.error)throw h.error;
  if(ctx().family?.id!==family.id)return;
  chores=c.data||[];history=h.data||[];
  last.rengoring=Date.now();renderChores();
 }catch(e){note("chore-notice","Kunne ikke hente opgaver: "+e.message,true);}finally{loading.rengoring=false;}
}
function clearChore(){
 choreEdit=null;$("chore-form").reset();$("chore-due").value=day(new Date());
 $("chore-save").textContent="Gem opgave";$("chore-form-title").textContent="Ny opgave";$("chore-cancel").classList.add("hidden");
}
async function saveChore(e){
 e.preventDefault();const {family}=ctx();if(!family)return;
 const title=$("chore-title").value.trim(),due_on=$("chore-due").value,repeat_days=Number($("chore-repeat").value);
 if(!title||!due_on||!Number.isInteger(repeat_days)){note("chore-notice","Udfyld titel og dato.",true);return;}
 $("chore-save").disabled=true;
 const row={title,due_on,repeat_days,details:$("chore-details").value.trim().slice(0,350),responsible:$("chore-person").value,updated_at:new Date().toISOString()};
 try{
  const result=choreEdit?await api.client.from("family_chores").update(row).eq("family_id",family.id).eq("id",choreEdit):
   await api.client.from("family_chores").insert({...row,family_id:family.id});
  if(result.error)throw result.error;clearChore();await loadChores(true);note("chore-notice","Opgaven er gemt.");
 }catch(e){note("chore-notice","Kunne ikke gemme opgave: "+e.message,true);}
 finally{$("chore-save").disabled=false;}
}
async function completeChore(id){
 const {data,error}=await api.client.rpc("complete_family_chore",{p_chore_id:id,p_date:day(new Date())});
 if(error)note("chore-notice","Kunne ikke markere udført: "+error.message,true);
 else{await loadChores(true);note("chore-notice","Opgaven er udført"+(data?.repeat_days?" og næste dato er planlagt.":". Fotfærdig."));}
}
async function reopenChore(id){
 const {error}=await api.client.from("family_chores").update({completed:false,updated_at:new Date().toISOString()}).eq("family_id",ctx().family.id).eq("id",id);
 if(error)note("chore-notice",error.message,true);else await loadChores(true);
}
async function eraseChore(id){
 if(!confirm("Slet opgaven og dens historik permanent fra begge telefoner?"))return;
 const {error}=await api.client.from("family_chores").delete().eq("family_id",ctx().family.id).eq("id",id);
 if(error)note("chore-notice","Kunne ikke slette: "+error.message,true);else await loadChores(true);
}
async function templates(){
 const {family}=ctx();if(!family||chores.length&&!confirm("Tilføj forslagene som nye opgaver? Eksisterende opgaver bevares."))return;
 const today=day(new Date());
 const items=[["Aftør køkkenbord",1],["Rengør badeværelse",7],["Støvsug fællesrum",7],["Vask gulve",14],["Skift sengetøj",14],["Rengør køleskab",30]].map(([title,repeat_days])=>({family_id:family.id,title,repeat_days,due_on:today}));
 const {error}=await api.client.from("family_chores").insert(items);
 if(error)note("chore-notice","Kunne ikke oprette forslag: "+error.message,true);
 else{await loadChores(true);note("chore-notice","Seks forslag er tilføjet. Tilpas dem efter behov.");}
}
function choreClick(e){
 const b=e.target.closest("button");if(!b)return;
 if(b.hasAttribute("data-chore-refresh"))void loadChores(true);
 const id=b.dataset.choreDone||b.dataset.choreEdit||b.dataset.choreDelete||b.dataset.choreReopen;
 if(b.dataset.choreDone)void completeChore(id);
 if(b.dataset.choreDelete)void eraseChore(id);
 if(b.dataset.choreReopen)void reopenChore(id);
 if(b.dataset.choreEdit){
  const c=chores.find(c=>c.id===id);if(!c)return;choreEdit=id;
  $("chore-title").value=c.title;$("chore-due").value=c.due_on;$("chore-repeat").value=c.repeat_days;
  $("chore-person").value=c.responsible||"Begge";$("chore-details").value=c.details||"";
  $("chore-save").textContent="Gem ændringer";$("chore-form-title").textContent="Ret opgave";$("chore-cancel").classList.remove("hidden");
  $("chore-form").scrollIntoView({behavior:"smooth",block:"start"});
 }
}
function init(config){
 api=config;rootSupp();rootChores();
 $("supplement-module").addEventListener("click",suppClick);
 $("chores-module").addEventListener("click",choreClick);
 $("chore-form").addEventListener("submit",saveChore);
 $("chore-cancel").addEventListener("click",clearChore);
 $("chore-templates").addEventListener("click",()=>void templates());
 $("chore-show-done").addEventListener("change",e=>{showDone=e.target.checked;renderChores();});
}
function onView(v){active=v;if(v==="tilskud")void loadSupp(true);if(v==="rengoring")void loadChores(true);}
function refresh(){if(active==="tilskud"&&$("view-tilskud").classList.contains("active"))void loadSupp();if(active==="rengoring"&&$("view-rengoring").classList.contains("active"))void loadChores();}
function reset(){plans=[];doses=[];chores=[];history=[];choreEdit=null;showDone=false;last={tilskud:0,rengoring:0};active="";loading={tilskud:false,rengoring:false};if(api){clearChore();renderSupp();renderChores();note("supplement-notice","");note("chore-notice","");}}
window.HouseholdModule={init,onView,refresh,reset};
})();