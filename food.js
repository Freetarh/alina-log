/* Shared groceries, weekly meals and saved recipes. */
(function(){
'use strict';
const $=id=>document.getElementById(id),safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localDay=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const dateLabel=d=>new Date(d+"T12:00:00").toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"});
const slotLabel={breakfast:"Morgenmad",lunch:"Frokost",dinner:"Aftensmad"};
const cats=["Frugt og grønt","Køl og mejeri","Kød og fisk","Brød og korn","Tørvarer","Husholdning","Andet"];
let api=null,items=[],recipes=[],meals=[],groEdit=null,recipeEdit=null,weekOffset=0,showChecked=true,searchText="";
let busy={indkob:false,madplan:false},last={indkob:0,madplan:0},active="";
const ctx=()=>api?.getState()||{};
const notice=(id,msg,error=false)=>{const x=$(id);if(x){x.textContent=msg;x.classList.toggle("error",Boolean(error));}};
function monday(offset=weekOffset){
 const d=new Date();d.setHours(12,0,0,0);
 d.setDate(d.getDate()-((d.getDay()+6)%7)+offset*7);return d;
}
function weekDays(){const m=monday();return Array.from({length:7},(_,i)=>{const d=new Date(m);d.setDate(d.getDate()+i);return localDay(d);});}
function rootGro(){
 $("grocery-module").innerHTML=
 '<div class="panel"><div class="sectionhead"><h2>Fælles indkøbsliste</h2><button type="button" class="btn soft" id="gro-refresh">Opdater</button></div>'+
 '<form id="gro-form"><div class="field"><label for="gro-name">Vare</label><input id="gro-name" maxlength="120" required placeholder="Fx Tomater"></div>'+
 '<div class="form-grid"><div class="field"><label for="gro-amount">Antal/mængde</label><input id="gro-amount" maxlength="65" placeholder="Fx 2 stk"></div>'+
 '<div class="field"><label for="gro-category">Kategori</label><select id="gro-category">'+cats.map(x=>'<option>'+safe(x)+'</option>').join("")+'</select></div></div>'+
 '<div class="row"><button type="submit" class="btn primary" id="gro-save">Tilføj vare</button><button type="button" class="btn hidden" id="gro-cancel">Annuller</button></div></form>'+
 '<p id="gro-notice" class="section-notice" role="status"></p></div>'+
 '<div class="panel"><div class="row split"><strong>Indkøb</strong><label class="house-check"><input type="checkbox" id="gro-show-checked" checked> Vis købte</label></div>'+
 '<div id="gro-summary" class="fineprint"></div><div id="gro-list" class="house-stack"></div>'+
 '<button type="button" class="btn soft" id="gro-clear" style="margin-top:12px">Fjern afkrydsede varer</button></div>';
}
function rootFood(){
 $("food-module").innerHTML=
 '<div class="panel"><div class="sectionhead"><h2>Ugens madplan</h2><button type="button" class="btn soft" id="food-refresh">Opdater</button></div>'+
 '<div class="calendar-date-row"><button type="button" class="btn" id="week-prev" aria-label="Forrige uge">‹</button><strong id="week-label"></strong><button type="button" class="btn" id="week-next" aria-label="Næste uge">›</button><button type="button" class="btn soft" id="week-today">Denne uge</button></div>'+
 '<div id="meal-week" class="house-stack"></div>'+
 '<button type="button" id="meal-groceries" class="btn soft" style="margin-top:12px">Tilføj ugens opskriftsingredienser til indkøb</button>'+
 '<p id="meal-notice" class="section-notice" role="status"></p></div>'+
 '<div class="panel"><h2>Planlæg et måltid</h2><form id="meal-form">'+
 '<div class="form-grid"><div class="field"><label for="meal-date">Dato</label><input type="date" id="meal-date" required></div>'+
 '<div class="field"><label for="meal-slot">Måltid</label><select id="meal-slot"><option value="dinner">Aftensmad</option><option value="lunch">Frokost</option><option value="breakfast">Morgenmad</option></select></div></div>'+
 '<div class="field"><label for="meal-recipe">Vælg opskrift (valgfrit)</label><select id="meal-recipe"><option value="">Ingen opskrift</option></select></div>'+
 '<div class="field"><label for="meal-title">Hvad skal I spise?</label><input id="meal-title" maxlength="120" required placeholder="Fx Kylling med ris"></div>'+
 '<div class="field"><label for="meal-note">Bemærkning</label><input id="meal-note" maxlength="350" placeholder="Fx rester fra i går"></div>'+
 '<div class="row"><button type="submit" class="btn primary" id="meal-save">Gem i madplan</button><button type="button" class="btn soft" id="meal-cancel">Nulstil</button></div></form></div>'+
 '<div class="panel"><div class="sectionhead"><h2>Opskriftsbibliotek</h2><span id="recipe-count" class="subtle small"></span></div>'+
 '<div class="field"><label for="recipe-search">Søg i opskrifter</label><input id="recipe-search" placeholder="Søg på navn" maxlength="120"></div>'+
 '<div id="recipe-list" class="house-stack"></div></div>'+
 '<div class="panel"><h2 id="recipe-form-title">Ny opskrift</h2>'+
 '<form id="recipe-form"><div class="field"><label for="recipe-title">Navn</label><input id="recipe-title" required maxlength="120" placeholder="Fx Spaghetti med tomatsauce"></div>'+
 '<div class="form-grid"><div class="field"><label for="recipe-servings">Portioner</label><input type="number" min="1" max="20" id="recipe-servings" value="2" required></div>'+
 '<div class="field"><label for="recipe-minutes">Tilberedning (min.)</label><input type="number" min="1" max="600" id="recipe-minutes" placeholder="Valgfrit"></div></div>'+
 '<div class="field"><label for="recipe-ingredients">Ingredienser, én pr. linje</label><textarea id="recipe-ingredients" maxlength="4000" rows="6" placeholder="2 løg&#10;400 g tomater&#10;1 pakke pasta"></textarea></div>'+
 '<div class="field"><label for="recipe-steps">Fremgangsmåde</label><textarea id="recipe-steps" maxlength="7000" rows="6" placeholder="Beskriv trinene…"></textarea></div>'+
 '<div class="row"><button type="submit" class="btn primary" id="recipe-save">Gem opskrift</button><button type="button" class="btn hidden" id="recipe-cancel">Annuller</button></div></form>'+
 '<p id="recipe-notice" class="section-notice" role="status"></p></div>';
 $("meal-date").value=localDay(new Date());
}
function drawGro(){
 const view=items.filter(x=>showChecked||!x.checked).sort((a,b)=>Number(a.checked)-Number(b.checked)||a.created_at.localeCompare(b.created_at));
 const left=items.filter(x=>!x.checked).length;
 $("gro-summary").textContent=left+" mangler · "+(items.length-left)+" købt";
 $("gro-list").innerHTML=view.length?view.map(x=>{
  return '<div class="item '+(x.checked?"house-muted":"")+'"><label class="house-grocery-checkbox"><input type="checkbox" data-gro-check="'+x.id+'" '+(x.checked?"checked":"")+' aria-label="Købt '+safe(x.name)+'"></label>'+
   '<div class="item-main"><div class="item-title">'+safe(x.name)+(x.amount?' · '+safe(x.amount):"")+'</div><div class="item-sub">'+safe(x.category)+'</div></div>'+
   '<div class="item-actions"><button type="button" class="tiny-btn" data-gro-edit="'+x.id+'">Ret</button><button type="button" class="tiny-btn" data-gro-delete="'+x.id+'">Slet</button></div></div>';
 }).join(""):'<div class="empty">Listen er tom. Tilføj varer ovenfor eller hent ingredienser fra en opskrift.</div>';
 $("gro-clear").disabled=!items.some(x=>x.checked);
}
function clearGro(){
 groEdit=null;$("gro-form").reset();$("gro-save").textContent="Tilføj vare";$("gro-cancel").classList.add("hidden");
}
async function loadGro(force=false){
 const {family}=ctx();if(!family||busy.indkob||(!force&&Date.now()-last.indkob<45000))return;
 busy.indkob=true;
 try{
  const {data,error}=await api.client.from("family_groceries").select("*").eq("family_id",family.id).order("created_at",{ascending:true}).limit(500);
  if(error)throw error;if(ctx().family?.id!==family.id)return;
  items=data||[];last.indkob=Date.now();drawGro();
 }catch(e){notice("gro-notice","Indkøb kunne ikke hentes: "+e.message,true);}finally{busy.indkob=false;}
}
async function saveGro(e){
 e.preventDefault();const {family,user}=ctx();if(!family||!user)return;
 const name=$("gro-name").value.trim(),amount=$("gro-amount").value.trim(),category=$("gro-category").value;
 if(!name)return;
 $("gro-save").disabled=true;
 try{
  const row={name,amount,category,updated_at:new Date().toISOString()};
  const r=groEdit?await api.client.from("family_groceries").update(row).eq("id",groEdit).eq("family_id",family.id):
   await api.client.from("family_groceries").insert({...row,family_id:family.id,created_by:user.id});
  if(r.error)throw r.error;clearGro();await loadGro(true);notice("gro-notice","Indkøbslisten er opdateret.");
 }catch(e){notice("gro-notice","Kunne ikke gemme vare: "+e.message,true);}finally{$("gro-save").disabled=false;}
}
async function checkGro(id,checked){
 const {error}=await api.client.from("family_groceries").update({checked,updated_at:new Date().toISOString()}).eq("id",id).eq("family_id",ctx().family.id);
 if(error)notice("gro-notice","Kunne ikke markere varen: "+error.message,true);
 else await loadGro(true);
}
async function deleteGro(id){
 const {error}=await api.client.from("family_groceries").delete().eq("id",id).eq("family_id",ctx().family.id);
 if(error)notice("gro-notice","Kunne ikke slette varen: "+error.message,true);else await loadGro(true);
}
async function clearChecked(){
 if(!items.some(i=>i.checked)||!confirm("Fjern alle afkrydsede varer fra listen?"))return;
 const {error}=await api.client.from("family_groceries").delete().eq("family_id",ctx().family.id).eq("checked",true);
 if(error)notice("gro-notice",error.message,true);else await loadGro(true);
}
function groClick(e){
 const btn=e.target.closest("button");if(!btn)return;
 const id=btn.dataset.groEdit||btn.dataset.groDelete;
 if(btn.dataset.groDelete)void deleteGro(id);
 if(btn.dataset.groEdit){
  const x=items.find(i=>i.id===id);if(!x)return;
  groEdit=x.id;$("gro-name").value=x.name;$("gro-amount").value=x.amount||"";
  $("gro-category").value=cats.includes(x.category)?x.category:"Andet";
  $("gro-save").textContent="Gem ændring";$("gro-cancel").classList.remove("hidden");
  $("gro-form").scrollIntoView({behavior:"smooth",block:"start"});
 }
}
function weekLabel(){
 const days=weekDays();
 $("week-label").textContent=dateLabel(days[0])+" – "+dateLabel(days[6]);
}
function renderWeek(){
 weekLabel();const days=weekDays();
 $("meal-week").innerHTML=days.map(d=>{
  const entries=meals.filter(x=>x.meal_date===d);
  return '<div class="house-card"><h3>'+safe(dateLabel(d))+'</h3>'+
   ["breakfast","lunch","dinner"].map(slot=>{
    const m=entries.find(x=>x.meal_slot===slot);
    return '<div class="meal-line"><div class="item-main"><span class="subtle small">'+slotLabel[slot]+'</span>'+
      '<div class="item-title">'+(m?safe(m.title):'<span class="muted">Ikke planlagt</span>')+'</div>'+
      (m?.note?'<div class="item-sub">'+safe(m.note)+'</div>':"")+'</div>'+
      '<div class="item-actions"><button type="button" class="tiny-btn" data-meal-open="'+d+'|'+slot+'">'+(m?"Ret":"Tilføj")+'</button>'+
      (m?'<button type="button" class="tiny-btn" data-meal-delete="'+m.id+'">Slet</button>':"")+'</div></div>';
   }).join("")+'</div>';
 }).join("");
 $("meal-groceries").disabled=!meals.some(x=>weekDays().includes(x.meal_date)&&x.recipe_id);
}
function recipeOptions(){
 const el=$("meal-recipe"),prior=el.value;
 el.innerHTML='<option value="">Ingen opskrift</option>'+recipes.map(x=>'<option value="'+x.id+'">'+safe(x.title)+'</option>').join("");
 el.value=recipes.some(x=>x.id===prior)?prior:"";
}
function renderRecipes(){
 $("recipe-count").textContent=recipes.length+" opskrifter";
 const shown=recipes.filter(x=>x.title.toLocaleLowerCase("da-DK").includes(searchText.toLocaleLowerCase("da-DK")));
 $("recipe-list").innerHTML=shown.length?shown.map(x=>{
  return '<details class="house-card house-recipe"><summary><strong>'+safe(x.title)+'</strong><span class="subtle small">'+x.servings+' portioner'+(x.prep_minutes?" · "+x.prep_minutes+" min":"")+'</span></summary>'+
   '<div class="house-recipe-content"><h4>Ingredienser</h4><p class="house-lines">'+(x.ingredients?safe(x.ingredients).replace(/\n/g,"<br>"):"Ikke udfyldt")+'</p>'+
   '<h4>Fremgangsmåde</h4><p class="house-lines">'+(x.instructions?safe(x.instructions).replace(/\n/g,"<br>"):"Ikke udfyldt")+'</p>'+
   '<div class="row"><button type="button" class="btn soft" data-recipe-shop="'+x.id+'">Til indkøbslisten</button>'+
   '<button type="button" class="btn" data-recipe-plan="'+x.id+'">Brug i madplan</button>'+
   '<button type="button" class="tiny-btn" data-recipe-edit="'+x.id+'">Ret</button>'+
   '<button type="button" class="tiny-btn" data-recipe-delete="'+x.id+'">Slet</button></div></div></details>';
 }).join(""):'<div class="empty">Ingen opskrifter matcher søgningen. Opret en opskrift nedenfor.</div>';
}
function clearRecipe(){
 recipeEdit=null;$("recipe-form").reset();$("recipe-servings").value=2;
 $("recipe-form-title").textContent="Ny opskrift";$("recipe-save").textContent="Gem opskrift";$("recipe-cancel").classList.add("hidden");
}
function clearMeal(){
 $("meal-form").reset();$("meal-date").disabled=false;$("meal-slot").disabled=false;
 $("meal-date").value=localDay(new Date());$("meal-slot").value="dinner";$("meal-save").textContent="Gem i madplan";
}
async function loadFood(force=false){
 const {family}=ctx();if(!family||busy.madplan||(!force&&Date.now()-last.madplan<45000))return;
 busy.madplan=true;
 const requestedWeek=weekDays()[0];
 try{
  const d=weekDays();
  const [r,m]=await Promise.all([
   api.client.from("family_recipes").select("*").eq("family_id",family.id).order("title").limit(350),
   api.client.from("family_meal_plan").select("*").eq("family_id",family.id).gte("meal_date",d[0]).lte("meal_date",d[6]).order("meal_date").limit(100)
  ]);
  if(r.error)throw r.error;if(m.error)throw m.error;
  if(ctx().family?.id!==family.id||weekDays()[0]!==requestedWeek)return;
  recipes=r.data||[];meals=m.data||[];last.madplan=Date.now();recipeOptions();renderWeek();renderRecipes();
 }catch(e){notice("meal-notice","Kunne ikke hente madplan: "+e.message,true);}
 finally{
  busy.madplan=false;
  if(ctx().family?.id===family.id&&weekDays()[0]!==requestedWeek&&active==="madplan")void loadFood(true);
 }
}
async function saveRecipe(e){
 e.preventDefault();const {family,user}=ctx();if(!family||!user)return;
 const title=$("recipe-title").value.trim(),servings=Number($("recipe-servings").value),minutes=$("recipe-minutes").value.trim(),prep_minutes=minutes?Number(minutes):null;
 if(!title||!(servings>=1&&servings<=20)||(minutes&&!(prep_minutes>=1&&prep_minutes<=600))){notice("recipe-notice","Kontrollér opskriftens titel, portioner og tid.",true);return;}
 $("recipe-save").disabled=true;
 try{
  const row={title,servings,prep_minutes,ingredients:$("recipe-ingredients").value.trim(),
   instructions:$("recipe-steps").value.trim(),updated_at:new Date().toISOString()};
  const r=recipeEdit?await api.client.from("family_recipes").update(row).eq("id",recipeEdit).eq("family_id",family.id):
    await api.client.from("family_recipes").insert({...row,family_id:family.id,created_by:user.id});
  if(r.error)throw r.error;clearRecipe();await loadFood(true);notice("recipe-notice","Opskriften er gemt.");
 }catch(e){notice("recipe-notice","Kunne ikke gemme opskrift: "+e.message,true);}finally{$("recipe-save").disabled=false;}
}
async function saveMeal(e){
 e.preventDefault();const {family,user}=ctx();if(!family||!user)return;
 const meal_date=$("meal-date").value,meal_slot=$("meal-slot").value,title=$("meal-title").value.trim(),recipe_id=$("meal-recipe").value||null;
 if(!meal_date||!title||!Object.keys(slotLabel).includes(meal_slot)){notice("meal-notice","Udfyld dato, måltid og navn.",true);return;}
 $("meal-save").disabled=true;
 try{
  const {data:existing,error:findError}=await api.client.from("family_meal_plan")
    .select("id").eq("family_id",family.id).eq("meal_date",meal_date).eq("meal_slot",meal_slot).maybeSingle();
  if(findError)throw findError;
  const row={title,recipe_id,note:$("meal-note").value.trim(),updated_at:new Date().toISOString()};
  const result=existing?
   await api.client.from("family_meal_plan").update(row).eq("family_id",family.id).eq("id",existing.id):
   await api.client.from("family_meal_plan").insert({...row,family_id:family.id,meal_date,meal_slot,created_by:user.id});
  if(result.error)throw result.error;
  clearMeal();const start=monday();const target=new Date(meal_date+"T12:00:00");
  weekOffset=Math.round((target-start)/(7*86400000));
  await loadFood(true);notice("meal-notice","Måltidet er gemt i ugeplanen.");
 }catch(err){notice("meal-notice","Kunne ikke gemme måltid: "+err.message,true);}finally{$("meal-save").disabled=false;}
}
function openMeal(date,slot){
 const m=meals.find(x=>x.meal_date===date&&x.meal_slot===slot);
 $("meal-date").value=date;$("meal-slot").value=slot;$("meal-recipe").value=m?.recipe_id||"";
 $("meal-title").value=m?.title||"";$("meal-note").value=m?.note||"";
 $("meal-date").disabled=Boolean(m);$("meal-slot").disabled=Boolean(m);
 $("meal-save").textContent=m?"Gem ændringer":"Gem i madplan";
 $("meal-form").scrollIntoView({behavior:"smooth",block:"start"});
}
async function deleteMeal(id){
 if(!confirm("Fjern måltidet fra madplanen?"))return;
 const {error}=await api.client.from("family_meal_plan").delete().eq("family_id",ctx().family.id).eq("id",id);
 if(error)notice("meal-notice",error.message,true);
 else await loadFood(true);
}
async function deleteRecipe(id){
 if(!confirm("Slet opskriften? Planlagte måltider bliver stående uden link til opskriften."))return;
 const {error}=await api.client.from("family_recipes").delete().eq("family_id",ctx().family.id).eq("id",id);
 if(error)notice("recipe-notice",error.message,true);
 else await loadFood(true);
}
function editRecipe(id){
 const r=recipes.find(x=>x.id===id);if(!r)return;
 recipeEdit=id;$("recipe-title").value=r.title;$("recipe-servings").value=r.servings;
 $("recipe-minutes").value=r.prep_minutes||"";$("recipe-ingredients").value=r.ingredients||"";$("recipe-steps").value=r.instructions||"";
 $("recipe-form-title").textContent="Ret opskrift";$("recipe-save").textContent="Gem ændringer";$("recipe-cancel").classList.remove("hidden");
 $("recipe-form").scrollIntoView({behavior:"smooth",block:"start"});
}
async function addIngredients(lines){
 const {family,user}=ctx();if(!family||!user)return 0;
 const products=[...new Set(lines.map(x=>String(x).replace(/^\s*[-•*]\s*/,"").trim()).filter(Boolean).map(x=>x.slice(0,120)))];
 if(!products.length)return 0;
 const current=await api.client.from("family_groceries").select("name").eq("family_id",family.id).eq("checked",false).limit(1000);
 if(current.error)throw current.error;
 const existing=new Set((current.data||[]).map(x=>x.name.toLocaleLowerCase("da-DK")));
 const unseen=products.filter(name=>{
  const key=name.toLocaleLowerCase("da-DK");
  if(existing.has(key))return false;existing.add(key);return true;
 });
 const newRows=unseen.map(name=>({family_id:family.id,name,category:"Andet",created_by:user.id}));
 if(newRows.length){
  const {error}=await api.client.from("family_groceries").insert(newRows);if(error)throw error;
 }
 last.indkob=0;
 return newRows.length;
}
async function recipeToGro(id){
 const r=recipes.find(x=>x.id===id);if(!r)return;
 try{const added=await addIngredients(r.ingredients.split(/\r?\n/));notice("recipe-notice",added+" ingredienser er føjet til indkøbslisten (dubletter springes over).");}
 catch(e){notice("recipe-notice","Kunne ikke tilføje ingredienser: "+e.message,true);}
}
async function weekToGro(){
 const planned=meals.filter(x=>weekDays().includes(x.meal_date)&&x.recipe_id);
 const ingredients=planned.flatMap(m=>(recipes.find(r=>r.id===m.recipe_id)?.ingredients||"").split(/\r?\n/));
 if(!ingredients.some(x=>x.trim())){notice("meal-notice","Ugens planlagte opskrifter har ingen ingredienser endnu.");return;}
 try{const added=await addIngredients(ingredients);notice("meal-notice",added+" ingredienser er tilføjet til indkøbslisten.");}
 catch(e){notice("meal-notice","Kunne ikke tilføje indkøb: "+e.message,true);}
}
function foodClick(e){
 const b=e.target.closest("button");if(!b)return;
 if(b.dataset.mealOpen){const [d,slot]=b.dataset.mealOpen.split("|");openMeal(d,slot);}
 if(b.dataset.mealDelete)void deleteMeal(b.dataset.mealDelete);
 if(b.dataset.recipeEdit)editRecipe(b.dataset.recipeEdit);
 if(b.dataset.recipeDelete)void deleteRecipe(b.dataset.recipeDelete);
 if(b.dataset.recipeShop)void recipeToGro(b.dataset.recipeShop);
 if(b.dataset.recipePlan){
  const r=recipes.find(x=>x.id===b.dataset.recipePlan);if(r){
   clearMeal();$("meal-recipe").value=r.id;$("meal-title").value=r.title;
   $("meal-form").scrollIntoView({behavior:"smooth",block:"start"});
  }
 }
}
function init(config){
 api=config;rootGro();rootFood();
 $("gro-form").addEventListener("submit",saveGro);$("gro-cancel").addEventListener("click",clearGro);
 $("gro-refresh").addEventListener("click",()=>void loadGro(true));
 $("gro-clear").addEventListener("click",()=>void clearChecked());
 $("gro-show-checked").addEventListener("change",e=>{showChecked=e.target.checked;drawGro();});
 $("gro-list").addEventListener("change",e=>{const id=e.target.dataset.groCheck;if(id)void checkGro(id,e.target.checked);});
 $("gro-list").addEventListener("click",groClick);
 $("meal-form").addEventListener("submit",saveMeal);$("meal-cancel").addEventListener("click",clearMeal);
 $("meal-recipe").addEventListener("change",e=>{const r=recipes.find(x=>x.id===e.target.value);if(r)$("meal-title").value=r.title;});
 $("recipe-form").addEventListener("submit",saveRecipe);$("recipe-cancel").addEventListener("click",clearRecipe);
 $("recipe-search").addEventListener("input",e=>{searchText=e.target.value.trim();renderRecipes();});
 $("food-module").addEventListener("click",foodClick);
 $("food-refresh").addEventListener("click",()=>void loadFood(true));
 $("meal-groceries").addEventListener("click",()=>void weekToGro());
 $("week-prev").addEventListener("click",()=>{weekOffset--;last.madplan=0;void loadFood(true);});
 $("week-next").addEventListener("click",()=>{weekOffset++;last.madplan=0;void loadFood(true);});
 $("week-today").addEventListener("click",()=>{weekOffset=0;last.madplan=0;void loadFood(true);});
}
function onView(v){active=v;if(v==="indkob")void loadGro(true);if(v==="madplan")void loadFood(true);}
function refresh(){if(active==="indkob"&&$("view-indkob").classList.contains("active"))void loadGro();if(active==="madplan"&&$("view-madplan").classList.contains("active"))void loadFood();}
function reset(){
 items=[];recipes=[];meals=[];groEdit=null;recipeEdit=null;weekOffset=0;showChecked=true;searchText="";
 last={indkob:0,madplan:0};busy={indkob:false,madplan:false};active="";
 if(api){clearGro();clearRecipe();clearMeal();$("recipe-search").value="";$("gro-show-checked").checked=true;drawGro();renderWeek();renderRecipes();notice("gro-notice","");notice("meal-notice","");notice("recipe-notice","");}
}
window.FoodModule={init,onView,refresh,reset};
})();