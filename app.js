
(() => {
  "use strict";

  const APP_KEY = "travelBookshelfV1";
  const BACKUP_DATE_KEY = "travelBookshelfLastBackupAt";
  const BACKUP_VERSION = 1;
  const categories = [
    { id:"food", name:"伙食", icon:"🍜" },
    { id:"stay", name:"住宿", icon:"🏨" },
    { id:"ticket", name:"門票", icon:"🎫" },
    { id:"medical", name:"醫療", icon:"🏥" },
    { id:"gift", name:"伴手禮", icon:"🛍️" },
    { id:"transport", name:"交通", icon:"🚆" },
    { id:"souvenir", name:"紀念品", icon:"🎁" },
    { id:"other", name:"其他", icon:"📦" }
  ];
  const currencyMap = {
    JPY:{name:"日圓", symbol:"¥", decimals:0},
    KRW:{name:"韓元", symbol:"₩", decimals:0},
    TWD:{name:"台幣", symbol:"NT$", decimals:0},
    CNY:{name:"人民幣", symbol:"¥", decimals:2},
    EUR:{name:"歐元", symbol:"€", decimals:2},
    USD:{name:"美金", symbol:"US$", decimals:2}
  };

  const chartColors = ["#c9817e","#7f9b83","#778eae","#d2a15f","#9b86a8","#74a09c","#b7795d","#7f7b78","#d0a0ad","#a7ad72"];
  const categoryIconMap = {
    food:"utensils",
    stay:"bed-double",
    ticket:"ticket",
    medical:"briefcase-medical",
    gift:"shopping-bag",
    transport:"train-front",
    souvenir:"gift",
    other:"package"
  };

  function icon(name, size=18, extra="") {
    return `<i data-lucide="${name}" width="${size}" height="${size}" class="${extra}" aria-hidden="true"></i>`;
  }
  function categoryIcon(category) {
    return icon(categoryIconMap[category.id] || "tag", 19);
  }

  let state = loadState();
  let ui = {
    view:"shelf",
    tripId:null,
    tripTab:"home",
    statsTab:"category",
    displayCurrency:"TWD",
    modal:null,
    editingExpenseId:null,
    editingTripId:null
  };
  let chart = null;

  function seedState() {
    const tripId = crypto.randomUUID();
    const members = [
      {id:crypto.randomUUID(), name:"Tiffany"},
      {id:crypto.randomUUID(), name:"Amy"},
      {id:crypto.randomUUID(), name:"Kevin"}
    ];
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()-2);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()+3);
    const date = d => d.toISOString().slice(0,10);
    const expenses = [
      {id:crypto.randomUUID(), date:date(start), category:"stay", title:"飯店住宿", amount:24000, currency:"JPY", payerId:members[0].id, paymentMethod:"信用卡", split:true, splitMemberIds:members.map(m=>m.id), note:"三晚住宿", createdAt:Date.now()-5000},
      {id:crypto.randomUUID(), date:date(new Date(start.getTime()+86400000)), category:"food", title:"一蘭拉麵", amount:2980, currency:"JPY", payerId:members[1].id, paymentMethod:"現金", split:true, splitMemberIds:members.map(m=>m.id), note:"排隊約 30 分鐘", createdAt:Date.now()-4000},
      {id:crypto.randomUUID(), date:date(new Date(start.getTime()+86400000)), category:"transport", title:"JR 車資", amount:1680, currency:"JPY", payerId:members[0].id, paymentMethod:"信用卡", split:false, splitMemberIds:[], note:"", createdAt:Date.now()-3000},
      {id:crypto.randomUUID(), date:date(today), category:"gift", title:"伴手禮", amount:5200, currency:"JPY", payerId:members[2].id, paymentMethod:"信用卡", split:false, splitMemberIds:[], note:"", createdAt:Date.now()-2000}
    ];
    return {
      trips:[{
        id:tripId,
        title:"京都慢旅",
        startDate:date(start),
        endDate:date(end),
        currency:"JPY",
        rate:0.22,
        initialAmount:50000,
        tagline:"楓葉正紅，慢慢走。",
        cover:"",
        members,
        customCategories:[],
        expenses,
        createdAt:Date.now()
      }]
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(APP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.trips = (parsed.trips || []).map(t => ({
          ...t,
          initialAmount: Number(t.initialAmount || 0),
          tagline: t.tagline || "",
          customCategories: t.customCategories || [],
          expenses: t.expenses || [],
          members: t.members || []
        }));
        return parsed;
      }
    } catch (e) {}
    const seeded = seedState();
    localStorage.setItem(APP_KEY, JSON.stringify(seeded));
    return seeded;
  }
  function saveState() {
    localStorage.setItem(APP_KEY, JSON.stringify(state));
    window.TravelCloud?.queueSave();
  }
  window.TravelAppBridge = {
    getState: () => JSON.parse(JSON.stringify(state)),
    replaceState: (incoming) => {
      if (!incoming || !Array.isArray(incoming.trips)) throw new Error("雲端資料格式錯誤");
      state = {trips:incoming.trips};
      localStorage.setItem(APP_KEY, JSON.stringify(state));
      ui = {...ui, view:"shelf", tripId:null, tripTab:"home", modal:null};
      render();
    }
  };
  function currentTrip() { return state.trips.find(t => t.id === ui.tripId); }
  function allCategories(trip) { return [...categories, ...(trip?.customCategories || [])]; }
  function catOf(trip, id) { return allCategories(trip).find(c=>c.id===id) || categories.at(-1); }
  function memberOf(trip, id) { return trip.members.find(m=>m.id===id); }
  function esc(s="") { return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
  function fmtDate(d) { return d ? new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric"}).format(new Date(d+"T00:00:00")) : ""; }
  function fmtFullDate(d) { return d ? new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(d+"T00:00:00")) : ""; }
  function daysBetween(a,b) { if(!a||!b) return 0; return Math.floor((new Date(b)-new Date(a))/86400000)+1; }
  function convertToTWD(trip, exp) {
    if (exp.currency === "TWD") return Number(exp.amount)||0;
    if (exp.currency === trip.currency) return (Number(exp.amount)||0) * Number(trip.rate||0);
    return (Number(exp.amount)||0) * Number(trip.rate||0);
  }
  function formatMoney(amount, currency) {
    const cfg = currencyMap[currency] || currencyMap.TWD;
    return `${cfg.symbol}${Number(amount||0).toLocaleString("zh-TW",{minimumFractionDigits:cfg.decimals, maximumFractionDigits:cfg.decimals})}`;
  }
  function dualMoney(trip, exp) {
    return { original:formatMoney(exp.amount, exp.currency), twd:formatMoney(Math.round(convertToTWD(trip,exp)), "TWD") };
  }
  function tripTotalTWD(trip) { return trip.expenses.reduce((s,e)=>s+convertToTWD(trip,e),0); }
  function tripTotalOriginal(trip) {
    return trip.expenses.filter(e=>e.currency===trip.currency).reduce((s,e)=>s+Number(e.amount||0),0);
  }
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg; el.classList.add("show");
    setTimeout(()=>el.classList.remove("show"),1800);
  }

  function safeFileName(value) {
    return String(value || "旅行書櫃").replace(/[\\/:*?"<>|]/g, "_").trim() || "旅行書櫃";
  }

  function localDateStamp(date=new Date()) {
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,"0");
    const d=String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  function lastBackupAt() {
    const raw=localStorage.getItem(BACKUP_DATE_KEY);
    const parsed=raw?new Date(raw):null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  function backupStatus() {
    const last=lastBackupAt();
    if(!last) return {label:"尚未備份", overdue:true, days:null};
    const days=Math.floor((Date.now()-last.getTime())/86400000);
    return {
      label:new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(last),
      overdue:days>=30,
      days
    };
  }

  function downloadBlob(content, type, filename) {
    const blob=content instanceof Blob?content:new Blob([content],{type});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportFullBackup() {
    const payload={
      app:"旅行書櫃",
      backupVersion:BACKUP_VERSION,
      exportedAt:new Date().toISOString(),
      data:state
    };
    const filename=`旅行書櫃完整備份_${localDateStamp()}.json`;
    downloadBlob(JSON.stringify(payload,null,2),"application/json;charset=utf-8",filename);
    localStorage.setItem(BACKUP_DATE_KEY,new Date().toISOString());
    render();
    toast("完整備份已下載");
  }

  function validateBackupPayload(payload) {
    if(!payload || typeof payload!=="object") throw new Error("備份格式錯誤");
    const data=payload.data || payload;
    if(!data || !Array.isArray(data.trips)) throw new Error("找不到旅程資料");
    data.trips.forEach(trip=>{
      if(!trip || typeof trip!=="object" || !Array.isArray(trip.members) || !Array.isArray(trip.expenses)) {
        throw new Error("備份中的旅程資料不完整");
      }
    });
    return data;
  }

  async function importFullBackup(file) {
    if(!file) return;
    try {
      const text=await file.text();
      const incoming=validateBackupPayload(JSON.parse(text));
      const tripCount=incoming.trips.length;
      const expenseCount=incoming.trips.reduce((sum,t)=>sum+(t.expenses?.length||0),0);
      const ok=window.confirm(`將以備份內容取代目前資料。\\n\\n備份內含 ${tripCount} 趟旅程、${expenseCount} 筆支出。\\n\\n確定繼續？`);
      if(!ok) return;
      state={
        ...incoming,
        trips:incoming.trips.map(t=>({
          ...t,
          initialAmount:Number(t.initialAmount||0),
          tagline:t.tagline||"",
          customCategories:t.customCategories||[],
          members:t.members||[],
          expenses:t.expenses||[]
        }))
      };
      saveState();
      ui={...ui,view:"shelf",tripId:null,tripTab:"home",modal:null,editingExpenseId:null,editingTripId:null};
      render();
      toast("備份已完整還原");
    } catch(err) {
      window.alert(`無法匯入備份：${err.message||"檔案格式不正確"}`);
    } finally {
      const input=document.getElementById("backupFileInput");
      if(input) input.value="";
    }
  }

  function tripAnalytics(trip) {
    const totalTWD=tripTotalTWD(trip);
    const totalOriginal=tripTotalOriginal(trip);
    const tripDays=Math.max(1,daysBetween(trip.startDate,trip.endDate));
    const daily={};
    const category={};
    const paid=Object.fromEntries(trip.members.map(m=>[m.id,0]));
    trip.expenses.forEach(e=>{
      const twd=convertToTWD(trip,e);
      daily[e.date]=(daily[e.date]||0)+twd;
      category[e.category]=(category[e.category]||0)+twd;
      paid[e.payerId]=(paid[e.payerId]||0)+twd;
    });
    const dayRows=Object.entries(daily).sort((a,b)=>a[0].localeCompare(b[0]));
    const highest=dayRows.length?[...dayRows].sort((a,b)=>b[1]-a[1])[0]:null;
    const lowest=dayRows.length?[...dayRows].sort((a,b)=>a[1]-b[1])[0]:null;
    const categoryRows=Object.entries(category)
      .map(([id,value])=>({id,name:catOf(trip,id).name,value}))
      .sort((a,b)=>b.value-a.value);
    const burdenTWD=(()=>{
      const previous=ui.displayCurrency;
      ui.displayCurrency="TWD";
      const result=calcBurden(trip);
      ui.displayCurrency=previous;
      return result;
    })();
    const settlementTWD=(()=>{
      const previous=ui.displayCurrency;
      ui.displayCurrency="TWD";
      const result=settlements(trip);
      ui.displayCurrency=previous;
      return result;
    })();
    return {totalTWD,totalOriginal,tripDays,daily:dayRows,highest,lowest,categoryRows,paid,burdenTWD,settlementTWD};
  }

  function htmlDocEscape(value="") {
    return esc(value);
  }

  function buildTripArchiveHTML(trip,{printMode=false}={}) {
    const previousCurrency=ui.displayCurrency;

    const statsFor=(currency)=>{
      ui.displayCurrency=currency;
      const categoryMap={}, dailyMap={};
      trip.expenses.forEach(e=>{
        const value=valueInDisplay(trip,e);
        categoryMap[e.category]=(categoryMap[e.category]||0)+value;
        dailyMap[e.date]=(dailyMap[e.date]||0)+value;
      });
      const categoryRows=Object.entries(categoryMap)
        .map(([id,value])=>({id,name:catOf(trip,id).name,value}))
        .sort((a,b)=>b.value-a.value);
      const dailyRows=Object.entries(dailyMap)
        .map(([date,value])=>({date,value}))
        .sort((a,b)=>a.date.localeCompare(b.date));
      const paidRows=trip.members
        .map(m=>({id:m.id,name:m.name,value:trip.expenses.filter(e=>e.payerId===m.id).reduce((s,e)=>s+valueInDisplay(trip,e),0)}))
        .sort((a,b)=>b.value-a.value);
      const burden=calcBurden(trip);
      const burdenRows=trip.members
        .map(m=>({id:m.id,name:m.name,value:burden[m.id]||0}))
        .sort((a,b)=>b.value-a.value);
      const splitRows=settlements(trip);
      return {categoryRows,dailyRows,paidRows,burdenRows,splitRows};
    };

    const originalStats=statsFor(trip.currency);
    const twdStats=statsFor("TWD");
    ui.displayCurrency=previousCurrency;

    const a=tripAnalytics(trip);
    const expenses=[...trip.expenses].sort((x,y)=>x.date.localeCompare(y.date)||x.createdAt-y.createdAt);
    const grouped=expenses.reduce((acc,e)=>{(acc[e.date]||=[]).push(e);return acc;},{});
    const title=htmlDocEscape(trip.title);
    const members=trip.members.map(m=>htmlDocEscape(m.name)).join("、");
    const generated=new Intl.DateTimeFormat("zh-TW",{dateStyle:"long",timeStyle:"short"}).format(new Date());

    const formatArchiveMoney=(value,currency)=>formatMoney(Math.round(value),currency);

    const buildConic=(rows)=>{
      if(!rows.length) return "#eadedb 0deg 360deg";
      const total=rows.reduce((s,r)=>s+r.value,0)||1;
      let pos=0;
      return rows.map((r,index)=>{
        const start=pos;
        pos += (r.value/total)*360;
        return `${chartColors[index%chartColors.length]} ${start}deg ${pos}deg`;
      }).join(",");
    };

    const buildCategoryPanel=(rows,currency)=>{
      const total=rows.reduce((s,r)=>s+r.value,0);
      return `<div class="stats-currency-panel" data-currency-panel="${currency}">
        <div class="chart-layout">
          <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${buildConic(rows)})"></div></div>
          <div>${rows.map((r,index)=>`<div class="legend-row"><span class="legend-dot" style="background:${chartColors[index%chartColors.length]}"></span><span>${htmlDocEscape(r.name)}<small>${total?((r.value/total)*100).toFixed(1):"0.0"}%</small></span><strong>${formatArchiveMoney(r.value,currency)}</strong></div>`).join("")||`<div class="empty">尚無分類資料</div>`}</div>
        </div>
      </div>`;
    };

    const buildDailyPanel=(rows,currency)=>`<div class="stats-currency-panel" data-currency-panel="${currency}">
      <div class="bar-chart">
        ${rows.length?rows.map(r=>{
          const max=Math.max(...rows.map(x=>x.value),1);
          const width=(r.value/max)*100;
          return `<div class="bar-row"><span>${fmtDate(r.date)}</span><div class="bar-track"><i style="width:${width}%"></i></div><strong>${formatArchiveMoney(r.value,currency)}</strong></div>`;
        }).join(""):`<div class="empty">尚無每日資料</div>`}
      </div>
    </div>`;

    const buildPeoplePanel=(rows,currency)=>`<div class="stats-currency-panel" data-currency-panel="${currency}">
      <div class="person-list">${rows.map(r=>`<div class="person-row"><span>${htmlDocEscape(r.name)}</span><strong>${formatArchiveMoney(r.value,currency)}</strong></div>`).join("")||`<div class="empty">尚無資料</div>`}</div>
    </div>`;

    const buildSplitPanel=(rows,currency)=>`<div class="split-currency-panel" data-split-currency="${currency}">
      ${rows.length?rows.map(s=>{
        const detailRows=(s.pair?.lines||[]).map(line=>{
          const from=memberOf(trip,line.fromId)?.name||"—";
          const to=memberOf(trip,line.toId)?.name||"—";
          const amount=currency==="TWD" ? line.amount : line.originalAmount;
          const lineCurrency=currency==="TWD" ? "TWD" : line.originalCurrency;
          return `<div class="settlement-line"><span>${htmlDocEscape(line.title)}<small>${htmlDocEscape(from)} → ${htmlDocEscape(to)}</small></span><strong>${formatArchiveMoney(amount,lineCurrency)}</strong></div>`;
        }).join("");
        return `<details class="settlement-card" open>
          <summary><span>${htmlDocEscape(s.from.name)} → ${htmlDocEscape(s.to.name)}</span><strong>${formatArchiveMoney(s.amount,currency)}</strong></summary>
          <div class="settlement-details">${detailRows||`<div class="empty">無明細</div>`}</div>
        </details>`;
      }).join(""):`<div class="empty">目前沒有需要結算的款項</div>`}
    </div>`;

    const expenseCards=Object.entries(grouped).map(([date,items])=>{
      const dayTWD=items.reduce((s,e)=>s+convertToTWD(trip,e),0);
      const dayOriginal=items.filter(e=>e.currency===trip.currency).reduce((s,e)=>s+Number(e.amount||0),0);
      return `<section class="day-card">
        <div class="day-head">
          <h3>${fmtFullDate(date)}</h3>
          <div><strong>${formatMoney(dayOriginal,trip.currency)}</strong><span>≈ ${formatMoney(Math.round(dayTWD),"TWD")}</span></div>
        </div>
        ${items.map(e=>{
          const money=dualMoney(trip,e);
          const payer=memberOf(trip,e.payerId)?.name||"未指定";
          const splitLabel=e.split?`分帳 ${e.splitMemberIds.length} 人`:"不分帳";
          return `<article class="expense-card">
            <div class="expense-symbol">${htmlDocEscape(catOf(trip,e.category).name.slice(0,1))}</div>
            <div class="expense-copy">
              <strong>${htmlDocEscape(e.title)}</strong>
              <span>${htmlDocEscape(catOf(trip,e.category).name)}｜${htmlDocEscape(payer)}付款｜${htmlDocEscape(e.paymentMethod)}｜${htmlDocEscape(splitLabel)}</span>
              ${e.note?`<small>${htmlDocEscape(e.note)}</small>`:""}
            </div>
            <div class="expense-money"><b>${money.original}</b><span>≈ ${money.twd}</span></div>
          </article>`;
        }).join("")}
      </section>`;
    }).join("") || `<div class="empty">尚無支出紀錄</div>`;

    const readonlyCss=`
      :root{--bg:#f8f1f0;--surface:#fffaf8;--surface2:#f3e5e3;--primary:#d6aaa8;--primaryDark:#a97e7d;--text:#4a4140;--muted:#8f8180;--line:#eadedb;--shadow:0 10px 30px rgba(111,79,78,.08)}
      *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif}
      button{font:inherit}.readonly-app{width:min(100%,760px);margin:0 auto;min-height:100vh;padding-bottom:88px;background:radial-gradient(circle at top left,rgba(234,211,209,.65),transparent 34%),var(--bg)}
      .readonly-badge{position:fixed;top:12px;right:max(14px,calc((100vw - 760px)/2 + 14px));z-index:20;padding:7px 11px;border-radius:999px;background:rgba(74,65,64,.84);color:#fff;font-size:11px;backdrop-filter:blur(8px)}
      .screen{display:none;padding:20px 16px 28px}.screen.active{display:block}.screen-title{text-align:center;margin:11px 0 18px;font-size:24px}.hero{min-height:270px;border-radius:28px;padding:24px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;background:linear-gradient(145deg,#c98f8e,#ead3d1 56%,#a98986);box-shadow:var(--shadow)}
      .hero h1{font-size:34px;margin:0 0 5px}.hero .tagline{font-size:16px;margin-bottom:17px}.hero .amount{font-size:32px;font-weight:700}.hero .minor{opacity:.9;font-size:12px}.metric-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px;margin-top:14px}.metric{background:var(--surface);border-radius:20px;padding:15px;box-shadow:var(--shadow)}.metric span{display:block;color:var(--muted);font-size:11px}.metric b{display:block;font-size:19px;margin-top:5px}.metric small{display:block;color:var(--muted);margin-top:3px}
      .balance-card{margin-top:14px;background:linear-gradient(145deg,#fffaf8,#f5e5e2);border-radius:22px;padding:17px;box-shadow:var(--shadow)}.balance-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.balance-row div{background:rgba(255,255,255,.68);border-radius:14px;padding:10px;text-align:center}.balance-row span{display:block;color:var(--muted);font-size:10px}.balance-row b{display:block;margin-top:4px;font-size:14px}
      .day-card,.panel,.chart-panel{background:var(--surface);border-radius:22px;padding:16px;box-shadow:var(--shadow);margin-bottom:14px}.day-head{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:4px}.day-head h3{margin:0}.day-head div{text-align:right}.day-head span{display:block;color:var(--muted);font-size:11px}
      .expense-card{display:grid;grid-template-columns:43px 1fr auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.expense-card:last-child{border-bottom:0}.expense-symbol{width:43px;height:43px;border-radius:14px;background:var(--surface2);display:grid;place-items:center;color:var(--primaryDark);font-weight:700}.expense-copy strong,.expense-copy span,.expense-copy small{display:block}.expense-copy span,.expense-copy small{color:var(--muted);font-size:11px;margin-top:3px}.expense-money{text-align:right;white-space:nowrap}.expense-money b,.expense-money span{display:block}.expense-money span{color:var(--muted);font-size:11px}
      .segment{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:5px;background:var(--surface2);padding:5px;border-radius:16px;margin:10px 0 14px}.segment button{border:0;border-radius:12px;min-height:38px;background:transparent;color:var(--muted)}.segment button.active{background:#fff;color:var(--primaryDark);font-weight:700;box-shadow:0 3px 10px rgba(100,70,70,.06)}
      .stats-view{display:none}.stats-view.active{display:block}.stats-currency-panel,.split-currency-panel{display:none}.stats-currency-panel.active,.split-currency-panel.active{display:block}
      .chart-layout{display:grid;gap:18px}.donut-wrap{display:grid;place-items:center}.donut{width:min(62vw,260px);aspect-ratio:1;border-radius:50%;position:relative}.donut::after{content:"";position:absolute;inset:28%;border-radius:50%;background:var(--surface)}.legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:9px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}.legend-row:last-child{border-bottom:0}.legend-row small{display:block;color:var(--muted);font-size:10px}.legend-dot{width:10px;height:10px;border-radius:50%}
      .bar-row{display:grid;grid-template-columns:52px 1fr auto;gap:9px;align-items:center;padding:9px 0}.bar-track{height:11px;border-radius:999px;background:var(--surface2);overflow:hidden}.bar-track i{display:block;height:100%;border-radius:999px;background:var(--primary)}.person-list{display:grid;gap:9px}.person-row{display:flex;justify-content:space-between;gap:12px;padding:12px;border-radius:15px;background:var(--surface2)}
      .settlement-card{background:var(--surface);border-radius:18px;padding:0 14px;box-shadow:var(--shadow);margin-bottom:11px}.settlement-card summary{list-style:none;display:flex;justify-content:space-between;padding:15px 0;cursor:pointer}.settlement-card summary::-webkit-details-marker{display:none}.settlement-details{border-top:1px solid var(--line)}.settlement-line{display:flex;justify-content:space-between;gap:15px;padding:10px 0;border-bottom:1px dashed var(--line)}.settlement-line span small{display:block;color:var(--muted);font-size:10px;margin-top:3px}
      .info-row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--line)}.info-row:last-child{border-bottom:0}.empty{text-align:center;color:var(--muted);padding:26px}
      .bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:min(100%,760px);height:74px;display:grid;grid-template-columns:repeat(5,1fr);background:rgba(255,250,248,.95);border-top:1px solid var(--line);backdrop-filter:blur(15px);z-index:15}.bottom-nav button{border:0;background:transparent;color:var(--muted);font-size:11px}.bottom-nav button.active{color:var(--primaryDark);font-weight:700}.bottom-nav span{display:block;font-size:20px;margin-bottom:3px}
      .print-actions{position:sticky;top:9px;display:flex;justify-content:flex-end;z-index:20;margin-bottom:8px}.print-actions button{border:0;border-radius:999px;background:var(--primaryDark);color:#fff;padding:10px 16px}
      .print-section-title{display:none}
      @media(min-width:650px){.chart-layout{grid-template-columns:.85fr 1.15fr;align-items:center}.metric-grid{grid-template-columns:repeat(3,1fr)}}
      @media print{
        body{background:#fff}.readonly-app{width:100%;padding:0;background:#fff}.readonly-badge,.bottom-nav,.print-actions,.interactive-only{display:none!important}.screen{display:block!important;padding:0 0 12mm;page-break-after:always}.screen:last-of-type{page-break-after:auto}.screen-title{margin-top:0}.hero,.metric,.balance-card,.day-card,.panel,.chart-panel,.settlement-card{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:none}.hero{border-radius:0;min-height:230px}.day-card,.settlement-card{break-inside:avoid}.donut{width:220px}.print-section-title{display:block;margin:24px 0 10px}.stats-view,.stats-currency-panel,.split-currency-panel{display:block!important}.stats-view{page-break-inside:avoid;margin-bottom:12mm}.stats-currency-panel,.split-currency-panel{margin-bottom:8mm}.stats-view::before{display:block;font-weight:700;font-size:18px;margin-bottom:8px}.stats-view[data-stats-view="category"]::before{content:"分類統計"}.stats-view[data-stats-view="daily"]::before{content:"每日統計"}.stats-view[data-stats-view="paid"]::before{content:"每人付款"}.stats-view[data-stats-view="burden"]::before{content:"每人負擔"}.stats-currency-panel::before,.split-currency-panel::before{display:block;color:var(--primaryDark);font-weight:700;margin-bottom:8px}.stats-currency-panel[data-currency-panel="${trip.currency}"]::before,.split-currency-panel[data-split-currency="${trip.currency}"]::before{content:"原幣（${trip.currency}）"}.stats-currency-panel[data-currency-panel="TWD"]::before,.split-currency-panel[data-split-currency="TWD"]::before{content:"台幣（TWD）"}@page{size:A4;margin:11mm}
      }
    `;

    const initial=Number(trip.initialAmount||0);
    const remaining=initial-a.totalOriginal;

    return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}｜旅行收藏</title><style>${readonlyCss}</style></head><body>
      <main class="readonly-app">
        <div class="readonly-badge">唯讀旅程</div>
        ${printMode?`<div class="print-actions"><button onclick="window.print()">列印／儲存 PDF</button></div>`:""}

        <section class="screen active" data-screen="home">
          <div class="hero">
            <div class="minor">${fmtFullDate(trip.startDate)}－${fmtFullDate(trip.endDate)}</div>
            <h1>${title}</h1>
            ${trip.tagline?`<div class="tagline">${htmlDocEscape(trip.tagline)}</div>`:""}
            <div class="minor">目前總花費</div>
            <div class="amount">${formatMoney(Math.round(a.totalTWD),"TWD")}</div>
            <div class="minor">${formatMoney(a.totalOriginal,trip.currency)}｜${htmlDocEscape(members)}</div>
          </div>
          <div class="metric-grid">
            <div class="metric"><span>旅行天數</span><b>${a.tripDays} 天</b></div>
            <div class="metric"><span>支出筆數</span><b>${trip.expenses.length}</b></div>
            <div class="metric"><span>每日平均</span><b>${formatMoney(Math.round(a.totalTWD/a.tripDays),"TWD")}</b></div>
            <div class="metric"><span>最高花費日</span><b>${a.highest?fmtDate(a.highest[0]):"—"}</b><small>${a.highest?formatMoney(Math.round(a.highest[1]),"TWD"):""}</small></div>
            <div class="metric"><span>最低花費日</span><b>${a.lowest?fmtDate(a.lowest[0]):"—"}</b><small>${a.lowest?formatMoney(Math.round(a.lowest[1]),"TWD"):""}</small></div>
            <div class="metric"><span>匯率</span><b>1 ${trip.currency}</b><small>= ${trip.rate} TWD</small></div>
          </div>
          <div class="balance-card">
            <strong>旅費餘額（原幣）</strong>
            <div class="balance-row">
              <div><span>初始金額</span><b>${formatMoney(initial,trip.currency)}</b></div>
              <div><span>累計支出</span><b>${formatMoney(a.totalOriginal,trip.currency)}</b></div>
              <div><span>目前餘額</span><b>${formatMoney(remaining,trip.currency)}</b></div>
            </div>
          </div>
        </section>

        <section class="screen" data-screen="expenses">
          <h2 class="screen-title">記帳</h2>
          ${expenseCards}
        </section>

        <section class="screen" data-screen="stats">
          <h2 class="screen-title">統計</h2>
          <div class="segment interactive-only">
            <button class="active" data-stats-target="category">分類</button>
            <button data-stats-target="daily">每日</button>
            <button data-stats-target="paid">付款</button>
            <button data-stats-target="burden">負擔</button>
          </div>
          <div class="segment interactive-only">
            <button class="active" data-stats-currency="${trip.currency}">原幣</button>
            <button data-stats-currency="TWD">台幣</button>
          </div>

          <div class="stats-view active" data-stats-view="category">
            <div class="chart-panel">
              ${buildCategoryPanel(originalStats.categoryRows,trip.currency)}
              ${buildCategoryPanel(twdStats.categoryRows,"TWD")}
            </div>
          </div>
          <div class="stats-view" data-stats-view="daily">
            <div class="chart-panel">
              ${buildDailyPanel(originalStats.dailyRows,trip.currency)}
              ${buildDailyPanel(twdStats.dailyRows,"TWD")}
            </div>
          </div>
          <div class="stats-view" data-stats-view="paid">
            <div class="chart-panel">
              ${buildPeoplePanel(originalStats.paidRows,trip.currency)}
              ${buildPeoplePanel(twdStats.paidRows,"TWD")}
            </div>
          </div>
          <div class="stats-view" data-stats-view="burden">
            <div class="chart-panel">
              ${buildPeoplePanel(originalStats.burdenRows,trip.currency)}
              ${buildPeoplePanel(twdStats.burdenRows,"TWD")}
            </div>
          </div>
        </section>

        <section class="screen" data-screen="split">
          <h2 class="screen-title">分帳</h2>
          <div class="segment interactive-only">
            <button class="active" data-split-switch="${trip.currency}">原幣</button>
            <button data-split-switch="TWD">台幣</button>
          </div>
          ${buildSplitPanel(originalStats.splitRows,trip.currency)}
          ${buildSplitPanel(twdStats.splitRows,"TWD")}
        </section>

        <section class="screen" data-screen="settings">
          <h2 class="screen-title">旅程資訊</h2>
          <div class="panel">
            <div class="info-row"><strong>旅程名稱</strong><span>${title}</span></div>
            <div class="info-row"><strong>日期</strong><span>${fmtFullDate(trip.startDate)}－${fmtFullDate(trip.endDate)}</span></div>
            <div class="info-row"><strong>旅程小句子</strong><span>${trip.tagline?htmlDocEscape(trip.tagline):"—"}</span></div>
            <div class="info-row"><strong>成員</strong><span>${members}</span></div>
            <div class="info-row"><strong>幣別</strong><span>${trip.currency}</span></div>
            <div class="info-row"><strong>匯率</strong><span>1 ${trip.currency} = ${trip.rate} TWD</span></div>
            <div class="info-row"><strong>初始金額</strong><span>${formatMoney(initial,trip.currency)}</span></div>
            <div class="info-row"><strong>產出時間</strong><span>${generated}</span></div>
          </div>
          <div style="text-align:center;color:var(--muted);font-size:12px;margin-top:28px">玩得開心，算得明白。 — Tiffany Shen</div>
        </section>

        ${printMode?"":`<nav class="bottom-nav">
          <button class="active" data-target="home"><span>⌂</span>首頁</button>
          <button data-target="expenses"><span>☷</span>記帳</button>
          <button data-target="stats"><span>◔</span>統計</button>
          <button data-target="split"><span>⇄</span>分帳</button>
          <button data-target="settings"><span>⚙</span>設定</button>
        </nav>`}
      </main>
      ${printMode?"":`<script>
        const showCurrency=(currency)=>{
          document.querySelectorAll(".stats-currency-panel").forEach(x=>x.classList.toggle("active",x.dataset.currencyPanel===currency));
          document.querySelectorAll("[data-stats-currency]").forEach(x=>x.classList.toggle("active",x.dataset.statsCurrency===currency));
        };
        const showSplitCurrency=(currency)=>{
          document.querySelectorAll(".split-currency-panel").forEach(x=>x.classList.toggle("active",x.dataset.splitCurrency===currency));
          document.querySelectorAll("[data-split-switch]").forEach(x=>x.classList.toggle("active",x.dataset.splitSwitch===currency));
        };
        document.querySelectorAll(".bottom-nav button").forEach(btn=>btn.addEventListener("click",()=>{
          document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.remove("active"));
          document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
          btn.classList.add("active");
          document.querySelector('[data-screen="'+btn.dataset.target+'"]').classList.add("active");
          window.scrollTo({top:0,behavior:"smooth"});
        }));
        document.querySelectorAll("[data-stats-target]").forEach(btn=>btn.addEventListener("click",()=>{
          document.querySelectorAll("[data-stats-target]").forEach(x=>x.classList.remove("active"));
          document.querySelectorAll(".stats-view").forEach(x=>x.classList.remove("active"));
          btn.classList.add("active");
          document.querySelector('[data-stats-view="'+btn.dataset.statsTarget+'"]').classList.add("active");
        }));
        document.querySelectorAll("[data-stats-currency]").forEach(btn=>btn.addEventListener("click",()=>showCurrency(btn.dataset.statsCurrency)));
        document.querySelectorAll("[data-split-switch]").forEach(btn=>btn.addEventListener("click",()=>showSplitCurrency(btn.dataset.splitSwitch)));
        showCurrency("${trip.currency}");
        showSplitCurrency("${trip.currency}");
      <\/script>`}
    </body></html>`;
  }

  function exportTripHTML(trip) {
    downloadBlob(buildTripArchiveHTML(trip),"text/html;charset=utf-8",`${safeFileName(trip.title)}_${localDateStamp(new Date(trip.startDate+"T00:00:00"))}_旅行收藏.html`);
    toast("唯讀旅程 App 已下載");
  }

  function exportTripPDF(trip) {
    const win=window.open("","_blank");
    if(!win){window.alert("瀏覽器阻擋了新視窗，請允許彈出視窗後再試一次。");return;}
    win.document.open();
    win.document.write(buildTripArchiveHTML(trip,{printMode:true}));
    win.document.close();
    setTimeout(()=>{try{win.focus();win.print();}catch(e){}},700);
  }

  function render() {
    if (chart) { chart.destroy(); chart = null; }
    const app = document.getElementById("app");
    app.innerHTML = ui.view === "shelf" ? renderShelf() : renderTripShell();
    bind();
    window.TravelCloud?.renderPanel();
    if (window.lucide) window.lucide.createIcons();
    setTimeout(renderChartIfNeeded, 0);
  }

  function renderShelf() {
    const trips = [...state.trips].sort((a,b)=>b.startDate.localeCompare(a.startDate));
    const grouped = trips.reduce((acc,t)=>{ const y=(t.startDate||"未定").slice(0,4); (acc[y] ||= []).push(t); return acc; },{});
    return `
      <main class="app-shell">
        <section class="page shelf-page">
          <header class="shelf-hero">
            <div class="shelf-kicker">MY TRAVEL COLLECTION</div>
            <h1 class="page-title hand">旅行書櫃</h1>
            <div class="title-stroke" aria-hidden="true"></div>
            <div class="subtitle">收藏每一次出發。</div>
          </header>
          ${trips.length ? Object.entries(grouped).map(([year,items])=>`
            <div class="section-title"><h2 class="bookshelf-year">${esc(year)}</h2><span class="muted small">${items.length} 本旅程</span></div>
            <div class="trip-grid">
              ${items.map((trip,index)=>renderTripCard(trip,index)).join("")}
            </div>
          `).join("") : `
            <div class="empty-state"><div class="emoji">${icon("library-big",42)}</div><p>書櫃還是空的，先建立第一趟旅程吧。</p></div>
          `}
          <button class="primary-btn" data-action="new-trip" style="margin-top:20px">＋ 建立新旅程</button>
          <div id="cloud-panel" class="cloud-panel"><strong>☁️ 雲端同步</strong><p>正在載入 Google 登入…</p></div>
          ${renderBackupPanel()}
          <div class="signature-wrap hand">
            <div class="slogan">玩得開心，算得明白。</div>
            <div class="signature">— Tiffany Shen</div>
          </div>
        </section>
        ${renderModal()}
      </main>`;
  }

  function renderBackupPanel() {
    const status=backupStatus();
    return `<section class="backup-panel ${status.overdue?"backup-warning":""}">
      <div class="backup-panel-head">
        <div class="backup-icon">${icon(status.overdue?"shield-alert":"shield-check",22)}</div>
        <div><strong>資料備份</strong><div class="muted small">上次備份：${status.label}</div></div>
      </div>
      ${status.overdue?`<div class="backup-reminder">${status.days===null?"尚未建立完整備份，建議現在備份。":`距離上次備份已 ${status.days} 天，建議更新備份。`}</div>`:""}
      <div class="backup-actions">
        <button class="secondary-btn" data-action="export-backup">${icon("download",17)} 完整備份</button>
        <button class="ghost-btn" data-action="import-backup">${icon("upload",17)} 還原備份</button>
      </div>
    </section>`;
  }

  function renderTripCard(trip,index=0) {
    const tone = index % 6;
    return `
      <article class="trip-card tone-${tone}" style="--book-index:${index}" data-action="open-trip" data-id="${trip.id}">
        <span class="book-tape" aria-hidden="true"></span>
        <span class="book-ribbon" aria-hidden="true"></span>
        <span class="book-spine-title">${esc(trip.title)}</span>
        <div class="book-photo">
          ${trip.cover ? `<img class="cover" src="${esc(trip.cover)}" alt="">` : `<div class="cover-placeholder"><span>${esc(trip.title)}</span><small>${(trip.startDate||"").slice(0,4)}</small></div>`}
        </div>
        <div class="trip-card-content">
          <h3>${esc(trip.title)}</h3>
          ${trip.tagline ? `<div class="trip-tagline">${esc(trip.tagline)}</div>` : ""}
          <div class="trip-meta">
            <span>${fmtDate(trip.startDate)}－${fmtDate(trip.endDate)}</span>
            <span>${trip.members.length} 位成員</span>
            <span>${formatMoney(Math.round(tripTotalTWD(trip)),"TWD")}</span>
          </div>
        </div>
      </article>`;
  }

  function renderTripShell() {
    const trip = currentTrip();
    if (!trip) { ui.view="shelf"; return renderShelf(); }
    const tabContent = {
      home: renderDashboard(trip),
      expenses: renderExpenses(trip),
      stats: renderStats(trip),
      split: renderSplit(trip),
      settings: renderSettings(trip)
    }[ui.tripTab];

    return `
      <main class="app-shell">
        <header class="topbar">
          <button class="icon-btn" data-action="back-shelf" aria-label="返回">${icon("chevron-left",22)}</button>
          <h1>${esc(trip.title)}</h1>
          <button class="icon-btn" data-action="edit-trip" aria-label="編輯旅程">${icon("ellipsis",22)}</button>
        </header>
        ${tabContent}
        ${ui.tripTab === "expenses" ? `<button class="fab" data-action="new-expense" aria-label="新增支出">＋</button>` : ""}
        <nav class="bottom-nav">
          ${navBtn("home","house","首頁")}
          ${navBtn("expenses","notebook-pen","記帳")}
          ${navBtn("stats","chart-no-axes-column","統計")}
          ${navBtn("split","users-round","分帳")}
          ${navBtn("settings","settings","設定")}
        </nav>
        ${renderModal()}
      </main>`;
  }
  function navBtn(tab, iconName, label) {
    return `<button data-action="tab" data-tab="${tab}" class="${ui.tripTab===tab?"active":""}"><span>${icon(iconName,19)}</span><span>${label}</span></button>`;
  }

  function renderDashboard(trip) {
    const total = tripTotalTWD(trip);
    const today = new Date().toISOString().slice(0,10);
    const todayExpenses = trip.expenses.filter(e=>e.date===today);
    const todayTotal = todayExpenses.reduce((s,e)=>s+convertToTWD(trip,e),0);
    const todayOriginal = todayExpenses.filter(e=>e.currency===trip.currency).reduce((s,e)=>s+Number(e.amount||0),0);
    const recent = [...trip.expenses].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5);
    const initialAmount = Number(trip.initialAmount || 0);
    const spentOriginal = trip.expenses
      .filter(e=>e.currency===trip.currency)
      .reduce((s,e)=>s+Number(e.amount||0),0);
    const remainingOriginal = initialAmount - spentOriginal;
    return `
      <section class="page with-header">
        <div class="hero-card">
          ${trip.cover ? `<img src="${esc(trip.cover)}" alt="">` : `<div class="cover-placeholder"></div>`}
          <div class="hero-content">
            <h2>${esc(trip.title)}</h2>
            ${trip.tagline ? `<div class="hero-tagline">${esc(trip.tagline)}</div>` : ""}
            <div class="hero-total">目前總花費</div>
            <div class="hero-amount">${formatMoney(Math.round(total),"TWD")}</div>
            <div class="small">約 ${formatMoney(tripTotalOriginal(trip), trip.currency)}｜匯率 1 ${trip.currency} = ${trip.rate} TWD</div>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-mini"><b>${daysBetween(trip.startDate,trip.endDate)}</b><span>旅遊天數</span></div>
          <div class="stat-mini"><b>${trip.members.length}</b><span>旅伴人數</span></div>
          <div class="stat-mini"><b>${trip.expenses.length}</b><span>支出筆數</span></div>
        </div>
        <div class="card balance-card">
          <div class="muted small">旅費餘額（僅計原幣）</div>
          <div class="balance-row">
            <div class="balance-cell"><span>初始金額</span><b>${formatMoney(initialAmount,trip.currency)}</b></div>
            <div class="balance-cell"><span>累計支出</span><b>${formatMoney(spentOriginal,trip.currency)}</b></div>
            <div class="balance-cell remaining"><span>目前餘額</span><b>${formatMoney(remainingOriginal,trip.currency)}</b></div>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="muted small">今日花費</div>
          <div class="today-dual">
            <div class="primary-amount">${formatMoney(todayOriginal,trip.currency)}</div>
            <div class="secondary-amount">≈ ${formatMoney(Math.round(todayTotal),"TWD")}</div>
          </div>
        </div>
        <button class="primary-btn" data-action="new-expense" style="margin-top:14px">＋ 新增支出</button>
        <div class="section-title"><h2>最近支出</h2><button class="ghost-btn" data-action="tab" data-tab="expenses">查看全部</button></div>
        <div class="expense-list">
          ${recent.length ? recent.map(e=>renderExpenseRow(trip,e)).join("") : `<div class="empty-state"><p>尚無支出紀錄</p></div>`}
        </div>
      </section>`;
  }

  function renderExpenseRow(trip, exp) {
    const cat=catOf(trip,exp.category), money=dualMoney(trip,exp), payer=memberOf(trip,exp.payerId);
    return `
      <article class="expense-row" data-action="expense-detail" data-id="${exp.id}">
        <div class="expense-icon">${categoryIcon(cat)}</div>
        <div class="expense-main">
          <h4>${esc(exp.title)}</h4>
          <div class="meta">${esc(cat.name)}｜${esc(payer?.name||"未指定")}付款｜${esc(exp.paymentMethod)}
            <span class="split-badge ${exp.split?"":"no"}">${exp.split?`分帳 ${exp.splitMemberIds.length} 人`:"不分帳"}</span>
          </div>
        </div>
        <div class="amount-pair">
          <strong>${money.original}</strong>
          <span>≈ ${money.twd}</span>
        </div>
      </article>`;
  }

  function renderExpenses(trip) {
    const sorted=[...trip.expenses].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
    const grouped=sorted.reduce((acc,e)=>{(acc[e.date] ||= []).push(e); return acc;},{});
    return `
      <section class="page with-header">
        <div class="section-title"><h2>支出紀錄</h2><span class="muted small">${trip.expenses.length} 筆</span></div>
        ${sorted.length ? Object.entries(grouped).map(([date,items])=>{
          const total=items.reduce((s,e)=>s+convertToTWD(trip,e),0);
          const originalTotal=items.filter(e=>e.currency===trip.currency).reduce((s,e)=>s+Number(e.amount||0),0);
          return `<div class="day-block">
            <div class="day-header">
              <h3>${fmtFullDate(date)}</h3>
              <div class="day-total-dual">
                <strong>今日 ${formatMoney(originalTotal,trip.currency)}</strong>
                <span>≈ ${formatMoney(Math.round(total),"TWD")}</span>
              </div>
            </div>
            <div class="expense-list">${items.map(e=>renderExpenseRow(trip,e)).join("")}</div>
          </div>`;
        }).join("") : `<div class="empty-state"><div class="emoji">${icon("receipt-text",42)}</div><p>還沒有支出，點右下角新增。</p></div>`}
      </section>`;
  }

  function renderStats(trip) {
    const currency = ui.displayCurrency;
    return `
      <section class="page with-header">
        <div class="segmented">
          <button data-action="stats-tab" data-tab="category" class="${ui.statsTab==="category"?"active":""}">分類</button>
          <button data-action="stats-tab" data-tab="daily" class="${ui.statsTab==="daily"?"active":""}">每日</button>
          <button data-action="stats-tab" data-tab="paid" class="${ui.statsTab==="paid"?"active":""}">付款</button>
          <button data-action="stats-tab" data-tab="burden" class="${ui.statsTab==="burden"?"active":""}">負擔</button>
        </div>
        <div class="segmented">
          <button data-action="currency-switch" data-currency="${trip.currency}" class="${currency===trip.currency?"active":""}">原幣</button>
          <button data-action="currency-switch" data-currency="TWD" class="${currency==="TWD"?"active":""}">台幣</button>
        </div>
        ${renderStatsContent(trip)}
      </section>`;
  }

  function valueInDisplay(trip, exp) {
    return ui.displayCurrency==="TWD" ? convertToTWD(trip,exp) : Number(exp.amount||0);
  }

  function calcBurden(trip) {
    const out=Object.fromEntries(trip.members.map(m=>[m.id,0]));
    for(const e of trip.expenses) {
      const val=valueInDisplay(trip,e);
      if(e.split && e.splitMemberIds.length) {
        const share=val/e.splitMemberIds.length;
        e.splitMemberIds.forEach(id=>{ if(id in out) out[id]+=share; });
      } else if(e.payerId in out) out[e.payerId]+=val;
    }
    return out;
  }

  function renderStatsContent(trip) {
    const curr=ui.displayCurrency;
    let rows=[];
    if(ui.statsTab==="category") {
      const map={};
      trip.expenses.forEach(e=>map[e.category]=(map[e.category]||0)+valueInDisplay(trip,e));
      rows=Object.entries(map)
        .map(([id,value])=>({id,label:catOf(trip,id).name,value}))
        .sort((a,b)=>b.value-a.value);
    } else if(ui.statsTab==="daily") {
      const map={};
      trip.expenses.forEach(e=>map[e.date]=(map[e.date]||0)+valueInDisplay(trip,e));
      rows=Object.entries(map).map(([date,value])=>({label:fmtDate(date),rawLabel:date,value})).sort((a,b)=>a.rawLabel.localeCompare(b.rawLabel));
    } else if(ui.statsTab==="paid") {
      rows=trip.members.map(m=>({label:m.name,value:trip.expenses.filter(e=>e.payerId===m.id).reduce((s,e)=>s+valueInDisplay(trip,e),0)})).sort((a,b)=>b.value-a.value);
    } else {
      const burden=calcBurden(trip);
      rows=trip.members.map(m=>({label:m.name,value:burden[m.id]||0})).sort((a,b)=>b.value-a.value);
    }
    const totalValue = rows.reduce((sum,row)=>sum+row.value,0);
    const isCategory = ui.statsTab==="category";
    return `
      <div class="chart-card ${isCategory?"category-chart-card":""}">
        <div class="chart-wrap"><canvas id="statsChart"></canvas></div>
        <div class="breakdown-list ${isCategory?"category-legend":""}">
          ${rows.length ? rows.map((r,index)=>`<div class="breakdown-row">
            <div class="legend-label">
              ${isCategory ? `<span class="legend-dot" style="background:${chartColors[index%chartColors.length]}"></span>${categoryIcon(catOf(trip,r.id))}` : ""}
              <div><strong>${esc(r.label)}</strong>${isCategory?`<small>${totalValue?((r.value/totalValue)*100).toFixed(1):"0.0"}%</small>`:""}</div>
            </div>
            <div>${formatMoney(Math.round(r.value),curr)}</div>
          </div>`).join("") : `<div class="empty-state"><p>尚無統計資料</p></div>`}
        </div>
      </div>`;
  }

  function renderChartIfNeeded() {
    if(ui.view!=="trip" || ui.tripTab!=="stats") return;
    const canvas=document.getElementById("statsChart");
    if(!canvas || typeof Chart==="undefined") return;
    const trip=currentTrip();
    let labels=[], data=[], type="bar";
    if(ui.statsTab==="category") {
      const map={}; trip.expenses.forEach(e=>map[e.category]=(map[e.category]||0)+valueInDisplay(trip,e));
      const rows=Object.entries(map).map(([id,value])=>({label:catOf(trip,id).name,value}));
      labels=rows.map(r=>r.label); data=rows.map(r=>r.value); type="doughnut";
    } else if(ui.statsTab==="daily") {
      const map={}; trip.expenses.forEach(e=>map[e.date]=(map[e.date]||0)+valueInDisplay(trip,e));
      const rows=Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
      labels=rows.map(r=>fmtDate(r[0])); data=rows.map(r=>r[1]); type="line";
    } else if(ui.statsTab==="paid") {
      labels=trip.members.map(m=>m.name); data=trip.members.map(m=>trip.expenses.filter(e=>e.payerId===m.id).reduce((s,e)=>s+valueInDisplay(trip,e),0));
    } else {
      const b=calcBurden(trip); labels=trip.members.map(m=>m.name); data=trip.members.map(m=>b[m.id]||0);
    }
    chart=new Chart(canvas,{
      type,
      data:{labels,datasets:[{data,borderWidth:2,tension:.3,backgroundColor:chartColors,borderColor:"#a97e7d",fill:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:type==="doughnut"?{}:{y:{beginAtZero:true,grid:{color:"#eee4e2"}},x:{grid:{display:false}}}}
    });
  }

  function pairwiseLedger(trip) {
    const ledger = {};
    const keyOf = (a,b) => [a,b].sort().join("|");

    for (const e of trip.expenses.filter(x=>x.split && x.splitMemberIds.length)) {
      const share = valueInDisplay(trip,e) / e.splitMemberIds.length;
      for (const memberId of e.splitMemberIds) {
        if (memberId === e.payerId) continue;
        const key = keyOf(memberId,e.payerId);
        if (!ledger[key]) ledger[key] = { a:key.split("|")[0], b:key.split("|")[1], net:0, lines:[] };

        const pair = ledger[key];
        const sign = (memberId === pair.a && e.payerId === pair.b) ? 1 : -1;
        pair.net += sign * share;
        pair.lines.push({
          title:e.title,
          fromId:memberId,
          toId:e.payerId,
          amount:valueInDisplay(trip,e)/e.splitMemberIds.length,
          originalAmount:Number(e.amount||0)/e.splitMemberIds.length,
          originalCurrency:e.currency
        });
      }
    }
    return ledger;
  }

  function settlements(trip) {
    return Object.values(pairwiseLedger(trip))
      .filter(p=>Math.abs(p.net)>0.01)
      .map(p=>{
        const fromId = p.net > 0 ? p.a : p.b;
        const toId = p.net > 0 ? p.b : p.a;
        return {
          from:{id:fromId,name:memberOf(trip,fromId)?.name||"—"},
          to:{id:toId,name:memberOf(trip,toId)?.name||"—"},
          amount:Math.abs(p.net),
          pair:p
        };
      })
      .sort((a,b)=>b.amount-a.amount);
  }

  function renderSplit(trip) {
    const curr=ui.displayCurrency;
    const result=settlements(trip);
    return `
      <section class="page with-header">
        <div class="segmented">
          <button data-action="currency-switch" data-currency="${trip.currency}" class="${curr===trip.currency?"active":""}">原幣</button>
          <button data-action="currency-switch" data-currency="TWD" class="${curr==="TWD"?"active":""}">台幣</button>
        </div>
        <div class="section-title"><h2>應收應付</h2><span class="muted small">依全部分帳資料計算</span></div>
        ${result.length ? result.map(s=>`
          <div class="settlement-card">
            <div class="settlement-head">
              <div><div class="muted small">付款人</div><strong>${esc(s.from.name)}</strong></div>
              <div class="settlement-arrow">→</div>
              <div><div class="muted small">收款人</div><strong>${esc(s.to.name)}</strong></div>
            </div>
            <div class="settlement-amount">${formatMoney(Math.round(s.amount),curr)}</div>
            <details class="details">
              <summary>查看相關分帳明細</summary>
              ${renderSettlementDetails(trip,s)}
            </details>
          </div>`).join("") : `<div class="empty-state"><div class="emoji">${icon("circle-check-big",42)}</div><p>目前沒有需要結算的款項。</p></div>`}
      </section>`;
  }

  function renderSettlementDetails(trip,settlement) {
    const {from,to,pair} = settlement;
    const relevant = pair.lines.filter(line =>
      (line.fromId===from.id && line.toId===to.id) ||
      (line.fromId===to.id && line.toId===from.id)
    );

    if (!relevant.length) return `<div class="muted small" style="padding-top:10px">無可顯示的分帳明細。</div>`;

    const rows = relevant.map(line=>{
      const positive = line.fromId===from.id && line.toId===to.id;
      const direction = `${memberOf(trip,line.fromId)?.name||"—"} → ${memberOf(trip,line.toId)?.name||"—"}`;
      return `<div class="detail-line ${positive?"":"negative"}">
        <span class="sign">${positive?"+":"−"}</span>
        <span style="flex:1">${esc(line.title)}<br><small>${esc(direction)}</small></span>
        <span>${formatMoney(line.originalAmount,line.originalCurrency)} ≈ ${formatMoney(Math.round(line.amount),"TWD")}</span>
      </div>`;
    }).join("");

    const netLabel = `${from.name} 應付 ${to.name}`;
    return `${rows}
      <div class="detail-line" style="font-weight:700;border-bottom:0">
        <span></span><span style="flex:1">${esc(netLabel)}（淨額）</span>
        <span>${formatMoney(Math.round(settlement.amount),ui.displayCurrency)}</span>
      </div>`;
  }

  function renderSettings(trip) {
    const total=tripTotalTWD(trip);
    const tripDays=Math.max(1,daysBetween(trip.startDate,trip.endDate));
    const dailyTotals={};
    trip.expenses.forEach(e=>dailyTotals[e.date]=(dailyTotals[e.date]||0)+convertToTWD(trip,e));
    const dayRows=Object.entries(dailyTotals).sort((a,b)=>a[0].localeCompare(b[0]));
    const highestDay=dayRows.length?[...dayRows].sort((a,b)=>b[1]-a[1])[0]:null;
    const lowestDay=dayRows.length?[...dayRows].sort((a,b)=>a[1]-b[1])[0]:null;
    const biggestCategory=(()=>{
      const map={};trip.expenses.forEach(e=>map[e.category]=(map[e.category]||0)+convertToTWD(trip,e));
      const x=Object.entries(map).sort((a,b)=>b[1]-a[1])[0]; return x?catOf(trip,x[0]).name:"—";
    })();
    return `
      <section class="page with-header">
        <div class="summary-cover">
          ${trip.cover ? `<img src="${esc(trip.cover)}" alt="">` : `<div class="cover-placeholder"></div>`}
          <div class="content"><h2 style="margin:0">${esc(trip.title)}</h2><div>${fmtFullDate(trip.startDate)}－${fmtFullDate(trip.endDate)}</div></div>
        </div>
        <div class="summary-grid travel-stats-grid">
          <div class="summary-item"><span>旅行天數</span><b>${tripDays} 天</b></div>
          <div class="summary-item"><span>每日平均花費</span><b>${formatMoney(Math.round(total/tripDays),"TWD")}</b></div>
          <div class="summary-item"><span>最高花費日</span><b>${highestDay?fmtDate(highestDay[0]):"—"}</b>${highestDay?`<small>${formatMoney(Math.round(highestDay[1]),"TWD")}</small>`:""}</div>
          <div class="summary-item"><span>最低花費日</span><b>${lowestDay?fmtDate(lowestDay[0]):"—"}</b>${lowestDay?`<small>${formatMoney(Math.round(lowestDay[1]),"TWD")}</small>`:""}</div>
          <div class="summary-item"><span>總花費</span><b>${formatMoney(Math.round(total),"TWD")}</b></div>
          <div class="summary-item"><span>最多花費類別</span><b>${esc(biggestCategory)}</b></div>
        </div>
        <div class="section-title"><h2>旅程設定</h2></div>
        <div class="card">
          <div class="breakdown-row"><strong>幣別</strong><span>${trip.currency}｜${currencyMap[trip.currency]?.name}</span></div>
          <div class="breakdown-row"><strong>匯率</strong><span>1 ${trip.currency} = ${trip.rate} TWD</span></div>
          <div class="breakdown-row"><strong>初始金額</strong><span>${formatMoney(Number(trip.initialAmount||0),trip.currency)}</span></div>
          <div class="breakdown-row"><strong>旅程小句子</strong><span>${trip.tagline?esc(trip.tagline):"—"}</span></div>
          <div class="breakdown-row"><strong>旅伴</strong><span>${trip.members.map(m=>esc(m.name)).join("、")}</span></div>
        </div>

        <div class="section-title"><h2>支出類別</h2><span class="muted small">可自行新增</span></div>
        <div class="card">
          <div class="member-input-row">
            <input id="customCategoryName" placeholder="例如：咖啡、購物">
            <button class="secondary-btn" data-action="add-category">新增</button>
          </div>
          <div class="category-manage-list">
            ${allCategories(trip).map(c=>`
              <div class="category-manage-row">
                <div class="cat-icon">${categoryIcon(c)}</div>
                <div>${esc(c.name)}</div>
                ${c.id.startsWith("custom-")?`<button data-action="delete-category" data-id="${c.id}" aria-label="刪除類別">×</button>`:`<span class="muted small">預設</span>`}
              </div>`).join("")}
          </div>
        </div>
        <button class="secondary-btn" data-action="edit-trip" style="width:100%;margin-top:14px">編輯旅程</button>
        <div class="section-title"><h2>輸出與保存</h2><span class="muted small">單一旅程</span></div>
        <div class="export-grid">
          <button class="ghost-btn" data-action="export-pdf">${icon("file-text",17)} PDF 紀錄</button>
          <button class="ghost-btn" data-action="export-html">${icon("file-code-2",17)} 唯讀 HTML</button>
          <button class="ghost-btn" data-action="export-csv">${icon("sheet",17)} CSV 明細</button>
        </div>
        ${renderBackupPanel()}
        <button class="danger-btn" data-action="delete-trip" style="width:100%;margin-top:14px">刪除旅程</button>
      </section>`;
  }

  function renderModal() {
    if(!ui.modal) return "";
    if(ui.modal==="trip-form") return renderTripFormModal();
    if(ui.modal==="expense-form") return renderExpenseFormModal();
    if(ui.modal==="expense-detail") return renderExpenseDetailModal();
    if(ui.modal==="confirm-delete-trip") return confirmModal("確定刪除旅程？","刪除後，這趟旅程內的所有支出與分帳資料都會一併刪除。","confirm-delete-trip");
    if(ui.modal==="confirm-delete-expense") return confirmModal("確定刪除此筆支出？","刪除後，統計及分帳會立即重新計算。","confirm-delete-expense");
    return "";
  }

  function modalWrap(title, body) {
    return `<div class="modal" data-action="modal-backdrop"><div class="modal-panel" onclick="event.stopPropagation()"><div class="modal-handle"></div><div class="modal-title"><h2>${title}</h2><button class="icon-btn" data-action="close-modal">×</button></div>${body}</div></div>`;
  }

  function renderTripFormModal() {
    const trip=ui.editingTripId?state.trips.find(t=>t.id===ui.editingTripId):null;
    const members=trip?trip.members.map(m=>m.name):["Tiffany"];
    return modalWrap(trip?"編輯旅程":"建立旅程",`
      <form id="tripForm" class="form-card form-grid">
        <div class="field"><label>旅程名稱</label><input name="title" required value="${esc(trip?.title||"")}"></div>
        <div class="field">
          <label>旅程小句子（可留空）</label>
          <input name="tagline" maxlength="40" value="${esc(trip?.tagline||"")}" placeholder="例如：楓葉正紅，慢慢走。">
        </div>
        <div class="inline-grid">
          <div class="field"><label>開始日期</label><input type="date" name="startDate" required value="${trip?.startDate||""}"></div>
          <div class="field"><label>結束日期</label><input type="date" name="endDate" required value="${trip?.endDate||""}"></div>
        </div>
        <div class="inline-grid">
          <div class="field"><label>預設幣別</label><select name="currency">${Object.entries(currencyMap).map(([k,v])=>`<option value="${k}" ${trip?.currency===k?"selected":""}>${v.name} ${k}</option>`).join("")}</select></div>
          <div class="field"><label>匯率（1 原幣 = TWD）</label><input type="number" step="0.0001" min="0" name="rate" required value="${trip?.rate??0.22}"></div>
        </div>
        <div class="field">
          <label>初始金額（原幣）</label>
          <input type="number" step="0.01" min="0" name="initialAmount" value="${trip?.initialAmount??0}" placeholder="例如：50000">
          <div class="muted small" style="margin-top:6px">只用於計算此趟旅程餘額，不納入支出統計或分帳。</div>
        </div>
        <div class="field"><label>封面圖片網址（可留空）</label><input name="cover" value="${esc(trip?.cover||"")}" placeholder="https://..."></div>
        <div class="field">
          <label>旅伴</label>
          <div class="member-input-row"><input id="memberInput" placeholder="輸入姓名"><button type="button" class="secondary-btn" data-action="add-member">加入</button></div>
          <div id="memberList" class="member-list">${members.map((n,i)=>`<span class="member-tag" data-name="${esc(n)}">${esc(n)}<button type="button" data-action="remove-member" data-index="${i}">×</button></span>`).join("")}</div>
        </div>
        <button class="primary-btn" type="submit">${trip?"儲存修改":"建立旅程"}</button>
      </form>`);
  }

  function renderExpenseFormModal() {
    const trip=currentTrip();
    const exp=ui.editingExpenseId?trip.expenses.find(e=>e.id===ui.editingExpenseId):null;
    const today=new Date().toISOString().slice(0,10);
    const splitIds=exp?.splitMemberIds||trip.members.map(m=>m.id);
    return modalWrap(exp?"編輯支出":"新增支出",`
      <form id="expenseForm" class="form-card form-grid">
        <div class="inline-grid">
          <div class="field"><label>日期</label><input type="date" name="date" required value="${exp?.date||today}"></div>
          <div class="field"><label>類別</label><select name="category">${allCategories(trip).map(c=>`<option value="${c.id}" ${exp?.category===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>消費內容</label><input name="title" required value="${esc(exp?.title||"")}" placeholder="例如：一蘭拉麵"></div>
        <div class="inline-grid">
          <div class="field"><label>原幣金額</label><input type="number" name="amount" min="0" step="0.01" required value="${exp?.amount??""}" placeholder="0"></div>
          <div class="field"><label>幣別</label><select name="currency">${Object.entries(currencyMap).map(([k,v])=>`<option value="${k}" ${(exp?.currency||trip.currency)===k?"selected":""}>${v.name} ${k}</option>`).join("")}</select></div>
        </div>
        <div id="convertedPreview" class="card small">輸入金額後，這裡會顯示台幣換算。</div>
        <div class="inline-grid">
          <div class="field"><label>付款方式</label><select name="paymentMethod"><option ${exp?.paymentMethod==="現金"?"selected":""}>現金</option><option ${exp?.paymentMethod==="信用卡"?"selected":""}>信用卡</option></select></div>
          <div class="field"><label>付款人</label><select name="payerId">${trip.members.map(m=>`<option value="${m.id}" ${exp?.payerId===m.id?"selected":""}>${esc(m.name)}</option>`).join("")}</select></div>
        </div>
        <div class="toggle-row"><div><strong>需要分帳</strong><div class="muted small">開啟後選擇參與成員</div></div><label class="switch"><input id="splitToggle" type="checkbox" ${exp?.split?"checked":""}><span></span></label></div>
        <div id="splitMembers" class="${exp?.split?"":"hidden"}">
          <div class="field"><label>分帳成員</label><div class="chips">${trip.members.map(m=>`<button type="button" class="chip ${splitIds.includes(m.id)?"selected":""}" data-action="toggle-split-member" data-id="${m.id}">${esc(m.name)}</button>`).join("")}</div></div>
        </div>
        <div class="field"><label>備註</label><textarea name="note" placeholder="例如：排隊 30 分鐘、值得再訪">${esc(exp?.note||"")}</textarea></div>
        <button class="primary-btn" type="submit">${exp?"儲存修改":"新增支出"}</button>
      </form>`);
  }

  function renderExpenseDetailModal() {
    const trip=currentTrip(), exp=trip.expenses.find(e=>e.id===ui.editingExpenseId);
    if(!exp) return "";
    const money=dualMoney(trip,exp), cat=catOf(trip,exp.category), payer=memberOf(trip,exp.payerId);
    return modalWrap("支出明細",`
      <div class="card">
        <div class="detail-category-icon">${categoryIcon(cat)}</div>
        <h2 style="margin:8px 0">${esc(exp.title)}</h2>
        <div style="font-size:26px;font-weight:700">${money.original}</div>
        <div class="muted">≈ ${money.twd}</div>
        <div class="breakdown-list" style="margin-top:14px">
          <div class="breakdown-row"><strong>日期</strong><span>${fmtFullDate(exp.date)}</span></div>
          <div class="breakdown-row"><strong>付款人</strong><span>${esc(payer?.name||"—")}</span></div>
          <div class="breakdown-row"><strong>付款方式</strong><span>${esc(exp.paymentMethod)}</span></div>
          <div class="breakdown-row"><strong>分帳</strong><span>${exp.split?exp.splitMemberIds.map(id=>memberOf(trip,id)?.name).filter(Boolean).join("、"):"不分帳"}</span></div>
          ${exp.note?`<div class="breakdown-row"><strong>備註</strong><span>${esc(exp.note)}</span></div>`:""}
        </div>
      </div>
      <div class="action-row three">
        <button class="secondary-btn" data-action="duplicate-expense">複製</button>
        <button class="secondary-btn" data-action="edit-expense">編輯</button>
        <button class="danger-btn" data-action="delete-expense">刪除</button>
      </div>`);
  }

  function confirmModal(title,text,action) {
    return modalWrap(title,`<div class="confirm-box"><p>${text}</p><div class="action-row"><button class="secondary-btn" data-action="close-modal">取消</button><button class="danger-btn" data-action="${action}">確認刪除</button></div></div>`);
  }

  function bind() {
    document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",handleAction));
    document.getElementById("tripForm")?.addEventListener("submit",submitTrip);
    document.getElementById("expenseForm")?.addEventListener("submit",submitExpense);
    document.querySelector("#expenseForm [name=amount]")?.addEventListener("input",updatePreview);
    document.querySelector("#expenseForm [name=currency]")?.addEventListener("change",updatePreview);
    document.getElementById("splitToggle")?.addEventListener("change",e=>document.getElementById("splitMembers").classList.toggle("hidden",!e.target.checked));
    const backupInput=document.getElementById("backupFileInput");
    if(backupInput && !backupInput.dataset.bound){
      backupInput.dataset.bound="1";
      backupInput.addEventListener("change",e=>importFullBackup(e.target.files?.[0]));
    }
    updatePreview();
  }

  function handleAction(e) {
    const el=e.currentTarget, action=el.dataset.action;
    if(action==="new-trip"){ui.modal="trip-form";ui.editingTripId=null;render();}
    if(action==="open-trip"){ui.view="trip";ui.tripId=el.dataset.id;ui.tripTab="home";ui.displayCurrency="TWD";render();}
    if(action==="back-shelf"){ui.view="shelf";ui.tripId=null;ui.modal=null;render();}
    if(action==="tab"){ui.tripTab=el.dataset.tab;render();}
    if(action==="stats-tab"){ui.statsTab=el.dataset.tab;render();}
    if(action==="currency-switch"){ui.displayCurrency=el.dataset.currency;render();}
    if(action==="new-expense"){ui.modal="expense-form";ui.editingExpenseId=null;render();}
    if(action==="expense-detail"){ui.editingExpenseId=el.dataset.id;ui.modal="expense-detail";render();}
    if(action==="edit-expense"){ui.modal="expense-form";render();}
    if(action==="duplicate-expense"){
      const trip=currentTrip(), source=trip.expenses.find(x=>x.id===ui.editingExpenseId);
      if(source){trip.expenses.push({...source,id:crypto.randomUUID(),title:source.title+"（複製）",createdAt:Date.now()});saveState();ui.modal=null;render();toast("已複製支出");}
    }
    if(action==="delete-expense"){ui.modal="confirm-delete-expense";render();}
    if(action==="confirm-delete-expense"){
      const trip=currentTrip();trip.expenses=trip.expenses.filter(e=>e.id!==ui.editingExpenseId);saveState();ui.modal=null;ui.editingExpenseId=null;render();toast("已刪除支出");
    }
    if(action==="edit-trip"){ui.editingTripId=ui.tripId;ui.modal="trip-form";render();}
    if(action==="delete-trip"){ui.modal="confirm-delete-trip";render();}
    if(action==="confirm-delete-trip"){
      state.trips=state.trips.filter(t=>t.id!==ui.tripId);saveState();ui.view="shelf";ui.tripId=null;ui.modal=null;render();toast("已刪除旅程");
    }
    if(action==="close-modal"||action==="modal-backdrop"){ui.modal=null;render();}
    if(action==="add-member"){addMemberTag();}
    if(action==="remove-member"){el.closest(".member-tag")?.remove();}
    if(action==="toggle-split-member"){el.classList.toggle("selected");}
    if(action==="add-category"){
      const trip=currentTrip(), input=document.getElementById("customCategoryName");
      const name=input?.value.trim();
      if(!name){toast("請輸入類別名稱");return;}
      if(allCategories(trip).some(c=>c.name===name)){toast("已有相同類別");return;}
      trip.customCategories.push({id:`custom-${crypto.randomUUID()}`,name,icon:"tag"});
      saveState();render();toast("已新增類別");
    }
    if(action==="delete-category"){
      const trip=currentTrip(), id=el.dataset.id;
      if(trip.expenses.some(e=>e.category===id)){toast("此類別已有支出，請先修改支出類別");return;}
      trip.customCategories=trip.customCategories.filter(c=>c.id!==id);
      saveState();render();toast("已刪除類別");
    }
    if(action==="export-backup"){exportFullBackup();}
    if(action==="import-backup"){document.getElementById("backupFileInput")?.click();}
    if(action==="export-pdf"){exportTripPDF(currentTrip());}
    if(action==="export-html"){exportTripHTML(currentTrip());}
    if(action==="export-csv"){exportCSV(currentTrip());}
  }

  function addMemberTag(){
    const input=document.getElementById("memberInput"),name=input.value.trim();
    if(!name)return;
    const list=document.getElementById("memberList");
    const tag=document.createElement("span");
    tag.className="member-tag";tag.dataset.name=name;
    tag.innerHTML=`${esc(name)}<button type="button" data-action="remove-member">×</button>`;
    list.appendChild(tag);input.value="";
    tag.querySelector("button").addEventListener("click",()=>tag.remove());
  }

  function submitTrip(e){
    e.preventDefault();
    const fd=new FormData(e.target);
    const memberNames=[...document.querySelectorAll("#memberList .member-tag")].map(x=>x.dataset.name).filter(Boolean);
    if(!memberNames.length){toast("請至少加入一位成員");return;}
    if(fd.get("endDate")<fd.get("startDate")){toast("結束日期不可早於開始日期");return;}
    if(ui.editingTripId){
      const t=state.trips.find(x=>x.id===ui.editingTripId);
      const oldByName=Object.fromEntries(t.members.map(m=>[m.name,m]));
      t.title=fd.get("title").trim();t.tagline=fd.get("tagline").trim();t.startDate=fd.get("startDate");t.endDate=fd.get("endDate");t.currency=fd.get("currency");t.rate=Number(fd.get("rate"));t.initialAmount=Number(fd.get("initialAmount")||0);t.cover=fd.get("cover").trim();
      t.members=memberNames.map(n=>oldByName[n]||{id:crypto.randomUUID(),name:n});
    }else{
      state.trips.push({id:crypto.randomUUID(),title:fd.get("title").trim(),tagline:fd.get("tagline").trim(),startDate:fd.get("startDate"),endDate:fd.get("endDate"),currency:fd.get("currency"),rate:Number(fd.get("rate")),initialAmount:Number(fd.get("initialAmount")||0),cover:fd.get("cover").trim(),members:memberNames.map(n=>({id:crypto.randomUUID(),name:n})),customCategories:[],expenses:[],createdAt:Date.now()});
    }
    saveState();ui.modal=null;ui.editingTripId=null;render();toast("旅程已儲存");
  }

  function updatePreview(){
    const form=document.getElementById("expenseForm");if(!form)return;
    const amount=Number(form.elements.amount?.value||0),currency=form.elements.currency?.value||currentTrip().currency;
    const exp={amount,currency};const twd=convertToTWD(currentTrip(),exp);
    const el=document.getElementById("convertedPreview");
    if(el)el.textContent=amount?`${formatMoney(amount,currency)} ≈ ${formatMoney(Math.round(twd),"TWD")}`:"輸入金額後，這裡會顯示台幣換算。";
  }

  function submitExpense(e){
    e.preventDefault();
    const trip=currentTrip(),fd=new FormData(e.target);
    const split=document.getElementById("splitToggle").checked;
    const splitIds=[...document.querySelectorAll("#splitMembers .chip.selected")].map(x=>x.dataset.id);
    if(split&&!splitIds.length){toast("請至少選一位分帳成員");return;}
    const data={date:fd.get("date"),category:fd.get("category"),title:fd.get("title").trim(),amount:Number(fd.get("amount")),currency:fd.get("currency"),paymentMethod:fd.get("paymentMethod"),payerId:fd.get("payerId"),split,splitMemberIds:split?splitIds:[],note:fd.get("note").trim()};
    if(ui.editingExpenseId){
      const exp=trip.expenses.find(x=>x.id===ui.editingExpenseId);Object.assign(exp,data);
    }else trip.expenses.push({id:crypto.randomUUID(),...data,createdAt:Date.now()});
    saveState();ui.modal=null;ui.editingExpenseId=null;render();toast("支出已儲存");
  }

  function exportCSV(trip){
    const headers=["日期","類別","消費內容","原幣金額","幣別","台幣金額","付款人","付款方式","是否分帳","分帳成員","備註"];
    const rows=trip.expenses.map(e=>[
      e.date,catOf(trip,e.category).name,e.title,e.amount,e.currency,Math.round(convertToTWD(trip,e)),
      memberOf(trip,e.payerId)?.name||"",e.paymentMethod,e.split?"是":"否",
      e.splitMemberIds.map(id=>memberOf(trip,id)?.name).filter(Boolean).join("、"),e.note||""
    ]);
    const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    downloadBlob("\ufeff"+csv,"text/csv;charset=utf-8",`${safeFileName(trip.title)}-支出.csv`);
  }

  render();
})();
