/* Adaptor: înlocuiește platforma Claude (window.claude.use) cu Firebase (Firestore + Auth) și /api/ask. */
(function(){
  const cfg = window.FIREBASE_CONFIG;
  if(!cfg || !cfg.apiKey || cfg.apiKey.startsWith("COMPLETEAZA")){ document.addEventListener("DOMContentLoaded",()=>{ document.body.insertAdjacentHTML("afterbegin",'<div style="background:#c2361f;color:#fff;padding:14px;font:16px system-ui">Lipsește configurarea Firebase – completează fișierul firebase-config.js (vezi README).</div>'); }); }
  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  try{ fs.settings({ignoreUndefinedProperties:true, merge:true}); }catch(e){}
  try{ fs.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}

  /* Firestore nu acceptă liste în liste (ex. punctele de temperatură) -> le codăm ca text */
  const isNested = a => Array.isArray(a) && a.some(x=>Array.isArray(x));
  function enc(v){ if(Array.isArray(v)){ if(isNested(v)) return {__na:JSON.stringify(v)}; return v.map(enc); }
    if(v && typeof v==="object"){ const o={}; for(const k in v){ if(v[k]!==undefined) o[k]=enc(v[k]); } return o; } return v; }
  function dec(v){ if(Array.isArray(v)) return v.map(dec);
    if(v && typeof v==="object"){ if(typeof v.__na==="string" && Object.keys(v).length===1){ try{ return JSON.parse(v.__na); }catch(e){ return []; } } const o={}; for(const k in v) o[k]=dec(v[k]); return o; } return v; }
  const DS = s => ({id:s.id, exists:s.exists, data:()=>s.exists?dec(s.data()):undefined});
  const QS = s => ({docs:s.docs.map(DS), empty:s.empty, size:s.size});
  const Q = q => ({ where:(...a)=>Q(q.where(...a)), orderBy:(...a)=>Q(q.orderBy(...a)), limit:n=>Q(q.limit(n)),
    get:()=>q.get().then(QS), onSnapshot:(cb,err)=>q.onSnapshot(s=>cb(QS(s)),err) });
  const D = d => ({ id:d.id, set:(v,o)=>d.set(enc(v),o||{}), update:v=>d.update(enc(v)), delete:()=>d.delete(),
    get:()=>d.get().then(DS), onSnapshot:(cb,err)=>d.onSnapshot(s=>cb(DS(s)),err) });
  const C = c => Object.assign(Q(c), {doc:id=>D(id?c.doc(id):c.doc())});
  const db = Object.freeze({ collection:p=>C(fs.collection(p)), doc:p=>D(fs.doc(p)) });

  /* Întreabă Claude -> funcția /api/ask de pe Vercel (cheia Anthropic stă pe server) */
  const b64=b=>new Promise(r=>{ const f=new FileReader(); f.onload=()=>r(String(f.result).split(",")[1]); f.readAsDataURL(b); });
  async function sample(input, opt){ opt=opt||{}; if(typeof input==="string") input=[{role:"user",content:input}];
    const images=opt.images?await Promise.all(opt.images.map(async b=>({media_type:b.type||"image/jpeg",data:await b64(b)}))):[];
    const u=auth.currentUser; const tok=u?await u.getIdToken():"";
    let r; try{ r=await fetch((window.API_BASE||"")+"/api/ask",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok},body:JSON.stringify({messages:input,images}),signal:opt.signal}); }
    catch(e){ const er=new Error("cancelled"); er.code=e.name==="AbortError"?"cancelled":"network"; throw er; }
    if(!r.ok){ const er=new Error("ask"); er.code=r.status===401?"not_granted":r.status===429?"rate_limited":r.status===501?"sampling_disabled":"server"; throw er; }
    const rd=r.body.getReader(), td=new TextDecoder(); let text="";
    try{ for(;;){ const {done,value}=await rd.read(); if(done) break; text+=td.decode(value,{stream:true}); opt.onText&&opt.onText({text}); } }
    catch(e){ const er=new Error("cancelled"); er.code="cancelled"; er.text=text; throw er; }
    const truncated=text.endsWith("[[TRUNCHIAT]]"); if(truncated) text=text.replace("[[TRUNCHIAT]]","");
    return {text,truncated}; }

  sample.limits=async()=>({images:true});
  /* Aplicația nativă (Capacitor): scanner nativ, buton Înapoi Android, bara de stare */
  const CAP=window.Capacitor, NATIVE=!!(CAP&&CAP.isNativePlatform&&CAP.isNativePlatform());
  window.__NATIVE=NATIVE;
  if(NATIVE){ const P=CAP.Plugins||{};
    if(P.BarcodeScanner) window.__nativeScan=async()=>{ try{ if(CAP.getPlatform()==="ios"){ const pr=await P.BarcodeScanner.requestPermissions(); if(pr.camera!=="granted"&&pr.camera!=="limited") throw new Error("perm"); }
        const r=await P.BarcodeScanner.scan(); return r&&r.barcodes&&r.barcodes[0]?(r.barcodes[0].rawValue||r.barcodes[0].displayValue):null; }catch(e){ if(String(e&&e.message).includes("canceled")) return null; throw e; } };
    if(P.App) P.App.addListener("backButton",()=>{ const sh=document.getElementById("mSheet"); if(sh&&!sh.hidden){ sh.hidden=true; return; }
      const m=document.querySelector(".modal.open"); if(m){ m.classList.remove("open"); return; }
      const cr=document.querySelector("#fabCrumb:not([hidden]) [data-fh=hub]"); if(cr){ cr.click(); return; }
      const on=document.querySelector("nav button.on"), first=[...document.querySelectorAll("nav button[data-tab]")].find(b=>!b.hidden&&!b.classList.contains("nav-hid"));
      if(on&&first&&on!==first){ first.click(); return; } P.App.minimizeApp&&P.App.minimizeApp(); });
    try{ P.StatusBar&&P.StatusBar.setBackgroundColor&&P.StatusBar.setBackgroundColor({color:"#0d0b0c"}); P.StatusBar&&P.StatusBar.setStyle&&P.StatusBar.setStyle({style:"DARK"}); }catch(e){}
    document.documentElement.classList.add("native");
  }
  window.claude = { use: async name => name==="db" ? db : name==="sample" ? sample : null };

  /* Login */
  const CSS=`#lg{position:fixed;inset:0;z-index:9999;background:linear-gradient(120deg,#0d0b0c,#4a0820 60%,#700c30);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
  #lg form{background:#fff;border-radius:22px;padding:28px;width:min(92vw,380px);box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
  #lg img{height:74px;align-self:center}#lg h1{margin:0;text-align:center;font-size:20px;color:#4a0820}
  #lg input{min-height:52px;font-size:17px;border:2px solid #e8dfe0;border-radius:12px;padding:0 14px}
  #lg button{min-height:54px;font-size:17px;font-weight:700;border:0;border-radius:12px;background:#700c30;color:#fff;cursor:pointer}
  #lg .e{color:#c2361f;font-size:14px;min-height:18px;text-align:center}
  #lg .ops{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:46vh;overflow:auto}#lg .ops button{background:#f6e6ec;color:#4a0820;min-height:56px}#lg .ops button.on{background:#700c30;color:#fff}`;
  function showLogin(){ if(document.getElementById("lg")) return;
    document.head.insertAdjacentHTML("beforeend",`<style>${CSS}</style>`);
    document.body.insertAdjacentHTML("beforeend",`<div id="lg"><form><img src="img/logo.png" alt=""><h1>Director tehnic</h1><input type="email" id="lgE" placeholder="Email" autocomplete="username" required><input type="password" id="lgP" placeholder="Parolă" autocomplete="current-password" required><button>Intră</button><div class="e" id="lgX"></div></form></div>`);
    document.querySelector("#lg form").onsubmit=async e=>{ e.preventDefault(); document.getElementById("lgX").textContent="";
      try{ await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); await auth.signInWithEmailAndPassword(document.getElementById("lgE").value.trim(),document.getElementById("lgP").value); }
      catch(err){ document.getElementById("lgX").textContent="Email sau parolă greșite."; } }; }
  /* Roluri: users/{uid} = {name,email,role,active}; tabletă stație -> operator cu PIN */
  window.__VERCEL=true;
  const ADMIN=(window.ADMIN_EMAIL||"").toLowerCase();
  window.__fbAdmin={
    createUser: async (email,pass)=>{ const sec=firebase.apps.find(a=>a.name==="sec")||firebase.initializeApp(cfg,"sec"); const c=await sec.auth().createUserWithEmailAndPassword(email,pass); const uid=c.user.uid; await sec.auth().signOut(); return uid; },
    resetPass: email=>auth.sendPasswordResetEmail(email) };
  const H=s=>`<div id="lg"><form onsubmit="return false"><img src="img/logo.png" alt="">${s}</form></div>`;
  function screen(html){ document.head.insertAdjacentHTML("beforeend",`<style>${CSS}</style>`); const o=document.getElementById("lg"); if(o) o.remove(); document.body.insertAdjacentHTML("beforeend",H(html)); }
  async function sha(id,pin){ const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id+":"+pin)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
  function pinScreen(u,prof){ fs.collection("operators").get().then(s=>{ const ops=s.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    screen(`<h1>${prof.name||"Tabletă stație"}</h1><div style="text-align:center;color:#6e6266">Cine lucrează acum?</div>
      <div class="ops">${ops.map(o=>`<button type="button" data-o="${o.id}">${o.name}</button>`).join("")||"<div class='e'>Niciun operator definit – cere administratorului.</div>"}</div>
      <input id="lgPin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" hidden><button id="lgGo" hidden>Intră</button><div class="e" id="lgX"></div><a href="#" id="lgOut" style="text-align:center;color:#6e6266;font-size:14px">Deconectează tableta</a>`);
    let sel=null; document.querySelectorAll("#lg [data-o]").forEach(b=>b.onclick=()=>{ sel=ops.find(o=>o.id===b.dataset.o); document.querySelectorAll("#lg [data-o]").forEach(x=>x.classList.toggle("on",x===b)); const p=document.getElementById("lgPin"); p.hidden=false; document.getElementById("lgGo").hidden=false; p.value=""; p.focus(); });
    const go=async()=>{ if(!sel) return; const h=await sha(sel.id,document.getElementById("lgPin").value); if(h!==sel.pin){ document.getElementById("lgX").textContent="PIN greșit."; return; }
      document.getElementById("lg").remove(); launch({uid:u.uid,role:sel.role,name:sel.name,station:true,stationName:prof.name}); };
    document.getElementById("lgGo").onclick=go; document.getElementById("lgPin").onkeydown=e=>{ if(e.key==="Enter") go(); };
    document.getElementById("lgOut").onclick=e=>{ e.preventDefault(); auth.signOut().then(()=>location.reload()); };
  }).catch(()=>screen(`<h1>Eroare</h1><div class="e">Nu pot citi lista de operatori.</div>`)); }
  let started=false;
  function launch(role){ if(started) return; started=true; window.__ROLE=role; window.__authed=true; const go=()=>{ if(window.__startApp) window.__startApp(); else setTimeout(go,50); }; go();
    const im=document.getElementById("imBtn"), out=document.getElementById("outBtn");
    if(im) im.hidden=role.role!=="admin"; const bk=document.getElementById("bkBtn"); if(bk) bk.hidden=!["admin","mgmt"].includes(role.role);
    if(out){ out.hidden=false; out.textContent=role.station?"Schimbă operatorul":"Ieșire"; out.onclick=()=>role.station?location.reload():auth.signOut().then(()=>location.reload()); }
    if(role.station){ let t; const reset=()=>{ clearTimeout(t); t=setTimeout(()=>location.reload(),15*60*1000); }; ["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,reset,true)); reset(); } }
  async function onUser(u){ const ref=fs.collection("users").doc(u.uid); let snap; try{ snap=await ref.get(); }catch(e){ snap=null; }
    let prof=snap&&snap.exists?snap.data():null;
    if(!prof&&ADMIN&&(u.email||"").toLowerCase()===ADMIN){ prof={name:"Director tehnic",email:u.email,role:"admin",active:true,created:Date.now()}; try{ await ref.set(prof); }catch(e){} }
    if(!prof||prof.active===false){ screen(`<h1>Cont fără acces</h1><div style="text-align:center">Contul <b>${u.email}</b> nu are un rol activ. Cere administratorului să îți dea acces.</div><button id="lgO">Ieșire</button>`); document.getElementById("lgO").onclick=()=>auth.signOut().then(()=>location.reload()); return; }
    if(prof.role==="statie"){ pinScreen(u,prof); return; }
    launch({uid:u.uid,role:prof.role,name:prof.name||u.email,email:u.email}); }
  auth.onAuthStateChanged(u=>{ const ready=()=>{ if(u){ const l=document.getElementById("lg"); if(l) l.remove(); onUser(u); } else showLogin(); };
    if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",ready); else ready(); });
})();
