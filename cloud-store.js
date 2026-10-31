import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, waitForPendingWrites } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCrE1y1FOGeBXkGjnRpFVg3Qwbl29_4z-U',
  authDomain: 'travel-bookshelf-98125.firebaseapp.com',
  projectId: 'travel-bookshelf-98125',
  storageBucket: 'travel-bookshelf-98125.firebasestorage.app',
  messagingSenderId: '963041260471',
  appId: '1:963041260471:web:4f712fb17f21d05e28ee32',
  measurementId: 'G-VJ035K0SLD'
};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let db;
try { db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}); }
catch(err){ console.warn('離線快取不可用',err); const mod=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'); db=mod.getFirestore(app); }
const provider=new GoogleAuthProvider();
let user=null, status='尚未登入：目前僅儲存在這台裝置', initialized=false, syncing=false, dirty=false, timer=null, unsubscribe=null, applying=false, activeUid=null;
const bridge=()=>window.TravelAppBridge;
const col=()=>collection(db,'users',user.uid,'trips');
function show(){ window.TravelCloud?.renderPanel(); }
function setStatus(s){status=s;show();}
function errorText(e){ return e?.code==='auth/unauthorized-domain'?'請先到 Firebase Authentication 加入 GitHub Pages 授權網域':(e?.message||String(e)); }
function renderPanel(){
  const el=document.getElementById('cloud-panel'); if(!el)return;
  el.innerHTML=`<strong>☁️ 雲端同步</strong><p>${user?`已登入：${escapeHtml(user.email||'Google 帳號')}`:'尚未登入 Google 帳號'}</p><p class="sync-state">${escapeHtml(status)}</p><button type="button" id="cloud-main">${user?'立即同步':'使用 Google 登入'}</button>${user?'<button type="button" class="secondary" id="cloud-logout">登出</button>':''}`;
  el.querySelector('#cloud-main').onclick=()=>user?flush():login();
  const logout=el.querySelector('#cloud-logout');if(logout)logout.onclick=()=>signOut(auth);
}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function login(){
  try {await signInWithPopup(auth,provider);}
  catch(e){
    if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment') {
      try{await signInWithRedirect(auth,provider);}catch(e2){setStatus('登入失敗：'+errorText(e2));}
    } else if(e.code!=='auth/popup-closed-by-user'){setStatus('登入失敗：'+errorText(e));}
  }
}
function queueSave(){
  if(applying || !user || !initialized)return;
  dirty=true;
  setStatus('本機已儲存，等待同步…');
  clearTimeout(timer);timer=setTimeout(flush,900);
}
async function flush(){
  if(!user||!initialized||syncing)return;
  clearTimeout(timer); timer=null;
  if(!navigator.onLine){setStatus('離線：本機已儲存，連線恢復後同步');return;}
  syncing=true; dirty=false;
  const uid=user.uid;
  setStatus('正在同步…');
  try {
    const local=bridge().getState().trips;
    // Each trip is an independent document. The entire trip is preserved, including expenses.
    // Firestore has a 1 MiB document limit; large trips must be split into subcollections in a later release.
    const refs=await getDocs(col());
    if(uid!==user?.uid)return;
    const ids=new Set(local.map(t=>t.id));
    for(const t of local){
      const bytes=new Blob([JSON.stringify(t)]).size;
      if(bytes>850000)throw new Error(`「${t.title}」資料接近 Firestore 單筆上限，請先匯出 JSON 備份，暫停雲端同步`);
      await setDoc(doc(col(),t.id),{...t,cloudUpdatedAt:Date.now()});
    }
    for(const d of refs.docs){if(!ids.has(d.id))await deleteDoc(d.ref);}
    await waitForPendingWrites(db);
    setStatus('已同步到雲端 ✓');
  }catch(e){dirty=true;setStatus('同步未完成：'+errorText(e));}
  finally{syncing=false;if(dirty&&navigator.onLine){clearTimeout(timer);timer=setTimeout(flush,2500);}}
}
async function startSession(u){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  initialized=false;dirty=false;clearTimeout(timer);user=u;activeUid=u?.uid||null;
  if(!u){setStatus('已登出：資料仍保留在這台裝置');return;}
  setStatus('登入成功，正在檢查雲端資料…');
  try{
    const snapshot=await getDocs(col());
    if(activeUid!==u.uid)return;
    const cloud=snapshot.docs.map(d=>{const t=d.data();delete t.cloudUpdatedAt;return t;});
    const local=bridge().getState().trips;
    if(cloud.length===0){
      if(window.confirm(`這個 Google 帳號尚無雲端旅程。要將這台裝置的 ${local.length} 趟旅程上傳嗎？\n\n注意：示範旅程也會一起上傳。`)){
        initialized=true;dirty=true;await flush();
      }else{initialized=false;setStatus('尚未上傳：同步已暫停，請重新登入後選擇');return;}
    }else{
      const replace=window.confirm(`雲端已有 ${cloud.length} 趟旅程，本機有 ${local.length} 趟。\n\n按「確定」：使用雲端資料取代本機（建議新裝置）。\n按「取消」：保留本機資料，暫不啟用自動同步。\n\n請先使用 JSON 備份重要資料。`);
      if(replace){applying=true;bridge().replaceState({trips:cloud});applying=false;initialized=true;setStatus('已載入雲端資料 ✓');}
      else {initialized=false;setStatus('已暫停同步：本機與雲端資料不同，請先備份並重新登入選擇');return;}
    }
    // Live updates: reload only if there are no pending local changes.
    unsubscribe=onSnapshot(col(),snap=>{
      if(activeUid!==u.uid || !initialized || syncing || dirty || snap.metadata.hasPendingWrites)return;
      const incoming=snap.docs.map(d=>{const t=d.data();delete t.cloudUpdatedAt;return t;});
      const current=bridge().getState().trips;
      if(JSON.stringify(incoming.slice().sort((a,b)=>a.id.localeCompare(b.id)))===JSON.stringify(current.slice().sort((a,b)=>a.id.localeCompare(b.id))))return;
      applying=true;try{bridge().replaceState({trips:incoming});setStatus('已更新其他裝置的資料 ✓');}finally{applying=false;}
    },e=>setStatus('監聽雲端失敗：'+errorText(e)));
  }catch(e){setStatus('無法讀取雲端：'+errorText(e));}
}
window.addEventListener('online',()=>{if(dirty)flush();});
window.addEventListener('beforeunload',()=>{if(dirty)console.warn('雲端同步尚未完成');});
window.TravelCloud={renderPanel,queueSave};
show();
getRedirectResult(auth).catch(e=>setStatus('登入失敗：'+errorText(e)));
onAuthStateChanged(auth,startSession,e=>setStatus('登入狀態錯誤：'+errorText(e)));
