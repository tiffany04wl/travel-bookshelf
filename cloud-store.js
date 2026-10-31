import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, waitForPendingWrites } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig={
  apiKey:'AIzaSyCrE1y1FOGeBXkGjnRpFVg3Qwbl29_4z-U',
  authDomain:'travel-bookshelf-98125.firebaseapp.com',
  projectId:'travel-bookshelf-98125',
  storageBucket:'travel-bookshelf-98125.firebasestorage.app',
  messagingSenderId:'963041260471',
  appId:'1:963041260471:web:4f712fb17f21d05e28ee32',
  measurementId:'G-VJ035K0SLD'
};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let db;
try {db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}
catch(e){console.warn('Firestore persistence unavailable',e); const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');db=m.getFirestore(app);}
const provider=new GoogleAuthProvider();
const bridge=()=>window.TravelAppBridge;
const clone=x=>JSON.parse(JSON.stringify(x));
const strip=t=>{const x=clone(t);delete x.cloudUpdatedAt;return x;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const storageKey=uid=>`travelBookshelfCloudBaselineV173:${uid}`;
const lastUidKey='travelBookshelfCloudLastUidV173';
let user=null,baseline={},initialized=false,syncing=false,dirty=false,applying=false,unsubscribe=null,timer=null,session=0;
let status='尚未登入 Google 帳號';
const col=()=>collection(db,'users',user.uid,'trips');
const getLocal=()=>bridge().getState().trips;
function readBaseline(uid){try{return JSON.parse(localStorage.getItem(storageKey(uid))||'null');}catch{return null;}}
function persistBaseline(){if(user)localStorage.setItem(storageKey(user.uid),JSON.stringify(baseline));}
function index(trips){return Object.fromEntries(trips.map(t=>[t.id,strip(t)]));}
function changes(){
 const local=index(getLocal());const upserts=[];const deletes=[];
 for(const [id,t] of Object.entries(local))if(!same(t,baseline[id]))upserts.push(t);
 for(const id of Object.keys(baseline))if(!local[id])deletes.push(id);
 return {local,upserts,deletes,hasChanges:upserts.length>0||deletes.length>0};
}
function setStatus(s){status=s;renderPanel();}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function errText(e){return e?.message||String(e);}
function renderPanel(){
 const el=document.getElementById('cloud-panel');if(!el)return;
 el.innerHTML=`<strong>☁️ 雲端同步</strong><p>${user?'已登入：'+esc(user.email||'Google 帳號'):'尚未登入 Google 帳號'}</p><p class="sync-state">${esc(status)}</p><button type="button" id="cloud-main">${user?'立即同步':'使用 Google 登入'}</button>${user?'<button type="button" class="secondary" id="cloud-logout">登出</button>':''}`;
 el.querySelector('#cloud-main').onclick=()=>user?flush():login();
 const logout=el.querySelector('#cloud-logout');if(logout)logout.onclick=()=>signOut(auth);
}
async function login(){try{await signInWithPopup(auth,provider);}catch(e){if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(e.code)){try{await signInWithRedirect(auth,provider);}catch(e2){setStatus('登入失敗：'+errText(e2));}}else if(e.code!=='auth/popup-closed-by-user')setStatus('登入失敗：'+errText(e));}}
function applyTrips(trips){applying=true;try{bridge().replaceState({trips});}finally{applying=false;}}
// Preserve locally changed trips and local deletions while adopting remote changes.
function mergeRemote(remote){
 const {local,upserts,deletes}=changes();
 const result=index(remote);
 for(const id of deletes)delete result[id];
 for(const t of upserts)result[t.id]=t;
 const merged=Object.values(result);
 if(!same(index(merged),local))applyTrips(merged);
 return {upserts,deletes};
}
function queueSave(){
 if(applying)return;
 // App data is persisted by app.js first. The baseline is persisted separately;
 // diffing against it survives reloads and does not depend on a JS timer.
 dirty=true;
 if(!user||!initialized)return;
 setStatus(navigator.onLine?'本機已儲存，等待同步…':'離線：本機已儲存，恢復網路後同步');
 clearTimeout(timer);timer=setTimeout(flush,1100);
}
async function flush(){
 if(!user||!initialized||syncing)return;
 clearTimeout(timer);timer=null;
 if(!navigator.onLine){setStatus('離線：本機已儲存，恢復網路後同步');return;}
 syncing=true;const currentSession=session;setStatus('正在同步…');
 try{
   // Read remote first, merge with unsynced local edits. Never delete remote trips
   // just because a different device has fewer local trips.
   const snap=await getDocs(col());
   if(currentSession!==session)return;
   const remote=snap.docs.map(d=>strip(d.data()));
   const {upserts,deletes}=mergeRemote(remote);
   // Baseline now represents the last server state, before local pending writes.
   baseline=index(remote);persistBaseline();
   for(const t of upserts){
     const bytes=new Blob([JSON.stringify(t)]).size;
     if(bytes>850000)throw new Error(`「${t.title}」超過安全容量，請匯出 JSON 備份`);
     await setDoc(doc(col(),t.id),{...t,cloudUpdatedAt:Date.now()});
     if(currentSession!==session)return;
     baseline[t.id]=strip(t);persistBaseline();
   }
   for(const id of deletes){await deleteDoc(doc(col(),id));if(currentSession!==session)return;delete baseline[id];persistBaseline();}
   await waitForPendingWrites(db);
   if(currentSession!==session)return;
   dirty=changes().hasChanges;
   setStatus(dirty?'仍有本機修改待同步':'已同步到雲端 ✓');
 }catch(e){dirty=true;setStatus('同步未完成（本機資料已保留）：'+errText(e));}
 finally{syncing=false;if(dirty&&navigator.onLine&&currentSession===session){clearTimeout(timer);timer=setTimeout(flush,8000);}}
}
async function startSession(u){
 session++;const thisSession=session;
 if(unsubscribe){unsubscribe();unsubscribe=null;}
 clearTimeout(timer);initialized=false;user=u;syncing=false;
 if(!u){setStatus('已登出：本機資料仍保留');return;}
 const previous=readBaseline(u.uid);
 if(previous!==null){
   // Returning user: never show a destructive replace prompt. Work from the
   // durable baseline and reconcile unsynced local changes after reconnect.
   baseline=previous;initialized=true;
   localStorage.setItem(lastUidKey,u.uid);
   dirty=changes().hasChanges;
   setStatus(navigator.onLine?'已登入，正在合併本機與雲端資料…':'離線：可繼續記帳，連線後自動同步');
   if(navigator.onLine)await flush();
 }else{
   if(!navigator.onLine){setStatus('首次登入需要網路，請連線後重新開啟');return;}
   setStatus('首次登入：正在檢查雲端旅程…');
   try{
     const snap=await getDocs(col());if(thisSession!==session)return;
     const remote=snap.docs.map(d=>strip(d.data()));
     const local=getLocal();
     if(remote.length){
       // Safe migration from V1.7.2: keep all unique trip IDs from both sides.
       // Never replace an offline-created trip on the first upgraded launch.
       if(!window.confirm(`這是新版同步首次啟用。雲端有 ${remote.length} 趟，本機有 ${local.length} 趟。\n\n按「確定」：保留兩邊所有不同 ID 的旅程並合併（建議先完成 JSON 備份）。\n按「取消」：暫停同步，不修改任何資料。`)){setStatus('同步已暫停：本機資料保留');return;}
       baseline=index(remote);persistBaseline();initialized=true;
       const combined=index(remote);
       for(const t of local)if(!combined[t.id])combined[t.id]=t;
       applyTrips(Object.values(combined));
       dirty=changes().hasChanges;
       if(dirty)await flush();else setStatus('已合併雲端資料 ✓');
     }else{
       if(!window.confirm(`雲端尚無旅程，是否上傳本機 ${local.length} 趟旅程？\n\n示範旅程也會上傳。`)){setStatus('同步已暫停：尚未上傳');return;}
       baseline={};persistBaseline();initialized=true;dirty=true;await flush();
     }
     localStorage.setItem(lastUidKey,u.uid);
   }catch(e){setStatus('無法讀取雲端：'+errText(e));return;}
 }
 if(thisSession!==session||!initialized)return;
 unsubscribe=onSnapshot(col(),snap=>{
   if(thisSession!==session||!initialized||syncing||snap.metadata.hasPendingWrites||snap.metadata.fromCache)return;
   const remote=snap.docs.map(d=>strip(d.data()));
   const pending=changes();
   mergeRemote(remote);
   baseline=index(remote);persistBaseline();
   dirty=changes().hasChanges;
   if(dirty){setStatus('已保留本機未同步修改，正在同步…');if(navigator.onLine){clearTimeout(timer);timer=setTimeout(flush,900);}}
   else setStatus('已更新雲端資料 ✓');
 },e=>setStatus('雲端監聽異常：'+errText(e)));
}
window.addEventListener('online',()=>{if(user&&initialized)flush();});
window.TravelCloud={renderPanel,queueSave};
renderPanel();
getRedirectResult(auth).catch(e=>setStatus('登入失敗：'+errText(e)));
onAuthStateChanged(auth,startSession,e=>setStatus('登入狀態錯誤：'+errText(e)));
