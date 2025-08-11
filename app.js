(function(){
  // Storage keys
  const KEY_TRADES = 'ott_trades_v1';
  const KEY_SETTINGS = 'ott_settings_v1';

  // Helpers
  const $ = sel => document.querySelector(sel);
  const fmt = (n) => (n===null || n===undefined || isNaN(n)) ? '' :
    Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
  const sum = arr => arr.reduce((a,b)=>a+b,0);
  const todayStr = () => new Date().toISOString().slice(0,10);
  const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
  const WEEK_MS = 7*24*60*60*1000, MONTH_MS = 30*24*60*60*1000;

  // State
  let trades = loadTrades();
  let settings = loadSettings();

  // Views nav
  const tabs = $('#tabs').querySelectorAll('button');
  tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabs.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      $('#view-'+view).classList.add('active');
      if(view==='dashboard'){ renderKPI(); drawEquity(); }
      if(view==='trades'){ renderTable(); renderKPI(); }
      if(view==='add'){ preview(); }
      if(view==='settings'){ fillSettings(); }
    });
  });

  // Elements
  const kpis = $('#kpis');
  const rows = $('#rows');
  const equityCanvas = $('#equityCanvas');
  const equityRange = $('#equityRange');

  // Add Trade form
  const date = $('#date'), symbol=$('#symbol'), direction=$('#direction'), strike=$('#strike');
  const entry=$('#entry'), stop=$('#stop'), target=$('#target'), exit=$('#exit');
  const lots=$('#lots'), lotSize=$('#lotSize'), feeUnit=$('#feeUnit'), feeTrade=$('#feeTrade'), notes=$('#notes');
  const addBtn=$('#addBtn'), resetForm=$('#resetForm'), liveCalc=$('#liveCalc');

  // Init defaults
  function applyDefaults(){
    date.value = todayStr();
    lotSize.value = settings.lotSize || 15;
    feeUnit.value = settings.feeUnit || 0;
    feeTrade.value = settings.feeTrade || 0;
  }
  applyDefaults();

  // Live calc preview
  function preview(){
    const dir = direction.value;
    const e = parseFloat(entry.value);
    const s = parseFloat(stop.value);
    const t = parseFloat(target.value);
    const L = parseInt(lots.value||0);
    const Z = parseInt(lotSize.value||0);
    const q = (L>0 && Z>0)? L*Z : 0;
    const fu = parseFloat(feeUnit.value||0), ft = parseFloat(feeTrade.value||0);
    let html='';
    if([e,s,t].every(v=>!isNaN(v)) && q>0){
      const riskPer = dir==='Long' ? (e - s) : (s - e);
      const rewardPer = dir==='Long' ? (t - e) : (e - t);
      const rr = riskPer>0 ? rewardPer/riskPer : null;
      const fees = fu*q + ft;
      html = `
        <div class="row-3">
          <div class="kpi-box"><div class="kpi-label">Qty</div><div class="kpi-value">${fmt(q)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Risk per unit</div><div class="kpi-value">${fmt(riskPer)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Reward per unit</div><div class="kpi-value">${fmt(rewardPer)}</div></div>
        </div>
        <div class="row-3">
          <div class="kpi-box"><div class="kpi-label">Potential risk</div><div class="kpi-value">${fmt(riskPer*q)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Potential reward</div><div class="kpi-value">${fmt(rewardPer*q)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Estimated fees</div><div class="kpi-value">${fmt(fees)}</div></div>
        </div>
        <div class="hint">R:R = ${rr? rr.toFixed(2): '—'} (positive risk required)</div>
      `;
    }else{
      html = `<div class="hint">Entry, Stop, Target + Lots/Lot size bharo for live R:R.</div>`;
    }
    liveCalc.innerHTML = html;
  }
  ['input','change'].forEach(evt=>{
    [direction, entry, stop, target, lots, lotSize, feeUnit, feeTrade].forEach(el=>el.addEventListener(evt, preview));
  });
  preview();

  // Compute derived
  function computeDerived(t){
    const q = t.lots*t.lotSize;
    const riskPer = t.direction==='Long' ? (t.entry - t.stop) : (t.stop - t.entry);
    const rewardPer = t.direction==='Long' ? (t.target - t.entry) : (t.entry - t.target);
    const rr = riskPer>0 ? (rewardPer/riskPer) : null;
    const fees = t.feeUnit*q + t.feeTrade;
    let pnl = null;
    if (typeof t.exit === 'number' && !isNaN(t.exit)){
      const raw = t.direction==='Long' ? ((t.exit - t.entry)*q) : ((t.entry - t.exit)*q);
      pnl = raw - fees;
    }
    return {q,riskPer,rewardPer,rr,fees,pnl};
  }

  // KPI
  function renderKPI(){
    const closed = trades.filter(t=>t.exit!=null).map(t=>({t, d:computeDerived(t)}));
    const pnls = closed.map(o=>o.d.pnl||0);
    const net = sum(pnls);
    const wins = pnls.filter(x=>x>0);
    const losses = pnls.filter(x=>x<0);
    const winRate = pnls.length ? (wins.length/pnls.length*100) : 0;

    const Rs = trades.map(t=>{
      const d = computeDerived(t);
      if(d.riskPer<=0) return null;
      const actualPer = (t.exit!=null) ? ((t.direction==='Long' ? (t.exit - t.entry) : (t.entry - t.exit))) : null;
      return (actualPer!=null) ? (actualPer / d.riskPer) : null;
    }).filter(v=>v!=null);
    const avgR = Rs.length ? (sum(Rs)/Rs.length) : 0;

    const avgWin = wins.length? (sum(wins)/wins.length):0;
    const avgLoss = losses.length? (sum(losses)/losses.length):0;
    const expectancy = (winRate/100)*(avgWin) + ((1-winRate/100)*(avgLoss));

    const best = pnls.length? Math.max(...pnls):0;
    const worst = pnls.length? Math.min(...pnls):0;

    kpis.innerHTML = [
      kpiBox('Net PnL', currency(net)),
      kpiBox('Win rate', `${winRate.toFixed(0)}%`),
      kpiBox('Avg R', avgR.toFixed(2)),
      kpiBox('Expectancy/trade', currency(expectancy)),
      kpiBox('Best / Worst', `${currency(best)} / ${currency(worst)}`)
    ].join('');
  }
  function kpiBox(label, value){
    return `<div class="kpi-box"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`;
  }
  function currency(n){
    const sym = settings.currency || '₹';
    if(n===null || n===undefined || isNaN(n)) return '';
    const sign = n>=0 ? '' : '-';
    return `${sign}${sym}${fmt(Math.abs(n))}`;
  }

  // Table render
  function renderTable(range='all'){
    const now = new Date();
    let filtered = [...trades];
    if(range==='today'){
      filtered = trades.filter(t=>t.date===todayStr());
    } else if(range==='week'){
      const start = new Date(now - WEEK_MS);
      filtered = trades.filter(t=>new Date(t.date)>=start && new Date(t.date)<=now);
    }
    // Recent first
    filtered.sort((a,b)=>(new Date(b.date)) - (new Date(a.date)) || (b.createdAt||'').localeCompare(a.createdAt||''));
    rows.innerHTML = '';
    const frag = document.createDocumentFragment();
    filtered.forEach(t=>{
      const d = computeDerived(t);
      const tr = document.createElement('tr');
      const rrBadge = d.rr!=null ? `<span class="badge ${d.rr>=2?'ok':(d.rr>=1?'warn':'err')}">${d.rr.toFixed(2)}</span>` : '<span class="badge">—</span>';
      const pnlCell = d.pnl==null ? '<span class="muted">—</span>' :
        `<span class="${d.pnl>=0?'badge ok':'badge err'}">${currency(d.pnl)}</span>`;
      tr.innerHTML = `
        <td class="nowrap">${t.date}</td>
        <td>${escapeHTML(t.symbol||'-')}</td>
        <td>${t.direction}</td>
        <td class="right">${fmt(d.q)}</td>
        <td class="right">${fmt(t.entry)}</td>
        <td class="right">${fmt(t.stop)}</td>
        <td class="right">${fmt(t.target)}</td>
        <td class="right">${t.exit!=null?fmt(t.exit):'<span class="muted">—</span>'}</td>
        <td class="right">${fmt(d.riskPer)}</td>
        <td class="right">${rrBadge}</td>
        <td class="right">${pnlCell}</td>
        <td>${t.adherence?'<span class="badge ok">Yes</span>':'<span class="badge">No</span>'}</td>
        <td>
          <div class="toolbar">
            <button class="btn" data-act="close" data-id="${t.id}">Close</button>
            <button class="btn" data-act="edit" data-id="${t.id}">Edit</button>
            <button class="btn" data-act="adh" data-id="${t.id}">${t.adherence?'Unmark':'Adhere'}</button>
            <button class="btn" data-act="dup" data-id="${t.id}">Duplicate</button>
            <button class="btn warn" data-act="del" data-id="${t.id}">Delete</button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });
    rows.appendChild(frag);
  }
  function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // Actions
  $('#tradeTable').addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const idx = trades.findIndex(x=>x.id===id);
    if(idx<0) return;
    const t = trades[idx];

    if(act==='close'){
      const val = prompt('Exit premium?', t.exit!=null? t.exit : '');
      if(val===null) return;
      const num = parseFloat(val);
      if(isNaN(num)){ alert('Invalid number'); return; }
      t.exit = num;
    }
    if(act==='edit'){
      const fields = [
        ['Symbol', 'symbol'],
        ['Direction (Long/Short)', 'direction'],
        ['Entry', 'entry'],
        ['Stop', 'stop'],
        ['Target', 'target'],
        ['Lots', 'lots'],
        ['Lot size', 'lotSize'],
        ['Fee per unit', 'feeUnit'],
        ['Fee per trade', 'feeTrade'],
        ['Exit (optional)', 'exit'],
        ['Notes', 'notes']
      ];
      for(const [label,key] of fields){
        let curr = t[key]==null? '' : t[key];
        const val = prompt(label, curr);
        if(val===null) continue;
        if(['entry','stop','target','lots','lotSize','feeUnit','feeTrade','exit'].includes(key)){
          const num = val==='' ? null : Number(val);
          if(val!=='' && isNaN(num)){ alert(`Invalid ${label}`); continue; }
          t[key] = (key==='exit') ? (num==null? null : num) : (num==null? 0 : num);
        }else if(key==='direction'){
          t[key] = (val==='Short')? 'Short':'Long';
        }else{
          t[key] = val;
        }
      }
    }
    if(act==='adh'){ t.adherence = !t.adherence; }
    if(act==='dup'){
      const clone = {...t, id:uid(), exit:null, date: todayStr(), createdAt:new Date().toISOString()};
      trades.unshift(clone);
    }
    if(act==='del'){
      if(!confirm('Delete this trade?')) return;
      trades.splice(idx,1);
    }
    saveTrades(trades); renderTable(currentRange); renderKPI(); drawEquity();
  });

  // Filters
  let currentRange = 'all';
  $('#filterToday').addEventListener('click', ()=>{ currentRange='today'; renderTable(currentRange); });
  $('#filterWeek').addEventListener('click', ()=>{ currentRange='week'; renderTable(currentRange); });
  $('#filterAll').addEventListener('click', ()=>{ currentRange='all'; renderTable(currentRange); });

  // Add trade submit
  $('#tradeForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const t = {
      id: uid(),
      date: date.value || todayStr(),
      symbol: (symbol.value||'').trim(),
      direction: direction.value,
      strike: parseFloat(strike.value)||null,
      entry: parseFloat(entry.value),
      stop: parseFloat(stop.value),
      target: parseFloat(target.value),
      lots: parseInt(lots.value)||0,
      lotSize: parseInt(lotSize.value)||0,
      feeUnit: parseFloat(feeUnit.value)||0,
      feeTrade: parseFloat(feeTrade.value)||0,
      exit: exit.value!=='' ? parseFloat(exit.value) : null,
      notes: (notes.value||'').trim(),
      adherence: false,
      createdAt: new Date().toISOString()
    };
    if([t.entry,t.stop,t.target].some(v=>isNaN(v))){
      alert('Entry, Stop, Target are required.'); return;
    }
    if(!(t.lots>0 && t.lotSize>0)){
      alert('Lots and Lot size must be > 0.'); return;
    }
    trades.unshift(t);
    saveTrades(trades);
    clearForm();
    renderTable(currentRange);
    renderKPI();
    drawEquity();
    alert('Trade added ✅');
  });

  function clearForm(){
    symbol.value=''; strike.value='';
    entry.value=''; stop.value=''; target.value='';
    exit.value=''; notes.value='';
    lots.value='1'; lotSize.value= settings.lotSize || 15; feeUnit.value= settings.feeUnit || 0; feeTrade.value= settings.feeTrade || 0;
    date.value=todayStr();
    preview();
  }
  resetForm.addEventListener('click', clearForm);

  // Export/Import
  function download(filename, text, type='text/plain'){
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  }
  function toCSV(arr){
    const cols = ['date','symbol','direction','strike','entry','stop','target','lots','lotSize','feeUnit','feeTrade','exit','notes','adherence'];
    const lines = [cols.join(',')];
    arr.forEach(t=>{
      const row = cols.map(k=>{
        let v = t[k];
        if(typeof v==='string'){ v = '"'+v.replace(/"/g,'""')+'"'; }
        return (v==null? '' : v);
      }).join(',');
      lines.push(row);
    });
    return lines.join('\n');
  }
  function parseCSV(text){
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines.shift().split(',');
    return lines.map(line=>{
      const vals = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v=>v.replace(/^"|"$/g,'').replace(/""/g,'"'));
      const o={};
      header.forEach((h,i)=>o[h]=vals[i]);
      ['strike','entry','stop','target','lots','lotSize','feeUnit','feeTrade','exit'].forEach(k=>{
        if(o[k]!=='' && o[k]!=null) o[k] = Number(o[k]); else o[k] = (k==='exit'? null : 0);
      });
      o.adherence = (o.adherence==='true'||o.adherence===true);
      o.id = uid(); o.createdAt = new Date().toISOString();
      if(!o.date) o.date = todayStr();
      return o;
    });
  }

  function doExportJSON(){ download('trades.json', JSON.stringify(trades, null, 2), 'application/json'); }
  function doExportCSV(){ download('trades.csv', toCSV(trades), 'text/csv'); }
  $('#exportJSON').addEventListener('click', doExportJSON);
  $('#exportCSV').addEventListener('click', doExportCSV);
  $('#exportJSON2').addEventListener('click', doExportJSON);
  $('#exportCSV2').addEventListener('click', doExportCSV);

  function handleImport(fileInput){
    const file = fileInput.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        let arr;
        if(file.name.endsWith('.json')){
          arr = JSON.parse(reader.result);
          if(!Array.isArray(arr)) throw new Error('Invalid JSON array');
        }else{
          arr = parseCSV(reader.result);
        }
        trades = [...arr, ...trades];
        saveTrades(trades);
        renderTable(currentRange); renderKPI(); drawEquity();
        alert('Imported successfully');
      }catch(err){
        alert('Import failed: '+err.message);
      }
      fileInput.value='';
    };
    reader.readAsText(file);
  }
  $('#importFile').addEventListener('change', (e)=>handleImport(e.target));
  $('#importFile2').addEventListener('change', (e)=>handleImport(e.target));

  // Equity curve
  equityRange.addEventListener('change', drawEquity);
  function drawEquity(){
    const ctx = equityCanvas.getContext('2d');
    const range = equityRange.value;
    const now = new Date();
    let closed = trades.filter(t=>t.exit!=null);
    if(range==='week'){
      const start = new Date(now - WEEK_MS);
      closed = closed.filter(t=>new Date(t.date)>=start && new Date(t.date)<=now);
    } else if(range==='month'){
      const start = new Date(now - MONTH_MS);
      closed = closed.filter(t=>new Date(t.date)>=start && new Date(t.date)<=now);
    }
    closed.sort((a,b)=>new Date(a.date)-new Date(b.date));

    const points = [];
    let cum = 0;
    closed.forEach(t=>{
      const pnl = computeDerived(t).pnl || 0;
      cum += pnl;
      points.push({x:new Date(t.date).getTime(), y:cum});
    });

    // Canvas clear
    const W = equityCanvas.width = equityCanvas.clientWidth;
    const H = equityCanvas.height = equityCanvas.clientHeight;
    ctx.clearRect(0,0,W,H);

    // Empty state
    if(points.length===0){
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px system-ui';
      ctx.fillText('No closed trades to plot.', 10, 20);
      return;
    }

    // Scales
    const pad = 24;
    const xs = points.map(p=>p.x); const ys = points.map(p=>p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeY = (maxY-minY)||1;
    const rangeX = (maxX-minX)||1;

    const xMap = x => pad + (x-minX)/rangeX * (W-2*pad);
    const yMap = y => H-pad - (y-minY)/rangeY * (H-2*pad);

    // Grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0;i<=4;i++){
      const y = pad + i*(H-2*pad)/4;
      ctx.moveTo(pad, y); ctx.lineTo(W-pad, y);
    }
    ctx.stroke();

    // Zero line
    const zeroY = yMap(0);
    if(zeroY>=pad && zeroY<=H-pad){
      ctx.strokeStyle = '#64748b';
      ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(pad, zeroY); ctx.lineTo(W-pad, zeroY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Line
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p,i)=>{
      const x = xMap(p.x), y = yMap(p.y);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // Last point dot
    const last = points[points.length-1];
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(xMap(last.x), yMap(last.y), 3, 0, Math.PI*2); ctx.fill();
  }

  // Settings
  const s_lotSize = $('#s_lotSize'), s_feeUnit=$('#s_feeUnit'), s_feeTrade=$('#s_feeTrade'), s_currency=$('#s_currency');
  $('#saveSettings').addEventListener('click', ()=>{
    settings.lotSize = parseInt(s_lotSize.value)||settings.lotSize;
    settings.feeUnit = parseFloat(s_feeUnit.value)||0;
    settings.feeTrade = parseFloat(s_feeTrade.value)||0;
    settings.currency = s_currency.value || settings.currency || '₹';
    saveSettings(settings);
    applyDefaults();
    alert('Settings saved ✅');
  });
  function fillSettings(){
    s_lotSize.value = settings.lotSize || 15;
    s_feeUnit.value = settings.feeUnit || 0;
    s_feeTrade.value = settings.feeTrade || 0;
    s_currency.value = settings.currency || '₹';
  }

  // Persistence
  function loadTrades(){ try{ return JSON.parse(localStorage.getItem(KEY_TRADES)||'[]'); }catch{ return []; } }
  function saveTrades(arr){ trades = arr; localStorage.setItem(KEY_TRADES, JSON.stringify(arr)); }
  function loadSettings(){ try{ return JSON.parse(localStorage.getItem(KEY_SETTINGS)||'{}'); }catch{ return {}; } }
  function saveSettings(obj){ localStorage.setItem(KEY_SETTINGS, JSON.stringify(obj)); }

  // Initial render
  renderKPI(); renderTable(); drawEquity();

})();
