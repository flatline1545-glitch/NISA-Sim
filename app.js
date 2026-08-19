let currentTab = 'growth';
let drawdownMode = 'fixed';
let displayView = 'line';
let currentSlot = 1;
let chartInstance = null;
let lastGrowthTotal = 40000000;
let currentDiagTitle = '';
let currentBP = 0;

let radarStats = [50, 50, 50, 50, 50];
let latestTableData = [];

// 歴史的暴落ストレステスト
let currentStress = 'none';
const STRESS_CONFIG = {
  none:   { drop: 0.00, label: '通常運用（暴落なし）', short: '通常' },
  lehman: { drop: 0.50, label: 'リーマン級ショック（約-50%）', short: 'リーマン級' },
  corona: { drop: 0.35, label: 'コロナショック（約-35%）', short: 'コロナ級' },
  dotcom: { drop: 0.45, label: 'ドットコムバブル崩壊（約-45%）', short: 'ドットコム級' }
};

function fmtYen(num) {
  return '¥' + Math.round(num).toLocaleString('ja-JP');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

/* シナリオ一発適用（ボタンハイライト連動 ＆ 一括更新） */
function applyScenario(type) {
  ['standard', 'sp500_growth', 'fast_rta', 'crash_survival', 'fire_exit'].forEach(t => {
    const btn = document.getElementById('scBtn_' + t);
    if (btn) btn.classList.toggle('active', t === type);
  });

  if (type === 'standard') {
    switchTab('growth', false);
    setPresetValues({ monthly: 50000, initial: 0, returnRate: 5.0, horizon: 30, stress: 'none' });
    showToast('🌱 王道オルカン積立シナリオを適用しました');
  } else if (type === 'sp500_growth') {
    switchTab('growth', false);
    setPresetValues({ monthly: 100000, initial: 1000000, returnRate: 7.0, horizon: 25, stress: 'none' });
    showToast('🚀 S&P500積極形成シナリオを適用しました');
  } else if (type === 'fast_rta') {
    switchTab('growth', false);
    setPresetValues({ monthly: 300000, initial: 0, returnRate: 7.0, horizon: 20, stress: 'none' });
    showToast('🏎️ 最短5年カンストRTAシナリオを適用しました');
  } else if (type === 'crash_survival') {
    switchTab('growth', false);
    setPresetValues({ monthly: 50000, initial: 1000000, returnRate: 7.0, horizon: 20, stress: 'lehman' });
    showToast('💥 リーマン級暴落耐久テストを適用しました');
  } else if (type === 'fire_exit') {
    switchTab('drawdown', false);
    switchDrawdownMode('fixed', false);
    document.getElementById('numDrawStart').value = 50000000;
    document.getElementById('rangeDrawStart').value = 50000000;
    const monthlyAmt = Math.round((50000000 * 0.04) / 12);
    document.getElementById('numDrawMonthly').value = monthlyAmt;
    document.getElementById('rangeDrawMonthly').value = Math.min(500000, monthlyAmt);
    document.getElementById('numDrawReturn').value = 5.0;
    document.getElementById('rangeDrawReturn').value = 5.0;
    saveAndRun();
    showToast('🏝️ 4%サイドFIRE取り崩しシナリオを適用しました');
  }
}

/* 複数値を一括セットして1回だけ再描画 */
function setPresetValues(obj) {
  if (obj.monthly !== undefined) {
    document.getElementById('numMonthly').value = obj.monthly;
    document.getElementById('rangeMonthly').value = obj.monthly;
  }
  if (obj.initial !== undefined) {
    document.getElementById('numInitial').value = obj.initial;
    document.getElementById('rangeInitial').value = obj.initial;
  }
  if (obj.returnRate !== undefined) {
    document.getElementById('numReturn').value = obj.returnRate;
    document.getElementById('rangeReturn').value = obj.returnRate;
  }
  if (obj.horizon !== undefined) {
    document.getElementById('numHorizon').value = obj.horizon;
    document.getElementById('rangeHorizon').value = obj.horizon;
  }
  if (obj.stress !== undefined) {
    setStress(obj.stress, false);
  }
  saveAndRun();
}

/* 📸 グラフ画像の強化エクスポート (カード風サマリーバナー＋ダークテーマ合成) */
function exportChartImage() {
  const chartCanvas = document.getElementById('simChart');
  if (!chartCanvas) {
    showToast('グラフが生成されていません');
    return;
  }

  const prevView = displayView;
  if (prevView !== 'line') {
    switchDisplayView('line');
  }

  setTimeout(() => {
    try {
      const outW = 1200;
      const outH = 780;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = outW;
      offCanvas.height = outH;
      const ctx = offCanvas.getContext('2d');

      // 1. 背景
      const bgGrad = ctx.createLinearGradient(0, 0, 0, outH);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, outW, outH);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, outW - 2, outH - 2);

      // 2. タイトル
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('新NISA 資産形成・戦闘力シミュレーション レポート', 36, 42);

      // 3. サマリーカード
      const cardX = 36, cardY = 58, cardW = outW - 72, cardH = 135;
      ctx.fillStyle = '#131c2e';
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5;
      roundRect(ctx, cardX, cardY, cardW, cardH, 10, true, true);

      const bp = document.getElementById('bpValue').innerText;
      const mainVal = document.getElementById('mainStatHeaderValue').innerText;
      const title = currentDiagTitle;

      ctx.fillStyle = '#c4b5fd';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('⚡ 投資戦闘力', cardX + 20, cardY + 28);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 24px "Courier New", monospace';
      ctx.fillText(bp + ' BP', cardX + 20, cardY + 58);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(currentTab === 'growth' ? '💰 最終資産総額' : '⏳ 資産寿命', cardX + 240, cardY + 28);
      ctx.fillStyle = '#60a5fa';
      ctx.font = '900 24px sans-serif';
      ctx.fillText(mainVal, cardX + 240, cardY + 58);

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(title, cardX + 20, cardY + 92);

      let cond1 = '', cond2 = '';
      if (currentTab === 'growth') {
        const m = parseInt(document.getElementById('numMonthly').value) || 0;
        const init = parseInt(document.getElementById('numInitial').value) || 0;
        const r = document.getElementById('numReturn').value;
        const y = document.getElementById('numHorizon').value;
        const stressLabel = STRESS_CONFIG[currentStress].short;
        cond1 = `【設定条件】 毎月積立: ¥${m.toLocaleString()}  /  初期投資: ¥${init.toLocaleString()}`;
        cond2 = `想定年利: ${r}%  /  運用期間: ${y}年  /  ストレステスト: ${stressLabel}`;
      } else {
        const start = parseInt(document.getElementById('numDrawStart').value) || 0;
        const r = document.getElementById('numDrawReturn').value;
        cond1 = `【設定条件】 開始資産: ¥${start.toLocaleString()}  /  想定利回り: ${r}%`;
        if (drawdownMode === 'fixed') {
          const dm = parseInt(document.getElementById('numDrawMonthly').value) || 0;
          cond2 = `取崩方式: 定額 (毎月 ¥${dm.toLocaleString()} / 年 ¥${(dm*12).toLocaleString()})`;
        } else {
          const dr = document.getElementById('numDrawRate').value;
          cond2 = `取崩方式: 定率 (年 ${dr}%)`;
        }
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px sans-serif';
      ctx.fillText(cond1, cardX + 540, cardY + 38);
      ctx.fillText(cond2, cardX + 540, cardY + 65);

      // 4. グラフ描画
      const graphX = 36, graphY = 208, graphW = outW - 72, graphH = 515;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      roundRect(ctx, graphX, graphY, graphW, graphH, 10, true, true);

      ctx.drawImage(chartCanvas, graphX + 10, graphY + 10, graphW - 20, graphH - 20);

      // 5. フッター
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      const nowStr = new Date().toLocaleString('ja-JP');
      ctx.fillText(`作成日時: ${nowStr}  |  新NISA 資産形成・戦闘力シミュレーター`, 40, outH - 18);

      const a = document.createElement('a');
      const filenamePrefix = currentTab === 'growth' ? '新NISA資産形成' : '新NISA出口戦略';
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = offCanvas.toDataURL('image/png', 1.0);
      a.download = `${filenamePrefix}_${dateStr}.png`;
      a.click();
      showToast('📸 高解像度レポート画像を保存しました！');

    } catch (e) {
      console.error(e);
      showToast('画像の生成に失敗しました');
    } finally {
      if (prevView !== 'line') {
        switchDisplayView(prevView);
      }
    }
  }, 100);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/* 📄 CSVレポートの出力（詳細メタデータ付き） */
function exportCsvReport() {
  if (!latestTableData || latestTableData.length === 0) {
    showToast('出力可能なデータがありません');
    return;
  }
  const lines = [];
  const nowStr = new Date().toLocaleString('ja-JP');
  const dateFileStr = new Date().toISOString().slice(0, 10);
  let filename = '';

  if (currentTab === 'growth') {
    const m = parseInt(document.getElementById('numMonthly').value) || 0;
    const init = parseInt(document.getElementById('numInitial').value) || 0;
    const r = document.getElementById('numReturn').value;
    const y = document.getElementById('numHorizon').value;
    const stress = STRESS_CONFIG[currentStress].label;
    const finalTot = document.getElementById('mainStatHeaderValue').innerText;
    const finalPr = document.getElementById('chipPrincipal').innerText;
    const finalGn = document.getElementById('chipGains').innerText;
    const finalTx = document.getElementById('chipTax').innerText;
    const bp = document.getElementById('bpValue').innerText;

    filename = `新NISA_月${Math.round(m/10000)}万_年${r}％_${y}年_${dateFileStr}.csv`;

    lines.push('# ==========================================');
    lines.push('# 新NISA 資産形成シミュレーション レポート');
    lines.push(`# 出力日時: ${nowStr}`);
    lines.push('# ------------------------------------------');
    lines.push('# ■ シミュレーション設定条件');
    lines.push(`# 毎月の積立額, ¥${m.toLocaleString()}`);
    lines.push(`# 初期投資額, ¥${init.toLocaleString()}`);
    lines.push(`# 想定年利回り, ${r}%`);
    lines.push(`# 運用期間, ${y}年`);
    lines.push(`# ストレステスト, ${stress}`);
    lines.push('# ------------------------------------------');
    lines.push('# ■ 試算結果サマリー');
    lines.push(`# 最終資産総額, ${finalTot}`);
    lines.push(`# 投資元本合計, ${finalPr}`);
    lines.push(`# 運用益(利益), ${finalGn}`);
    lines.push(`# 節税バリア効果, ${finalTx}`);
    lines.push(`# 投資戦闘力, ${bp} BP`);
    lines.push(`# 獲得称号, ${currentDiagTitle}`);
    lines.push('# ==========================================');
    lines.push('');
    lines.push('運用年数,投資元本(円),運用益(円),総資産額(円),課税口座手取り(円),非課税節税額(円)');

    latestTableData.forEach(row => {
      lines.push(`${row.year}年目,${row.principal},${row.gains},${row.balance},${row.taxableNet},${row.taxSaved}`);
    });

  } else {
    const start = parseInt(document.getElementById('numDrawStart').value) || 0;
    const r = document.getElementById('numDrawReturn').value;
    const life = document.getElementById('mainStatHeaderValue').innerText;
    const annualDraw = document.getElementById('chipDrawAnnual').innerText;
    const totalRec = document.getElementById('chipDrawTotal').innerText;
    const bp = document.getElementById('bpValue').innerText;

    filename = `新NISA出口戦略_${Math.round(start/10000)}万開始_${dateFileStr}.csv`;

    lines.push('# ==========================================');
    lines.push('# 新NISA 出口・取り崩しシミュレーション レポート');
    lines.push(`# 出力日時: ${nowStr}`);
    lines.push('# ------------------------------------------');
    lines.push('# ■ 取り崩し設定条件');
    lines.push(`# 開始時資産総額, ¥${start.toLocaleString()}`);
    if (drawdownMode === 'fixed') {
      const dm = parseInt(document.getElementById('numDrawMonthly').value) || 0;
      lines.push(`# 取崩方式, 定額取り崩し (毎月 ¥${dm.toLocaleString()} / 年間 ¥${(dm*12).toLocaleString()})`);
    } else {
      const dr = document.getElementById('numDrawRate').value;
      lines.push(`# 取崩方式, 定率取り崩し (年 ${dr}%)`);
    }
    lines.push(`# 運用想定利回り, ${r}%`);
    lines.push('# ------------------------------------------');
    lines.push('# ■ 試算結果サマリー');
    lines.push(`# 推定資産寿命, ${life}`);
    lines.push(`# 年間取崩額(初年), ${annualDraw}`);
    lines.push(`# 受取累計総額, ${totalRec}`);
    lines.push(`# 出口耐久戦闘力, ${bp} BP`);
    lines.push(`# 獲得称号, ${currentDiagTitle}`);
    lines.push('# ==========================================');
    lines.push('');
    lines.push('経過年数,年間受取額(円),運用取崩残高(円),現金のみ残高(円),受取累計額(円)');

    latestTableData.forEach(row => {
      lines.push(`${row.year}年後,${row.draw},${row.balanceInvest},${row.balanceCash},${row.totalReceived}`);
    });
  }

  const csvContent = '\uFEFF' + lines.join('\n') + '\n';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📄 CSVレポート「${filename}」を出力しました！`);
}

function switchSlot(slotNum) {
  saveCurrentSlot();
  currentSlot = slotNum;
  [1, 2, 3].forEach(i => {
    const btn = document.getElementById(`slotBtn${i}`);
    if (btn) btn.classList.toggle('active', i === slotNum);
  });
  loadSlot(slotNum);
  showToast(`スロット${slotNum} を読み込みました`);
  updateAll();
}

function saveCurrentSlot() {
  const data = {
    monthly: document.getElementById('numMonthly').value,
    initial: document.getElementById('numInitial').value,
    returnRate: document.getElementById('numReturn').value,
    horizon: document.getElementById('numHorizon').value,
    capToggle: document.getElementById('inputCapToggle').checked,
    stress: currentStress,
    drawStart: document.getElementById('numDrawStart').value,
    drawMonthly: document.getElementById('numDrawMonthly').value,
    drawRate: document.getElementById('numDrawRate').value,
    drawReturn: document.getElementById('numDrawReturn').value,
    tab: currentTab,
    drawMode: drawdownMode
  };
  localStorage.setItem(`nisa_sim_slot_${currentSlot}`, JSON.stringify(data));
}

function loadSlot(slotNum) {
  const saved = localStorage.getItem(`nisa_sim_slot_${slotNum}`);
  if (saved) {
    try {
      const d = JSON.parse(saved);
      if (d.monthly !== undefined) document.getElementById('numMonthly').value = d.monthly;
      if (d.initial !== undefined) document.getElementById('numInitial').value = d.initial;
      if (d.returnRate !== undefined) document.getElementById('numReturn').value = d.returnRate;
      if (d.horizon !== undefined) document.getElementById('numHorizon').value = d.horizon;
      if (d.capToggle !== undefined) document.getElementById('inputCapToggle').checked = d.capToggle;
      if (d.drawStart !== undefined) document.getElementById('numDrawStart').value = d.drawStart;
      if (d.drawMonthly !== undefined) document.getElementById('numDrawMonthly').value = d.drawMonthly;
      if (d.drawRate !== undefined) document.getElementById('numDrawRate').value = d.drawRate;
      if (d.drawReturn !== undefined) document.getElementById('numDrawReturn').value = d.drawReturn;
      ['monthly', 'initial', 'return', 'horizon', 'drawStart', 'drawMonthly', 'drawRate', 'drawReturn'].forEach(f => syncInputs(f, 'num', false));
      if (d.stress) {
        setStress(d.stress, false);
      } else {
        setStress('none', false);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

function switchDisplayView(view) {
  displayView = view;
  document.getElementById('btnViewLine').classList.toggle('active', view === 'line');
  document.getElementById('btnViewRadar').classList.toggle('active', view === 'radar');
  document.getElementById('btnViewDiag').classList.toggle('active', view === 'diag');

  const canvas = document.getElementById('simChart');
  const diagBox = document.getElementById('diagnosisViewBox');

  if (view === 'diag') {
    canvas.style.display = 'none';
    diagBox.style.display = 'flex';
  } else {
    canvas.style.display = 'block';
    diagBox.style.display = 'none';
    updateAll();
  }
}

function switchTab(tab, shouldRun = true) {
  currentTab = tab;
  document.getElementById('tabGrowth').classList.toggle('active', tab === 'growth');
  document.getElementById('tabDrawdown').classList.toggle('active', tab === 'drawdown');

  document.getElementById('growthControls').style.display = tab === 'growth' ? 'block' : 'none';
  document.getElementById('drawdownControls').style.display = tab === 'drawdown' ? 'block' : 'none';
  document.getElementById('rowGrowthStats').style.display = tab === 'growth' ? 'grid' : 'none';
  document.getElementById('rowDrawdownStats').style.display = tab === 'drawdown' ? 'grid' : 'none';
  document.getElementById('btnImportFromGrowth').style.display = tab === 'drawdown' ? 'inline-flex' : 'none';

  if (tab === 'drawdown') {
    document.getElementById('ctrlTitle').innerText = '取り崩し条件設定';
    document.getElementById('mainStatHeaderLabel').innerText = '資産寿命';
  } else {
    document.getElementById('ctrlTitle').innerText = 'シミュレーション条件設定';
    document.getElementById('mainStatHeaderLabel').innerText = '最終資産総額';
  }
  if (shouldRun) saveAndRun();
}

function switchDrawdownMode(mode, shouldRun = true) {
  drawdownMode = mode;
  document.getElementById('subTabFixed').classList.toggle('active', mode === 'fixed');
  document.getElementById('subTabPercent').classList.toggle('active', mode === 'percent');
  document.getElementById('drawControlFixed').style.display = mode === 'fixed' ? 'block' : 'none';
  document.getElementById('drawControlPercent').style.display = mode === 'percent' ? 'block' : 'none';

  if (mode === 'fixed') {
    document.getElementById('chipDrawAnnualLabel').innerText = '年間取崩額';
  } else {
    document.getElementById('chipDrawAnnualLabel').innerText = '初年取崩額';
  }
  if (shouldRun) saveAndRun();
}

function importFromGrowthResult() {
  document.getElementById('numDrawStart').value = lastGrowthTotal;
  document.getElementById('rangeDrawStart').value = Math.min(100000000, lastGrowthTotal);
  applyPercentMonthly(0.04);
  saveAndRun();
}

function applyPercentMonthly(rate) {
  const startAsset = parseInt(document.getElementById('numDrawStart').value) || 0;
  const monthlyAmt = Math.round((startAsset * rate) / 12);
  document.getElementById('numDrawMonthly').value = monthlyAmt;
  document.getElementById('rangeDrawMonthly').value = Math.min(500000, monthlyAmt);
  saveAndRun();
}

function setPreset(field, val) {
  if (field === 'monthly') {
    document.getElementById('numMonthly').value = val;
    document.getElementById('rangeMonthly').value = val;
  } else if (field === 'initial') {
    document.getElementById('numInitial').value = val;
    document.getElementById('rangeInitial').value = val;
  } else if (field === 'return') {
    document.getElementById('numReturn').value = val;
    document.getElementById('rangeReturn').value = val;
  } else if (field === 'horizon') {
    document.getElementById('numHorizon').value = val;
    document.getElementById('rangeHorizon').value = val;
  } else if (field === 'drawStart') {
    document.getElementById('numDrawStart').value = val;
    document.getElementById('rangeDrawStart').value = Math.min(100000000, val);
  } else if (field === 'drawMonthly') {
    document.getElementById('numDrawMonthly').value = val;
    document.getElementById('rangeDrawMonthly').value = Math.min(500000, val);
  } else if (field === 'drawRate') {
    document.getElementById('numDrawRate').value = val;
    document.getElementById('rangeDrawRate').value = val;
  } else if (field === 'drawReturn') {
    document.getElementById('numDrawReturn').value = val;
    document.getElementById('rangeDrawReturn').value = val;
  }
  saveAndRun();
}

function setStress(type, shouldRun = true) {
  currentStress = type;
  ['none', 'lehman', 'corona', 'dotcom'].forEach(t => {
    const btn = document.getElementById('stressBtn' + (t === 'none' ? 'None' : t.charAt(0).toUpperCase() + t.slice(1)));
    if (!btn) return;
    btn.classList.remove('stress-active', 'stress-active-none', 'highlight');
    if (t === type) {
      if (t === 'none') {
        btn.classList.add('stress-active-none');
      } else {
        btn.classList.add('stress-active');
      }
    } else if (t === 'none') {
      btn.classList.add('highlight');
    }
  });

  const info = document.getElementById('stressInfo');
  const cfg = STRESS_CONFIG[type] || STRESS_CONFIG.none;
  if (info) {
    if (type === 'none') {
      info.innerHTML = '暴落なし（通常の右肩上がりシミュレーション）';
      info.style.color = 'var(--text-muted)';
    } else {
      info.innerHTML = `⚠ ${cfg.label}<br>運用期間の約40%地点で一時的に資産が下落します。積立は継続します。`;
      info.style.color = '#fca5a5';
    }
  }
  if (shouldRun) saveAndRun();
}

function syncInputs(field, source, shouldRun = true) {
  const numEl = document.getElementById(
    field === 'monthly' ? 'numMonthly' :
    field === 'initial' ? 'numInitial' :
    field === 'return' ? 'numReturn' :
    field === 'horizon' ? 'numHorizon' :
    field === 'drawStart' ? 'numDrawStart' :
    field === 'drawMonthly' ? 'numDrawMonthly' :
    field === 'drawRate' ? 'numDrawRate' : 'numDrawReturn'
  );
  const rangeEl = document.getElementById(
    field === 'monthly' ? 'rangeMonthly' :
    field === 'initial' ? 'rangeInitial' :
    field === 'return' ? 'rangeReturn' :
    field === 'horizon' ? 'rangeHorizon' :
    field === 'drawStart' ? 'rangeDrawStart' :
    field === 'drawMonthly' ? 'rangeDrawMonthly' :
    field === 'drawRate' ? 'rangeDrawRate' : 'rangeDrawReturn'
  );

  if (!numEl || !rangeEl) return;

  if (source === 'range') {
    numEl.value = rangeEl.value;
  } else if (source === 'num') {
    let val = parseFloat(numEl.value);
    if (!isNaN(val)) {
      rangeEl.value = val;
    }
  }
  if (shouldRun) saveAndRun();
}

function toggleTable() {
  const wrapper = document.getElementById('tableWrapper');
  const icon = document.getElementById('collapseIcon');
  if (!wrapper || !icon) return;
  wrapper.classList.toggle('open');
  icon.innerText = wrapper.classList.contains('open') ? '▲' : '▼';
}

function saveAndRun() {
  saveCurrentSlot();
  updateAll();
}

function updateAll() {
  if (currentTab === 'growth') {
    runGrowthSim();
  } else {
    runDrawdownSim();
  }
}

function animateCounter(target) {
  const el = document.getElementById('bpValue');
  if (!el) return;
  const start = currentBP;
  currentBP = target;
  const duration = 200;
  const startTime = performance.now();

  function update(time) {
    const elapsed = time - startTime;
    const progress = Math.min(1, elapsed / duration);
    const val = Math.round(start + (target - start) * progress);
    el.innerText = val.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

let optimalMonthlyCap = 0;

function checkAnnualCapAlert(monthly, initial) {
  const alertBox = document.getElementById('annualCapAlert');
  const headerTitle = document.getElementById('alertHeaderTitle');
  const bodyText = document.getElementById('alertBodyText');
  const autoBtn = document.getElementById('btnAutoAdjustCap');
  const targetMonthlyText = document.getElementById('targetMonthlyText');

  if (!alertBox) return;
  const firstYearTotal = initial + (monthly * 12);
  const ANNUAL_CAP = 3600000;

  if (firstYearTotal <= ANNUAL_CAP) {
    alertBox.style.display = 'none';
    return;
  }

  alertBox.style.display = 'block';

  if (initial > ANNUAL_CAP) {
    alertBox.className = 'annual-alert-box info';
    headerTitle.innerText = '💡 既存残高・移行シミュレーション';
    bodyText.innerHTML = `初期投資額（${fmtYen(initial)}）が新NISAの年間上限（360万円）を超えています。すでに運用中の残高や、特定口座からの順次移行を想定した試算としてそのまま計算しています。`;
    autoBtn.style.display = 'none';
  } else {
    alertBox.className = 'annual-alert-box warning';
    const overAmount = firstYearTotal - ANNUAL_CAP;
    const maxMonthly = Math.max(0, Math.floor((ANNUAL_CAP - initial) / 12 / 1000) * 1000);
    optimalMonthlyCap = maxMonthly;

    headerTitle.innerText = '⚠️ 年間投資枠（360万円）を超過しています';
    bodyText.innerHTML = `初年度の投資予定額が <b>${fmtYen(firstYearTotal)}</b>（超過: +${fmtYen(overAmount)}）になっています。実際のNISAでは年360万円（つみたて120万＋成長240万）が上限となります。`;
    
    targetMonthlyText.innerText = (maxMonthly / 10000).toFixed(maxMonthly % 10000 === 0 ? 0 : 1);
    autoBtn.style.display = 'inline-flex';
  }
}

function autoAdjustToAnnualCap() {
  setPreset('monthly', optimalMonthlyCap);
  showToast(`毎月の積立額を ¥${optimalMonthlyCap.toLocaleString()} に調整しました`);
}

function runGrowthSim() {
  const monthly = Math.max(0, parseInt(document.getElementById('numMonthly').value) || 0);
  const initial = Math.max(0, parseInt(document.getElementById('numInitial').value) || 0);
  const annualReturn = Math.max(0, parseFloat(document.getElementById('numReturn').value) || 0);
  const horizon = Math.max(1, parseInt(document.getElementById('numHorizon').value) || 1);
  const capEnabled = document.getElementById('inputCapToggle').checked;

  checkAnnualCapAlert(monthly, initial);

  const monthlyRate = (annualReturn / 100) / 12;
  const totalMonths = horizon * 12;
  const CAP_LIMIT = 18000000;

  const stressCfg = STRESS_CONFIG[currentStress] || STRESS_CONFIG.none;
  const crashMonth = (stressCfg.drop > 0 && totalMonths > 12)
    ? Math.max(12, Math.floor(totalMonths * 0.4))
    : -1;

  let principal = initial;
  let balance = initial;
  let capMonth = null;
  let crashApplied = false;

  const labels = [];
  const dataPrincipal = [];
  const dataTotal = [];
  const dataGains = [];
  const dataTaxable = [];
  const tableRows = [];
  latestTableData = [];

  labels.push('0年');
  dataPrincipal.push(initial);
  dataTotal.push(initial);
  dataGains.push(0);
  dataTaxable.push(initial);

  for (let m = 1; m <= totalMonths; m++) {
    let add = 0;
    if (!capEnabled || principal < CAP_LIMIT) {
      if (capEnabled && (principal + monthly > CAP_LIMIT)) {
        add = CAP_LIMIT - principal;
      } else {
        add = monthly;
      }
    }
    principal += add;
    balance = balance * (1 + monthlyRate) + add;

    if (m === crashMonth && !crashApplied) {
      balance = balance * (1 - stressCfg.drop);
      crashApplied = true;
    }

    if (capEnabled && principal >= CAP_LIMIT && capMonth === null) {
      capMonth = m;
    }

    if (m % 12 === 0) {
      const year = m / 12;
      const gains = balance - principal;
      const taxableNet = principal + Math.max(0, gains) * (1 - 0.20315);
      const taxSaved = Math.max(0, gains) * 0.20315;

      labels.push(year + '年');
      dataPrincipal.push(Math.round(principal));
      dataTotal.push(Math.round(balance));
      dataGains.push(Math.round(gains));
      dataTaxable.push(Math.round(taxableNet));

      latestTableData.push({
        year: year,
        principal: Math.round(principal),
        gains: Math.round(gains),
        balance: Math.round(balance),
        taxableNet: Math.round(taxableNet),
        taxSaved: Math.round(taxSaved)
      });

      const gainsColor = gains >= 0 ? '#34d399' : '#f87171';
      const gainsText = (gains >= 0 ? '+' : '') + fmtYen(gains);
      const taxSavedText = taxSaved > 0 ? '+' + fmtYen(taxSaved) : fmtYen(0);

      tableRows.push(`
        <tr>
          <td>${year}年目</td>
          <td>${fmtYen(principal)}</td>
          <td style="color: ${gainsColor};">${gainsText}</td>
          <td style="font-weight: 700; color: #60a5fa;">${fmtYen(balance)}</td>
          <td style="color: #fbbf24;">${fmtYen(taxableNet)}</td>
          <td style="color: #f472b6;">${taxSavedText}</td>
        </tr>
      `);
    }
  }

  lastGrowthTotal = Math.round(balance);
  const finalTotal = balance;
  const finalPrincipal = principal;
  const finalGains = finalTotal - finalPrincipal;
  const finalTaxSaved = Math.max(0, finalGains) * 0.20315;

  document.getElementById('mainStatHeaderValue').innerText = fmtYen(finalTotal);
  document.getElementById('chipPrincipal').innerText = fmtYen(finalPrincipal);

  const chipGainsEl = document.getElementById('chipGains');
  chipGainsEl.innerText = (finalGains >= 0 ? '+' : '') + fmtYen(finalGains);
  chipGainsEl.classList.remove('gains', 'danger');
  chipGainsEl.classList.add(finalGains >= 0 ? 'gains' : 'danger');

  document.getElementById('chipTax').innerText = fmtYen(finalTaxSaved);

  document.getElementById('tableHeader').innerHTML = `
    <tr>
      <th>年数</th>
      <th>元本</th>
      <th>運用益</th>
      <th>総資産</th>
      <th>課税手取り</th>
      <th>節税</th>
    </tr>
  `;
  document.getElementById('tableBody').innerHTML = tableRows.join('');

  // 能力値レーダー計算
  let atkScore = 0;
  if (monthly === 0 && initial === 0) {
    atkScore = 0;
  } else {
    const monthlyP = monthly <= 100000 
      ? (monthly / 100000) * 80 
      : 80 + ((monthly - 100000) / 200000) * 20;
    const initialBonus = (initial / 2400000) * 15;
    atkScore = Math.min(100, Math.round(monthlyP + initialBonus));
  }

  let defScore = 0;
  if (horizon <= 10) {
    defScore = Math.round(15 + (horizon / 10) * 40);
  } else if (horizon <= 20) {
    defScore = Math.round(55 + ((horizon - 10) / 10) * 25);
  } else {
    defScore = Math.min(100, Math.round(80 + ((horizon - 20) / 10) * 20));
  }

  let criScore = 0;
  if (annualReturn <= 0) {
    criScore = 0;
  } else if (annualReturn <= 3) {
    criScore = Math.round((annualReturn / 3) * 45);
  } else if (annualReturn <= 5) {
    criScore = Math.round(45 + ((annualReturn - 3) / 2) * 20);
  } else if (annualReturn <= 7) {
    criScore = Math.round(65 + ((annualReturn - 5) / 2) * 15);
  } else {
    criScore = Math.min(100, Math.round(80 + ((annualReturn - 7) / 3) * 20));
  }

  let guardScore = 0;
  if (finalTaxSaved <= 0) {
    guardScore = 0;
  } else if (finalTaxSaved <= 3000000) {
    guardScore = Math.round((finalTaxSaved / 3000000) * 60);
  } else if (finalTaxSaved <= 6000000) {
    guardScore = Math.round(60 + ((finalTaxSaved - 3000000) / 3000000) * 20);
  } else {
    guardScore = Math.min(100, Math.round(80 + ((finalTaxSaved - 6000000) / 4000000) * 20));
  }

  let vitScore = 0;
  if (finalTotal <= 0) {
    vitScore = 0;
  } else if (finalTotal <= 20000000) {
    vitScore = Math.round((finalTotal / 20000000) * 50);
  } else if (finalTotal <= 50000000) {
    vitScore = Math.round(50 + ((finalTotal - 20000000) / 30000000) * 30);
  } else {
    vitScore = Math.min(100, Math.round(80 + ((finalTotal - 50000000) / 50000000) * 20));
  }

  radarStats = [atkScore, defScore, criScore, guardScore, vitScore];

  const bp = Math.round(Math.max(0, finalTotal) / 10) + Math.round(finalTaxSaved / 5);
  animateCounter(bp);

  if (displayView === 'line') {
    renderGrowthLineChart(labels, dataPrincipal, dataTotal, dataGains, dataTaxable);
  } else if (displayView === 'radar') {
    renderRadarChart(['入金火力 (ATK)', '複利耐久 (DEF)', '会心利回り (CRI)', '節税障壁 (GUARD)', '資産体力 (VIT)'], radarStats);
  }

  updateDiagnosis('growth', finalTotal, monthly, initial, annualReturn, horizon);
}

function renderGrowthLineChart(labels, dataPrincipal, dataTotal, dataGains, dataTaxable) {
  const ctx = document.getElementById('simChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '総資産額',
          data: dataTotal,
          backgroundColor: 'rgba(16, 185, 129, 0.65)',
          borderColor: '#10b981',
          borderWidth: 1.5,
          fill: 1,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: '投資元本',
          data: dataPrincipal,
          backgroundColor: 'rgba(59, 130, 246, 0.85)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          fill: 'origin',
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: '課税手取り比較',
          data: dataTaxable,
          borderColor: '#f59e0b',
          borderWidth: 1.5,
          borderDash: [3, 3],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#d1d5db', font: { size: 10 }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          padding: 8,
          titleFont: { size: 11 },
          bodyFont: { size: 10.5 },
          callbacks: {
            title: (items) => `運用年数: ${items[0].label}`,
            beforeBody: (items) => {
              const idx = items[0].dataIndex;
              const g = dataGains[idx];
              const gainsLabel = g >= 0
                ? `運用益: +${fmtYen(g)}`
                : `運用益: ${fmtYen(g)}（含み損）`;
              return [
                `投資元本: ${fmtYen(dataPrincipal[idx])}`,
                gainsLabel,
                `課税手取り: ${fmtYen(dataTaxable[idx])}`,
                `-------------------`,
                `総資産額: ${fmtYen(dataTotal[idx])}`
              ];
            },
            label: () => null
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 10 },
            callback: (val) => {
              if (val >= 100000000) return (val / 100000000).toFixed(1) + '億';
              if (val >= 10000) return (val / 10000).toLocaleString() + '万';
              return val;
            }
          }
        }
      }
    }
  });
}

function renderRadarChart(labels, stats) {
  const ctx = document.getElementById('simChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: '能力値ビルド',
        data: stats,
        backgroundColor: 'rgba(168, 85, 247, 0.35)',
        borderColor: '#c084fc',
        borderWidth: 2,
        pointBackgroundColor: '#fbbf24',
        pointBorderColor: '#fff',
        pointRadius: 3.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          beginAtZero: true,
          angleLines: { color: 'rgba(255, 255, 255, 0.12)' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: { color: '#cbd5e1', font: { size: 10.5, weight: 'bold' } },
          ticks: {
            display: false,
            stepSize: 20
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `能力値: ${context.raw} / 100`
          }
        }
      }
    }
  });
}

function runDrawdownSim() {
  document.getElementById('annualCapAlert').style.display = 'none';

  const startAsset = Math.max(0, parseInt(document.getElementById('numDrawStart').value) || 0);
  const drawReturn = Math.max(0, parseFloat(document.getElementById('numDrawReturn').value) || 0);
  const monthlyRate = (drawReturn / 100) / 12;

  const maxYears = 45;
  const labels = [];
  const dataInvest = [];
  const dataCash = [];
  const tableRows = [];
  latestTableData = [];

  labels.push('0年');
  dataInvest.push(startAsset);
  dataCash.push(startAsset);

  let balanceInvest = startAsset;
  let balanceCash = startAsset;
  let depletedInvestYear = null;
  let depletedCashYear = null;
  let totalReceivedInvest = 0;

  if (drawdownMode === 'fixed') {
    const monthlyDraw = Math.max(0, parseInt(document.getElementById('numDrawMonthly').value) || 0);
    const annualDraw = monthlyDraw * 12;

    for (let y = 1; y <= maxYears; y++) {
      let yearDrawInvest = 0;
      for (let m = 1; m <= 12; m++) {
        if (balanceInvest > 0) {
          const draw = Math.min(balanceInvest, monthlyDraw);
          balanceInvest = (balanceInvest - draw) * (1 + monthlyRate);
          yearDrawInvest += draw;
          totalReceivedInvest += draw;
          if (balanceInvest <= 0 && depletedInvestYear === null) {
            depletedInvestYear = (y - 1) + (m / 12);
          }
        }

        if (balanceCash > 0) {
          const drawC = Math.min(balanceCash, monthlyDraw);
          balanceCash -= drawC;
          if (balanceCash <= 0 && depletedCashYear === null) {
            depletedCashYear = (y - 1) + (m / 12);
          }
        }
      }

      labels.push(y + '年後');
      dataInvest.push(Math.max(0, Math.round(balanceInvest)));
      dataCash.push(Math.max(0, Math.round(balanceCash)));

      latestTableData.push({
        year: y,
        draw: Math.round(yearDrawInvest),
        balanceInvest: Math.round(balanceInvest),
        balanceCash: Math.round(balanceCash),
        totalReceived: Math.round(totalReceivedInvest)
      });

      tableRows.push(`
        <tr>
          <td>${y}年後</td>
          <td style="color:#34d399;">${fmtYen(yearDrawInvest)}</td>
          <td style="font-weight:700; color:#60a5fa;">${fmtYen(balanceInvest)}</td>
          <td style="color:#ef4444;">${fmtYen(balanceCash)}</td>
          <td style="color:#fbbf24;">${fmtYen(totalReceivedInvest)}</td>
        </tr>
      `);
    }

    const lifeText = startAsset === 0 ? '0年' : (depletedInvestYear ? `${depletedInvestYear.toFixed(1)}年` : '45年以上(永続)');
    document.getElementById('mainStatHeaderValue').innerText = lifeText;
    document.getElementById('chipDrawAnnual').innerText = fmtYen(annualDraw);
    document.getElementById('chipDrawTotal').innerText = fmtYen(totalReceivedInvest);

    const cashLife = depletedCashYear ? depletedCashYear.toFixed(1) : (startAsset / (annualDraw || 1)).toFixed(1);
    if (startAsset === 0) {
      document.getElementById('chipDrawDiff').innerText = '元本ゼロ';
    } else if (depletedInvestYear) {
      const diff = (depletedInvestYear - parseFloat(cashLife)).toFixed(1);
      document.getElementById('chipDrawDiff').innerText = diff > 0 ? `+${diff}年 延命` : '差なし';
    } else {
      document.getElementById('chipDrawDiff').innerText = '枯渇せず (+∞)';
    }

    const bp = Math.round(startAsset / 15) + Math.round(totalReceivedInvest / 10);
    animateCounter(bp);

    const atk = monthlyDraw === 0 ? 0 : (monthlyDraw <= 150000 ? Math.round((monthlyDraw / 150000) * 80) : Math.min(100, Math.round(80 + ((monthlyDraw - 150000) / 150000) * 20)));
    const def = depletedInvestYear ? Math.min(100, Math.round((depletedInvestYear / 30) * 80)) : 100;
    const cri = drawReturn <= 0 ? 0 : (drawReturn <= 3 ? Math.round((drawReturn / 3) * 70) : Math.min(100, Math.round(70 + ((drawReturn - 3) / 4) * 30)));
    const guard = !depletedInvestYear ? 100 : Math.min(100, Math.round((depletedInvestYear / 25) * 80));
    const vit = startAsset <= 0 ? 0 : (startAsset <= 50000000 ? Math.round((startAsset / 50000000) * 80) : Math.min(100, Math.round(80 + ((startAsset - 50000000) / 50000000) * 20)));
    radarStats = [atk, def, cri, guard, vit];

    if (displayView === 'line') {
      renderDrawdownLineChart(labels, dataInvest, dataCash);
    } else if (displayView === 'radar') {
      renderRadarChart(['取崩火力 (消費)', '生存耐久 (寿命)', '運用利回り (CRI)', '枯渇耐性 (GUARD)', '元本体力 (VIT)'], radarStats);
    }

    updateDiagnosis('drawdown', startAsset, monthlyDraw, 0, drawReturn, 0, depletedInvestYear);

  } else {
    const drawRate = Math.max(0.1, parseFloat(document.getElementById('numDrawRate').value) || 4.0) / 100;
    const initialAnnual = startAsset * drawRate;

    for (let y = 1; y <= maxYears; y++) {
      let yearDraw = 0;
      if (balanceInvest > 0) {
        yearDraw = balanceInvest * drawRate;
        totalReceivedInvest += yearDraw;
        balanceInvest = (balanceInvest - yearDraw) * (1 + (drawReturn / 100));
      }

      if (balanceCash > 0) {
        const cashDraw = balanceCash * drawRate;
        balanceCash -= cashDraw;
      }

      labels.push(y + '年後');
      dataInvest.push(Math.max(0, Math.round(balanceInvest)));
      dataCash.push(Math.max(0, Math.round(balanceCash)));

      latestTableData.push({
        year: y,
        draw: Math.round(yearDraw),
        balanceInvest: Math.round(balanceInvest),
        balanceCash: Math.round(balanceCash),
        totalReceived: Math.round(totalReceivedInvest)
      });

      tableRows.push(`
        <tr>
          <td>${y}年後</td>
          <td style="color:#34d399;">${fmtYen(yearDraw)} (${fmtYen(yearDraw/12)}/月)</td>
          <td style="font-weight:700; color:#60a5fa;">${fmtYen(balanceInvest)}</td>
          <td style="color:#ef4444;">${fmtYen(balanceCash)}</td>
          <td style="color:#fbbf24;">${fmtYen(totalReceivedInvest)}</td>
        </tr>
      `);
    }

    document.getElementById('mainStatHeaderValue').innerText = startAsset === 0 ? '0年' : '枯渇なし(永続)';
    document.getElementById('chipDrawAnnual').innerText = `${fmtYen(initialAnnual)}(初年)`;
    document.getElementById('chipDrawTotal').innerText = fmtYen(totalReceivedInvest);
    document.getElementById('chipDrawDiff').innerText = startAsset === 0 ? '元本ゼロ' : '残高追従';

    const bp = Math.round(startAsset / 12) + Math.round(totalReceivedInvest / 10);
    animateCounter(bp);

    const atk = Math.min(100, Math.round((drawRate / 0.04) * 80));
    const def = 100;
    const cri = drawReturn <= 0 ? 0 : (drawReturn <= 3 ? Math.round((drawReturn / 3) * 70) : Math.min(100, Math.round(70 + ((drawReturn - 3) / 4) * 30)));
    const guard = drawRate <= 0.04 ? 100 : Math.max(50, Math.round(100 - (drawRate - 0.04) * 500));
    const vit = startAsset <= 0 ? 0 : (startAsset <= 50000000 ? Math.round((startAsset / 50000000) * 80) : Math.min(100, Math.round(80 + ((startAsset - 50000000) / 50000000) * 20)));
    radarStats = [atk, def, cri, guard, vit];

    if (displayView === 'line') {
      renderDrawdownLineChart(labels, dataInvest, dataCash);
    } else if (displayView === 'radar') {
      renderRadarChart(['取崩割合 (RATE)', '永続耐久 (DEF)', '運用利回り (CRI)', '枯渇耐性 (GUARD)', '元本体力 (VIT)'], radarStats);
    }

    updateDiagnosis('drawdown_percent', startAsset, 0, 0, drawReturn, 0, null, drawRate);
  }

  document.getElementById('tableHeader').innerHTML = `
    <tr>
      <th>経過</th>
      <th>年間受取額</th>
      <th>運用残高</th>
      <th>現金のみ残高</th>
      <th>受取累計額</th>
    </tr>
  `;
  document.getElementById('tableBody').innerHTML = tableRows.join('');
}

function renderDrawdownLineChart(labels, dataInvest, dataCash) {
  const ctx = document.getElementById('simChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '運用取崩残高',
          data: dataInvest,
          borderColor: '#34d399',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderWidth: 1.8,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: '現金のみ残高',
          data: dataCash,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 1.2,
          borderDash: [3, 3],
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#d1d5db', font: { size: 10 }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          padding: 8,
          callbacks: {
            title: (items) => `経過年数: ${items[0].label}`,
            label: (context) => `${context.dataset.label}: ${fmtYen(context.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#9ca3af',
            font: { size: 10 },
            callback: (val) => {
              if (val >= 100000000) return (val / 100000000).toFixed(1) + '億';
              if (val >= 10000) return (val / 10000).toLocaleString() + '万';
              return val;
            }
          }
        }
      }
    }
  });
}

function updateDiagnosis(mode, total, monthly, initial, returnRate, horizon, depletedYear = null, drawRate = null) {
  let title = '';
  let level = '';
  let tags = [];
  let carteHtml = '';
  let rxButtonHtml = '';
  let statusBadgeText = 'カルテ作成完了';

  if (mode === 'growth') {
    if (monthly === 0 && initial === 0) {
      title = '👀 観客席の傍観者（ノーポジ待機）';
      level = 'RANK 0';
      tags = ['#ノーポジション', '#まずは少額から', '#時間の損失注意'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">投資元本が0円の無風状態です。インデックス投資における最大のリスクは「市場に資金を置いていない時間」そのものです。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来予測】</span><span class="carte-text">年2%のインフレが進むと、現金の購買力は20年で約33%目減りします。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">生活費の半年分を手元に残した上で、月3,000円〜3万円の少額積立から雪だるま作りを始めましょう。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="setPreset('monthly', 30000)">⚡ 処方箋: 月3万円で積立開始</button>`;
    }
    else if (currentStress !== 'none' && horizon < 15) {
      title = '💥 暴落直撃・メンタル耐久テスト級';
      level = 'WARNING';
      tags = ['#暴落耐久中', '#ドルコスト効果', '#狼狽売り厳禁'];
      statusBadgeText = '⚠️ 回復待ち';
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">${STRESS_CONFIG[currentStress].short}により一時的に資産が急減。期間が${horizon}年と短いため、底値からの回復カーブを十分に取り込めていません。</span></div>
        <div class="carte-block"><span class="carte-heading">【歴史的教訓】</span><span class="carte-text">過去すべての歴史的暴落（リーマン・ITバブル等）は、15〜20年保有し続けた場合プラスに回帰しています。暴落時こそ「安く多く口数を仕込む好機」です。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">相場から絶対に退場せず、運用期間を「20年以上」に設定して複利回復を確認してください。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="setPreset('horizon', 20)">⚡ 処方箋: 期間を20年に延長（回復確認）</button>`;
    }
    else if (returnRate >= 10) {
      title = '🎰 レバナス戦士・ハイレバドリーム級';
      level = 'HIGH RISK';
      tags = ['#ハイリスク強気', '#ドローダウン警戒', '#過信注意'];
      statusBadgeText = '⚠️ 高リスク';
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">想定利回り${returnRate}%は魅力的な数字ですが、レバレッジ投信やハイテク集中投資など、資産が一時的に50〜70%削られるリスクを背負う水準です。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来予測】</span><span class="carte-text">上昇相場では爆発的に増えますが、リタイア直前に暴落を被弾すると計画が根底から崩壊します。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">長期の資産形成プランは、歴史的平均（全世界株5%、S&P500 7%）をベースに堅牢に組むのが定石です。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="setPreset('return', 7.0)">⚡ 処方箋: 年利7%（王道S&P500）に補正</button>`;
    }
    else if (horizon <= 5) {
      title = '⏱️ 短期決戦・複利スリーパー級';
      level = 'SHORT TERM';
      tags = ['#短期運用', '#複利待機中', '#元本割れリスク'];
      statusBadgeText = '💡 期間見直し推奨';
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">運用年数${horizon}年は投資信託において短期です。複利の真骨頂である「後半の二次曲線的な伸び」が発動する前に終了してしまいます。</span></div>
        <div class="carte-block"><span class="carte-heading">【資金の色分け】</span><span class="carte-text">5年以内に使う予定の資金（学費・住宅頭金等）は定期預金等で守り、投資は10年超の長期資金で行うのが原則です。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">使わない余裕資金であれば、期間を15〜20年に延ばして複利の恩恵を最大化しましょう。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="setPreset('horizon', 20)">⚡ 処方箋: 複利が効く20年に設定</button>`;
    }
    else if (total >= 300000000) {
      title = '🪐 超富裕層・石油王・FIRE神';
      level = 'RANK GOD';
      tags = ['#資産3億円超', '#超富裕層', '#資産承継ステージ'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">最終資産【${fmtYen(total)}】到達。個人の生活費やFIREの次元を完全に超越した圧倒的な資産規模です。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来像】</span><span class="carte-text">年3%の配当・取り崩しでも年間900万円以上。インフレリスクも完全に克服しています。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">今後は資産防衛に加え、プライベートカンパニー（資産管理法人）の設立や、生前贈与・相続税対策が主眼となります。</span></div>
      `;
    }
    else if (total >= 100000000) {
      title = '👑 億り人・完全FIRE級 (Fat FIRE)';
      level = 'RANK SSS';
      tags = ['#億り人', '#完全FIRE達成', '#経済的自由'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">資産1億円突破。非課税枠1,800万円の複利最大化に成功したトップクラスの資産家ポートフォリオです。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来像】</span><span class="carte-text">4%ルール適用で年間400万円（月33万円）の不労所得。労働から完全に解放される経済的自由が確立されます。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">完全リタイア時は、生活防衛資金として2〜3年分の生活費（600〜900万円）を現金で別管理し、暴落時の投げ売りを防ぎましょう。</span></div>
      `;
    }
    else if (total >= 50000000) {
      title = '🏝️ サイドFIRE・準富裕層クラス';
      level = 'RANK S';
      tags = ['#準富裕層', '#サイドFIRE', '#選択的労働'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">資産5,000万円を突破し「準富裕層」の仲間入りです。元本と運用益が1:1以上に育ち、複利が加速する理想的な状態です。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来像】</span><span class="carte-text">年間4%（月16.6万円）の取り崩し＋好きな副業や週3日労働（月10〜15万）で、ストレスのないセミリタイア生活が実現します。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">出口タブで「定額・定率取り崩し」のシミュレーションを行い、理想の引き出しペースを検証してみましょう。</span></div>
      `;
    }
    else if (total >= 30000000) {
      title = '🛡️ アッパーマス層・安心老後級';
      level = 'RANK A';
      tags = ['#アッパーマス層', '#老後安泰', '#上位20%'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">資産3,000万円以上。日本の全世帯上位20%に到達し、老後2,000万円問題を完全クリアしています。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来像】</span><span class="carte-text">公的年金に加えて月10万円前後の資産取り崩しが可能となり、旅行や趣味を楽しめるゆとりある老後が約束されます。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">家計の破綻リスクは極めて低いため、教育費や住宅ローンとのバランスを取りつつ、無理のないペースで枠を埋め続けましょう。</span></div>
      `;
    }
    else if (total >= 15000000) {
      title = '🌱 安定投資家タイプ';
      level = 'RANK B';
      tags = ['#堅実投資', '#ライフプラン万全', '#枠の再利用'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">まとまった資産【${fmtYen(total)}】を構築。新NISAの非課税メリット（節税約${fmtYen(finalTaxSaved)}）が強力に効いています。</span></div>
        <div class="carte-block"><span class="carte-heading">【制度の強み】</span><span class="carte-text">新NISAは売却しても「翌年に非課税枠が再利用可能（簿価ベース）」です。人生の途中でお金が必要になっても柔軟に対応できます。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">継続は力なり。市場の短期的な上下に一喜一憂せず、自動積立を淡々と継続することが3,000万突破の最短ルートです。</span></div>
      `;
    }
    else {
      title = '🚀 コツコツ投資家・スタート級';
      level = 'RANK C';
      tags = ['#コツコツ積立', '#長期インデックス', '#複利の種まき'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">着実に資産形成の土台作りを進めています。初期段階は元本の積み上げがメインですが、10年目以降から運用の力（利益）が加速します。</span></div>
        <div class="carte-block"><span class="carte-heading">【インフレ対策】</span><span class="carte-text">銀行預金だけでは物価上昇に負けてしまいます。低コスト全世界株やS&P500を毎月積み立てることが最大の購買力防衛になります。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">昇給や固定費削減ができたら、月1万円でも積立額をアップさせると最終資産が大きく跳ね上がります。</span></div>
      `;
    }

    if (monthly >= 300000) tags.push('🏎️ #新NISA_RTA');
    else if (monthly >= 100000) tags.push('🚀 #ハイペース入金');
    if (initial > 0 && monthly === 0) tags.push('🧘 #寝かせ仙人');
    if (horizon >= 40) tags.push('🐢 #超長寿インデックス');

  } else if (mode === 'drawdown') {
    if (total === 0) {
      title = '📭 金庫空っぽ・取り崩し不可';
      level = 'NO DATA';
      tags = ['#元本ゼロ'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">開始資産が0円です。まずは「資産形成」タブで元本を育ててから出口戦略をシミュレーションしましょう。</span></div>
      `;
    } else if (depletedYear && depletedYear < 15) {
      title = '🔥 豪遊炎上・超特急枯渇モード';
      level = 'DANGER';
      tags = ['#超速枯渇', '#支出過多', '#順序リスク直撃'];
      statusBadgeText = '🚨 早期破綻リスク';
      const safe4Amt = Math.round((total * 0.04) / 12);
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【リスク診断】</span><span class="carte-text">わずか【${depletedYear.toFixed(1)}年】で資産が底をつきます。引き出しペースが運用益を大幅にオーバーしています。</span></div>
        <div class="carte-block"><span class="carte-heading">【順序リスク】</span><span class="carte-text">リタイア初期に暴落が起きると、元本が急激に削られ二度と回復できなくなります（収益率の順序リスク）。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">安全域である「年4%以内（月${(safe4Amt/10000).toFixed(1)}万円）」に引き下げて資産延命を図ることを強く推奨します。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="applyPercentMonthly(0.04)">⚡ 処方箋: 安全な4%（月${(safe4Amt/10000).toFixed(1)}万）に補正</button>`;
    } else if (!depletedYear) {
      title = '♾️ 永久機関・資産増殖型リタイア';
      level = 'RANK INFINITY';
      tags = ['#永久機関', '#不労所得生活', '#減らない資産'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">取り崩し額よりも年間の運用益が上回り、資産寿命は理論上無限大。使っても資産が増え続ける無敵状態です。</span></div>
        <div class="carte-block"><span class="carte-heading">【DIE WITH ZERO視点】</span><span class="carte-text">「死ぬときに一番お金持ち」を避け、人生の充実にお金を使いたい場合は、年5〜7%に引き上げる選択肢もあります。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">生活水準を上げるか、家族への贈与・旅行など有意義な支出に回すプランも検討してみましょう。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="applyPercentMonthly(0.05)">⚡ 処方箋: 計画消費型（年5%）を試す</button>`;
    } else {
      title = '🌿 スマート・バランス取崩ライフ';
      level = 'EXIT RANK A';
      tags = ['#バランス取崩', '#資産延命成功', '#キャッシュクッション'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">運用を継続しながら取り崩すことで、資産寿命を【${depletedYear.toFixed(1)}年】まで延命できています。</span></div>
        <div class="carte-block"><span class="carte-heading">【暴落防衛策】</span><span class="carte-text">下落相場の年は投信売却を一時停止できるよう、生活費2〜3年分を普通預金（キャッシュクッション）に確保しておくと盤石です。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">公的年金の受給開始後は取り崩し額を減らせるため、実質的な資産寿命はさらに伸びます。</span></div>
      `;
    }
  } else {
    if (total === 0) {
      title = '📭 金庫空っぽ・取り崩し不可';
      level = 'NO DATA';
      tags = ['#元本ゼロ'];
      carteHtml = `<div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">まずは資産形成シミュレーションから始めましょう。</span></div>`;
    } else if (drawRate <= 0.04) {
      title = '👑 黄金律・4%ルール実践マスター';
      level = 'EXIT MASTER';
      tags = ['#4%ルール', '#トリニティスタディ', '#枯渇リスク極小'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【理論的裏付け】</span><span class="carte-text">米トリニティ大学の研究でも実証された、資産枯渇リスクが極小の黄金ルールです。</span></div>
        <div class="carte-block"><span class="carte-heading">【自律調整機能】</span><span class="carte-text">相場下落時は自動的に受取額が減り、好況時は増えるため、元本が枯渇することなく半永久的に資産を維持できます。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">下落年の受取額減少に備え、生活費の基礎部分は年金や現金で賄えるよう設計しておくのがプロの定石です。</span></div>
      `;
    } else if (drawRate >= 0.07) {
      title = '⚡ 急速消費・計画的使い切りスタイル';
      level = 'EXIT RANK B';
      tags = ['#急速消費', '#相場追従型', '#年金併用確認'];
      statusBadgeText = '💡 計画的使い切り';
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">年7%以上の定率取り崩しは、初期に多額の生活費を得られる反面、後半にかけて受取額が急速に小さくなります。</span></div>
        <div class="carte-block"><span class="carte-heading">【未来予測】</span><span class="carte-text">資産残高が早く減るため、80代以降の取り崩し額は初期の半分以下になる可能性があります。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">公的年金と合算して、高齢期の最低生活費が不足しないか確認した上で活用しましょう。</span></div>
      `;
      rxButtonHtml = `<button class="btn-rx-action" onclick="setPreset('drawRate', 4.0)">⚡ 処方箋: 黄金律4%ルールに戻す</button>`;
    } else {
      title = '🌿 バランス定率取崩しスタイル';
      level = 'EXIT RANK A';
      tags = ['#バランス定率', '#相場追従型', '#積極消費'];
      carteHtml = `
        <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">年5%前後の積極消費型プラン。相場好調時は贅沢に使い、不調時は支出を抑える柔軟な家計管理に適しています。</span></div>
        <div class="carte-block"><span class="carte-heading">【メリット】</span><span class="carte-text">定額取り崩しと違って理論上資産が尽きることがなく、元本を有効活用できます。</span></div>
        <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">固定費を抑え、変動費（旅行・趣味）の割合を高めておくと相場変動に柔軟に対応できます。</span></div>
      `;
    }
  }

  currentDiagTitle = title;
  document.getElementById('diagTitle').innerText = title;
  document.getElementById('diagLevelTag').innerText = level;
  document.getElementById('diagTags').innerHTML = tags.map(t => `<span class="style-tag">${t}</span>`).join('');
  document.getElementById('carteContentArea').innerHTML = carteHtml;
  document.getElementById('fpStatusBadge').innerText = statusBadgeText;

  const rxBox = document.getElementById('prescriptionBox');
  if (rxButtonHtml) {
    rxBox.innerHTML = rxButtonHtml;
    rxBox.style.display = 'block';
  } else {
    rxBox.style.display = 'none';
    rxBox.innerHTML = '';
  }
}

function shareOnX() {
  let text = '';
  const siteUrl = window.location.href.split('?')[0];
  const bpStr = currentBP.toLocaleString();
  if (currentTab === 'growth') {
    const total = document.getElementById('mainStatHeaderValue').innerText;
    text = `【新NISA投資戦闘力】私の戦闘力は… 【 ${bpStr} BP 】！\n称号: ${currentDiagTitle}\n\n💰 最終資産総額: ${total}\n新NISAシミュレーターで能力値レーダー・資産カルテを作成してみました！\n#新NISA #FIRE #投資戦闘力\n`;
  } else {
    const life = document.getElementById('mainStatHeaderValue').innerText;
    text = `【新NISA出口戦略戦闘力】私の耐久力は… 【 ${bpStr} BP 】！\n称号: ${currentDiagTitle}\n\n⏳ 資産寿命: ${life}\n新NISAシミュレーターで取り崩し戦略を試算しました！\n#新NISA #出口戦略 #FIRE\n`;
  }
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`;
  window.open(shareUrl, '_blank');
}

function copySimulationUrl() {
  const params = new URLSearchParams();
  if (currentTab === 'growth') {
    params.set('tab', 'growth');
    params.set('m', document.getElementById('numMonthly').value);
    params.set('init', document.getElementById('numInitial').value);
    params.set('r', document.getElementById('numReturn').value);
    params.set('y', document.getElementById('numHorizon').value);
    if (currentStress && currentStress !== 'none') {
      params.set('stress', currentStress);
    }
  } else {
    params.set('tab', 'drawdown');
    params.set('start', document.getElementById('numDrawStart').value);
    params.set('dm', document.getElementById('numDrawMonthly').value);
    params.set('dr', document.getElementById('numDrawReturn').value);
  }
  const fullUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast('設定URLをコピーしました！');
  }).catch(() => {
    prompt('以下のURLをコピーしてください:', fullUrl);
  });
}

function loadFromUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('m')) document.getElementById('numMonthly').value = params.get('m');
  if (params.has('init')) document.getElementById('numInitial').value = params.get('init');
  if (params.has('r')) document.getElementById('numReturn').value = params.get('r');
  if (params.has('y')) document.getElementById('numHorizon').value = params.get('y');
  if (params.has('stress')) {
    currentStress = params.get('stress');
  }

  if (params.has('start')) document.getElementById('numDrawStart').value = params.get('start');
  if (params.has('dm')) document.getElementById('numDrawMonthly').value = params.get('dm');
  if (params.has('dr')) document.getElementById('numDrawReturn').value = params.get('dr');

  ['monthly', 'initial', 'return', 'horizon', 'drawStart', 'drawMonthly', 'drawReturn'].forEach(f => syncInputs(f, 'num', false));

  if (params.get('tab') === 'drawdown') {
    switchTab('drawdown', false);
  }
}

// --- 身近な出費の未来価値換算関数 ---
window.applyWastePreset = function (itemName, amount) {
    // 1. 積立額スライダーと数値をセット
    const numMonthly = document.getElementById('numMonthly');
    const rangeMonthly = document.getElementById('rangeMonthly');
    if (numMonthly && rangeMonthly) {
        numMonthly.value = amount;
        rangeMonthly.value = amount;
    }

    // 2. 現在の運用年数と利回りを取得して計算
    const rateAnnual = (parseFloat(document.getElementById('numReturn').value) || 5.0) / 100;
    const years = parseInt(document.getElementById('numHorizon').value) || 30;
    const rateMonthly = rateAnnual / 12;
    const totalMonths = years * 12;

    // 複利計算（元利合計）
    let totalFutureValue = 0;
    if (rateMonthly > 0) {
        totalFutureValue = amount * ((Math.pow(1 + rateMonthly, totalMonths) - 1) / rateMonthly);
    } else {
        totalFutureValue = amount * totalMonths;
    }

    const principal = amount * totalMonths;
    const profit = Math.max(0, totalFutureValue - principal);

    // 3. 未来価値結果カードを表示
    const resultCard = document.getElementById('wasteResultCard');
    if (resultCard) {
        const fmt = (v) => '¥' + Math.round(v).toLocaleString();
        resultCard.style.display = 'block';
        resultCard.innerHTML = `
      💡 <b>【${itemName}（月${(amount / 10000).toFixed(1).replace('.0', '')}万円）】</b> を${years}年間（年利${(rateAnnual * 100).toFixed(1)}%）運用すると…<br>
      将来 <span class="waste-result-highlight">${fmt(totalFutureValue)}</span> に化けます！<br>
      <span style="color:#94a3b8; font-size: 0.9em;">（投資元本: ${fmt(principal)} ➔ 運用利益: +${fmt(profit)}）</span>
    `;
    }

    // 4. シミュレーション全体を再計算
    if (typeof saveAndRun === 'function') {
        saveAndRun();
    }
};

// --- ページ読み込み時の初期起動処理（確実に実行される安全版） ---
function initApp() {
    loadSlot(1);
    loadFromUrlParams();
    updateAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
