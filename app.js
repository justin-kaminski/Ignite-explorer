(function(){
"use strict";

// ================= helpers =================
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const LS=(k,v)=>{try{if(v===undefined){const r=localStorage.getItem(k);return r?JSON.parse(r):null}localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};
const ICON={
  star:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  user:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  note:'<svg class="i" viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  share:'<svg class="i" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  ext:'<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>',
  play:'<svg class="i" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>'
};
const TZ="America/Los_Angeles";
const BUILDING_ORDER=["Chase Center","Moscone South","Moscone West","AMC Metreon","Marriott Marquis"];
const TYPE_ORDER=["Breakout","Theater","Lightning Talk","Table Talk","Lab","Digital Lab","Broadcast Stage","Innovation Session","Keynote","Pre-recorded"];
const TAGC=["--c-brk","--c-tt","--c-lab","--c-bc","--c-lt","--c-inv","--c-key","--c-thr"];
const ZOOM=[3,4,5,6,8,10,12];
const shortB=b=>({"AMC Metreon":"Metreon","Marriott Marquis":"Marriott"}[b]||b||"Online");
const tclass=ty=>"t-"+String(ty||"Other").split(" ")[0].replace(/[^A-Za-z-]/g,"");
// Session kinds Microsoft mixes into the catalog. Everything stays visible; these get labels and callouts.
const KIND={
  overflow:{label:"Overflow",filter:"Overflow viewing"},
  online:{label:"Online only",filter:"Online only"},
  ondemand:{label:"On demand",filter:"On demand"},
  digital:{label:"Digital lab",filter:"Digital lab"},
  inperson:{label:"",filter:"In-person session"}
};
const kindBadge=s=>(s.cancelled?`<span class="kb kb-cancelled">Cancelled</span>`:"")+(s.kind&&s.kind!=="inperson"?`<span class="kb kb-${s.kind}">${KIND[s.kind].label}</span>`:"");
const isInput=el=>!!el&&(el.tagName==="INPUT"||el.tagName==="TEXTAREA");

// ================= time (always Pacific) =================
const ptParts=new Intl.DateTimeFormat("en-US",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function nowPT(){const p={};ptParts.formatToParts(new Date()).forEach(x=>p[x.type]=x.value);return {day:`${p.year}-${p.month}-${p.day}`,min:(+p.hour)*60+(+p.minute)}}
const fmtMin=m=>{const h=Math.floor(m/60),mm=m%60;return `${((h+11)%12)+1}:${String(mm).padStart(2,"0")} ${h>=12?"PM":"AM"}`};
const fmtMinShort=m=>{const h=Math.floor(m/60),mm=m%60,h12=((h+11)%12)+1;return mm?`${h12}:${String(mm).padStart(2,"0")}`:`${h12}${h>=12?"p":"a"}`};
const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const dayLabel=d=>{const [y,m,dd]=d.split("-").map(Number);const w=DOW[new Date(Date.UTC(y,m-1,dd)).getUTCDay()];return {w,n:dd,long:`${w} Nov ${dd}`}};
const isPast=(s,n)=>!!s.day&&(s.day<n.day||(s.day===n.day&&s.e<=n.min));
const isLive=(s,n)=>s.day===n.day&&s.s<=n.min&&s.e>n.min;
const byTime=(a,b)=>(a.day||"z").localeCompare(b.day||"z")||(a.s||0)-(b.s||0)||a.t.localeCompare(b.t);

// ================= view state (this browser only) =================
const FKEYS=["ty","kd","tp","lv","au","b","dl","tg","rec","my","tt"];
const ui=(function(){
  const raw=LS("ig-ui")||{};
  const u={view:"guide",day:null,q:"",ppm:null,zv:3,onlyTrk:false,onlyStar:false,hidePast:false,tagAll:false,tagPanel:false,legend:true,rem:false,remSys:false,remLead:10,alerts:true,f:{}};
  ["view","day","q"].forEach(k=>{if(typeof raw[k]==="string")u[k]=raw[k]});
  ["onlyTrk","onlyStar","hidePast","tagAll","tagPanel","legend","rem","remSys","alerts"].forEach(k=>{if(typeof raw[k]==="boolean")u[k]=raw[k]});
  if([5,10,15,30].includes(raw.remLead))u.remLead=raw.remLead;
  if(raw.zv===3&&ZOOM.includes(raw.ppm))u.ppm=raw.ppm;
  const f=raw.f&&typeof raw.f==="object"?raw.f:{};
  FKEYS.forEach(k=>{u.f[k]=Array.isArray(f[k])?f[k].filter(x=>typeof x==="string"):[]});
  return u;
})();
const saveUI=()=>LS("ig-ui",ui);

// ================= catalog =================
let DATA=null,SES=[],DAYS=[],TAGLIST=[],ALIAS={};
const byKey=new Map(),byCode=new Map(),byId=new Map(),SPK=new Map();

// ================= the person's data (stars, follows, notes, tags) =================
const my={stars:new Set(),follow:new Set(),notes:new Map(),tags:[],manual:{}};
let tagsVer=0;                       // bump whenever tags or manual tag edits change
const tagsChanged=()=>{tagsVer++};
function normFollow(){let ch=false;const out=new Set();my.follow.forEach(id=>{const c=ALIAS[id]||id;if(c!==id)ch=true;out.add(c)});my.follow=out;return ch}
const isTrk=s=>s.sp.some(id=>my.follow.has(id));
const tagColor=t=>`var(${TAGC[(t.c||0)%TAGC.length]})`;
const tagById=id=>my.tags.find(t=>t.id===id);

// ================= my tags engine =================
const FIELDS={title:s=>s.t,desc:s=>s.d,tag:s=>s.tg.join(" | "),topic:s=>s.tp.join(" | "),type:s=>s.ty,level:s=>s.lv.join(" | "),speaker:s=>s.spn,room:s=>s.b+" "+s.r,code:s=>s.c};
const ruleCache=new Map();
function compileRule(q){
  if(ruleCache.has(q))return ruleCache.get(q);
  const pos=[],neg=[];
  String(q||"").split(",").map(x=>x.trim()).filter(Boolean).forEach(item=>{
    let isNeg=false;if(item.startsWith("-")){isNeg=true;item=item.slice(1).trim()}
    let field=null;const m=item.match(/^([a-z]+):\s*(.+)$/i);
    if(m&&FIELDS[m[1].toLowerCase()]){field=m[1].toLowerCase();item=m[2]}
    item=item.replace(/^"|"$/g,"").trim().toLowerCase();if(!item)return;
    (isNeg?neg:pos).push({field,re:new RegExp("(^|[^a-z0-9])"+reEsc(item)+"($|[^a-z0-9])","i")});
  });
  const r={pos,neg};ruleCache.set(q,r);return r;
}
function fieldText(s,f){if(!s._L)s._L={};if(s._L[f]==null)s._L[f]=f==="any"?[s.t,s.d,s.tg.join(" | "),s.tp.join(" | ")].join(" \n "):(FIELDS[f](s)||"");return s._L[f]}
function ruleMatch(s,r){if(!r.pos.length)return false;const hit=t=>t.re.test(fieldText(s,t.field||"any"));return r.pos.some(hit)&&!r.neg.some(hit)}
let sTags=new Map(),sTagsVer=-1;
function computeTags(){
  if(sTagsVer===tagsVer)return;
  sTags=new Map();
  const rules=my.tags.map(t=>({t,r:compileRule(t.q)}));
  if(rules.length)SES.forEach(s=>{
    const man=my.manual[s.c]||{};const out=[];
    rules.forEach(({t,r})=>{const m=man[t.id];if(m===true||(m!==false&&ruleMatch(s,r)))out.push(t.id)});
    if(out.length)sTags.set(s.k,out);
  });
  sTagsVer=tagsVer;
}
const sessionTags=s=>(sTags.get(s.k)||[]).map(tagById).filter(Boolean);
const tagCount=id=>{let n=0;sTags.forEach(v=>{if(v.includes(id))n++});return n};
const previewCount=q=>{const r=compileRule(q);let n=0;SES.forEach(s=>{if(ruleMatch(s,r))n++});return n};
const newTagId=()=>"t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const nextTagColor=()=>my.tags.reduce((m,t)=>Math.max(m,(t.c|0)+1),0);
const termRe=new Map();
function termMatch(s,term){
  let re=termRe.get(term);
  if(!re){re=new RegExp("(^|[^a-z0-9])"+reEsc(term.toLowerCase())+"($|[^a-z0-9])","i");termRe.set(term,re)}
  return re.test(fieldText(s,"tag"))||re.test(fieldText(s,"topic"))||sessionTags(s).some(t=>re.test(t.name));
}

// ================= filtering =================
function matches(s,n,opt){
  opt=opt||{};const f=ui.f;
  if(ui.q){for(const w of ui.q.toLowerCase().split(/\s+/))if(w&&!s.hay.includes(w))return false}
  if(!opt.ignoreTy&&f.ty.length&&!f.ty.includes(s.ty))return false;
  if(f.kd.length&&!(f.kd.includes(KIND[s.kind].filter)||(s.cancelled&&f.kd.includes("Cancelled"))))return false;
  if(f.tp.length&&!s.tp.some(x=>f.tp.includes(x)))return false;
  if(f.lv.length&&!s.lv.some(x=>f.lv.includes(x)))return false;
  if(f.au.length&&!s.au.some(x=>f.au.includes(x)))return false;
  if(f.b.length&&!f.b.includes(s.b||"Online"))return false;
  if(f.dl.length&&!s.dl.some(x=>f.dl.includes(x)))return false;
  if(f.rec.length&&!f.rec.includes(s.rec?"Recorded":"Not recorded"))return false;
  if(f.tg.length||f.my.length||f.tt.length){
    const st=sTags.get(s.k)||[];
    const checks=[...f.tg.map(t=>()=>s.tg.includes(t)),...f.my.map(id=>()=>st.includes(id)),...f.tt.map(term=>()=>termMatch(s,term))];
    if(ui.tagAll?!checks.every(c=>c()):!checks.some(c=>c()))return false;
  }
  if(ui.onlyTrk&&!isTrk(s))return false;
  if(ui.onlyStar&&!my.stars.has(s.k))return false;
  if(ui.hidePast&&isPast(s,n))return false;
  return true;
}
const filterCount=()=>FKEYS.reduce((a,k)=>a+ui.f[k].length,0);

// ================= render: header =================
let M=[];   // sessions matching everything, computed once per render
function renderChrome(n){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected",String(t.dataset.v===ui.view)));
  const counts={};M.forEach(s=>{const d=s.day||"od";counts[d]=(counts[d]||0)+1});
  $("#days").innerHTML=DAYS.map(d=>{const L=dayLabel(d);return `<button class="day${d===n.day?" today":""}" data-d="${d}" aria-pressed="${d===ui.day}"><b>${L.w} ${L.n}</b><span>${counts[d]||0}</span></button>`}).join("")+`<button class="day" data-d="od" aria-pressed="${ui.day==="od"}"><b>On demand</b><span>${counts.od||0}</span></button>`;
  const showDays=ui.view==="guide"||ui.view==="list";
  $("#dayrow").hidden=!showDays;
  $("#gtools").hidden=ui.view!=="guide"||ui.day==="od";
  $("#quick").hidden=!showDays;
  $("#tTrk").setAttribute("aria-pressed",ui.onlyTrk);$("#tStar").setAttribute("aria-pressed",ui.onlyStar);$("#tPast").setAttribute("aria-pressed",ui.hidePast);
  $("#mytagchips").innerHTML=my.tags.map(t=>`<button class="mtag" data-mytag="${esc(t.id)}" aria-pressed="${ui.f.my.includes(t.id)}" style="--tg:${tagColor(t)}"><span class="tdot"></span>${esc(t.name)}</button>`).join("");
  const fc=filterCount();$("#fcount").hidden=!fc;$("#fcount").textContent=fc;
  $("#qclear").hidden=!ui.q;
  const tsel=ui.f.tg.length+ui.f.my.length+ui.f.tt.length;
  $("#tTags").setAttribute("aria-pressed",ui.tagPanel);$("#tagn").textContent=tsel?` (${tsel})`:"";
  $("#tagpanel").hidden=!(ui.tagPanel&&showDays);
  if(ui.tagPanel&&showDays)renderTagPanel();
  $("#tKey").setAttribute("aria-pressed",ui.legend);
  $("#legend").hidden=!(ui.legend&&showDays);
  if(ui.legend&&showDays)renderLegend(n);
  ["grid","listv","spkv","minev"].forEach(id=>$("#"+id).hidden=true);
  $("#"+currentPane()).hidden=false;
}
const currentPane=()=>ui.view==="guide"?(ui.day==="od"?"listv":"grid"):ui.view==="list"?"listv":ui.view==="speakers"?"spkv":"minev";

function renderLegend(n){
  const pool=SES.filter(s=>ui.day==="od"?!s.day:s.day===ui.day);
  const cnt=new Map();pool.forEach(s=>{if(matches(s,n,{ignoreTy:true}))cnt.set(s.ty,(cnt.get(s.ty)||0)+1)});
  const present=new Set(pool.map(s=>s.ty));ui.f.ty.forEach(t=>present.add(t));
  const types=[...TYPE_ORDER.filter(t=>present.has(t)),...[...present].filter(t=>!TYPE_ORDER.includes(t)).sort()];
  let h=`<span class="lh">Type</span>`+types.map(t=>`<button class="lg ${tclass(t)}" data-fk="ty" data-fv="${esc(t)}" aria-pressed="${ui.f.ty.includes(t)}" title="Show only ${esc(t)} sessions"><span class="sb"></span>${esc(t)}<small>${cnt.get(t)||0}</small></button>`).join("");
  h+=`<span class="lsep"></span><span class="lh">Marks</span>`
   +`<span class="lk"><span class="ob" style="box-shadow:inset 0 0 0 2px var(--accent)"></span>Starred</span>`
   +`<span class="lk"><span class="ob" style="box-shadow:inset 0 0 0 2px var(--follow)"></span><b style="color:var(--follow)">Name</b> followed speaker</span>`
   +`<span class="lk"><span style="color:var(--now);font-family:var(--f-mono);font-weight:600;font-size:11px">LIVE</span>on now</span>`
   +`<span class="lk"><span class="ob" style="opacity:.45;box-shadow:inset 4px 0 0 var(--muted)"></span>Ended</span>`
   +`<span class="lk">${ICON.note}Has notes</span>`
   +`<span class="lsep"></span><span class="lh">Kind</span>`
   +`<span class="lk"><span class="kb kb-cancelled">Cancelled</span>by Microsoft</span>`
   +`<span class="lk"><span class="kb kb-overflow">Overflow</span>stream of another session</span>`
   +`<span class="lk"><span class="kb kb-online">Online only</span>broadcast, no seated room</span>`
   +`<span class="lk"><span class="kb kb-ondemand">On demand</span>recorded</span>`
   +`<span class="lk"><span class="kb kb-digital">Digital lab</span>self-paced online</span>`
   +(my.tags.length?`<span class="lk"><span class="tdot" style="--tg:var(--c-brk)"></span>My tag</span>`:"")
   +(ui.f.ty.length?`<button class="tog" data-clearty="1" style="flex:none">Show all types</button>`:"");
  $("#legend").innerHTML=h;
}

function renderTagPanel(){
  const f=ui.f;
  $("#mAny").setAttribute("aria-pressed",!ui.tagAll);$("#mAll").setAttribute("aria-pressed",ui.tagAll);
  const sel=[
    ...f.tt.map(t=>`<span class="tchip tterm" style="--tg:var(--muted)" title="Matches any tag containing this word">"${esc(t)}"<button data-rmterm="${esc(t)}" aria-label="Remove ${esc(t)}">${ICON.x}</button></span>`),
    ...f.tg.map(t=>`<span class="tchip" style="--tg:var(--accent)">${esc(t)}<button data-fk="tg" data-fv="${esc(t)}" aria-label="Remove ${esc(t)}">${ICON.x}</button></span>`),
    ...f.my.map(tagById).filter(Boolean).map(t=>`<span class="tchip" style="--tg:${tagColor(t)}"><span class="tdot"></span>${esc(t.name)}<button data-mytag="${esc(t.id)}" aria-label="Remove ${esc(t.name)}">${ICON.x}</button></span>`)
  ];
  $("#tagsel").innerHTML=sel.length?sel.join(""):`<span class="hint">Tap tags below, or type words and press Enter. ${ui.tagAll?"Match all":"Match any"} decides whether a session needs one of them or all of them.</span>`;
  renderTagList();
}
function renderTagList(){
  const f=ui.f;const last=(($("#tagin").value||"").split(",").pop()||"").trim().toLowerCase();
  const mine=my.tags.filter(t=>!f.my.includes(t.id)&&(!last||t.name.toLowerCase().includes(last)));
  const ms=TAGLIST.filter(t=>!f.tg.includes(t.v)&&(!last||t.v.toLowerCase().includes(last)));
  let h=mine.map(t=>`<button class="tagb" data-mytag="${esc(t.id)}" aria-pressed="false" style="--tg:${tagColor(t)}"><span class="tdot" style="margin-right:5px"></span>${esc(t.name)}<small>${tagCount(t.id)}</small></button>`).join("")
       +ms.map(t=>`<button class="tagb" data-fk="tg" data-fv="${esc(t.v)}" aria-pressed="false">${esc(t.v)}<small>${t.c}</small></button>`).join("");
  if(last&&!h)h=`<span class="hint">No tag contains "${esc(last)}". Press Enter to filter on it as a word anyway.</span>`;
  $("#taglistp").innerHTML=h;
}
function addTerms(raw){
  String(raw||"").split(",").map(x=>x.trim().replace(/^"|"$/g,"").trim()).filter(Boolean).forEach(t=>{
    if(!ui.f.tt.some(x=>x.toLowerCase()===t.toLowerCase()))ui.f.tt.push(t.slice(0,60));
  });
  $("#tagin").value="";render();
}

// ================= render: guide grid =================
const meas=document.createElement("canvas").getContext("2d");
const lineCache=new Map();
function titleLines(t,w){
  const key=t+"|"+Math.round(w);if(lineCache.has(key))return lineCache.get(key);
  meas.font="600 12px 'IBM Plex Sans', system-ui, sans-serif";
  const sp=meas.measureText(" ").width;let lines=1,cur=0;
  t.split(/\s+/).forEach(wd=>{const ww=meas.measureText(wd).width;
    if(cur>0&&cur+sp+ww<=w){cur+=sp+ww;return}
    if(cur>0)lines++;
    if(ww>w){lines+=Math.floor(ww/w);cur=ww%w}else cur=ww});
  lineCache.set(key,lines);return lines;
}
function spkLine(s){
  const ps=s.sp.map(id=>SPK.get(id)).filter(Boolean);
  ps.sort((a,b)=>(my.follow.has(b.id)?1:0)-(my.follow.has(a.id)?1:0));
  return ps.map(p=>my.follow.has(p.id)?`<span class="f">${esc(p.n)}</span>`:esc(p.n)).join(", ");
}
function roomSort(a,b){
  const ia=BUILDING_ORDER.indexOf(a.b),ib=BUILDING_ORDER.indexOf(b.b);
  const oa=ia<0?99:ia,ob=ib<0?99:ib;
  return oa-ob||a.b.localeCompare(b.b)||a.r.localeCompare(b.r,undefined,{numeric:true});
}
const statusClasses=(s,n)=>(isPast(s,n)?" past":"")+(isLive(s,n)?" live":"");
function renderGrid(keepScroll){
  const el=$("#grid"),n=nowPT();
  const prev={x:el.scrollLeft,y:el.scrollTop,pin:(el.querySelector(".pinrow")||{}).offsetHeight||0};
  const dayAll=SES.filter(s=>s.day===ui.day);
  if(!dayAll.length){el.innerHTML=`<div class="empty"><b>No sessions</b>Nothing is scheduled for this day.</div>`;el._t0=null;return}
  const list=M.filter(s=>s.day===ui.day);
  const pinned=dayAll.filter(s=>my.stars.has(s.k)&&!(ui.hidePast&&isPast(s,n)));
  if(!list.length&&!pinned.length){el.innerHTML=`<div class="empty"><b>No matches</b>No sessions on ${esc(dayLabel(ui.day).long)} match your search and filters. Other days may have matches; check the counts on the day buttons.</div>`;el._t0=null;return}
  const t0=Math.floor(Math.min(...dayAll.map(s=>s.s))/60)*60, t1=Math.ceil(Math.max(...dayAll.map(s=>s.e))/60)*60;
  const ppm=ui.ppm, W=(t1-t0)*ppm;
  const rooms=new Map();
  list.forEach(s=>{const key=(s.b||"Online")+"|"+s.r;if(!rooms.has(key))rooms.set(key,{b:s.b||"Online",r:s.r,items:[]});rooms.get(key).items.push(s)});
  const rows=[...rooms.values()].sort(roomSort);
  if(pinned.length)rows.unshift({pin:true,b:"",r:"",items:pinned.slice()});
  const rowh=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rowh"))||58;
  const bw=s=>Math.max(18,(s.e-s.s)*ppm-3);
  const flagCount=s=>(my.stars.has(s.k)?1:0)+(isTrk(s)?1:0)+(my.notes.has(s.c)?1:0)+Math.min(3,(sTags.get(s.k)||[]).length);
  const blockH=(s,pin)=>{const inner=bw(s)-16-flagCount(s)*13;const lines=Math.min(7,titleLines(s.t,Math.max(20,inner)));return 8+lines*15+1+14+(s.spn?14:0)+(pin?14:0)+(s.kind!=="inperson"||s.cancelled?21:0)+6};
  let html=`<div class="gin" style="width:calc(var(--labelw) + ${W}px)"><div class="ghead"><div class="corner">${list.length} session${list.length===1?"":"s"}</div><div class="ticks" style="width:${W}px">`;
  for(let m=t0;m<t1;m+=30)html+=`<div class="tick${m%60?"":" hr"}" style="left:${(m-t0)*ppm}px">${fmtMin(m).replace(":00","")}</div>`;
  html+=`<div class="nowtick" id="nowtick" hidden></div></div></div>`;
  let lastB=null;
  rows.forEach(row=>{
    row.items.sort((a,b)=>a.s-b.s||a.e-b.e);
    const lane=new Map(),ends=[];
    row.items.forEach(s=>{let li=ends.findIndex(end=>end<=s.s);if(li<0){li=ends.length;ends.push(0)}ends[li]=s.e;lane.set(s.k,li)});
    const lh=Math.max(rowh,...row.items.map(s=>blockH(s,row.pin)))+6,H=ends.length*lh;
    const label=row.pin?`<b>My schedule</b><span${ends.length>1?' class="cf"':""}>${row.items.length} starred${ends.length>1?", overlaps":""}</span>`:`<b>${esc(row.r||row.b)}</b><span>${esc(shortB(row.b))}</span>`;
    html+=`<div class="grow${row.pin?" pinrow":""}${!row.pin&&lastB!==null&&lastB!==row.b?" bstart":""}" style="height:${H}px"><div class="rlabel">${label}</div><div class="track" style="width:${W}px;--hh:${60*ppm}px;background-position:${-(t0%60)*ppm}px 0">`;
    lastB=row.pin?null:row.b;
    row.items.forEach(s=>{
      const st=my.stars.has(s.k),tk=isTrk(s),nt=my.notes.has(s.c),fc=flagCount(s);
      const flags=sessionTags(s).slice(0,3).map(t=>`<span class="tdot" style="--tg:${tagColor(t)}" title="${esc(t.name)}"></span>`).join("")+(st?`<span class="fstar">${ICON.star}</span>`:"")+(tk?`<span class="ffol">${ICON.user}</span>`:"")+(nt?`<span>${ICON.note}</span>`:"");
      html+=`<button class="blk ${tclass(s.ty)} k-${s.kind}${s.cancelled?" cx":""}${st?" star":""}${tk?" trk":""}${statusClasses(s,n)}" data-k="${esc(s.k)}" style="left:${(s.s-t0)*ppm+1}px;width:${bw(s)}px;top:${lane.get(s.k)*lh+3}px;height:${lh-6}px" title="${esc(s.t)}">`
        +(flags?`<span class="flags">${flags}</span>`:"")
        +(s.kind!=="inperson"||s.cancelled?`<span class="kline">${kindBadge(s)}${s.main?` streams ${esc(s.main.c)}`:""}</span>`:"")
        +`<span class="bt"${fc?` style="padding-right:${fc*13}px"`:""}>${esc(s.t)}</span><span class="bm">${fmtMinShort(s.s)}-${fmtMinShort(s.e)} ${esc(s.c)}</span>`
        +(row.pin?`<span class="bs">${esc([shortB(s.b),s.r].filter(Boolean).join(", "))}</span>`:"")
        +(s.spn?`<span class="bs">${spkLine(s)}</span>`:"")+`</button>`;
    });
    html+=`</div></div>`;
  });
  html+=`<div class="nowline" id="nowline" hidden></div></div>`;
  el.innerHTML=html;el._t0=t0;el._t1=t1;
  placeNow(n);
  if(keepScroll){
    // When the pinned My schedule row grows or shrinks above the view, shift by the same amount so the rows on screen stay put.
    const pin=(el.querySelector(".pinrow")||{}).offsetHeight||0;
    el.scrollLeft=prev.x;el.scrollTop=prev.y>0?Math.max(0,prev.y+pin-prev.pin):0;
  }
}
function placeNow(n){
  const el=$("#grid"),line=$("#nowline"),tick=$("#nowtick");if(!line||el._t0==null)return;
  const on=n.day===ui.day&&n.min>=el._t0&&n.min<=el._t1;
  line.hidden=tick.hidden=!on;if(!on)return;
  const x=(n.min-el._t0)*ui.ppm;
  line.style.left=`calc(var(--labelw) + ${x}px)`;tick.style.left=x+"px";tick.textContent=fmtMin(n.min);
}
function scrollToNow(){const el=$("#grid"),n=nowPT();if(ui.day===n.day&&el._t0!=null)el.scrollLeft=Math.max(0,(n.min-30-el._t0)*ui.ppm)}

// ================= render: list =================
function cardHTML(s,n,extra){
  extra=extra||{};const st=my.stars.has(s.k);
  const spk=s.sp.map(id=>SPK.get(id)).filter(Boolean).map(p=>my.follow.has(p.id)?`<span class="f">${esc(p.n)}</span>`:esc(p.n)).join(", ");
  const when=s.day?`<span class="tm">${extra.showDay?esc(dayLabel(s.day).w)+" ":""}${fmtMinShort(s.s)}-${fmtMinShort(s.e)}</span>`:`<span class="tm">On demand</span>`;
  const tags=sessionTags(s).map(t=>`<span style="--tg:${tagColor(t)};display:inline-flex;align-items:center;gap:4px"><span class="tdot"></span>${esc(t.name)}</span>`).join("");
  return `<div class="card ${tclass(s.ty)} k-${s.kind}${s.cancelled?" cx":""}${st?" star":""}${statusClasses(s,n)}" data-card="${esc(s.k)}"><button class="main" data-k="${esc(s.k)}"><span class="ct">${esc(s.t)}</span><span class="cm">${when}${kindBadge(s)}<span class="pill">${esc(s.ty)}</span><span>${esc(s.c)}</span><span>${esc([shortB(s.b),s.r].filter(Boolean).join(", "))}</span>${my.notes.has(s.c)?`<span>${ICON.note}</span>`:""}${tags}</span>${spk?`<span class="cs">${spk}</span>`:""}${extra.warn?`<span class="warn">${esc(extra.warn)}</span>`:""}</button><button class="starbtn" data-star="${esc(s.k)}" aria-pressed="${st}" aria-label="${st?"Unstar":"Star"} ${esc(s.t)}">${ICON.star}</button></div>`;
}
function overlapMap(list){
  const m=new Map();
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j];
    if(a.day&&a.day===b.day&&a.s<b.e&&b.s<a.e){(m.get(a.k)||m.set(a.k,[]).get(a.k)).push(b.c);(m.get(b.k)||m.set(b.k,[]).get(b.k)).push(a.c)}}
  return m;
}
function renderList(){
  const el=$("#listv"),n=nowPT();
  const inDay=s=>ui.day==="od"?!s.day:s.day===ui.day;
  const list=M.filter(inDay).sort(byTime);
  const pinned=SES.filter(s=>inDay(s)&&my.stars.has(s.k)&&!(ui.hidePast&&isPast(s,n))).sort(byTime);
  if(!list.length&&!pinned.length){el.innerHTML=`<div class="empty"><b>No matches</b>Try another day, or clear the search and filters.</div>`;return}
  let html=`<div class="list">`;
  if(pinned.length){
    const conf=overlapMap(pinned);
    html+=`<div class="slot pin">My schedule<small>${pinned.length} starred</small></div>`+pinned.map(s=>cardHTML(s,n,{warn:conf.has(s.k)?`Overlaps ${conf.get(s.k).join(", ")}`:""})).join("");
    if(!list.length)html+=`<p class="hint">No other sessions match your search and filters on this day.</p>`;
  }
  let cur=null;
  list.forEach(s=>{
    const slot=s.day?s.s:-1;
    if(slot!==cur){cur=slot;const cnt=list.filter(x=>(x.day?x.s:-1)===slot).length;html+=`<div class="slot" data-slot="${slot}">${s.day?fmtMin(slot):"On demand and online only"}<small>${cnt} session${cnt>1?"s":""}</small></div>`}
    html+=cardHTML(s,n);
  });
  el.innerHTML=html+`</div>`;
  // Jump to the current time once per day, unless starred sessions still to come are at the top.
  if(ui.day===n.day&&el._scrolledFor!==ui.day){
    el._scrolledFor=ui.day;
    const upcomingPinned=pinned.some(s=>!isPast(s,n));
    const target=[...el.querySelectorAll(".slot[data-slot]")].find(x=>+x.dataset.slot>=n.min-10);
    if(!upcomingPinned&&target){el.scrollTop=target.offsetTop-4;el._kept=null}
  }
}

// ================= render: speakers =================
let spq="";
function spkRow(p){
  const f=my.follow.has(p.id);
  return `<div class="spk"><button class="main" data-spk="${esc(p.id)}"><div class="sn">${esc(p.n)}</div><div class="sj">${esc([p.j,p.co].filter(Boolean).join(", "))}</div><div class="sc">${p.ss.length} session${p.ss.length===1?"":"s"}</div></button><button class="folbtn" data-fol="${esc(p.id)}" aria-pressed="${f}">${f?"Following":"Follow"}</button></div>`;
}
function renderSpeakers(){
  const el=$("#spkv");
  if(!el.querySelector("#spq")){
    el.innerHTML=`<div class="list"><div class="spsearch"><input id="spq" type="search" placeholder="Find a speaker by name, title or company" autocomplete="off" aria-label="Find a speaker"></div><div id="spres" class="list" style="padding:0"></div></div>`;
    const inp=el.querySelector("#spq");inp.value=spq;
    inp.addEventListener("input",()=>{spq=inp.value;renderSpeakerResults()});
  }
  renderSpeakerResults();
}
function renderSpeakerResults(){
  const q=spq.trim().toLowerCase();
  const fol=[...my.follow].map(id=>SPK.get(id)).filter(Boolean).sort((a,b)=>a.n.localeCompare(b.n));
  let html="";
  if(q){
    const ws=q.split(/\s+/);const res=DATA.speakers.filter(p=>ws.every(w=>p.hay.includes(w))).sort((a,b)=>a.n.localeCompare(b.n));
    html+=`<div class="sec">Results<small>${res.length} of ${DATA.speakers.length}</small></div>`;
    html+=res.length?res.slice(0,150).map(spkRow).join(""):`<p class="hint">No speakers match "${esc(spq)}".</p>`;
    if(res.length>150)html+=`<p class="hint">Showing the first 150. Keep typing to narrow it down.</p>`;
  }
  html+=`<div class="sec">Following<small>${fol.length}</small></div>`;
  html+=fol.length?fol.map(spkRow).join(""):`<p class="hint">Search for a speaker above and tap Follow. Their sessions get a pink outline in the guide and their names show in pink.</p>`;
  if(!q){
    const feat=["Mark Russinovich","Scott Hanselman","Satya Nadella","Kelsey Hightower","Seth Juarez","Charles Lamanna"].map(nm=>DATA.speakers.find(p=>p.n===nm)).filter(p=>p&&!my.follow.has(p.id));
    if(feat.length)html+=`<div class="sec">Suggestions<small>headliners in this year's catalog</small></div>`+feat.map(spkRow).join("");
  }
  $("#spres").innerHTML=html;
}

// ================= render: my schedule =================
function renderMine(){
  const el=$("#minev"),n=nowPT();
  const starred=[...my.stars].map(k=>byKey.get(k)).filter(Boolean).sort(byTime);
  const conf=overlapMap(starred);
  let html=`<div class="list">${reminderCard()}${transferCard()}${changesHTML()}<div class="actions" style="margin-top:8px"><button class="btn" data-import="1"><svg class="i" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Import from the Microsoft app</button></div>`;
  html+=`<div class="sec">Starred<small>${starred.length}</small></div>`;
  if(!starred.length)html+=`<p class="hint">Tap the star on any session to add it here, or import the sessions you already picked in the Microsoft Events app. Overlapping picks get flagged.</p>`;
  let cur=null;
  starred.forEach(s=>{const d=s.day||"od";if(d!==cur){cur=d;html+=`<div class="slot">${d==="od"?"On demand":esc(dayLabel(d).long)}</div>`}
    html+=cardHTML(s,n,{warn:s.cancelled?"Cancelled by Microsoft":conf.has(s.k)?`Overlaps ${conf.get(s.k).join(", ")}`:""})});
  const fromFol=SES.filter(s=>isTrk(s)&&!my.stars.has(s.k)).sort(byTime);
  html+=`<div class="sec">From speakers you follow<small>${fromFol.length} not starred</small></div>`;
  html+=fromFol.length?fromFol.map(s=>cardHTML(s,n,{showDay:true})).join(""):`<p class="hint">${my.follow.size?"Everything from the speakers you follow is already starred.":"Follow speakers on the Speakers tab to see their sessions here."}</p>`;
  const noted=[...my.notes.keys()].map(c=>(byCode.get(c)||[])[0]).filter(Boolean);
  html+=`<div class="sec">Notes<small>${noted.length}</small></div>`;
  html+=noted.length?noted.map(s=>{const t=my.notes.get(s.c)||"";return `<div class="card ${tclass(s.ty)}"><button class="main" data-k="${esc(s.k)}"><span class="ct">${esc(s.t)}</span><span class="cm"><span>${esc(s.c)}</span></span><span class="cs" style="white-space:pre-wrap">${esc(t.slice(0,240))}${t.length>240?"...":""}</span></button></div>`}).join(""):`<p class="hint">Open a session and type in its Notes box. Notes save as you type.</p>`;
  el.innerHTML=html+`</div>`;
}

// ================= reminders =================
// Reminders fire only while this page is open. For alerts with the page closed, the calendar file adds the
// starred sessions to the phone's own calendar with alarms.
const IN_CLAUDE=!!(window.claude&&window.claude.use);
const GH_URL="https://justin-kaminski.github.io/Ignite-explorer/";
const sysSupported=!IN_CLAUDE&&"Notification" in window&&window.isSecureContext;
let swReg=null;
const notified=(()=>{const v=LS("ig-notified");return v&&typeof v==="object"?v:{}})();
// ================= transfer link =================
// Packs stars, follows, tags and notes into the part of a link after "#", which browsers never send to the server.
// The receiving device shows what is in it and merges only when the person confirms.
const XFER_MAX=1000;
function transferCard(){
  return `<div class="remcard"><div class="sec" style="margin:4px 0 2px">Move to another device</div>
  <p class="hint" style="margin:0">Copy a link that carries your stars, followed speakers, tags and notes, send it to yourself, and open it on your other device${IN_CLAUDE?" (it opens the GitHub version of this guide)":""}. You'll be asked before anything is merged. Anyone with the link can read your notes, so only send it to yourself.</p>
  <div class="actions"><button class="btn" id="xfercopy">Copy transfer link</button>${!IN_CLAUDE&&navigator.share?`<button class="btn" id="xfershare">${ICON.share}Send to myself</button>`:""}</div>
  <div class="impstat" id="xferstat" role="status"></div></div>`;
}
const b64u={
  enc:bytes=>{let bin="";for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")},
  dec:str=>{const b=atob(str.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((str.length+3)%4));const out=new Uint8Array(b.length);for(let i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out}
};
async function pipeBytes(bytes,stream){const r=new Response(new Blob([bytes]).stream().pipeThrough(stream));return new Uint8Array(await r.arrayBuffer())}
async function buildTransferLink(){
  const data={v:1,st:[...my.stars],fo:[...my.follow],tg:my.tags,mn:my.manual,nt:Object.fromEntries(my.notes)};
  let bytes=new TextEncoder().encode(JSON.stringify(data)),z="j";
  if(typeof CompressionStream==="function"){try{bytes=await pipeBytes(bytes,new CompressionStream("deflate-raw"));z="z"}catch(e){}}
  const base=IN_CLAUDE?GH_URL:location.origin+location.pathname;
  return {url:`${base}#xfer-${z}${b64u.enc(bytes)}`,counts:{st:data.st.length,fo:data.fo.length,tg:data.tg.length,nt:Object.keys(data.nt).length}};
}
const xferSummary=c=>`${c.st} starred, ${c.fo} followed speaker${c.fo===1?"":"s"}, ${c.tg} tag${c.tg===1?"":"s"}, ${c.nt} note${c.nt===1?"":"s"}`;
async function copyTransfer(){
  const st=$("#xferstat");
  try{
    const {url,counts}=await buildTransferLink();
    try{await navigator.clipboard.writeText(url);st.textContent=`Copied a link with ${xferSummary(counts)}. Send it to yourself and open it on the other device.`}
    catch(e){st.textContent="Copy didn't work here. Select and copy this link:\n"+url}
  }catch(e){st.textContent="Couldn't build the link: "+(e&&e.message||e)}
}
async function shareTransfer(){
  try{const {url,counts}=await buildTransferLink();await navigator.share({title:"Ignite Explorer transfer link",text:`My Ignite Explorer data (${xferSummary(counts)}). Open on my other device:`,url})}
  catch(e){if(!(e&&e.name==="AbortError"))$("#xferstat").textContent="Sharing didn't work; use Copy transfer link instead."}
}
async function readTransfer(payload){
  const z=payload[0],bytes=b64u.dec(payload.slice(1));
  const raw=z==="z"?await pipeBytes(bytes,new DecompressionStream("deflate-raw")):bytes;
  const d=JSON.parse(new TextDecoder().decode(raw));
  if(!d||d.v!==1)throw new Error("unknown format");
  const strs=(v,max,len)=>Array.isArray(v)?v.filter(x=>typeof x==="string"&&x.length<=len).slice(0,max):[];
  const tags=Array.isArray(d.tg)?d.tg.filter(t=>t&&typeof t.id==="string"&&typeof t.name==="string").slice(0,100).map(t=>({id:t.id.slice(0,40),name:t.name.slice(0,40),q:typeof t.q==="string"?t.q.slice(0,2000):"",c:+t.c||0})):[];
  const manual={};if(d.mn&&typeof d.mn==="object")Object.entries(d.mn).slice(0,XFER_MAX).forEach(([c,m])=>{if(typeof c==="string"&&c.length<=40&&m&&typeof m==="object"){const mm={};Object.entries(m).forEach(([id,b])=>{if(typeof b==="boolean")mm[id]=b});if(Object.keys(mm).length)manual[c]=mm}});
  const notes={};if(d.nt&&typeof d.nt==="object")Object.entries(d.nt).slice(0,XFER_MAX).forEach(([c,t])=>{if(typeof c==="string"&&c.length<=40&&typeof t==="string"&&t)notes[c]=t.slice(0,20000)});
  return {st:strs(d.st,XFER_MAX,40),fo:strs(d.fo,XFER_MAX,80),tg:tags,mn:manual,nt:notes};
}
function clearXferHash(){try{history.replaceState(null,"",location.pathname+location.search+"#mine")}catch(e){}}
async function openTransfer(payload){
  let d;
  try{d=await readTransfer(payload)}
  catch(e){clearXferHash();showSheet("Transfer link",`<p class="hint">This transfer link couldn't be read. It may have been cut off when it was sent; try copying it again.</p><div class="actions"><button class="btn" data-close="1">Close</button></div>`);return}
  const newSt=d.st.filter(k=>!my.stars.has(k)).length,newFo=d.fo.filter(k=>!my.follow.has(ALIAS[k]||k)).length;
  const newTg=d.tg.filter(t=>!my.tags.some(x=>x.id===t.id||x.name.toLowerCase()===t.name.toLowerCase())).length;
  const nn=Object.entries(d.nt);const newNt=nn.filter(([c])=>!my.notes.has(c)).length,diffNt=nn.filter(([c,t])=>my.notes.has(c)&&my.notes.get(c)!==t).length;
  showSheet("Merge from another device",`<p style="margin:0">This link has ${esc(xferSummary({st:d.st.length,fo:d.fo.length,tg:d.tg.length,nt:nn.length}))}.</p>
  <ul class="hint" style="margin:0;padding-left:20px"><li>${newSt} new starred session${newSt===1?"":"s"}</li><li>${newFo} new followed speaker${newFo===1?"":"s"}</li><li>${newTg} new tag${newTg===1?"":"s"}</li><li>${newNt} new note${newNt===1?"":"s"}${diffNt?`, and ${diffNt} note${diffNt===1?"":"s"} that differ from this device's (both versions are kept)`:""}</li></ul>
  <p class="hint" style="margin:0">Merging only adds. Nothing on this device is removed.</p>
  <div class="actions"><button class="btn primary" id="xfermerge">Merge into this device</button><button class="btn" data-close="1">Cancel</button></div>`,{kind:"x",data:d,onClose:clearXferHash});
}
function mergeTransfer(d){
  d.st.forEach(k=>my.stars.add(k));
  d.fo.forEach(k=>my.follow.add(ALIAS[k]||k));
  const idMap={};
  d.tg.forEach(t=>{const ex=my.tags.find(x=>x.id===t.id||x.name.toLowerCase()===t.name.toLowerCase());if(ex){idMap[t.id]=ex.id;if(!ex.q&&t.q)ex.q=t.q}else{my.tags.push(Object.assign({},t,{c:nextTagColor()}));idMap[t.id]=t.id}});
  Object.entries(d.mn).forEach(([c,m])=>{const cur=Object.assign({},my.manual[c]||{});Object.entries(m).forEach(([id,b])=>{const nid=idMap[id]||id;if(!(nid in cur))cur[nid]=b});my.manual[c]=cur});
  tagsChanged();store.prefsChanged();
  Object.entries(d.nt).forEach(([c,t])=>{const cur=my.notes.get(c);if(!cur)store.setNote(c,t);else if(cur!==t&&!cur.includes(t))store.setNote(c,cur+"\n\n--- from your other device ---\n"+t)});
  closeSheet();ui.view="mine";clearXferHash();render({keepScroll:false});
  notify({head:"Merged",title:"Your data from the other device is merged",meta:xferSummary({st:d.st.length,fo:d.fo.length,tg:d.tg.length,nt:Object.keys(d.nt).length}),tag:"xfer"});
}

function reminderCard(){
  const perm=sysSupported?Notification.permission:"unsupported";
  return `<div class="remcard"><div class="sec" style="margin:4px 0 2px">Reminders</div>
  <label class="chk"><input type="checkbox" id="alerton" ${ui.alerts?"checked":""}> Alert me when a starred session is cancelled, moves or changes room</label>
  <label class="chk"><input type="checkbox" id="remon" ${ui.rem?"checked":""}> Remind me before starred sessions</label>
  <label class="chk">Remind me <select id="remlead" aria-label="How long before">${[5,10,15,30].map(m=>`<option value="${m}" ${ui.remLead===m?"selected":""}>${m} minutes</option>`).join("")}</select> before</label>
  ${sysSupported?`<label class="chk"><input type="checkbox" id="remsys" ${ui.remSys&&perm==="granted"?"checked":""} ${perm==="denied"?"disabled":""}> Also show system notifications${perm==="denied"?" (blocked in your browser settings)":""}</label>`:""}
  <p class="hint" style="margin:0">Alerts and reminders show up while this page is open in a tab; the session data is checked for updates every 15 minutes. Phones pause background tabs, so for alerts with the page closed, add your starred sessions to your calendar.</p>
  <div class="actions">${IN_CLAUDE
    ?`<button class="btn" id="copycodes">Copy starred codes</button><a class="btn" href="${GH_URL}" target="_blank" rel="noopener">${ICON.ext}Open the GitHub version</a>`
    :`<button class="btn" id="icsbtn">Add starred sessions to my calendar</button>`}</div>
  ${IN_CLAUDE?`<p class="hint" style="margin:0">This claude.ai view can't save calendar files. Copy your starred codes, paste them into Import on the GitHub version, then use its calendar button.</p>`:""}
  <div class="impstat" id="remstat" role="status"></div></div>`;
}
function remStatus(t){const el=$("#remstat");if(el)el.textContent=t}
function checkReminders(n){
  if(!ui.rem||!DATA)return;
  let changed=false;
  Object.keys(notified).forEach(k=>{if(!k.endsWith("|"+n.day)){delete notified[k];changed=true}});
  my.stars.forEach(k=>{
    const s=byKey.get(k);if(!s||s.day!==n.day||s.cancelled)return;
    const until=s.s-n.min,id=s.k+"|"+n.day;
    if(until<=ui.remLead&&until>=0&&!notified[id]){notified[id]=1;changed=true;fireReminder(s,until)}
  });
  if(changed)LS("ig-notified",notified);
}
// One banner in the page, plus a system notification when the person turned those on.
function notify({head,title,meta,k,tag,warn}){
  const t=document.createElement("div");t.className="toast"+(warn?" warn":"");t.setAttribute("role","alert");
  t.innerHTML=`<div class="tt">${esc(head)}</div><div class="tb">${esc(title)}</div>${meta?`<div class="tm">${esc(meta)}</div>`:""}<div class="actions">${k?`<button class="btn primary" data-k="${esc(k)}" data-dismiss="1">Open</button>`:""}<button class="btn" data-dismiss="1">Dismiss</button></div>`;
  $("#toasts").appendChild(t);
  if(ui.remSys&&sysSupported&&Notification.permission==="granted"){
    const opts={body:[title,meta].filter(Boolean).join("\n"),tag:"ig-"+tag,data:{url:location.href.split("#")[0]+"#mine"}};
    try{if(swReg&&swReg.showNotification)swReg.showNotification(head,opts);else new Notification(head,opts)}catch(e){}
  }
}
function fireReminder(s,until){
  const when=until<=0?"Starting now":`Starts in ${until} min`;
  const where=[shortB(s.b),s.r].filter(Boolean).join(", ")||"Online";
  notify({head:`${when} · ${fmtMin(s.s)}`,title:s.t,meta:`${s.c} · ${where}`,k:s.k,tag:"rem-"+s.k});
}
// Schedule changes: remember what each starred session looked like, and flag cancellations, moves and room changes.
const seen=(()=>{const v=LS("ig-seen");return v&&typeof v==="object"?v:{}})();
let changes=(()=>{const v=LS("ig-changes");return Array.isArray(v)?v.filter(x=>x&&typeof x.what==="string"):[]})();
const snapOf=s=>({t:s.t,day:s.day||"",s:s.s==null?null:s.s,loc:[s.b,s.r].filter(Boolean).join(", "),cx:!!s.cancelled});
function detectChanges(){
  if(!DATA)return;
  const found=[];let dirty=false;
  my.stars.forEach(k=>{
    const cur=byKey.get(k),prev=seen[k];
    if(!prev){if(cur){seen[k]=snapOf(cur);dirty=true}return}
    if(!cur){if(!prev.gone){prev.gone=true;dirty=true;found.push({k,c:k.replace(/-\d+$/,""),t:prev.t,what:"No longer in Microsoft's catalog."})}return}
    const now=snapOf(cur),msgs=[];
    if(now.cx&&!prev.cx)msgs.push("Cancelled.");
    if(now.day!==prev.day||now.s!==prev.s)msgs.push(now.day?`Moved to ${dayLabel(now.day).long}, ${fmtMin(now.s)}${prev.day?` (was ${dayLabel(prev.day).w} ${fmtMin(prev.s)})`:""}.`:"Moved to on demand.");
    if(now.loc!==prev.loc&&now.loc&&prev.loc)msgs.push(`Room changed to ${now.loc} (was ${prev.loc}).`);
    if(msgs.length)found.push({k,c:cur.c,t:cur.t,what:msgs.join(" ")});
    if(JSON.stringify(now)!==JSON.stringify({t:prev.t,day:prev.day,s:prev.s,loc:prev.loc,cx:prev.cx})){seen[k]=now;dirty=true}
  });
  Object.keys(seen).forEach(k=>{if(!my.stars.has(k)){delete seen[k];dirty=true}});
  if(dirty)LS("ig-seen",seen);
  if(!found.length)return;
  const at=new Date().toISOString();
  found.forEach(f=>{changes.unshift(Object.assign({at},f));if(ui.alerts)notify({head:"Change to your schedule",title:`${f.c}: ${f.t}`,meta:f.what,k:byKey.has(f.k)?f.k:null,tag:"chg-"+f.k,warn:true})});
  changes=changes.slice(0,30);LS("ig-changes",changes);
  if(ui.view==="mine")softRender();
}
function changesHTML(){
  if(!changes.length)return "";
  const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?"just now":m<60?m+" min ago":m<1440?Math.round(m/60)+" h ago":Math.round(m/1440)+" d ago"};
  return `<div class="sec">Schedule changes<small>${changes.length}</small><button class="tog" id="clrchg" style="margin-left:auto">Clear</button></div>`
    +changes.map(c=>`<div class="card chg">${byKey.has(c.k)?`<button class="main" data-k="${esc(c.k)}">`:`<div class="main">`}<span class="ct">${esc(c.c)}: ${esc(c.t)}</span><span class="warn">${esc(c.what)}</span><span class="cm">Noticed ${esc(ago(c.at))}</span>${byKey.has(c.k)?"</button>":"</div>"}</div>`).join("");
}
async function ensureSW(){
  if(swReg||!("serviceWorker" in navigator))return swReg;
  try{swReg=await navigator.serviceWorker.register("sw.js")}catch(e){swReg=null}
  return swReg;
}
async function setSys(on){
  if(!on){ui.remSys=false;saveUI();return}
  try{
    const p=await Notification.requestPermission();
    if(p!=="granted"){ui.remSys=false;saveUI();remStatus(p==="denied"?"Notifications are blocked for this site in your browser settings.":"Notifications weren't allowed.");softRender();return}
    ui.remSys=true;if(!ui.rem)ui.rem=true;saveUI();await ensureSW();remStatus("System notifications are on while this page is open.");softRender();
  }catch(e){ui.remSys=false;saveUI();remStatus("This browser can't show notifications here.");softRender()}
}
// iCalendar export of starred sessions, with an alarm at the reminder lead time.
function ptToUTC(day,min){
  const [y,m,d]=day.split("-").map(Number),want=Date.UTC(y,m-1,d,Math.floor(min/60),min%60);let t=want+8*3600e3;
  for(let i=0;i<2;i++){const p={};ptFull.formatToParts(new Date(t)).forEach(x=>p[x.type]=x.value);t+=want-Date.UTC(+p.year,p.month-1,+p.day,+p.hour,+p.minute)}
  return new Date(t);
}
const icsStamp=dte=>dte.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
const icsEsc=v=>String(v||"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/([,;])/g,"\\$1");
const icsFold=line=>{let out="",l=line;while(l.length>74){out+=l.slice(0,74)+"\r\n ";l=l.slice(74)}return out+l};
function buildICS(){
  const all=[...my.stars].map(k=>byKey.get(k)).filter(s=>s&&s.day);
  const list=all.filter(s=>!s.cancelled).sort(byTime),skipped=all.length-list.length;
  const now=icsStamp(new Date()),lead=ui.remLead||10;
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Ignite Explorer//Starred sessions//EN","CALSCALE:GREGORIAN","X-WR-CALNAME:Ignite starred sessions"];
  list.forEach(s=>{
    const where=[s.b,s.r].filter(Boolean).join(", ")||"Online",url="https://ignite.microsoft.com/en-US/sessions/"+s.id;
    lines.push("BEGIN:VEVENT","UID:"+s.k+"@ignite-explorer","DTSTAMP:"+now,"DTSTART:"+icsStamp(ptToUTC(s.day,s.s)),"DTEND:"+icsStamp(ptToUTC(s.day,s.e)),
      "SUMMARY:"+icsEsc(`${s.c} | ${s.t}`),"LOCATION:"+icsEsc(where),"URL:"+url,"DESCRIPTION:"+icsEsc(`${s.ty}${s.kind!=="inperson"?" ("+KIND[s.kind].label+")":""}\n${s.spn||""}\n${url}`),
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEsc(s.t),"TRIGGER:-PT"+lead+"M","END:VALARM","END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return {text:lines.map(icsFold).join("\r\n")+"\r\n",count:list.length,skipped};
}
function downloadICS(){
  const {text,count,skipped}=buildICS();
  if(!count){remStatus("Star some sessions first.");return}
  const url=URL.createObjectURL(new Blob([text],{type:"text/calendar"}));
  const a=document.createElement("a");a.href=url;a.download="ignite-starred-sessions.ics";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  remStatus(`Saved ${count} session${count===1?"":"s"} with a ${ui.remLead||10}-minute alarm${skipped?` (skipped ${skipped} cancelled)`:""}. Open the file to add them to your calendar. Download it again after starring more; your calendar app updates matching entries or adds them again, depending on the app.`);
}
async function copyCodes(){
  const codes=[...my.stars].map(k=>byKey.get(k)).filter(Boolean).sort(byTime).map(s=>s.c);
  if(!codes.length){remStatus("Star some sessions first.");return}
  const txt=[...new Set(codes)].join(", ");
  try{await navigator.clipboard.writeText(txt);remStatus(`Copied ${codes.length} codes. Paste them into Import on the GitHub version.`)}
  catch(e){remStatus("Copy didn't work here. Select and copy: "+txt)}
}
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.id==="remon"){ui.rem=t.checked;saveUI();if(ui.rem){checkReminders(nowPT());remStatus(`Reminders on: ${ui.remLead} minutes before each starred session while this page is open.`)}else remStatus("Reminders off.")}
  if(t.id==="remlead"){ui.remLead=+t.value;saveUI();checkReminders(nowPT())}
  if(t.id==="alerton"){ui.alerts=t.checked;saveUI();remStatus(ui.alerts?"Change alerts on.":"Change alerts off. Changes still appear in the Schedule changes list.")}
  if(t.id==="remsys")setSys(t.checked);
});

// ================= render loop =================
function render(opts){
  if(!DATA)return;
  const n=nowPT();
  computeTags();
  ui.f.my=ui.f.my.filter(id=>tagById(id));
  M=SES.filter(s=>matches(s,n));
  detectChanges();
  renderChrome(n);
  const pane=currentPane(),keep=!opts||opts.keepScroll!==false;
  const el=$("#"+pane),y=el.scrollTop;
  if(pane==="grid")renderGrid(keep);
  else if(pane==="listv")renderList();
  else if(pane==="spkv")renderSpeakers();
  else renderMine();
  if(keep&&pane!=="grid"&&el._kept===pane)el.scrollTop=y;   // replacing the content resets scroll; put it back
  el._kept=pane;
  saveUI();
}
let rq=null;
function softRender(){
  if(rq)return;
  rq=requestAnimationFrame(()=>{rq=null;render();
    const a=document.activeElement;
    if(openSheet&&openSheet.refresh&&!(isInput(a)&&a.closest(".sheet")))openSheet.refresh();
  });
}
// Once a minute: move the now line and update ended/live marks without rebuilding the page.
let lastTickDay=null;
function tick(){
  if(!DATA)return;
  const n=nowPT();
  if(lastTickDay&&lastTickDay!==n.day){lastTickDay=n.day;if(!isInput(document.activeElement))render();return}
  lastTickDay=n.day;
  checkReminders(n);
  if(ui.hidePast&&!isInput(document.activeElement)&&!openSheet){render();return}
  placeNow(n);
  document.querySelectorAll("[data-card],.blk[data-k]").forEach(el=>{
    const s=byKey.get(el.dataset.card||el.dataset.k);if(!s)return;
    el.classList.toggle("past",isPast(s,n));el.classList.toggle("live",isLive(s,n));
  });
}
setInterval(tick,60000);

// ================= sheets =================
let openSheet=null;
function focusTarget(el){
  if(!el||el===document.body)return null;
  if(el.id)return "#"+CSS.escape(el.id);
  for(const a of ["k","star","spk","fol","mytag","d","v"])if(el.dataset&&el.dataset[a])return `[data-${a}="${CSS.escape(el.dataset[a])}"]`;
  return null;
}
function closeSheet(){
  if(!openSheet)return;
  const s=openSheet;openSheet=null;
  if(s.onClose)s.onClose();
  $("#sheetroot").innerHTML="";
  if(/^#s-/.test(location.hash))try{history.replaceState(null,"",location.pathname+location.search+"#"+ui.view)}catch(e){}
  if(pendingData){const d=pendingData;pendingData=null;applyData(d)}
  // Prefer a match outside the pinned My schedule row so focus lands where the person was, and never scroll to it.
  const all=s.returnTo?[...document.querySelectorAll(s.returnTo)]:[];
  const t=all.find(x=>!x.closest(".pinrow"))||all[0];
  if(t)try{t.focus({preventScroll:true})}catch(e){}
}
function showSheet(title,bodyHTML,opts){
  const returnTo=openSheet?openSheet.returnTo:focusTarget(document.activeElement);
  if(openSheet){const o=openSheet;openSheet=null;if(o.onClose)o.onClose()}
  $("#sheetroot").innerHTML=`<div class="scrim" data-close="1"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="shead gut"><h2>${esc(title)}</h2><button class="iconbtn" data-close="1" aria-label="Close">${ICON.x}</button></div><div class="sbody gut" id="sbody">${bodyHTML}</div></div>`;
  openSheet=Object.assign({returnTo},opts||{});
  const b=$("#sheetroot .shead button");if(b)b.focus({preventScroll:true});
}
function refreshBody(html,after){const body=$("#sbody");if(!body)return;const y=body.scrollTop;const f=focusTarget(document.activeElement);body.innerHTML=html;if(after)after();body.scrollTop=y;const t=f&&body.querySelector(f);if(t)try{t.focus({preventScroll:true})}catch(e){}}

// ---- session details ----
function sessionBody(s){
  const n=nowPT(),st=my.stars.has(s.k);
  const when=s.day?`${dayLabel(s.day).long}, ${fmtMin(s.s)} to ${fmtMin(s.e)} PT (${s.e-s.s} min)`:"On demand / online";
  const others=(byCode.get(s.c)||[]).filter(x=>x.k!==s.k);
  const vid=/^https:\/\//i.test(s.vid||"")?s.vid:"";
  let h=kindCallout(s)+`<div class="actions"><button class="btn${st?" primary":""}" data-star="${esc(s.k)}" aria-pressed="${st}">${ICON.star}${st?"Starred":"Star"}</button><a class="btn" href="https://ignite.microsoft.com/en-US/sessions/${encodeURIComponent(s.id)}" target="_blank" rel="noopener">${ICON.ext}Official page</a><button class="btn" data-share="${esc(s.k)}">${ICON.share}Share</button>${vid?`<a class="btn" href="${esc(vid)}" target="_blank" rel="noopener">${ICON.play}Recording</a>`:""}</div><div class="impstat" id="sharestat" role="status"></div>`;
  h+=`<dl class="kv"><dt>When</dt><dd>${esc(when)}${isLive(s,n)?` <b style="color:var(--now)">LIVE NOW</b>`:""}</dd><dt>Where</dt><dd>${esc([s.b,s.r].filter(Boolean).join(", ")||"Online")}</dd><dt>Code</dt><dd>${esc(s.c)}</dd><dt>Type</dt><dd><span class="pill ${tclass(s.ty)}">${esc(s.ty)}</span></dd>`
    +(s.lv.length?`<dt>Level</dt><dd>${esc(s.lv.join(", "))}</dd>`:"")+(s.tp.length?`<dt>Topic</dt><dd>${esc(s.tp.join(", "))}</dd>`:"")+(s.au.length?`<dt>For</dt><dd>${esc(s.au.join(", "))}</dd>`:"")
    +`<dt>Format</dt><dd>${esc(s.dl.join(", "))}${s.rec?", recorded":", not recorded"}${s.seat?", "+esc(s.seat.toLowerCase()):""}</dd>`
    +(others.length?`<dt>Also at</dt><dd>${others.map(o=>`<button class="tagb" data-k="${esc(o.k)}">${o.day?esc(dayLabel(o.day).w)+" "+fmtMinShort(o.s):"On demand"}</button>`).join(" ")}</dd>`:"")+`</dl>`;
  const sp=s.sp.map(id=>SPK.get(id)).filter(Boolean);
  if(sp.length)h+=`<div><div class="sec" style="margin-top:0">Speakers</div>${sp.map(p=>{const f=my.follow.has(p.id);return `<div class="spline"><button class="main" data-spk="${esc(p.id)}"><div style="font-weight:600">${esc(p.n)}</div><div class="sj">${esc([p.j,p.co].filter(Boolean).join(", "))}</div></button><button class="folbtn" data-fol="${esc(p.id)}" aria-pressed="${f}">${f?"Following":"Follow"}</button></div>`}).join("")}</div>`;
  const man=my.manual[s.c]||{},on=sessionTags(s),off=my.tags.filter(t=>man[t.id]===false);
  h+=`<div><div class="sec" style="margin-top:0">My tags<small>${my.tags.length?"auto tags come from your keywords":"none yet"}</small></div><div class="tags">`
    +on.map(t=>`<span class="tchip" style="--tg:${tagColor(t)}"><span class="tdot"></span>${esc(t.name)}${man[t.id]===true?"":"<small>auto</small>"}<button data-untag="${esc(t.id)}" data-code="${esc(s.c)}" aria-label="Remove ${esc(t.name)} from this session">${ICON.x}</button></span>`).join("")
    +off.map(t=>`<button class="tagb" data-retag="${esc(t.id)}" data-code="${esc(s.c)}" title="Removed by you. Tap to let the keywords decide again">${esc(t.name)} <small>removed</small></button>`).join("")
    +`</div><div class="inline" style="margin-top:8px"><input id="addtag" list="taglist" placeholder="Add a tag to this session" aria-label="Add a tag to this session" autocomplete="off"><datalist id="taglist">${my.tags.filter(t=>!on.includes(t)).map(t=>`<option value="${esc(t.name)}">`).join("")}</datalist><button class="btn" data-addmytag="${esc(s.c)}">Add</button></div></div>`;
  h+=`<div class="notes"><label for="note"><span>My notes</span><span id="notestat"></span></label><textarea id="note" placeholder="Questions to ask, takeaways, links">${esc(my.notes.get(s.c)||"")}</textarea></div>`;
  if(s.d)h+=`<div class="desc">${esc(s.d)}</div>`;
  if(s.tg.length)h+=`<div><div class="sec" style="margin-top:0">Tags<small>tap to filter</small></div><div class="tags">${s.tg.map(t=>`<button class="tagb" data-fk="tg" data-fv="${esc(t)}" aria-pressed="${ui.f.tg.includes(t)}">${esc(t)}</button>`).join("")}</div></div>`;
  return h;
}
function kindCallout(s){
  const room=x=>esc([x.b,x.r].filter(Boolean).join(", ")||"Online");
  if(s.cancelled)return `<div class="callout kc-cancelled"><b>Cancelled.</b> Microsoft marked this session as cancelled in the catalog.</div>`;
  if(s.kind==="overflow"&&s.main)return `<div class="callout kc-overflow"><b>Overflow viewing room.</b> This room shows a live stream of <button class="linkbtn" data-k="${esc(s.main.k)}">${esc(s.main.c)}: ${esc(s.main.t)}</button>, which runs at the same time in ${room(s.main)}. The speakers are in the main room; this room is for when that one is full.</div>`;
  if(s.kind==="overflow")return `<div class="callout kc-overflow"><b>Overflow viewing room.</b> This room shows a live stream of another session; the speakers are not here in person.</div>`;
  if(s.kind==="online")return `<div class="callout kc-online"><b>Online only.</b> Microsoft lists this as an online broadcast from ${room(s)}, not a seated session room. Watch it on the Ignite website or the Broadcast Stage screens.</div>`;
  if(s.kind==="ondemand")return `<div class="callout kc-ondemand"><b>On demand.</b> Pre-recorded content to watch online any time. It has no time slot or room.</div>`;
  if(s.kind==="digital")return `<div class="callout kc-digital"><b>Digital lab.</b> A self-paced online lab. It has no time slot or room.</div>`;
  if(s.overflows&&s.overflows.length)return `<div class="callout kc-main"><b>Overflow rooms</b> show a live stream of this session if the room is full: ${s.overflows.map(o=>`<button class="linkbtn" data-k="${esc(o.k)}">${room(o)}</button>`).join(", ")}.</div>`;
  return "";
}
let noteTimer=null,notePending=null;
function bindNote(s){
  const ta=$("#note");if(!ta)return;
  ta.addEventListener("input",()=>{notePending={c:s.c,text:ta.value};$("#notestat").textContent="Typing";clearTimeout(noteTimer);noteTimer=setTimeout(flushNote,700)});
  ta.addEventListener("blur",flushNote);
}
function flushNote(){
  clearTimeout(noteTimer);if(!notePending)return;
  const p=notePending;notePending=null;
  store.setNote(p.c,p.text.replace(/\s+$/,"")).then(ok=>{const el=$("#notestat");if(el)el.textContent=ok?"Saved":"Saved on this device"});
  if(ui.view==="mine")softRender();
}
function openSession(k){
  const s=byKey.get(k);if(!s)return;
  showSheet(s.t,sessionBody(s),{kind:"s",
    refresh(){const ta=$("#note");if(ta&&document.activeElement===ta)return;refreshBody(sessionBody(s),()=>bindNote(s))},
    onClose:flushNote});
  bindNote(s);
}
function openSpeaker(id){
  const p=SPK.get(id);if(!p)return;
  const body=()=>{const f=my.follow.has(p.id),n=nowPT();const ss=p.ss.map(k=>byKey.get(k)).filter(Boolean).sort(byTime);
    return `<div class="hint">${esc([p.j,p.co].filter(Boolean).join(", "))}</div><div class="actions"><button class="btn${f?" primary":""}" data-fol="${esc(p.id)}" aria-pressed="${f}">${ICON.user}${f?"Following":"Follow"}</button></div><div><div class="sec" style="margin-top:0">Sessions<small>${ss.length}</small></div><div class="list" style="padding:0">${ss.map(s=>cardHTML(s,n,{showDay:true})).join("")}</div></div>${p.bio?`<div class="desc">${esc(p.bio)}</div>`:""}`};
  showSheet(p.n,body(),{kind:"p",refresh(){refreshBody(body())}});
}

// ---- filters ----
function facet(field,sw){const m=new Map();SES.forEach(s=>{(Array.isArray(s[field])?s[field]:[s[field]]).forEach(v=>{if(v)m.set(v,(m.get(v)||0)+1)})});return [...m].sort((a,b)=>b[1]-a[1]).map(([v,c])=>({v,c,sw}))}
function filterBody(){
  const f=ui.f,n=nowPT();
  const grp=(title,key,vals)=>`<div class="fgroup"><h3>${title}</h3><div class="tags">${vals.map(v=>`<button class="tagb" data-fk="${key}" data-fv="${esc(v.v)}" aria-pressed="${f[key].includes(v.v)}">${v.sw?`<span class="pill ${tclass(v.v)}" style="padding:0 4px;margin-right:4px">&nbsp;</span>`:""}${esc(v.v)}<small>${v.c}</small></button>`).join("")}</div></div>`;
  const bld=new Map();SES.forEach(s=>{const b=s.b||"Online";bld.set(b,(bld.get(b)||0)+1)});
  const recC=[{v:"Recorded",c:SES.filter(s=>s.rec).length},{v:"Not recorded",c:SES.filter(s=>!s.rec).length}];
  return `<div class="actions"><button class="btn primary" data-close="1">Show ${M.length} sessions</button><button class="btn" data-fclear="1">Clear filters</button></div>
  <div class="fgroup"><h3>My tags</h3><div class="tags">${my.tags.map(t=>`<button class="tagb" data-fk="my" data-fv="${esc(t.id)}" aria-pressed="${f.my.includes(t.id)}"><span class="tdot" style="--tg:${tagColor(t)};margin-right:5px"></span>${esc(t.name)}<small>${tagCount(t.id)}</small></button>`).join("")}<button class="tagb" data-opentags="1">${my.tags.length?"Edit my tags":"+ Create a tag"}</button></div></div>
  ${grp("Kind","kd",Object.values(KIND).map(k=>({v:k.filter,c:SES.filter(s=>KIND[s.kind].filter===k.filter).length})).concat([{v:"Cancelled",c:SES.filter(s=>s.cancelled).length}]).filter(x=>x.c))}
  ${grp("Session type","ty",facet("ty",true))}
  ${grp("Topic","tp",facet("tp"))}
  <div class="fgroup"><h3>Tags</h3>${f.tt.length?`<p class="hint" style="margin:0 0 6px">Typed tag words: ${f.tt.map(t=>`"${esc(t)}"`).join(", ")}. Edit them in the Tag list.</p>`:""}<p class="hint" style="margin:0 0 6px">Tags, your tags and typed tag words combine using <b>${ui.tagAll?"Match all":"Match any"}</b>, set in the Tag list.</p><input id="tagq" type="search" placeholder="Search ${TAGLIST.length} tags" aria-label="Search tags" autocomplete="off"><div class="tags" id="ftags">${filterTagsHTML("")}</div></div>
  ${grp("Level","lv",facet("lv").sort((a,b)=>a.v.localeCompare(b.v)))}
  ${grp("Audience","au",facet("au"))}
  ${grp("Venue","b",[...bld].sort((a,b)=>b[1]-a[1]).map(([v,c])=>({v,c})))}
  ${grp("Attend","dl",facet("dl"))}
  ${grp("Recording","rec",recC)}
  <p class="hint">Within a group, any selected option matches. Across groups, a session has to match every group. Tags and My tags count as one group.</p>`;
}
function filterTagsHTML(q){
  const f=ui.f;q=q.trim().toLowerCase();
  const sel=TAGLIST.filter(t=>f.tg.includes(t.v));
  let rest=TAGLIST.filter(t=>!f.tg.includes(t.v));
  rest=q?rest.filter(t=>t.v.toLowerCase().includes(q)):rest.slice(0,40);
  return sel.concat(rest).map(v=>`<button class="tagb" data-fk="tg" data-fv="${esc(v.v)}" aria-pressed="${f.tg.includes(v.v)}">${esc(v.v)}<small>${v.c}</small></button>`).join("")+(!q&&TAGLIST.length>40?`<p class="hint" style="flex-basis:100%;margin:4px 0 0">Showing the 40 most used. Search to find the rest.</p>`:"");
}
function bindFilterSheet(){const i=$("#tagq");if(!i)return;i.value=openSheet.tagq||"";i.addEventListener("input",()=>{openSheet.tagq=i.value;$("#ftags").innerHTML=filterTagsHTML(i.value)})}
function openFilters(){showSheet("Filters",filterBody(),{kind:"f",tagq:"",refresh(){refreshBody(filterBody(),()=>{bindFilterSheet();$("#ftags").innerHTML=filterTagsHTML(openSheet.tagq||"")})}});bindFilterSheet()}

// ---- my tags manager ----
const SUGG=[
  {name:"Kubernetes",q:"aks, kubernetes, k8s, containers, container apps"},
  {name:"Hands-on",q:"type:lab, type:digital lab"},
  {name:"Deep dive",q:"level:300, level:400"},
  {name:"GitHub",q:"github"},
  {name:"Identity",q:"entra, identity, conditional access, zero trust"},
  {name:"Data and Fabric",q:"fabric, onelake, power bi, sql, cosmos db, postgresql"},
  {name:"Infra and networking",q:"networking, virtual machines, landing zone, terraform, bicep, azure arc, storage"},
  {name:"Agents",q:"agent, agents, agentic, mcp"}
];
function setManual(code,id,val){
  const m=Object.assign({},my.manual[code]||{});
  if(val===null)delete m[id];else m[id]=val;
  if(Object.keys(m).length)my.manual[code]=m;else delete my.manual[code];
  tagsChanged();store.prefsChanged();softRender();
}
function addTag(name,q){
  name=String(name||"").trim().slice(0,40);if(!name)return null;
  let tg=my.tags.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(tg){if(q&&!tg.q)tg.q=String(q).trim()}
  else{tg={id:newTagId(),name,q:String(q||"").trim(),c:nextTagColor()};my.tags.push(tg)}
  tagsChanged();store.prefsChanged();return tg;
}
function deleteTag(id){
  my.tags=my.tags.filter(x=>x.id!==id);
  Object.keys(my.manual).forEach(c=>{delete my.manual[c][id];if(!Object.keys(my.manual[c]).length)delete my.manual[c]});
  ui.f.my=ui.f.my.filter(x=>x!==id);
  tagsChanged();store.prefsChanged();
}
function managerBody(){
  computeTags();
  const sugg=SUGG.map((g,i)=>({g,i})).filter(({g})=>!my.tags.some(t=>t.name.toLowerCase()===g.name.toLowerCase()));
  return `<p class="hint" style="margin:0">A tag gets added automatically to every session that matches one of its keywords. Keywords are separated by commas and match whole words in the title, description, topics and Microsoft's tags. To look in one field only, start a keyword with <code class="k">title:</code> <code class="k">speaker:</code> <code class="k">type:</code> <code class="k">level:</code> <code class="k">topic:</code> <code class="k">tag:</code> <code class="k">room:</code> or <code class="k">code:</code>. Start a keyword with <code class="k">-</code> to leave out matches. You can also add or remove a tag on any single session from its details.</p>`
  +my.tags.map(t=>`<div class="tagedit" style="--tg:${tagColor(t)}"><div class="r"><span class="tdot"></span><input class="nm" id="tn-${esc(t.id)}" data-tname="${esc(t.id)}" value="${esc(t.name)}" aria-label="Tag name" maxlength="40"><span class="cnt" id="cnt-${esc(t.id)}">${tagCount(t.id)} sessions</span></div><div class="r"><input id="tq-${esc(t.id)}" data-tq="${esc(t.id)}" value="${esc(t.q)}" placeholder="Keywords, e.g. aks, kubernetes, -windows" aria-label="Keywords for ${esc(t.name)}"><button class="del" data-deltag="${esc(t.id)}">Delete</button></div></div>`).join("")
  +`<div class="tagedit" style="--tg:var(--muted)"><div class="r"><input id="ntname" placeholder="New tag name" aria-label="New tag name" maxlength="40"></div><div class="r"><input id="ntq" placeholder="Keywords, comma separated" aria-label="New tag keywords"><button class="btn primary" data-newtag="1">Add</button></div><div class="cnt" id="ntcnt"></div></div>`
  +(sugg.length?`<div><div class="sec" style="margin-top:4px">Starter tags<small>tap to add, then edit the keywords</small></div><div class="tags">${sugg.map(({g,i})=>`<button class="tagb" data-sugg="${i}" title="${esc(g.q)}">+ ${esc(g.name)}<small>${previewCount(g.q)}</small></button>`).join("")}</div></div>`:"");
}
function openTagManager(){
  showSheet("My tags",managerBody(),{kind:"t",refresh(){computeTags();my.tags.forEach(t=>{const el=document.getElementById("cnt-"+t.id);if(el)el.textContent=tagCount(t.id)+" sessions"})}});
}
const rerenderManager=()=>{if(openSheet&&openSheet.kind==="t")refreshBody(managerBody())};
let tagEditT=null;
document.addEventListener("input",e=>{
  const el=e.target;if(!el.dataset)return;
  const id=el.dataset.tq||el.dataset.tname;
  if(id){
    const tg=tagById(id);if(!tg)return;
    if(el.dataset.tq){tg.q=el.value;const c=document.getElementById("cnt-"+id);if(c)c.textContent=previewCount(tg.q)+" sessions"}
    else tg.name=el.value.slice(0,40)||"Untitled";
    clearTimeout(tagEditT);tagEditT=setTimeout(()=>{tagEditT=null;tagsChanged();store.prefsChanged();softRender()},700);
  }
  if(el.id==="ntq"){const c=$("#ntcnt");if(c)c.textContent=el.value.trim()?previewCount(el.value)+" sessions match":""}
});

// ---- import from the Microsoft app ----
let sampleFn=null,imageLimits=null,impCtl=null,impFound=[];
async function initSample(){
  try{
    if(!window.claude||!window.claude.use)return;
    sampleFn=await window.claude.use("sample");
    if(sampleFn&&sampleFn.limits){const l=await sampleFn.limits().catch(()=>null);imageLimits=l&&l.images?l.images:null}
  }catch(e){sampleFn=null}
}
function importBody(){
  const img=sampleFn&&imageLimits;
  return `<p class="hint" style="margin:0">Add the sessions you already picked in the Microsoft Events app. Agenda items such as badge pickup and lunch are not catalog sessions, so they are skipped. You get to review the matches before anything is starred.</p>
  <div class="imp"><div class="sec" style="margin:4px 0 0">From your Ignite calendar file (most accurate)</div>
  <ol class="hint" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px">
    <li>Open <a href="https://ignite.microsoft.com/en-US/schedule" target="_blank" rel="noopener">My Schedule on the Ignite website</a> and sign in.</li>
    <li>Tap the download button (the down arrow). If you don't see it, tap your profile picture at the top right; the panel that opens has My schedule with the download button under the day picker.</li>
    <li>Save the calendar file (.ics) it gives you, then pick it below. If it opens as text instead, copy all of it into the text box further down.</li>
  </ol>
  <input type="file" id="impics" accept=".ics,text/calendar"><div class="actions"><button class="btn primary" id="impicsgo">Read calendar file</button><a class="btn" href="https://ignite.microsoft.com/en-US/schedule" target="_blank" rel="noopener">${ICON.ext}Open Ignite My Schedule</a></div>
  <div class="sec" style="margin:8px 0 0">From screenshots</div>${img
    ?`<p class="hint" style="margin:0">Take screenshots of My Schedule in the Microsoft app, one per day is fine, then pick them here. Claude reads the session codes from them using your Claude account.</p><input type="file" id="impfiles" accept="${esc(imageLimits.mediaTypes.join(","))}" multiple><div class="actions"><button class="btn primary" id="impread">Read screenshots</button><button class="btn" id="impstop" hidden>Stop</button></div>`
    :`<p class="hint" style="margin:0">Reading screenshots works in the claude.ai version of this page. Here, type or paste the session codes instead.</p>`}
  <div class="sec" style="margin:8px 0 0">From text</div><p class="hint" style="margin:0">Paste or type session codes or titles, separated by commas or new lines, for example BRK543, THR920.</p><textarea id="imptext" placeholder="BRK543, THR920, INV641"></textarea><div class="actions"><button class="btn" id="impfind">Find sessions</button></div>
  <div class="impstat" id="impstat" role="status"></div><div id="impres"></div></div>`;
}
function openImport(){showSheet("Import my schedule",importBody(),{kind:"i",onClose(){if(impCtl)impCtl.abort()}})}
function impStatus(t,err){const el=$("#impstat");if(el){el.textContent=t;el.classList.toggle("err",!!err)}}
const normTitle=t=>String(t||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function parseDay(str){
  const m=String(str||"").match(/nov(?:ember)?\.?\s*(\d{1,2})/i);
  if(m&&DAYS.length)return `${DAYS[0].slice(0,4)}-11-${String(+m[1]).padStart(2,"0")}`;
  const w=String(str||"").match(/\b(mon|tue|wed|thu|fri|sat|sun)/i);
  if(w){const d=DAYS.find(x=>dayLabel(x).w.toLowerCase()===w[1].toLowerCase());if(d)return d}
  return null;
}
function parseTime(str){const m=String(str||"").match(/(\d{1,2}):(\d{2})\s*([ap])\.?m/i);if(!m)return null;let h=+m[1]%12;if(m[3].toLowerCase()==="p")h+=12;return h*60+(+m[2])}
function resolveItems(items){
  const found=new Map(),missing=[],agenda=[];
  const titleIndex=SES.map(s=>({s,n:normTitle(s.t),w:new Set(normTitle(s.t).split(" "))}));
  items.forEach(it=>{
    const code=String(it.code||"").toUpperCase().replace(/\s+/g,"");
    if(/^AGENDA/.test(code)){agenda.push(it.title||code);return}
    let cands=code&&byCode.get(code)?byCode.get(code).slice():[];
    if(!cands.length&&it.id&&byId.get(it.id))cands=byId.get(it.id).slice();
    if(!cands.length&&it.title){
      const nt=normTitle(it.title),nw=new Set(nt.split(" "));let best=0,pick=[];
      titleIndex.forEach(x=>{let sc;if(x.n===nt)sc=1;else{let inter=0;nw.forEach(w=>{if(x.w.has(w))inter++});sc=inter/Math.max(nw.size,x.w.size)}
        if(sc>best+1e-9){best=sc;pick=[x.s]}else if(Math.abs(sc-best)<1e-9)pick.push(x.s)});
      if(best>=0.75)cands=pick;
    }
    if(!cands.length){missing.push(it.title||code||"(unreadable entry)");return}
    const d=it.day||parseDay(it.date),t=it.min!=null?it.min:parseTime(it.start);
    let narrowed=d?cands.filter(s=>s.day===d):cands;if(!narrowed.length)narrowed=cands;
    if(t!=null&&narrowed.length>1){const exact=narrowed.filter(s=>s.s===t);if(exact.length)narrowed=exact}
    narrowed.forEach((s,i)=>{if(!found.has(s.k))found.set(s.k,{s,checked:i===0})});
  });
  return {found:[...found.values()].sort((a,b)=>byTime(a.s,b.s)),missing,agenda};
}
function showResults(r){
  impFound=r.found;const n=nowPT();
  let h="";
  if(r.found.length){
    h+=`<div class="sec" style="margin:8px 0 0">Found ${r.found.length}</div>`+r.found.map((x,i)=>{const s=x.s,st=my.stars.has(s.k);
      return `<div class="irow"><input type="checkbox" id="imp-${i}" ${x.checked&&!st?"checked":""} ${st?"disabled":""}><label for="imp-${i}"><span class="ct">${esc(s.t)}</span><span class="cm">${esc(s.c)} · ${s.day?esc(dayLabel(s.day).long)+" "+fmtMinShort(s.s)+"-"+fmtMinShort(s.e):"On demand"} · ${esc([shortB(s.b),s.r].filter(Boolean).join(", "))}${st?" · already starred":""}${isPast(s,n)?" · ended":""}</span></label></div>`}).join("");
    h+=`<div class="actions" style="margin-top:8px"><button class="btn primary" id="impstar">Star selected sessions</button></div>`;
  }
  if(r.missing.length)h+=`<p class="miss">Not found in the catalog: ${r.missing.map(esc).join("; ")}</p>`;
  if(r.agenda.length)h+=`<p class="miss">Skipped agenda items: ${r.agenda.map(esc).join("; ")}</p>`;
  if(!r.found.length&&!r.missing.length&&!r.agenda.length)h=`<p class="miss">No sessions found.</p>`;
  $("#impres").innerHTML=h;
}
// iCalendar (.ics) parsing: one item per VEVENT with code, session id, title and Pacific start.
const ptFull=new Intl.DateTimeFormat("en-US",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function icsTime(prop,val){
  const m=String(val||"").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);if(!m||m[4]==null)return {};
  if(m[7]){const p={};ptFull.formatToParts(new Date(Date.UTC(+m[1],m[2]-1,+m[3],+m[4],+m[5]))).forEach(x=>p[x.type]=x.value);return {day:`${p.year}-${p.month}-${p.day}`,min:(+p.hour)*60+(+p.minute)}}
  const tz=(prop.match(/TZID=([^;:]+)/i)||[])[1]||"";
  if(!tz||/los_angeles|pacific/i.test(tz))return {day:`${m[1]}-${m[2]}-${m[3]}`,min:(+m[4])*60+(+m[5])};
  return {day:`${m[1]}-${m[2]}-${m[3]}`};
}
const icsText=v=>String(v||"").replace(/\\n/gi,"\n").replace(/\\([,;\\])/g,"$1");
function parseICS(txt){
  const lines=String(txt).replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"").split("\n");
  const items=[];let ev=null;
  lines.forEach(line=>{
    if(/^BEGIN:VEVENT/i.test(line)){ev={};return}
    if(/^END:VEVENT/i.test(line)){if(ev)items.push(ev);ev=null;return}
    if(!ev)return;const i=line.indexOf(":");if(i<0)return;
    const prop=line.slice(0,i),name=prop.split(";")[0].toUpperCase(),val=line.slice(i+1);
    if(name==="DTSTART")Object.assign(ev,icsTime(prop,val));
    else if(["SUMMARY","DESCRIPTION","URL","UID","LOCATION","X-ALT-DESC","X-SESSION-ID"].includes(name))ev[name]=(ev[name]?ev[name]+" ":"")+icsText(val);
  });
  return items.map(ev=>{
    // Ignite's own export: SUMMARY is "Type | CODE | Title", X-SESSION-ID is the catalog session id.
    const parts=String(ev.SUMMARY||"").split(" | ").map(x=>x.trim());
    const title=parts.length>=3?parts.slice(2).join(" | "):String(ev.SUMMARY||"").trim();
    const all=[ev.SUMMARY,ev.UID,ev.URL,ev.DESCRIPTION,ev["X-ALT-DESC"]].join(" ");
    const idm=String(ev["X-SESSION-ID"]||"").trim()||((all.match(/\/sessions\/([A-Za-z0-9]+)/)||[])[1])||"";
    const code=(all.match(/\b[A-Za-z]{2,10}\d{1,5}[A-Za-z]?\b/g)||[]).map(c=>c.toUpperCase()).find(c=>byCode.has(c)||/^AGENDA/.test(c))||"";
    return {code,id:idm,title,day:ev.day||null,min:ev.min!=null?ev.min:null};
  }).filter(x=>x.code||x.id||x.title);
}
function importICS(txt){
  const items=parseICS(txt);
  if(!items.length){impStatus("That file has no calendar entries this page can read.",true);return}
  impStatus(`Read ${items.length} calendar entr${items.length===1?"y":"ies"}.`);showResults(resolveItems(items));
}
async function readICSFile(){
  const f=($("#impics").files||[])[0];if(!f){impStatus("Pick the calendar file first.",true);return}
  try{importICS(await f.text())}catch(e){impStatus("That file couldn't be read.",true)}
}
function findFromText(){
  const txt=$("#imptext").value||"";
  if(/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(txt)){importICS(txt);return}const items=[];const used=new Set();
  (txt.match(/\b[A-Za-z]{2,10}\d{1,5}[A-Za-z]?\b/g)||[]).forEach(c=>{const C=c.toUpperCase();if((byCode.has(C)||/^AGENDA/.test(C))&&!used.has(C)){used.add(C);items.push({code:C})}});
  txt.split(/[\n;]+/).map(x=>x.trim()).filter(x=>x.length>8&&!/^[A-Za-z]{2,10}\d{1,5}[A-Za-z]?$/.test(x)&&!(x.match(/\b[A-Za-z]{2,10}\d{1,5}[A-Za-z]?\b/g)||[]).some(c=>used.has(c.toUpperCase()))).forEach(line=>items.push({title:line}));
  if(!items.length){impStatus("No session codes or titles found in that text.",true);return}
  impStatus("");showResults(resolveItems(items));
}
async function sliceImage(file){
  // Phone screenshots are tall; split them into overlapping pieces so the text stays readable after downsizing.
  try{
    const bmp=await createImageBitmap(file);
    const W=bmp.width,H=bmp.height,scale=Math.min(1,960/W),w=Math.round(W*scale),total=Math.round(H*scale);
    const chunk=Math.round(w*1.25),overlap=Math.round(w*0.15),out=[];
    for(let y=0;;y+=chunk-overlap){
      const h=Math.min(chunk,total-y);const c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(bmp,0,y/scale,W,h/scale,0,0,w,h);
      out.push(await new Promise(r=>c.toBlob(r,"image/jpeg",0.9)));
      if(y+h>=total)break;
    }
    return out.filter(Boolean);
  }catch(e){return [file]}
}
const SAMPLE_ERR={not_granted:"This page isn't allowed to use Claude, so it can't read screenshots. Type the codes instead.",sampling_disabled:"Claude isn't available on this account, so screenshots can't be read here. Type the codes instead.",rate_limited:"Too many requests right now. Wait a minute and try again.",image_rejected:"One of the images couldn't be read. Try a PNG or JPEG screenshot.",invalid_json:"Claude's answer couldn't be read. Try again.",images_unavailable:"This view can't send images to Claude. Type the codes instead.",session_expired:"Sign in to claude.ai again, then retry."};
async function readScreenshots(){
  const files=[...($("#impfiles").files||[])];
  if(!files.length){impStatus("Pick one or more screenshots first.",true);return}
  if(impCtl)impCtl.abort();
  const ctl=impCtl=new AbortController();
  $("#impread").disabled=true;$("#impstop").hidden=false;
  try{
    impStatus("Preparing images");
    let pieces=[];for(const f of files)pieces=pieces.concat(await sliceImage(f));
    const per=Math.max(1,imageLimits.maxCount||1),items=[];
    const prompt=`These images are pieces of screenshots of one person's "My Schedule" page in the Microsoft Ignite 2026 conference app (San Francisco, November 16-20, 2026). Pieces overlap, so an entry may appear twice; list it once. List every schedule entry you can read. For each give: "code", the session code exactly as printed (examples: BRK543, THR920, INV641, LTG1233, LAB680, AGENDA024), or "" if none is visible; "title" as printed; "date" as printed or as shown in the day selector (for example "Thursday, November 19"); "start", the start time as printed (for example "02:45 PM"). Skip the cards that say there is a gap in the schedule. Reply with only JSON in this shape: {"items":[{"code":"BRK543","title":"Scott and Mark learn to... live again","date":"Thursday, November 19","start":"02:45 PM"}]}`;
    for(let i=0;i<pieces.length;i+=per){
      impStatus(`Reading ${Math.min(i+per,pieces.length)} of ${pieces.length} image pieces. This can take a minute.`);
      const res=await sampleFn.json(prompt,{images:pieces.slice(i,i+per),signal:ctl.signal});
      if(res&&Array.isArray(res.items))res.items.forEach(x=>{if(x&&typeof x==="object")items.push({code:String(x.code||""),title:String(x.title||""),date:String(x.date||""),start:String(x.start||"")})});
    }
    if(ctl.signal.aborted)return;
    if(!items.length){impStatus("No schedule entries were found in those screenshots.",true);return}
    impStatus(`Read ${items.length} entries.`);showResults(resolveItems(items));
  }catch(e){
    if(e&&e.code==="cancelled"){impStatus("Stopped.");return}
    impStatus((e&&SAMPLE_ERR[e.code])||"Reading the screenshots failed. Try again in a moment, or type the codes instead.",true);
  }finally{
    if(impCtl===ctl)impCtl=null;
    const r=$("#impread"),st=$("#impstop");if(r)r.disabled=false;if(st)st.hidden=true;
  }
}
function starImported(){
  let n=0;impFound.forEach((x,i)=>{const cb=document.getElementById("imp-"+i);if(cb&&cb.checked&&!cb.disabled&&!my.stars.has(x.s.k)){my.stars.add(x.s.k);n++}});
  if(!n){impStatus("Nothing new selected.");return}
  store.prefsChanged();softRender();
  impStatus(`Starred ${n} session${n===1?"":"s"}. They're in the My schedule row of the guide.`);
  showResults({found:impFound,missing:[],agenda:[]});
}

// ================= actions =================
function toggleStar(k){my.stars.has(k)?my.stars.delete(k):my.stars.add(k);store.prefsChanged();softRender()}
function toggleFollow(id){my.follow.has(id)?my.follow.delete(id):my.follow.add(id);store.prefsChanged();softRender()}
function toggleIn(arr,v){const i=arr.indexOf(v);i>=0?arr.splice(i,1):arr.push(v)}
document.addEventListener("click",e=>{
  const t=e.target.closest("button,[data-close]");if(!t)return;
  const d=t.dataset;
  if(d.dismiss){const tt=t.closest(".toast");if(tt)tt.remove();if(!d.k)return}
  if(d.close){closeSheet();return}
  if(d.star){toggleStar(d.star);return}
  if(d.fol){toggleFollow(d.fol);return}
  if(d.share){shareSession(d.share);return}
  if(d.untag){const tg=tagById(d.untag),s=(byCode.get(d.code)||[])[0];
    const autoHit=tg&&s&&ruleMatch(s,compileRule(tg.q));setManual(d.code,d.untag,autoHit?false:null);return}
  if(d.retag){setManual(d.code,d.retag,null);return}
  if(d.addmytag){const i=$("#addtag");const tg=addTag(i&&i.value);if(tg)setManual(d.addmytag,tg.id,true);return}
  if(d.k){openSession(d.k);return}
  if(d.spk){openSpeaker(d.spk);return}
  if(d.clearty){ui.f.ty=[];render();return}
  if(d.rmterm!=null){ui.f.tt=ui.f.tt.filter(x=>x!==d.rmterm);render();return}
  if(d.opentags){openTagManager();return}
  if(d.mytag){toggleIn(ui.f.my,d.mytag);render();return}
  if(d.newtag){if(addTag($("#ntname").value,$("#ntq").value)){rerenderManager();softRender()}return}
  if(d.sugg!=null){const g=SUGG[+d.sugg];if(g){addTag(g.name,g.q);rerenderManager();softRender()}return}
  if(d.deltag){if(t.classList.contains("arm")){deleteTag(d.deltag);rerenderManager();softRender()}else{t.classList.add("arm");t.textContent="Confirm delete"}return}
  if(d.fk){toggleIn(ui.f[d.fk],d.fv);if(t.closest("#tagpanel"))$("#tagin").value="";softRender();return}
  if(d.fclear){FKEYS.forEach(k=>ui.f[k]=[]);softRender();return}
  if(d.import){openImport();return}
  if(d.d){ui.day=d.d;render();if(ui.view==="guide")scrollToNow();return}
  if(d.v){location.hash=d.v;return}
  switch(t.id){
    case "impread":readScreenshots();return;
    case "impstop":if(impCtl)impCtl.abort();return;
    case "impfind":findFromText();return;
    case "impicsgo":readICSFile();return;
    case "impstar":starImported();return;
    case "icsbtn":downloadICS();return;
    case "copycodes":copyCodes();return;
    case "xfercopy":copyTransfer();return;
    case "xfershare":shareTransfer();return;
    case "xfermerge":if(openSheet&&openSheet.data)mergeTransfer(openSheet.data);return;
    case "clrchg":changes=[];LS("ig-changes",changes);render();return;
  }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&openSheet)closeSheet()});
$("#fbtn").addEventListener("click",openFilters);
$("#impbtn").addEventListener("click",openImport);
$("#tagmgr").addEventListener("click",openTagManager);
let qT=null;$("#q").addEventListener("input",e=>{clearTimeout(qT);qT=setTimeout(()=>{ui.q=e.target.value.trim();render()},150)});
$("#qclear").addEventListener("click",()=>{$("#q").value="";ui.q="";render();$("#q").focus()});
$("#tTrk").addEventListener("click",()=>{ui.onlyTrk=!ui.onlyTrk;render()});
$("#tStar").addEventListener("click",()=>{ui.onlyStar=!ui.onlyStar;render()});
$("#tPast").addEventListener("click",()=>{ui.hidePast=!ui.hidePast;render()});
$("#tKey").addEventListener("click",()=>{ui.legend=!ui.legend;render()});
$("#tTags").addEventListener("click",()=>{ui.tagPanel=!ui.tagPanel;render();if(ui.tagPanel)$("#tagin").focus()});
$("#tagin").addEventListener("input",renderTagList);
$("#tagin").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addTerms(e.target.value)}else if(e.key==="Backspace"&&!e.target.value&&ui.f.tt.length){ui.f.tt.pop();render()}});
$("#tagadd").addEventListener("click",()=>addTerms($("#tagin").value));
$("#tagclr").addEventListener("click",()=>{ui.f.tg=[];ui.f.my=[];ui.f.tt=[];$("#tagin").value="";render()});
$("#mAny").addEventListener("click",()=>{ui.tagAll=false;render()});
$("#mAll").addEventListener("click",()=>{ui.tagAll=true;render()});
function zoom(dir){
  const el=$("#grid"),old=ui.ppm,lw=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--labelw"))||112;
  const centerMin=(el.scrollLeft+(el.clientWidth-lw)/2)/old;
  let i=ZOOM.indexOf(old);if(i<0)i=ZOOM.indexOf(10);
  ui.ppm=ZOOM[Math.max(0,Math.min(ZOOM.length-1,i+dir))];if(ui.ppm===old)return;
  render();el.scrollLeft=Math.max(0,centerMin*ui.ppm-(el.clientWidth-lw)/2);
}
$("#zin").addEventListener("click",()=>zoom(1));$("#zout").addEventListener("click",()=>zoom(-1));
$("#nowbtn").addEventListener("click",()=>{const n=nowPT();if(DAYS.includes(n.day)){ui.day=n.day;render();scrollToNow()}else setStatus("The event isn't running right now")});
// ---- share a session ----
// The shared link opens the public GitHub Pages copy at that session (#s-KEY); claude.ai links need an account.
const sessionLink=k=>(IN_CLAUDE?GH_URL:location.origin+location.pathname)+"#s-"+k;
function shareText(s){
  const when=s.day?`${dayLabel(s.day).long}, ${fmtMin(s.s)} to ${fmtMin(s.e)} PT`:"On demand";
  const where=[s.b,s.r].filter(Boolean).join(", ")||"Online";
  const notes=[s.cancelled?"Cancelled by Microsoft":"",s.kind!=="inperson"?KIND[s.kind].label:""].filter(Boolean).join(", ");
  return `${s.c}: ${s.t}${notes?` (${notes})`:""}\n${when}\n${where}${s.spn?"\n"+s.spn:""}\nGuide: ${sessionLink(s.k)}\nOfficial page: https://ignite.microsoft.com/en-US/sessions/${encodeURIComponent(s.id)}`;
}
function shareStatus(t){const el=$("#sharestat");if(el)el.textContent=t}
async function shareSession(k){
  const s=byKey.get(k);if(!s)return;
  const text=shareText(s);
  if(!IN_CLAUDE&&navigator.share){                 // phone share sheet (not available inside claude.ai)
    try{await navigator.share({title:`${s.c}: ${s.t}`,text});return}
    catch(e){if(e&&e.name==="AbortError")return}
  }
  try{await navigator.clipboard.writeText(text);shareStatus("Copied the session details and links. Paste them anywhere.")}
  catch(e){shareStatus("Copy didn't work here. Select and copy this:\n"+text)}
}
// Deep link: #s-KEY opens the guide on that session's day, scrolls to it and opens its details.
function revealSession(s){
  if(s.day){
    const el=$("#grid"),b=[...el.querySelectorAll(`.blk[data-k="${CSS.escape(s.k)}"]`)].find(x=>!x.closest(".pinrow"));
    if(b){const lw=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--labelw"))||112;
      el.scrollLeft=Math.max(0,parseFloat(b.style.left)-40);el.scrollTop=Math.max(0,b.closest(".grow").offsetTop-el.clientHeight/3)}
  }else{const c=$(`#listv [data-card="${CSS.escape(s.k)}"]`);if(c)$("#listv").scrollTop=Math.max(0,c.offsetTop-80)}
}
function route(){
  if(openSheet){const o=openSheet;openSheet=null;if(o.onClose)o.onClose();$("#sheetroot").innerHTML=""}   // a new link replaces any open details
  const v=(location.hash||"").replace("#","");
  const x=v.match(/^xfer-([jz][A-Za-z0-9_-]+)$/);
  if(x&&!IN_CLAUDE){ui.view="mine";render({keepScroll:false});openTransfer(x[1]);return}
  const m=v.match(/^s-([A-Za-z0-9-]+)$/);
  if(m){
    const s=byKey.get(m[1])||byKey.get(m[1].toUpperCase())||(byCode.get(m[1].toUpperCase())||[])[0];
    if(s){
      ui.view="guide";ui.day=s.day||"od";
      if(ui.q&&!matches(s,nowPT())){ui.q="";$("#q").value=""}
      FKEYS.forEach(k=>{if(ui.f[k].length&&!matches(s,nowPT()))ui.f[k]=[]});
      if(!matches(s,nowPT())){ui.onlyTrk=ui.onlyStar=false;ui.hidePast=false}   // make sure the shared session is visible
      render({keepScroll:false});revealSession(s);openSession(s.k);return;
    }
  }
  if(["guide","list","speakers","mine"].includes(v))ui.view=v;render({keepScroll:false});if(ui.view==="guide")scrollToNow();
}
window.addEventListener("hashchange",route);

// ================= storage =================
// Saved per person: stars, followed speakers, my tags and manual tag edits in one "prefs" record, and one record per note.
// In claude.ai these sync to a private per-person store; elsewhere they stay in this browser.
// Unsynced local changes are tracked so a reload or another device never silently overwrites them.
function setStatus(t){$("#status").textContent=t}
const store=(function(){
  const sync=LS("ig-sync")||{};
  const migrating=sync.v!==2;              // first run after the old storage format
  let rev=+sync.rev||0,dirtyPrefs=!!sync.dirtyPrefs,dirtyNotes=Object.assign({},sync.dirtyNotes||{});
  let col=null,mode="local",ready=false,prefsBusy=false,prefsAgain=false,retried=false;
  const noteBusy=new Set(),noteAgain=new Set();
  const okTags=v=>Array.isArray(v)?v.filter(t=>t&&typeof t.id==="string"&&typeof t.name==="string").map(t=>({id:t.id,name:t.name.slice(0,40),q:typeof t.q==="string"?t.q:"",c:+t.c||0})):[];
  const okMan=v=>{const out={};if(v&&typeof v==="object"&&!Array.isArray(v))Object.entries(v).forEach(([c,m])=>{if(m&&typeof m==="object"){const mm={};Object.entries(m).forEach(([id,b])=>{if(typeof b==="boolean")mm[id]=b});if(Object.keys(mm).length)out[c]=mm}});return out};
  const strs=v=>Array.isArray(v)?v.filter(x=>typeof x==="string"):[];
  function saveLocal(){LS("ig-my",{stars:[...my.stars],follow:[...my.follow],notes:Object.fromEntries(my.notes),tags:my.tags,manual:my.manual});LS("ig-sync",{v:2,rev,dirtyPrefs,dirtyNotes})}
  function loadLocal(){const d=LS("ig-my");if(!d)return;strs(d.stars).forEach(k=>my.stars.add(k));strs(d.follow).forEach(k=>my.follow.add(k));Object.entries(d.notes||{}).forEach(([c,t])=>{if(typeof t==="string"&&t)my.notes.set(c,t)});my.tags=okTags(d.tags);my.manual=okMan(d.manual);tagsChanged()}
  function applyRemote(p){my.stars=new Set(strs(p.stars));my.follow=new Set(strs(p.follow));my.tags=okTags(p.tags);my.manual=okMan(p.manual);tagsChanged()}
  function mergeRemote(p){
    strs(p.stars).forEach(k=>my.stars.add(k));strs(p.follow).forEach(k=>my.follow.add(k));
    const ids=new Set(my.tags.map(t=>t.id));okTags(p.tags).forEach(t=>{if(!ids.has(t.id))my.tags.push(t)});
    const rm=okMan(p.manual);Object.entries(rm).forEach(([c,m])=>{my.manual[c]=Object.assign({},m,my.manual[c]||{})});
    tagsChanged();
  }
  const hasLocalPrefs=()=>my.stars.size||my.follow.size||my.tags.length||Object.keys(my.manual).length;
  const failMsg=e=>{const c=e&&e.code;if(c==="invalid_argument"||c==="not_granted"||c==="revoked"){mode="local";return "Saved on this device. Your access to this page can't sync to your account"}return "Saved on this device. Will sync on your next change"};
  const noteId=c=>"n-"+c.replace(/[^A-Za-z0-9_\-.~:@+]/g,"_");
  function retryOnce(e){if(e&&e.code==="unavailable"&&!retried){retried=true;setTimeout(()=>{retried=false;flushAll()},3000+Math.random()*5000)}}
  async function flushPrefs(){
    if(mode!=="db"||!ready||!dirtyPrefs)return;
    if(prefsBusy){prefsAgain=true;return}
    prefsBusy=true;
    try{
      do{prefsAgain=false;const next=rev+1;
        await col.doc("prefs").set({stars:[...my.stars],follow:[...my.follow],tags:my.tags,manual:my.manual,rev:next,updated:new Date().toISOString()});
        rev=next;if(!prefsAgain)dirtyPrefs=false;saveLocal();
      }while(prefsAgain);
      setStatus("Synced to your account");
    }catch(e){setStatus(failMsg(e));retryOnce(e)}
    finally{prefsBusy=false}
  }
  async function flushNote(c){
    if(mode!=="db"||!ready||!dirtyNotes[c])return mode==="db";
    if(noteBusy.has(c)){noteAgain.add(c);return true}
    noteBusy.add(c);
    try{
      do{noteAgain.delete(c);const text=my.notes.get(c),ref=col.doc(noteId(c));
        if(text)await ref.set({code:c,text,updated:new Date().toISOString()});else await ref.delete();
        if(!noteAgain.has(c))delete dirtyNotes[c];saveLocal();
      }while(noteAgain.has(c));
      return true;
    }catch(e){setStatus(failMsg(e));retryOnce(e);return false}
    finally{noteBusy.delete(c)}
  }
  function flushAll(){flushPrefs();Object.keys(dirtyNotes).forEach(flushNote)}
  function onSnapshot(snap){
    if(snap.metadata.fromCache&&!ready)return;      // wait for the store's own answer before deciding anything
    let prefs=null;const notes=new Map();
    snap.docs.forEach(doc=>{if(!doc.exists)return;const v=doc.data()||{};
      if(doc.id==="prefs")prefs=v;else if(doc.id.startsWith("n-")&&typeof v.text==="string"&&typeof v.code==="string")notes.set(v.code,v.text)});
    const editingTag=!!tagEditT;
    if(!ready){
      ready=true;
      if(prefs){
        if(dirtyPrefs||migrating){mergeRemote(prefs);dirtyPrefs=true}   // keep unsynced local changes, add the account's
        else applyRemote(prefs);
        rev=Math.max(rev,+prefs.rev||0);
      }
      else if(hasLocalPrefs())dirtyPrefs=true;
      if(migrating)my.notes.forEach((t,c)=>{if(!notes.has(c))dirtyNotes[c]=true});
      const merged=new Map();notes.forEach((t,c)=>{if(!dirtyNotes[c])merged.set(c,t)});
      Object.keys(dirtyNotes).forEach(c=>{const t=my.notes.get(c);if(t)merged.set(c,t)});
      my.notes=merged;
      setStatus("Synced to your account");
    }else{
      if(prefs&&!prefsBusy&&!dirtyPrefs&&!editingTag&&(+prefs.rev||0)>=rev){applyRemote(prefs);rev=+prefs.rev||0}
      const merged=new Map();notes.forEach((t,c)=>{if(!dirtyNotes[c]&&!noteBusy.has(c))merged.set(c,t)});
      my.notes.forEach((t,c)=>{if(dirtyNotes[c]||noteBusy.has(c))merged.set(c,t)});
      if(notePending)merged.set(notePending.c,notePending.text);
      my.notes=merged;
    }
    if(DATA&&normFollow())dirtyPrefs=true;
    saveLocal();flushAll();softRender();
  }
  async function init(){
    loadLocal();
    if(!window.claude||!window.claude.use){setStatus("Saved on this device");return}
    try{
      const [db,user]=await Promise.all([window.claude.use("db"),window.claude.use("user")]);
      const uid=user?await user.id():null;
      if(!db||!uid){setStatus(db?"Saved on this device. Sign in to sync":"Saved on this device");return}
      col=db.collection("data/users/"+uid);mode="db";setStatus("Connecting to your saved data");
      const timer=setTimeout(()=>{if(!ready)setStatus("Can't reach your saved data yet. Changes are kept on this device")},10000);
      col.onSnapshot(snap=>{clearTimeout(timer);onSnapshot(snap)},err=>{clearTimeout(timer);mode="local";setStatus("Saved on this device. Account sync stopped; reload to reconnect")});
    }catch(e){setStatus("Saved on this device")}
  }
  return {
    init,
    prefsChanged(){dirtyPrefs=true;saveLocal();flushPrefs()},
    setNote(c,text){if(text)my.notes.set(c,text);else my.notes.delete(c);dirtyNotes[c]=true;saveLocal();return flushNote(c)}
  };
})();

// ================= boot =================
function prep(d){
  byKey.clear();byCode.clear();byId.clear();SPK.clear();lineCache.clear();
  DATA=d;ALIAS=d.alias||{};
  d.speakers.forEach(p=>{p.hay=(p.n+" "+p.j+" "+p.co).toLowerCase();SPK.set(p.id,p)});
  d.sessions.forEach(s=>{
    ["tp","tg","lv","au","dl","sp"].forEach(k=>{if(!Array.isArray(s[k]))s[k]=[]});
    s.t=s.t||"";s.d=s.d||"";s.b=s.b||"";s.r=s.r||"";s.ty=s.ty||"Other";
    s.spn=s.sp.map(id=>SPK.get(id)).filter(Boolean).map(p=>p.n).join(", ");
    s.hay=[s.t,s.c,s.spn,s.tg.join(" "),s.tp.join(" "),s.ty,s.b,s.r,s.d].join(" ").toLowerCase();
    byKey.set(s.k,s);if(!byCode.has(s.c))byCode.set(s.c,[]);byCode.get(s.c).push(s);
    if(s.id){if(!byId.has(s.id))byId.set(s.id,[]);byId.get(s.id).push(s)}
  });
  byCode.forEach(v=>v.sort(byTime));
  SES=d.sessions;
  SES.forEach(s=>{
    const base=/O$/.test(s.c)?byCode.get(s.c.slice(0,-1)):null;
    s.kind=!s.day?(s.ty==="Digital Lab"?"digital":"ondemand"):base?"overflow":(s.dl.length&&!s.dl.includes("In-person")?"online":"inperson");
    if(base){s.main=base.find(m=>m.day===s.day&&m.s===s.s)||base[0];(s.main.overflows||(s.main.overflows=[])).push(s)}
    const cm=s.t.match(/^\s*(cancell?ed)\s*[:\-–]\s*/i);
    if(cm){s.cancelled=true;s.t=s.t.slice(cm[0].length);s.hay+=" cancelled canceled"}
    if(s.kind!=="inperson")s.hay+=" "+KIND[s.kind].label.toLowerCase();
  });
  SES=d.sessions;
  const tm=new Map();SES.forEach(s=>s.tg.forEach(t=>tm.set(t,(tm.get(t)||0)+1)));
  TAGLIST=[...tm].map(([v,c])=>({v,c})).sort((a,b)=>b.c-a.c||a.v.localeCompare(b.v));
  DAYS=[...new Set(SES.filter(s=>s.day).map(s=>s.day))].sort();
  const n=nowPT();
  if(!ui.day||(ui.day!=="od"&&!DAYS.includes(ui.day)))ui.day=DAYS.includes(n.day)?n.day:(DAYS.find(x=>SES.filter(s=>s.day===x).length>50)||DAYS[0]||"od");
  if(!ui.ppm)ui.ppm=10;
  tagsChanged();
  if(normFollow())store.prefsChanged();
  const upd=new Date(d.fetched);
  $("#evsub").textContent=`${SES.length} sessions, times in Pacific. Catalog updated ${isNaN(upd)?"recently":upd.toLocaleString("en-US",{timeZone:TZ,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" PT"}`;
  const ld=$("#loading");if(ld)ld.remove();
  $("#q").value=ui.q||"";
}
// Check for newer session data while the page is open (the GitHub version is refreshed every 30 minutes).
let lastDataCheck=Date.now(),pendingData=null;
function applyData(d){prep(d);render()}
async function refreshData(force){
  if(!DATA||(!force&&Date.now()-lastDataCheck<10*60000))return;
  lastDataCheck=Date.now();
  try{
    const r=await fetch("data.json?t="+Date.now(),{cache:"no-store"});if(!r.ok)return;
    const d=await r.json();
    if(!d||!Array.isArray(d.sessions)||d.fetched===DATA.fetched)return;
    if(openSheet||isInput(document.activeElement)){pendingData=d;return}
    applyData(d);
  }catch(e){}
}
window.__igRefresh=()=>refreshData(true);
setInterval(()=>refreshData(false),15*60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshData(false)});
store.init().then(()=>{if(DATA)softRender()});
initSample();
fetch("data.json").then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(d=>{
  prep(d);route();checkReminders(nowPT());
  if(ui.remSys&&sysSupported&&Notification.permission==="granted")ensureSW();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{lineCache.clear();softRender()});
}).catch(err=>{const ld=$("#loading");if(ld)ld.textContent="Couldn't load the session catalog ("+err.message+"). Reload the page to try again."});
})();
