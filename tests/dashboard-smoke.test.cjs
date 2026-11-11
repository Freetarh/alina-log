// node --test tests/dashboard-smoke.test.cjs
// Dependency-free smoke tests of dashboard shell and WHO reference mathematics.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
const scripts=['family-dashboard.js','google-calendar.js','growth.js','home.js','household.js','food.js'];
const assets=['index.html','manifest.webmanifest','sw.js','family-dashboard.css','household.css','google-setup.html',...scripts];

test('all necessary static assets exist and JavaScript parses',()=>{
 for(const file of assets)assert.ok(fs.existsSync(path.join(root,file)),file);
 for(const file of scripts)assert.doesNotThrow(()=>new vm.Script(load(file),{filename:file}));
 const inline=load('index.html').match(/<script>\s*([\s\S]*?)<\/script>/);
 assert.ok(inline,'inline application script');
 assert.doesNotThrow(()=>new vm.Script(inline[1],{filename:'app-inline.js'}));
 assert.doesNotThrow(()=>JSON.parse(load('manifest.webmanifest')));
});
test('PWA caches every client module and index references all scripts',()=>{
 const html=load('index.html'),sw=load('sw.js');
 for(const f of scripts){assert.ok(html.includes('src="./'+f+'"'),f);assert.ok(sw.includes("'./"+f+"'"),f);}
 assert.ok(html.includes('href="./household.css"'));
});
test('all static HTML IDs are unique and main routes exist',()=>{
 const html=load('index.html');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'duplicate HTML IDs');
 for(const view of ['hjem','overblik','vaegt','kalender','moduler','tilskud','rengoring','indkob','madplan','indstillinger']){
  assert.ok(ids.includes('view-'+view),'missing '+view);
   const settingsPos=html.indexOf('id="view-indstillinger"');
  const accountPos=html.indexOf('id="cloud-account"');
  assert.ok(accountPos>settingsPos,'Account details must be inside Settings, not above tabs');
  assert.ok(html.includes('id="settings-shortcut"'),'Settings shortcut in header');
  assert.ok(html.includes('id="copy-family-code"'),'Family-code copy preserved');
  assert.ok(html.includes('id="logout-btn"'),'Logout preserved');
});
test('WHO girls reference curves match published LMS medians',()=>{
 const w={};vm.runInNewContext(load('growth.js'),{window:w,document:{getElementById:()=>null}});
 const {ref,cdf,zscore}=w.GrowthModule.reference;
 const points=[[0,3.2322],[7,3.3388],[42,4.5793],[91,5.8393],[365.25,8.9481],[730.5,11.4775]];
 for(const [age,median] of points)assert.ok(Math.abs(ref(age,0)-median)<0.015,'age='+age);
 assert.ok(Math.abs(cdf(0)-.5)<.00001);
 assert.ok(Math.abs(cdf(-2)-.0227501)<.0001);
 assert.ok(Math.abs(zscore(0,3232.2))<.001);
});
function createFakeDOM(html){
 const elements=new Map();
 function get(id){
  if(elements.has(id))return elements.get(id);
  let source='';
  const obj={id,value:'',checked:false,disabled:false,textContent:'',dataset:{},style:{},listeners:{},
   classList:{toggle(){},add(){},remove(){},contains(){return true}},
   addEventListener(type,fn){this.listeners[type]=fn;},scrollIntoView(){},reset(){},querySelector(){return {disabled:false}},
   get innerHTML(){return source},
   set innerHTML(next){source=String(next);for(const m of source.matchAll(/\bid="([^"]+)"/g))get(m[1]);}
  };
  elements.set(id,obj);return obj;
 }
 for(const m of html.matchAll(/\bid="([^"]+)"/g))get(m[1]);
 return {document:{getElementById:get},get};
}
class MockQuery {
 constructor(table,storage){this.table=table;this.storage=storage;}
 select(){return this;}eq(){return this;}order(){return this;}gte(){return this;}lte(){return this;}lt(){return this;}is(){return this;}limit(){return this;}
 maybeSingle(){return Promise.resolve({data:this.storage[this.table]?.[0]||null,error:null});}
 then(ok,bad){return Promise.resolve({data:this.storage[this.table]||[],error:null}).then(ok,bad);}
}
test('new household views render from one family without throwing',async()=>{
 const {document,get}=createFakeDOM(load('index.html')),win={};
 const today=new Date(),d=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
 const db={
  family_supplements:[{id:'s1',code:'vitamin_d',title:'D-dråber',dose_instructions:'',daily_goal:null,schedule_time:null,active:true},
   {id:'s2',code:'iron',title:'Jern',dose_instructions:'',daily_goal:null,schedule_time:null,active:true}],
  family_supplement_doses:[],family_chores:[{id:'c1',title:'Badeværelse',repeat_days:7,due_on:d,responsible:'Begge',completed:false,details:''}],
  family_chore_history:[],family_groceries:[{id:'g1',name:'Mælk',amount:'1 liter',category:'Køl og mejeri',checked:false,created_at:new Date().toISOString()}],
  family_recipes:[{id:'r1',title:'Pasta',servings:2,prep_minutes:20,ingredients:'Pasta\nTomat',instructions:'Kog'}],
  family_meal_plan:[{id:'m1',meal_date:d,meal_slot:'dinner',title:'Pasta',recipe_id:'r1',note:''}],
  alina_growth_measures:[{id:'gr1',kind:'length',measured_on:d,value_mm:505,note:''}],
  family_events:[{id:'e1',title:'Lægebesøg',visibility:'family',show_on_family_calendar:true,starts_at:new Date().toISOString()}]
 };
 const quickActions=[],navigations=[],newEvents=[];
 const cfg={client:{from:x=>new MockQuery(x,db)},getState:()=>({
  user:{id:'u1'},family:{id:'f1'},
  entries:[{kind:'weight',at:new Date().toISOString(),grams:3400},
   {kind:'weight',at:new Date(Date.now()-7*86400000).toISOString(),grams:3200}]
 }),go(route){navigations.push(route);},openEntry(kind){quickActions.push(kind);},openEvent(){newEvents.push('new');}};
 for(const f of ['growth.js','household.js','food.js','home.js'])vm.runInNewContext(load(f),{window:win,document,console,confirm:()=>true});
 for(const key of ['GrowthModule','HouseholdModule','FoodModule','HomeModule'])assert.doesNotThrow(()=>win[key].init(cfg));
 for(const [module,route] of [['GrowthModule','vaegt'],['HouseholdModule','tilskud'],['HouseholdModule','rengoring'],
  ['FoodModule','indkob'],['FoodModule','madplan'],['HomeModule','hjem']])assert.doesNotThrow(()=>win[module].onView(route));
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.match(get('weight-plot').innerHTML,/<svg/);
 assert.match(get('supplement-list').innerHTML,/D-dråber/);
 assert.match(get('chore-list').innerHTML,/Badeværelse/);
 assert.match(get('gro-list').innerHTML,/Mælk/);
 assert.match(get('recipe-list').innerHTML,/Pasta/);
 assert.match(get('meal-week').innerHTML,/Aftensmad/);
 assert.match(get('home-glance').innerHTML,/Dagens overblik/);
 assert.match(get('home-glance').innerHTML,/Amning/);
 assert.match(get('home-glance').innerHTML,/Aftensmad/);
 const home=get('home-glance');
 assert.equal(typeof home.listeners.click,'function','Home delegated action handler');
 home.listeners.click({target:{closest(selector){return selector==='[data-home-kind]'?{dataset:{homeKind:'breast'}}:null;}}});
 assert.deepEqual(quickActions,['breast'],'Quick nursing entry opens registration');
 home.listeners.click({target:{closest(selector){return selector==='[data-home-go]'?{dataset:{homeGo:'kalender'}}:null;}}});
 assert.deepEqual(navigations,['kalender'],'Calendar shortcut opens calendar');
 home.listeners.click({target:{closest(selector){return selector==='[data-home-new-event]'?{}:null;}}});
 assert.deepEqual(newEvents,['new'],'Quick new appointment launches its form');
 for(const key of ['GrowthModule','HouseholdModule','FoodModule','HomeModule'])assert.doesNotThrow(()=>win[key].reset());
});
