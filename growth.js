/* WHO weight-for-age for girls: official LMS weekly 0-13 weeks, monthly 0-24 months.
   https://www.who.int/tools/child-growth-standards/standards/weight-for-age */
(function(){
'use strict';
const BIRTH="2026-10-06",dayMs=86400000,$=id=>document.getElementById(id);
const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=d=>new Date(d).toLocaleDateString("da-DK",{day:"numeric",month:"short",year:"numeric"});
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const one=x=>Number(x).toLocaleString("da-DK",{maximumFractionDigits:1});
const born=Date.UTC(2026,9,6),age=d=>(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-born)/dayMs;
const W="0 .3809 3.2322 .14171|1 .2671 3.3388 .14600|2 .2304 3.5693 .14339|3 .2024 3.8352 .14060|4 .1789 4.0987 .13805|5 .1582 4.3476 .13583|6 .1395 4.5793 .13392|7 .1224 4.7950 .13228|8 .1065 4.9959 .13087|9 .0918 5.1842 .12966|10 .0779 5.3618 .12861|11 .0648 5.5295 .12770|12 .0525 5.6883 .12691|13 .0407 5.8393 .12622";
const M="0 .3809 3.2322 .14171|1 .1714 4.1873 .13724|2 .0962 5.1282 .13000|3 .0402 5.8458 .12619|4 -.0050 6.4237 .12402|5 -.0430 6.8985 .12274|6 -.0756 7.2970 .12204|7 -.1039 7.6422 .12178|8 -.1288 7.9487 .12181|9 -.1507 8.2254 .12199|10 -.1700 8.4800 .12223|11 -.1872 8.7192 .12247|12 -.2024 8.9481 .12268|13 -.2158 9.1699 .12283|14 -.2278 9.3870 .12294|15 -.2384 9.6008 .12299|16 -.2478 9.8124 .12303|17 -.2562 10.0226 .12306|18 -.2637 10.2315 .12309|19 -.2703 10.4393 .12315|20 -.2762 10.6464 .12323|21 -.2815 10.8534 .12335|22 -.2862 11.0608 .12350|23 -.2903 11.2688 .12369|24 -.2941 11.4775 .12390";
function table(raw,days){return raw.split("|").map(line=>{const [x,L,M,S]=line.trim().split(/\s+/).map(Number);return {day:x*days,L,M,S};});}
const weeks=table(W,7),months=table(M,365.25/12);
function lms(d){
 if(d<0||d>months[24].day)return null;
 const rows=d<=91?weeks:months;
 for(let i=1;i<rows.length;i++)if(d<=rows[i].day){
  const a=rows[i-1],b=rows[i],u=Math.max(0,(d-a.day)/(b.day-a.day));
  return {L:a.L+(b.L-a.L)*u,M:a.M+(b.M-a.M)*u,S:a.S+(b.S-a.S)*u};
 }
 return rows[rows.length-1];
}
function ref(d,z){const a=lms(d);return !a?NaN:a.M*(Math.abs(a.L)<1e-8?Math.exp(a.S*z):Math.pow(Math.max(.001,1+a.L*a.S*z),1/a.L));}
function zscore(d,grams){const a=lms(d),kg=grams/1000;return !a||!(kg>0)?NaN:Math.abs(a.L)<1e-8?Math.log(kg/a.M)/a.S:(Math.pow(kg/a.M,a.L)-1)/(a.L*a.S);}
function cdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989422804014327*Math.exp(-z*z/2),p=d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return Math.max(0,Math.min(1,z>=0?1-p:p));}
let api=null,measures=[],editing=null,busy=false;
const ctx=()=>api?.getState()||{};
function weights(){return(ctx().entries||[]).filter(e=>e.kind==="weight"&&Number(e.grams)>0&&Number.isFinite(Date.parse(e.at))).map(e=>({...e,g:Number(e.grams),a:age(new Date(e.at))})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}
function renderWeights(){
 if(!$("weight-plot"))return;
 const all=weights(),period=$("weight-period").value,cut=period==="all"?-Infinity:Date.now()-Number(period)*dayMs;
 const pts=all.filter(e=>Date.parse(e.at)>=cut),recent=all[all.length-1];
 const chart=$("weight-plot"),summary=$("weight-summary"),list=$("weight-list");
 if(!recent){chart.innerHTML='<div class="empty">Ingen vejninger endnu. Registrér en vægt for at starte kurven.</div>';summary.innerHTML="";list.innerHTML="";return;}
 const z=zscore(recent.a,recent.g),first=pts[0]||recent,change=recent.g-first.g;
 summary.innerHTML='<div class="weight-stat"><span>Seneste vejning</span><strong>'+recent.g.toLocaleString("da-DK")+' g</strong></div>'+
 '<div class="weight-stat"><span>Ændring i perioden</span><strong>'+(change>0?"+":"")+change.toLocaleString("da-DK")+' g</strong></div>'+
 '<div class="weight-stat"><span>WHO vægt-for-alder</span><strong>'+(Number.isFinite(z)?"Ca. "+one(100*cdf(z))+". percentil":"Ingen reference")+'</strong></div>'+
 '<div class="weight-stat"><span>Alder ved vejning</span><strong>'+Math.floor(recent.a)+" dage</strong></div>";
 const upper=Math.min(731,Math.max(50,Math.ceil(Math.max(recent.a,age(new Date()))+10)));
 const min=period==="all"?0:Math.max(0,upper-Number(period)),max=Math.max(min+14,upper);
 const samples=Array.from({length:81},(_,i)=>min+(max-min)*i/80);
 const chosen=pts.filter(p=>p.a>=min&&p.a<=max);
 const values=samples.flatMap(a=>[-2,0,2].map(z=>ref(a,z)*1000)).filter(Number.isFinite).concat(chosen.map(p=>p.g));
 if(!values.length){chart.innerHTML='<div class="empty">WHO-referencen gælder til 24 måneder.</div>';return;}
 const low=Math.max(0,Math.min(...values)-300),high=Math.max(...values)+300,X=660,Y=330,L=54,R=16,T=22,B=44;
 const sx=d=>L+(d-min)/(max-min)*(X-L-R),sy=g=>T+(high-g)/(high-low)*(Y-T-B);
 let svg='<svg viewBox="0 0 '+X+' '+Y+'" role="img" aria-label="WHO vægt-for-alder standardkurver og Alinas vejninger">';
 for(let i=0;i<=4;i++){const v=low+(high-low)*i/4,y=sy(v);svg+='<line x1="'+L+'" y1="'+y+'" x2="'+(X-R)+'" y2="'+y+'" stroke="#dae6e1"/><text x="'+(L-6)+'" y="'+(y+4)+'" font-size="12" text-anchor="end" fill="#607781">'+one(v/1000)+'</text>';}
 for(const z of [-2,-1,0,1,2]){
  const line=samples.map(a=>{const kg=ref(a,z);return Number.isFinite(kg)?sx(a).toFixed(1)+","+sy(kg*1000).toFixed(1):null;}).filter(Boolean);
  const color=z===0?"#9b8cb5":Math.abs(z)===2?"#d6a584":"#b1c9c1";
  if(line.length)svg+='<polyline fill="none" stroke="'+color+'" stroke-width="'+(z===0?2.5:1.5)+'" stroke-dasharray="'+(z===0?"none":"5 4")+'" points="'+line.join(" ")+'"/>';
  const endpoint=ref(max,z);if(Number.isFinite(endpoint))svg+='<text x="'+(X-R-3)+'" y="'+(sy(endpoint*1000)-3)+'" text-anchor="end" fill="'+color+'" font-size="11">'+(z>0?"+":"")+z+' SD</text>';
 }
 if(chosen.length>1)svg+='<polyline fill="none" stroke="#176e76" stroke-width="3.5" points="'+chosen.map(p=>sx(p.a)+","+sy(p.g)).join(" ")+'"/>';
 for(const p of chosen)svg+='<circle cx="'+sx(p.a)+'" cy="'+sy(p.g)+'" r="5" fill="#176e76" stroke="white" stroke-width="1.5"><title>'+safe(date(p.at))+': '+p.g+' g</title></circle>';
 for(const n of [min,(min+max)/2,max])svg+='<text x="'+sx(n)+'" y="'+(Y-12)+'" font-size="12" fill="#607781" text-anchor="middle">'+Math.round(n)+' dage</text>';
 chart.innerHTML=svg+'</svg>';
 list.innerHTML=pts.slice(-12).reverse().map(p=>{const z=zscore(p.a,p.g);return '<div class="item"><div class="item-main"><div class="item-title">'+p.g.toLocaleString("da-DK")+' g</div><div class="item-sub">'+safe(date(p.at))+" · "+Math.round(p.a)+" dage"+(Number.isFinite(z)?" · ca. "+one(cdf(z)*100)+". pct.":"")+(p.note?" · "+safe(p.note):"")+'</div></div></div>';}).join("")||'<div class="empty">Ingen vejninger i valgt periode.</div>';
}
function drawMeasures(){
 if(!$("growth-measures-list"))return;
 const kind=$("growth-kind").value,items=measures.filter(x=>x.kind===kind).sort((a,b)=>b.measured_on.localeCompare(a.measured_on));
 const label=kind==="length"?"Længde":"Hovedomfang";
 $("growth-chart-title").textContent=label+" over tid";
 $("growth-measures-list").innerHTML=items.length?items.slice(0,15).map(x=>'<div class="item"><div class="item-main"><div class="item-title">'+one(x.value_mm/10)+' cm</div><div class="item-sub">'+safe(date(x.measured_on+"T12:00:00"))+(x.note?" · "+safe(x.note):"")+'</div></div><div class="item-actions"><button type="button" class="tiny-btn" data-grow-edit="'+x.id+'">Ret</button><button type="button" class="tiny-btn" data-grow-delete="'+x.id+'">Slet</button></div></div>').join(""):'<div class="empty">Ingen målinger endnu.</div>';
 const chart=$("growth-own-chart");if(items.length<2){chart.innerHTML='<div class="empty">Registrér to målinger for at se udviklingen.</div>';return;}
 const pts=items.slice().reverse().map(x=>({a:age(new Date(x.measured_on+"T12:00:00Z")),v:x.value_mm/10,at:x.measured_on})),vmin=Math.min(...pts.map(x=>x.v))-1,vmax=Math.max(...pts.map(x=>x.v))+1,amin=pts[0].a,amax=pts[pts.length-1].a;
 const sx=a=>amin===amax?300:40+(a-amin)/(amax-amin)*540,sy=v=>20+(vmax-v)/(vmax-vmin)*175;
 let s='<svg viewBox="0 0 600 235" role="img" aria-label="'+label+' over tid">';
 for(let i=0;i<=4;i++){const v=vmin+(vmax-vmin)*i/4,y=sy(v);s+='<line x1="40" x2="582" y1="'+y+'" y2="'+y+'" stroke="#e0eae7"/><text x="35" y="'+(y+4)+'" text-anchor="end" font-size="12" fill="#607781">'+one(v)+'</text>';}
 s+='<polyline fill="none" stroke="#176e76" stroke-width="3" points="'+pts.map(x=>sx(x.a)+","+sy(x.v)).join(" ")+'"/>';
 for(const p of pts)s+='<circle cx="'+sx(p.a)+'" cy="'+sy(p.v)+'" r="4.5" fill="#176e76"><title>'+safe(date(p.at+"T12:00:00"))+': '+one(p.v)+' cm</title></circle>';
 chart.innerHTML=s+'</svg>';
}
function clear(){
 editing=null;$("growth-form").reset();$("growth-date").value=iso(new Date());
 $("growth-save").textContent="Gem måling";$("growth-cancel").classList.add("hidden");$("growth-notice").textContent="";
}
async function load(){
 const f=ctx().family;if(!f||busy)return;busy=true;
 try{const {data,error}=await api.client.from("alina_growth_measures").select("id,kind,measured_on,value_mm,note").eq("family_id",f.id).order("measured_on",{ascending:false}).limit(500);
  if(error)throw error;if(ctx().family?.id!==f.id)return;measures=data||[];drawMeasures();
 }catch(e){$("growth-notice").textContent="Kunne ikke hente målinger: "+e.message;}finally{busy=false;}
}
async function save(e){
 e.preventDefault();const {family,user}=ctx();if(!family||!user)return;
 const kind=$("growth-kind").value,measured_on=$("growth-date").value,mm=Math.round(Number($("growth-value").value.replace(",","."))*10);
 if(!measured_on||!(kind==="length"?mm>=350&&mm<=1250:mm>=250&&mm<=700)){ $("growth-notice").textContent="Kontrollér dato og cm-måling.";return; }
 const row={kind,measured_on,value_mm:mm,note:$("growth-note").value.trim().slice(0,300)};
 $("growth-save").disabled=true;
 try{
  const query=editing?api.client.from("alina_growth_measures").update(row).eq("family_id",family.id).eq("id",editing):
   api.client.from("alina_growth_measures").insert({...row,family_id:family.id,created_by:user.id});
  const {error}=await query;if(error)throw error;clear();await load();$("growth-notice").textContent="Målingen er gemt.";
 }catch(err){$("growth-notice").textContent="Kunne ikke gemme: "+err.message;}finally{$("growth-save").disabled=false;}
}
function clickMeasure(e){
 const edit=e.target.closest("[data-grow-edit]"),del=e.target.closest("[data-grow-delete]");
 const id=edit?.dataset.growEdit||del?.dataset.growDelete;if(!id)return;
 const x=measures.find(x=>x.id===id);if(!x)return;
 if(edit){editing=id;$("growth-kind").value=x.kind;$("growth-date").value=x.measured_on;$("growth-value").value=x.value_mm/10;$("growth-note").value=x.note||"";$("growth-save").textContent="Gem ændringer";$("growth-cancel").classList.remove("hidden");$("growth-form").scrollIntoView({behavior:"smooth",block:"start"});return;}
 if(!confirm("Slet denne måling?"))return;
 void(async()=>{const {error}=await api.client.from("alina_growth_measures").delete().eq("family_id",ctx().family.id).eq("id",id);if(error)$("growth-notice").textContent=error.message;else await load();})();
}
function init(config){
 api=config;$("growth-date").value=iso(new Date());
 $("growth-form").addEventListener("submit",save);$("growth-cancel").addEventListener("click",clear);
 $("growth-kind").addEventListener("change",drawMeasures);$("growth-measures-list").addEventListener("click",clickMeasure);
 $("growth-refresh").addEventListener("click",()=>void load());
}
function onView(v){if(v==="vaegt"){renderWeights();void load();}}
function reset(){measures=[];editing=null;busy=false;if(api){clear();drawMeasures();}}
window.GrowthModule={init,onView,reset,renderWeights,reference:{ref,zscore,cdf}};
})();