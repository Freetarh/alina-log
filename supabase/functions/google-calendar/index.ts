// Google Calendar bridge for Familiens dashboard.
// Google refresh tokens stay encrypted on the server and never reach GitHub Pages.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const API_URL = Deno.env.get("SUPABASE_URL") || "";
function envKey(name, legacy) {
  try { return JSON.parse(Deno.env.get(name) || "{}").default || Deno.env.get(legacy) || ""; }
  catch { return Deno.env.get(legacy) || ""; }
}
const ADMIN_KEY = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const PUBLIC_KEY = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const GOOGLE_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const TOKEN_KEY = Deno.env.get("GOOGLE_TOKEN_KEY") || "";
const RETURN_URL = Deno.env.get("GOOGLE_APP_RETURN_URL") || "https://freetarh.github.io/alina-log/";
const REDIRECT_URI = API_URL + "/functions/v1/google-calendar/callback";
const SCOPES = [
  "openid", "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");
const encoder = new TextEncoder();
const admin = createClient(API_URL, ADMIN_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function configured() {
  try { return !!(GOOGLE_ID && GOOGLE_SECRET && TOKEN_KEY && Uint8Array.from(atob(TOKEN_KEY), c => c.charCodeAt(0)).length === 32); }
  catch { return false; }
}
function cors(req) {
  const origin = req.headers.get("Origin") || "";
  let allowed = "";
  try {
    const allowedOrigin = new URL(RETURN_URL).origin;
    if (origin === allowedOrigin || (origin === "http://localhost:3000" || origin === "http://127.0.0.1:5500")) allowed = origin;
  } catch { /* no CORS */ }
  return { "Content-Type": "application/json; charset=utf-8", "Vary": "Origin", ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
function json(body, req, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
function fail(message, req, status = 400) { return json({ error: message }, req, status); }
function toBase64url(data) { return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,""); }
function rand(size = 32) { return toBase64url(crypto.getRandomValues(new Uint8Array(size))); }
async function shaHex(value) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value)))].map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function challenge(verifier) { return toBase64url(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(verifier)))); }
async function aesKey() {
  if (!configured()) throw new Error("Google Kalender er endnu ikke konfigureret.");
  return await crypto.subtle.importKey("raw", Uint8Array.from(atob(TOKEN_KEY), c=>c.charCodeAt(0)), { name:"AES-GCM" }, false, ["encrypt","decrypt"]);
}
async function encrypt(value) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(),encoder.encode(value)));
  return toBase64url(iv)+"."+toBase64url(ciphertext);
}
function decodeBase64url(value) {
  const base=value.replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base+"=".repeat((4-base.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function decrypt(value) {
  const [a,b]=String(value||"").split(".");
  if(!a||!b)throw new Error("Ugyldig Google-forbindelse.");
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decodeBase64url(a)},await aesKey(),decodeBase64url(b)));
}
async function parseAuth(req) {
  const token = (req.headers.get("Authorization")||"").match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new Error("Log ind i familiedashboardet igen.");
  const client=createClient(API_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data?.user)throw new Error("Sessionen er udløbet. Log ind igen.");
  const {data:membership,error:memberError}=await admin.from("alina_members").select("family_id").eq("user_id",data.user.id).maybeSingle();
  if(memberError||!membership)throw new Error("Ingen adgang til en familiekonto.");
  return { id:data.user.id, family_id:membership.family_id };
}
async function googleToken(userId) {
  const {data,error}=await admin.from("google_calendar_connections").select("refresh_token_enc").eq("user_id",userId).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("Forbind først din Google-konto.");
  const body=new URLSearchParams({
    client_id:GOOGLE_ID,client_secret:GOOGLE_SECRET,
    refresh_token:await decrypt(data.refresh_token_enc),grant_type:"refresh_token"
  });
  const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok||!payload.access_token)throw new Error("Google-forbindelsen kan ikke fornyes. Prøv at forbinde kontoen igen.");
  if(payload.refresh_token) {
    await admin.from("google_calendar_connections").update({refresh_token_enc:await encrypt(payload.refresh_token),updated_at:new Date().toISOString()}).eq("user_id",userId);
  }
  return payload.access_token;
}
async function googleRequest(accessToken,path,init={}) {
  const response=await fetch("https://www.googleapis.com/calendar/v3"+path,{
    ...init,headers:{Authorization:"Bearer "+accessToken,...(init.body?{"Content-Type":"application/json"}:{}),...(init.headers||{})},
  });
  const body=await response.text();
  let data={};try{data=body?JSON.parse(body):{};}catch{}
  if(!response.ok) {
    const message=data?.error?.message||"Google Kalender returnerede en fejl.";
    const err=new Error("Google Kalender: "+String(message).slice(0,160));
    err.status=response.status;
    throw err;
  }
  return data;
}
async function getCalendars(token) {
 const items=[];let page="";
 do {
  const params=new URLSearchParams({maxResults:"250"});
  if(page)params.set("pageToken",page);
  const data=await googleRequest(token,"/users/me/calendarList?"+params);
  items.push(...(data.items||[]));page=data.nextPageToken||"";
 }while(page&&items.length<1000);
 return items;
}
async function readableEventList(token,calendarId,date) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Ugyldig dato.");
  const d=new Date(date+"T00:00:00Z");
  if(!Number.isFinite(d.valueOf()))throw new Error("Ugyldig dato.");
  const t0=new Date(d.getTime()-86400000).toISOString(); // Include time zones near UTC midnight
  const t1=new Date(d.getTime()+2*86400000).toISOString();
  const items=[];let page="";
  do{
    const p=new URLSearchParams({timeMin:t0,timeMax:t1,singleEvents:"true",orderBy:"startTime",maxResults:"250"});
    if(page)p.set("pageToken",page);
    const response=await googleRequest(token,"/calendars/"+encodeURIComponent(calendarId)+"/events?"+p);
    items.push(...(response.items||[]));page=response.nextPageToken||"";
  }while(page&&items.length<1000);
  return items.filter(x=>x.status!=="cancelled"&&x.start&&(x.start.dateTime||x.start.date)).slice(0,1000).map(x=>({
    id:x.id,summary:String(x.summary||"(Uden titel)").slice(0,160),
    starts_at:x.start.dateTime||x.start.date+"T00:00:00",ends_at:x.end?.dateTime||x.end?.date+"T00:00:00",
    all_day:!!x.start.date,calendar_id:calendarId,link:x.htmlLink||""
  }));
}
async function sharedSetting(familyId) {
 const {data,error}=await admin.from("family_google_calendar_settings").select("*").eq("family_id",familyId).maybeSingle();
 if(error)throw error;return data;
}
async function authorizedShared(user) {
 const setting=await sharedSetting(user.family_id);
 if(!setting)throw new Error("Vælg først en særskilt fælles Google-kalender.");
 return {setting,token:await googleToken(setting.owner_user_id)};
}
function appointmentDates(e) {
 const start=e.start?.dateTime||e.start?.date&&e.start.date+"T00:00:00Z";
 const end=e.end?.dateTime||e.end?.date&&e.end.date+"T00:00:00Z";
 if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))return null;
 return {starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString()};
}
async function syncShared(user) {
 const {setting,token}=await authorizedShared(user);
 const now=Date.now();
 const from=new Date(now-180*86400000).toISOString(),to=new Date(now+540*86400000).toISOString();
 let page="",imported=0,updated=0,skipped=0;const seen=new Set();
 do {
  const params=new URLSearchParams({timeMin:from,timeMax:to,singleEvents:"true",orderBy:"startTime",maxResults:"250"});
  if(page)params.set("pageToken",page);
  const data=await googleRequest(token,"/calendars/"+encodeURIComponent(setting.google_calendar_id)+"/events?"+params);
  for(const g of data.items||[]){
   if(g.status==="cancelled"||g.visibility==="private"||!g.id){skipped++;continue;}
   const dates=appointmentDates(g);if(!dates){skipped++;continue;}
   seen.add(g.id);
   const {data:existing,error:lookError}=await admin.from("family_events")
      .select("id,google_updated_at,google_dirty,visibility,show_on_family_calendar")
      .eq("family_id",user.family_id).eq("google_calendar_id",setting.google_calendar_id).eq("google_event_id",g.id).maybeSingle();
   if(lookError)throw lookError;
   const googleUpdated=g.updated||new Date().toISOString();
   const updatedData={title:String(g.summary||"Aftale").slice(0,120),
     details:String(g.description||"").slice(0,500),...dates,
     google_updated_at:googleUpdated,google_etag:g.etag||null,google_all_day:!!g.start?.date};
   if(existing){
     if(existing.google_dirty){skipped++;continue;}
     if(existing.google_updated_at&&Date.parse(existing.google_updated_at)>=Date.parse(googleUpdated))continue;
     const {error}=await admin.from("family_events").update(updatedData).eq("id",existing.id);
     if(error)throw error;updated++;
   }else{
     const {error}=await admin.from("family_events").insert({...updatedData,
       family_id:user.family_id,created_by:setting.owner_user_id,
       kind:"appointment",visibility:"family",show_on_family_calendar:true,
       source:"google",google_calendar_id:setting.google_calendar_id,google_event_id:g.id});
     if(error){if(error.code==="23505")continue;throw error;}imported++;
   }
  }
  page=data.nextPageToken||"";
 }while(page&&seen.size<1500);
 await admin.from("family_google_calendar_settings").update({last_synced_at:new Date().toISOString()}).eq("family_id",user.family_id);
 // We never delete local records from a missing remote result automatically.
 return {imported,updated,skipped,range:"180 dage tilbage og 540 dage frem",google_calendar:setting.google_calendar_name};
}
async function pushFamilyEvent(user,id) {
 const {data:e,error}=await admin.from("family_events").select("*").eq("id",id).eq("family_id",user.family_id).maybeSingle();
 if(error)throw error;if(!e)throw new Error("Aftalen findes ikke.");
 if(e.created_by!==user.id&&e.visibility!=="family")throw new Error("Du har ikke adgang til at ændre denne aftale.");
 if(e.visibility!=="family"||!e.show_on_family_calendar)return {synced:false,reason:"Skjulte og private aftaler synkroniseres ikke til den fælles Google-kalender."};
 const {setting,token}=await authorizedShared(user);
 if(e.google_calendar_id&&e.google_calendar_id!==setting.google_calendar_id)throw new Error("Aftalen hører til en anden Google-kalender.");
 const payload={summary:e.title,description:e.details||"",
   start:{dateTime:e.starts_at},end:{dateTime:e.ends_at},
   extendedProperties:{private:{family_event_id:e.id,source:"family-dashboard"}}};
 const path="/calendars/"+encodeURIComponent(setting.google_calendar_id)+"/events";
 let googleEvent;
 if(e.google_event_id){
   googleEvent=await googleRequest(token,path+"/"+encodeURIComponent(e.google_event_id),{
     method:"PATCH",headers:e.google_etag?{"If-Match":e.google_etag}:{},body:JSON.stringify(payload)});
 }else{
   googleEvent=await googleRequest(token,path,{method:"POST",body:JSON.stringify(payload)});
 }
 const {error:saveError}=await admin.from("family_events").update({
   google_calendar_id:setting.google_calendar_id,google_event_id:googleEvent.id,
   google_etag:googleEvent.etag||null,google_updated_at:googleEvent.updated||new Date().toISOString(),
   google_dirty:false,google_all_day:false
 }).eq("id",e.id).eq("family_id",user.family_id);
 if(saveError)throw saveError;
 return {synced:true};
}
async function deleteFamilyEvent(user,id){
 const {data:e,error}=await admin.from("family_events").select("created_by,visibility,google_event_id,google_calendar_id").eq("id",id).eq("family_id",user.family_id).maybeSingle();
 if(error)throw error;if(!e)return {synced:true};
 if(e.created_by!==user.id&&e.visibility!=="family")throw new Error("Du har ikke adgang til at slette denne aftale.");
 if(!e.google_event_id)return {synced:true};
 const {setting,token}=await authorizedShared(user);
 if(e.google_calendar_id!==setting.google_calendar_id)throw new Error("Aftalen er koblet til en anden kalender.");
 try{
  await googleRequest(token,"/calendars/"+encodeURIComponent(setting.google_calendar_id)+"/events/"+encodeURIComponent(e.google_event_id),{method:"DELETE"});
 }catch(err){if(err.status!==404&&err.status!==410)throw err;}
 return {synced:true};
}
async function handlePost(req) {
 let body={};try{const raw=await req.text();if(raw.length>16000)return fail("For stor forespørgsel.",req,413);body=JSON.parse(raw||"{}");}
 catch{return fail("Ugyldig forespørgsel.",req);}
 let user;try{user=await parseAuth(req);}catch(e){return fail(e.message,req,401);}
 const action=body.action;
 if(action==="status"){
   const {data:conn}=await admin.from("google_calendar_connections").select("google_email,connected_at").eq("user_id",user.id).maybeSingle();
   const shared=await sharedSetting(user.family_id);
   return json({configured:configured(),connected:!!conn,email:conn?.google_email||"",
     shared:shared?{name:shared.google_calendar_name,calendar_id:shared.google_calendar_id,owned_by_me:shared.owner_user_id===user.id,last_synced_at:shared.last_synced_at}:null},req);
 }
 if(!configured())return fail("Google Kalender mangler opsætning af OAuth i Supabase.",req,503);
 if(action==="authorize"){
   const state=rand(),verifier=rand(64);
   const {error}=await admin.from("google_calendar_oauth_states").insert({
     state_hash:await shaHex(state),user_id:user.id,family_id:user.family_id,
     code_verifier:verifier,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
   if(error)throw error;
   const params=new URLSearchParams({client_id:GOOGLE_ID,redirect_uri:REDIRECT_URI,response_type:"code",
     scope:SCOPES,access_type:"offline",prompt:"consent",state,code_challenge:await challenge(verifier),code_challenge_method:"S256"});
   return json({url:"https://accounts.google.com/o/oauth2/v2/auth?"+params},req);
 }
 if(action==="disconnect"){
   const {data:shared}=await admin.from("family_google_calendar_settings").select("owner_user_id").eq("family_id",user.family_id).maybeSingle();
   if(shared?.owner_user_id===user.id)await admin.from("family_google_calendar_settings").delete().eq("family_id",user.family_id);
   await admin.from("google_calendar_connections").delete().eq("user_id",user.id);
   return json({ok:true},req);
 }
 if(action==="sync-shared"){
   const data=await syncShared(user);return json(data,req);
 }
 if(action==="push-family"){
   const result=await pushFamilyEvent(user,String(body.id||""));return json(result,req);
 }
 if(action==="delete-family"){
   const result=await deleteFamilyEvent(user,String(body.id||""));return json(result,req);
 }
 const token=await googleToken(user.id);
 if(action==="calendars"){
   const items=await getCalendars(token);
   return json({calendars:items.map(c=>({id:c.id,name:c.summary||c.id,primary:!!c.primary,
     access_role:c.accessRole,writable:["writer","owner"].includes(c.accessRole)}))},req);
 }
 if(action==="events"){
   const calendarId=String(body.calendar_id||"primary");
   const calendars=await getCalendars(token);
   if(calendarId!=="primary"&&!calendars.some(c=>c.id===calendarId))return fail("Kalenderen er ikke tilgængelig.",req,403);
   const events=await readableEventList(token,calendarId,String(body.day||""));
   return json({events},req);
 }
 if(action==="set-shared"){
   const id=String(body.calendar_id||"");
   const calendars=await getCalendars(token),selected=calendars.find(c=>c.id===id);
   if(!selected||selected.primary||!["writer","owner"].includes(selected.accessRole))
     return fail("Vælg en separat Google-kalender, som du har skriverettigheder til. Din primære kalender kan ikke deles her.",req);
   const current=await sharedSetting(user.family_id);
   if(current&&current.owner_user_id!==user.id)return fail("Den fælles Google-kalender administreres allerede af den anden bruger.",req,403);
   const {error}=await admin.from("family_google_calendar_settings").upsert({
     family_id:user.family_id,owner_user_id:user.id,
     google_calendar_id:id,google_calendar_name:String(selected.summary||id).slice(0,200),
     connected_at:new Date().toISOString(),last_synced_at:null});
   if(error)throw error;
   return json({ok:true},req);
 }
 return fail("Ukendt handling.",req,404);
}
function bounce(code) {
 const u=new URL(RETURN_URL);
 u.searchParams.set("google_calendar",code);
 return Response.redirect(u.toString(),303);
}
async function callback(req) {
 const url=new URL(req.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 if(!state||state.length>200||!code)return bounce("cancelled");
 if(!configured())return bounce("setup-required");
 const stateHash=await shaHex(state);
 const {data:rows,error}=await admin.from("google_calendar_oauth_states")
  .delete().eq("state_hash",stateHash).gt("expires_at",new Date().toISOString())
  .select("user_id,family_id,code_verifier");
 if(error||!rows?.length)return bounce("expired");
 const record=rows[0];
 try{
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code,client_id:GOOGLE_ID,client_secret:GOOGLE_SECRET,
      redirect_uri:REDIRECT_URI,grant_type:"authorization_code",code_verifier:record.code_verifier})
  });
  const tokens=await response.json().catch(()=>({}));
  if(!response.ok||!tokens.access_token)return bounce("google-error");
  let refresh=tokens.refresh_token;
  if(!refresh){
    const {data:prior}=await admin.from("google_calendar_connections").select("refresh_token_enc").eq("user_id",record.user_id).maybeSingle();
    if(!prior)return bounce("refresh-required");
    refresh=await decrypt(prior.refresh_token_enc);
  }
  const profileResp=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{
    headers:{Authorization:"Bearer "+tokens.access_token}});
  const profile=await profileResp.json().catch(()=>({}));
  if(!profileResp.ok||!profile.email||profile.email_verified!==true)return bounce("google-error");
  const {error:writeError}=await admin.from("google_calendar_connections").upsert({
    user_id:record.user_id,family_id:record.family_id,google_email:profile.email,
    refresh_token_enc:await encrypt(refresh),updated_at:new Date().toISOString()
  });
  if(writeError)throw writeError;
  return bounce("connected");
 }catch(e){console.error("Google OAuth callback failed:",e?.message||String(e));return bounce("google-error");}
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(req.method==="GET"&&new URL(req.url).pathname.endsWith("/callback"))return await callback(req);
 if(req.method!=="POST")return fail("Metoden understøttes ikke.",req,405);
 try{return await handlePost(req);}
 catch(e){console.error("Google Calendar error:",e?.message||String(e));
   return fail(e?.message||"Google Kalender kunne ikke tilgås.",req,e?.status===403?403:400);}
});
