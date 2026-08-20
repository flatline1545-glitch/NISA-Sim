/**
 * 新NISA 資産形成・戦闘力シミュレーター コアエンジン (nisa.js)
 * 資産形成(課税手取り線付き) / 出口取崩(現金放置残高を赤点線・受取累計デフォルト非表示) / 暴落テスト / 3スロット / 高解像度画像出力
 */

let currentTab = 'growth'; // 'growth' | 'drawdown'
let drawdownMode = 'fixed'; // 'fixed' | 'percent'
let currentSlot = 1;
let displayView = 'line'; // 'line' | 'radar' | 'diag'
let currentStress = 'none';
let chartInstance = null;
let latestTableData = [];
let radarStats = [50, 50, 50, 50, 50];
let currentDiagTitle = '';

const NISA_MAX_LIFETIME_CAP = 18000000; // 生涯上限 1,800万円
const ANNUAL_MAX_CAP = 3600000;         // 年間上限 360万円
const TAX_RATE = 0.20315;

const STRESS_CONFIG = {
    none: { name: '通常（暴落なし）', short: '通常', dropRate: 0.0, year: 0, desc: '暴落なし（通常の右肩上がりシミュレーション）' },
    lehman: { name: 'リーマン級(-50%)', short: 'リーマン級暴落', dropRate: 0.50, year: 5, desc: '5年目に資産が約50%急落し、約5年かけて元の水準へ回復するテスト' },
    corona: { name: 'コロナ級(-35%)', short: 'コロナ級暴落', dropRate: 0.35, year: 4, desc: '4年目に資産が約35%急落し、約2年で急回復するテスト' },
    dotcom: { name: 'ドットコム級(-45%)', short: 'ITバブル崩壊級', dropRate: 0.45, year: 3, desc: '3年目に資産が約45%下落し、回復まで約7年を要する長期停滞テスト' }
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

// スロット保存機能
function switchSlot(slotNum) {
    saveSlotData(currentSlot);
    currentSlot = slotNum;
    [1, 2, 3].forEach(n => {
        const btn = document.getElementById(`slotBtn${n}`);
        if (btn) btn.classList.toggle('active', n === slotNum);
    });
    loadSlotData(slotNum);
    updateAll();
    showToast(`スロット${slotNum}を読み込みました`);
}

function saveSlotData(slotNum) {
    const data = {
        monthly: document.getElementById('numMonthly')?.value,
        initial: document.getElementById('numInitial')?.value,
        returnRate: document.getElementById('numReturn')?.value,
        horizon: document.getElementById('numHorizon')?.value,
        capToggle: document.getElementById('inputCapToggle')?.checked,
        stress: currentStress,
        drawStart: document.getElementById('numDrawStart')?.value,
        drawMonthly: document.getElementById('numDrawMonthly')?.value,
        drawRate: document.getElementById('numDrawRate')?.value,
        drawReturn: document.getElementById('numDrawReturn')?.value,
        drawdownMode: drawdownMode
    };
    localStorage.setItem(`nisa_slot_${slotNum}`, JSON.stringify(data));
}

function loadSlotData(slotNum) {
    const raw = localStorage.getItem(`nisa_slot_${slotNum}`);
    if (!raw) return;
    try {
        const d = JSON.parse(raw);
        if (d.monthly !== undefined) setPreset('monthly', d.monthly);
        if (d.initial !== undefined) setPreset('initial', d.initial);
        if (d.returnRate !== undefined) setPreset('return', d.returnRate);
        if (d.horizon !== undefined) setPreset('horizon', d.horizon);
        if (d.capToggle !== undefined && document.getElementById('inputCapToggle')) {
            document.getElementById('inputCapToggle').checked = d.capToggle;
        }
        if (d.stress) setStress(d.stress, false);
        if (d.drawStart !== undefined) setPreset('drawStart', d.drawStart);
        if (d.drawMonthly !== undefined) setPreset('drawMonthly', d.drawMonthly);
        if (d.drawRate !== undefined) setPreset('drawRate', d.drawRate);
        if (d.drawReturn !== undefined) setPreset('drawReturn', d.drawReturn);
        if (d.drawdownMode) switchDrawdownMode(d.drawdownMode, false);
    } catch (e) { console.error(e); }
}

// タブ切り替え（資産形成 vs 取り崩し）
function switchTab(tab) {
    currentTab = tab;
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    document.getElementById('tabGrowth')?.classList.toggle('active', tab === 'growth');
    document.getElementById('tabDrawdown')?.classList.toggle('active', tab === 'drawdown');

    const growthCtrl = document.getElementById('growthControls');
    const drawCtrl = document.getElementById('drawdownControls');
    const rowGrowth = document.getElementById('rowGrowthStats');
    const rowDraw = document.getElementById('rowDrawdownStats');
    const btnImport = document.getElementById('btnImportFromGrowth');
    const ctrlTitle = document.getElementById('ctrlTitle');

    if (tab === 'growth') {
        if (growthCtrl) growthCtrl.style.display = 'block';
        if (drawCtrl) drawCtrl.style.display = 'none';
        if (rowGrowth) rowGrowth.style.display = 'grid';
        if (rowDraw) rowDraw.style.display = 'none';
        if (btnImport) btnImport.style.display = 'none';
        if (ctrlTitle) ctrlTitle.innerText = 'シミュレーション条件設定';
        document.getElementById('mainStatHeaderLabel').innerText = '最終資産総額';
    } else {
        if (growthCtrl) growthCtrl.style.display = 'none';
        if (drawCtrl) drawCtrl.style.display = 'block';
        if (rowGrowth) rowGrowth.style.display = 'none';
        if (rowDraw) rowDraw.style.display = 'grid';
        if (btnImport) btnImport.style.display = 'inline-flex';
        if (ctrlTitle) ctrlTitle.innerText = '出口・取り崩し条件設定';
        document.getElementById('mainStatHeaderLabel').innerText = '資産寿命 / 最終残高';
    }
    updateAll();
}

function switchDrawdownMode(mode, triggerUpdate = true) {
    drawdownMode = mode;
    document.getElementById('subTabFixed')?.classList.toggle('active', mode === 'fixed');
    document.getElementById('subTabPercent')?.classList.toggle('active', mode === 'percent');

    const fixedCtrl = document.getElementById('drawControlFixed');
    const pctCtrl = document.getElementById('drawControlPercent');

    if (mode === 'fixed') {
        if (fixedCtrl) fixedCtrl.style.display = 'block';
        if (pctCtrl) pctCtrl.style.display = 'none';
    } else {
        if (fixedCtrl) fixedCtrl.style.display = 'none';
        if (pctCtrl) pctCtrl.style.display = 'block';
    }
    if (triggerUpdate) updateAll();
}

function applyScenario(key) {
    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`scBtn_${key}`)?.classList.add('active');

    if (key === 'standard') {
        switchTab('growth');
        setPreset('monthly', 50000);
        setPreset('initial', 0);
        setPreset('return', 5.0);
        setPreset('horizon', 25);
        setStress('none', false);
    } else if (key === 'sp500_growth') {
        switchTab('growth');
        setPreset('monthly', 100000);
        setPreset('initial', 0);
        setPreset('return', 7.0);
        setPreset('horizon', 20);
        setStress('none', false);
    } else if (key === 'fast_rta') {
        switchTab('growth');
        setPreset('monthly', 300000);
        setPreset('initial', 0);
        setPreset('return', 5.0);
        setPreset('horizon', 5);
        setStress('none', false);
    } else if (key === 'crash_survival') {
        switchTab('growth');
        setPreset('monthly', 50000);
        setPreset('initial', 2400000);
        setPreset('return', 5.0);
        setPreset('horizon', 20);
        setStress('lehman', false);
    } else if (key === 'fire_exit') {
        switchTab('drawdown');
        switchDrawdownMode('fixed', false);
        setPreset('drawStart', 50000000);
        setPreset('drawMonthly', 166000);
        setPreset('drawReturn', 4.0);
    }
    updateAll();
}

function setStress(type, triggerUpdate = true) {
    currentStress = type;
    ['none', 'lehman', 'corona', 'dotcom'].forEach(t => {
        const btn = document.getElementById(`stressBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) btn.classList.toggle('highlight', t === type);
    });
    const infoEl = document.getElementById('stressInfo');
    if (infoEl) infoEl.innerText = STRESS_CONFIG[type].desc;
    if (triggerUpdate) updateAll();
}

function importFromGrowthResult() {
    const currentTotalText = document.getElementById('mainStatHeaderValue')?.innerText || '¥0';
    const numVal = parseInt(currentTotalText.replace(/[^0-9]/g, '')) || 30000000;
    const growthFinalVal = window.__lastGrowthTotal || numVal;
    setPreset('drawStart', Math.round(growthFinalVal));
    showToast('資産形成の結果を取り崩し開始額に代入しました');
    updateAll();
}

function applyPercentMonthly(rate) {
    const startAsset = parseInt(document.getElementById('numDrawStart')?.value) || 0;
    const monthly = Math.round((startAsset * rate) / 12);
    setPreset('drawMonthly', monthly);
    showToast(`開始資産の年${(rate * 100).toFixed(0)}%（月${(monthly / 10000).toFixed(1)}万）に設定しました`);
}

function autoAdjustToAnnualCap() {
    const init = parseInt(document.getElementById('numInitial')?.value) || 0;
    const remainAnnual = Math.max(0, ANNUAL_MAX_CAP - init);
    const targetMonthly = Math.floor(remainAnnual / 12);
    setPreset('monthly', targetMonthly);
    showToast(`年間枠360万円に収まるよう月${(targetMonthly / 10000).toFixed(1)}万円に自動調整しました`);
}

function syncInputs(field, source) {
    const map = {
        monthly: ['numMonthly', 'rangeMonthly'],
        initial: ['numInitial', 'rangeInitial'],
        return: ['numReturn', 'rangeReturn'],
        horizon: ['numHorizon', 'rangeHorizon'],
        drawStart: ['numDrawStart', 'rangeDrawStart'],
        drawMonthly: ['numDrawMonthly', 'rangeDrawMonthly'],
        drawRate: ['numDrawRate', 'rangeDrawRate'],
        drawReturn: ['numDrawReturn', 'rangeDrawReturn']
    };
    const [numId, rangeId] = map[field] || [];
    const numEl = document.getElementById(numId);
    const rangeEl = document.getElementById(rangeId);
    if (!numEl || !rangeEl) return;

    if (source === 'range') {
        numEl.value = rangeEl.value;
    } else if (source === 'num') {
        let val = parseFloat(numEl.value);
        if (!isNaN(val)) rangeEl.value = val;
    }
    updateAll();
}

function setPreset(field, val) {
    const map = {
        monthly: ['numMonthly', 'rangeMonthly'],
        initial: ['numInitial', 'rangeInitial'],
        return: ['numReturn', 'rangeReturn'],
        horizon: ['numHorizon', 'rangeHorizon'],
        drawStart: ['numDrawStart', 'rangeDrawStart'],
        drawMonthly: ['numDrawMonthly', 'rangeDrawMonthly'],
        drawRate: ['numDrawRate', 'rangeDrawRate'],
        drawReturn: ['numDrawReturn', 'rangeDrawReturn']
    };
    const [numId, rangeId] = map[field] || [];
    if (numId && document.getElementById(numId)) document.getElementById(numId).value = val;
    if (rangeId && document.getElementById(rangeId)) document.getElementById(rangeId).value = val;
    updateAll();
}

function switchDisplayView(view) {
    displayView = view;
    document.getElementById('btnViewLine')?.classList.toggle('active', view === 'line');
    document.getElementById('btnViewRadar')?.classList.toggle('active', view === 'radar');
    document.getElementById('btnViewDiag')?.classList.toggle('active', view === 'diag');

    const canvas = document.getElementById('simChart');
    const diagBox = document.getElementById('diagnosisViewBox');

    if (view === 'diag') {
        if (canvas) canvas.style.display = 'none';
        if (diagBox) diagBox.style.display = 'flex';
    } else {
        if (canvas) canvas.style.display = 'block';
        if (diagBox) diagBox.style.display = 'none';
        updateAll();
    }
}

function toggleTable() {
    const wrapper = document.getElementById('tableWrapper');
    const icon = document.getElementById('collapseIcon');
    if (!wrapper || !icon) return;
    wrapper.classList.toggle('open');
    icon.innerText = wrapper.classList.contains('open') ? '▲' : '▼';
}

function saveAndRun() {
    updateAll();
}

// 計算＆描画メインエンジン
function updateAll() {
    if (currentTab === 'growth') {
        calcGrowthMode();
    } else {
        calcDrawdownMode();
    }
}

function calcGrowthMode() {
    const monthly = Math.max(0, parseInt(document.getElementById('numMonthly')?.value) || 0);
    const initial = Math.max(0, parseInt(document.getElementById('numInitial')?.value) || 0);
    const annualReturn = Math.max(0, parseFloat(document.getElementById('numReturn')?.value) || 0);
    const horizon = Math.max(1, parseInt(document.getElementById('numHorizon')?.value) || 1);
    const isCapEnabled = document.getElementById('inputCapToggle')?.checked ?? true;

    // 年間投資枠チェック (月額×12 + 初期投資)
    const firstYearTotal = monthly * 12 + initial;
    const alertBox = document.getElementById('annualCapAlert');
    if (alertBox) {
        if (firstYearTotal > ANNUAL_MAX_CAP) {
            alertBox.style.display = 'block';
            const overVal = firstYearTotal - ANNUAL_MAX_CAP;
            document.getElementById('alertBodyText').innerHTML = `初年度の投資予定額が<b>${fmtYen(firstYearTotal)}</b>となり、年間投資枠（360万円）を<b>${fmtYen(overVal)}超過</b>しています。`;
            const remainAnnual = Math.max(0, ANNUAL_MAX_CAP - initial);
            document.getElementById('targetMonthlyText').innerText = (remainAnnual / 12 / 10000).toFixed(1);
        } else {
            alertBox.style.display = 'none';
        }
    }

    const monthlyRate = (annualReturn / 100) / 12;
    const totalMonths = horizon * 12;

    let balance = initial;
    let principal = initial;

    const labels = ['0年'];
    const dataPrincipal = [initial];
    const dataTotal = [initial];
    const dataTaxedNet = [initial]; // 課税後手取りの点線
    const tableRows = [];
    latestTableData = [];

    const stress = STRESS_CONFIG[currentStress];

    for (let m = 1; m <= totalMonths; m++) {
        const curYear = Math.floor((m - 1) / 12) + 1;
        let add = monthly;

        if (isCapEnabled) {
            if (principal + add > NISA_MAX_LIFETIME_CAP) {
                add = Math.max(0, NISA_MAX_LIFETIME_CAP - principal);
            }
        }
        principal += add;
        balance = (balance + add) * (1 + monthlyRate);

        // 暴落テストの適用
        if (stress.dropRate > 0 && curYear === stress.year && (m % 12 === 0)) {
            balance = balance * (1 - stress.dropRate);
        }

        if (m % 12 === 0) {
            const y = m / 12;
            const gains = Math.max(0, balance - principal);
            const taxSavings = gains * TAX_RATE;
            const taxedNet = balance - taxSavings; // 課税後手取り

            labels.push(y + '年目');
            dataPrincipal.push(Math.round(principal));
            dataTotal.push(Math.round(balance));
            dataTaxedNet.push(Math.round(taxedNet));

            latestTableData.push({
                year: y,
                principal: Math.round(principal),
                balance: Math.round(balance),
                gains: Math.round(gains),
                taxSavings: Math.round(taxSavings)
            });

            tableRows.push(`
        <tr>
          <td>${y}年目</td>
          <td>${fmtYen(principal)}</td>
          <td style="font-weight:700; color:#60a5fa;">${fmtYen(balance)}</td>
          <td style="color:#34d399;">+${fmtYen(gains)}</td>
          <td style="color:#fbbf24; font-weight:700;">+${fmtYen(taxSavings)}</td>
        </tr>
      `);
        }
    }

    const finalPrincipal = principal;
    const finalTotal = balance;
    const finalGains = Math.max(0, finalTotal - finalPrincipal);
    const finalTaxSavings = finalGains * TAX_RATE;
    window.__lastGrowthTotal = finalTotal;

    // 投資戦闘力 (BP) 計算
    const bp = Math.round((finalTotal / 100000) * (1 + annualReturn / 10) * (horizon / 20));
    animateBpCounter(bp);

    document.getElementById('mainStatHeaderValue').innerText = fmtYen(finalTotal);
    document.getElementById('chipPrincipal').innerText = fmtYen(finalPrincipal);
    document.getElementById('chipGains').innerText = `+${fmtYen(finalGains)}`;
    document.getElementById('chipTax').innerText = `+${fmtYen(finalTaxSavings)}`;

    document.getElementById('tableHeader').innerHTML = `
    <tr>
      <th>年数</th>
      <th>投資元本</th>
      <th>運用残高</th>
      <th>運用益(利益)</th>
      <th>節税バリア</th>
    </tr>
  `;
    document.getElementById('tableBody').innerHTML = tableRows.join('');

    // 📊 レーダーパラメータ (0〜100)
    const atk = Math.min(100, Math.round(monthly <= 30000 ? (monthly / 30000) * 60 : 60 + ((monthly - 30000) / 270000) * 40));
    const def = Math.min(100, Math.round(horizon <= 10 ? (horizon / 10) * 50 : 50 + ((horizon - 10) / 30) * 50));
    const cri = annualReturn <= 0 ? 0 : Math.min(100, Math.round((annualReturn / 8.0) * 100));
    const fill = Math.min(100, Math.round((finalPrincipal / NISA_MAX_LIFETIME_CAP) * 100));
    const vit = Math.min(100, Math.round(finalTotal <= 10000000 ? (finalTotal / 10000000) * 60 : 60 + ((finalTotal - 10000000) / 40000000) * 40));
    radarStats = [atk, def, cri, fill, vit];

    if (displayView === 'line') {
        renderNisaTriLineChart(labels, dataPrincipal, dataTotal, dataTaxedNet, '元本合計', '受取資産総額(元本+運用益)', '課税手取り(特定口座比較)');
    } else if (displayView === 'radar') {
        renderNisaRadarChart(['入金火力 (ATK)', '複利耐久 (DEF)', '会心利回り (CRI)', '枠充填度 (FILL)', '資産体力 (VIT)'], radarStats);
    }

    updateNisaDiagnosis({
        mode: 'growth',
        monthly,
        initial,
        returnRate: annualReturn,
        horizon,
        total: finalTotal,
        principal: finalPrincipal,
        gains: finalGains,
        taxSavings: finalTaxSavings,
        currentStress,
        stressConfig: STRESS_CONFIG
    });
}

function calcDrawdownMode() {
    const startAsset = Math.max(0, parseInt(document.getElementById('numDrawStart')?.value) || 0);
    const monthlyDraw = Math.max(0, parseInt(document.getElementById('numDrawMonthly')?.value) || 0);
    const drawRate = Math.max(0.1, parseFloat(document.getElementById('numDrawRate')?.value) || 4.0) / 100;
    const drawReturn = Math.max(0, parseFloat(document.getElementById('numDrawReturn')?.value) || 0);

    const monthlyRate = (drawReturn / 100) / 12;
    const maxYears = 40;
    const totalMonths = maxYears * 12;

    let balance = startAsset;
    let totalWithdrawn = 0;
    let depletedYear = null;

    const labels = ['0年'];
    const dataTotal = [startAsset];
    const dataWithdrawn = [0];
    const dataZeroYieldBalance = [startAsset]; // 現金放置(利回り0%)の残高線
    const tableRows = [];
    latestTableData = [];

    let annualDrawAccum = 0;
    let zeroYieldBal = startAsset;

    for (let m = 1; m <= totalMonths; m++) {
        let curMonthDraw = (drawdownMode === 'fixed') ? monthlyDraw : (balance * (drawRate / 12));
        let zeroMonthDraw = (drawdownMode === 'fixed') ? monthlyDraw : (zeroYieldBal * (drawRate / 12));

        // 運用しながら取り崩し
        if (balance <= 0) {
            curMonthDraw = 0;
            if (depletedYear === null) depletedYear = m / 12;
        } else if (balance < curMonthDraw) {
            curMonthDraw = balance;
            balance = 0;
            if (depletedYear === null) depletedYear = m / 12;
        } else {
            balance = (balance - curMonthDraw) * (1 + monthlyRate);
        }

        // 現金放置(利回り0%)での取り崩し
        if (zeroYieldBal > 0) {
            zeroYieldBal = Math.max(0, zeroYieldBal - zeroMonthDraw);
        }

        totalWithdrawn += curMonthDraw;
        annualDrawAccum += curMonthDraw;

        if (m % 12 === 0) {
            const y = m / 12;
            labels.push(y + '年目');
            dataTotal.push(Math.round(balance));
            dataWithdrawn.push(Math.round(totalWithdrawn));
            dataZeroYieldBalance.push(Math.round(zeroYieldBal));

            latestTableData.push({
                year: y,
                annualDraw: Math.round(annualDrawAccum),
                totalWithdrawn: Math.round(totalWithdrawn),
                balance: Math.round(balance)
            });

            tableRows.push(`
        <tr>
          <td>${y}年目</td>
          <td style="color:#fbbf24;">${fmtYen(annualDrawAccum)}</td>
          <td style="color:#34d399;">${fmtYen(totalWithdrawn)}</td>
          <td style="font-weight:700; color:#60a5fa;">${fmtYen(balance)}</td>
        </tr>
      `);
            annualDrawAccum = 0;
        }
    }

    let zeroYieldDeplete = startAsset > 0 && monthlyDraw > 0 ? (startAsset / (monthlyDraw * 12)) : 0;
    let diffYearsText = '--';
    if (depletedYear) {
        const diff = depletedYear - zeroYieldDeplete;
        diffYearsText = diff > 0 ? `+${diff.toFixed(1)}年延命` : `${depletedYear.toFixed(1)}年で枯渇`;
    } else {
        diffYearsText = '永続（減らない）';
    }

    document.getElementById('mainStatHeaderValue').innerText = depletedYear ? `${depletedYear.toFixed(1)}年で枯渇` : '資産永続（枯渇なし）';
    document.getElementById('chipDrawAnnualLabel').innerText = drawdownMode === 'fixed' ? '年間取崩額' : '初年取崩額(目安)';
    document.getElementById('chipDrawAnnual').innerText = drawdownMode === 'fixed' ? fmtYen(monthlyDraw * 12) : fmtYen(startAsset * drawRate);
    document.getElementById('chipDrawTotal').innerText = fmtYen(totalWithdrawn);
    document.getElementById('chipDrawDiff').innerText = diffYearsText;

    document.getElementById('bpValue').innerText = 'EXIT';

    document.getElementById('tableHeader').innerHTML = `
    <tr>
      <th>年数</th>
      <th>年間受取額</th>
      <th>受取累計額</th>
      <th>資産残高</th>
    </tr>
  `;
    document.getElementById('tableBody').innerHTML = tableRows.join('');

    if (displayView === 'line') {
        renderNisaTriLineChart(labels, dataWithdrawn, dataTotal, dataZeroYieldBalance, '受取累計額', '資産残高(運用継続)', '現金放置残高(利回り0%)');
    } else if (displayView === 'radar') {
        const atk = Math.min(100, Math.round((startAsset / 100000000) * 100));
        const def = depletedYear ? Math.min(100, Math.round((depletedYear / 30) * 100)) : 100;
        const cri = Math.min(100, Math.round((drawReturn / 8.0) * 100));
        const fill = Math.min(100, Math.round((totalWithdrawn / (startAsset || 1)) * 50));
        const vit = Math.min(100, Math.round((dataTotal[dataTotal.length - 1] / (startAsset || 1)) * 100));
        radarStats = [atk, def, cri, fill, vit];
        renderNisaRadarChart(['初期資産 (ATK)', '延命寿命 (DEF)', '運用力 (CRI)', '回収効率 (FILL)', '残存体力 (VIT)'], radarStats);
    }

    updateNisaDiagnosis({
        mode: drawdownMode === 'fixed' ? 'drawdown' : 'drawdown_percent',
        total: startAsset,
        monthlyDraw,
        drawRate,
        drawReturn,
        depletedYear,
        totalWithdrawn
    });
}

function animateBpCounter(targetBp) {
    const el = document.getElementById('bpValue');
    if (!el) return;
    el.innerText = targetBp.toLocaleString();
}

/* 3本ライン（青エリア・緑エリア・点線）の汎用描画 */
function renderNisaTriLineChart(labels, data1, data2, dataDashed, l1, l2, l3) {
    const canvas = document.getElementById('simChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const isDrawdown = (currentTab === 'drawdown');
    const dashedColor = isDrawdown ? '#ef4444' : '#fbbf24'; // 出口モードは赤点線、形成モードは黄点線

    if (chartInstance && chartInstance.config.type === 'line') {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].label = l1;
        chartInstance.data.datasets[0].data = data1;
        chartInstance.data.datasets[0].hidden = isDrawdown;
        chartInstance.data.datasets[1].label = l2;
        chartInstance.data.datasets[1].data = data2;
        chartInstance.data.datasets[2].label = l3;
        chartInstance.data.datasets[2].data = dataDashed;
        chartInstance.data.datasets[2].borderColor = dashedColor;
        chartInstance.update('none');
        return;
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: l1,
                    data: data1,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.75)',
                    borderWidth: 1.5,
                    fill: isDrawdown ? false : 'origin',
                    pointStyle: 'circle',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    hidden: isDrawdown, // 出口モード時はデフォルト非表示
                    order: 3
                },
                {
                    label: l2,
                    data: data2,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.45)',
                    borderWidth: 1.8,
                    fill: isDrawdown ? 'origin' : 0,
                    pointStyle: 'circle',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 2
                },
                {
                    label: l3,
                    data: dataDashed,
                    borderColor: dashedColor, // 出口モードは赤(#ef4444)、形成は黄(#fbbf24)
                    borderWidth: 2,
                    borderDash: [5, 4],
                    fill: false,
                    pointStyle: 'line',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 1
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#d1d5db',
                        font: { size: 10 },
                        boxWidth: 14,
                        usePointStyle: true,
                        sort: (a, b) => a.datasetIndex - b.datasetIndex
                    }
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

function renderNisaRadarChart(labels, stats) {
    const canvas = document.getElementById('simChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartInstance && chartInstance.config.type === 'radar') {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = stats;
        chartInstance.update('none');
        return;
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'ステータス',
                data: stats,
                backgroundColor: 'rgba(16, 185, 129, 0.35)',
                borderColor: '#34d399',
                borderWidth: 2,
                pointBackgroundColor: '#fbbf24',
                pointBorderColor: '#fff',
                pointRadius: 3.5
            }]
        },
        options: {
            animation: false,
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
                    ticks: { display: false, stepSize: 20 }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => `能力スコア: ${c.raw} / 100` } }
            }
        }
    });
}

function updateNisaDiagnosis(params) {
    if (typeof window.generateDiagnosis !== 'function') return;

    const diag = window.generateDiagnosis(params);
    currentDiagTitle = diag.title;

    const diagTitleEl = document.getElementById('diagTitle');
    const diagLevelEl = document.getElementById('diagLevelTag');
    const diagTagsEl = document.getElementById('diagTags');
    const carteEl = document.getElementById('carteContentArea');
    const rxBox = document.getElementById('prescriptionBox');
    const badgeEl = document.getElementById('fpStatusBadge');

    if (diagTitleEl) diagTitleEl.innerText = diag.title;
    if (diagLevelEl) diagLevelEl.innerText = diag.level;
    if (diagTagsEl) diagTagsEl.innerHTML = diag.tags.map(t => `<span class="style-tag">${t}</span>`).join('');
    if (carteEl) carteEl.innerHTML = diag.carteHtml;
    if (badgeEl) badgeEl.innerText = diag.statusBadgeText;

    if (rxBox) {
        if (diag.rxButtonHtml) {
            rxBox.innerHTML = diag.rxButtonHtml;
            rxBox.style.display = 'block';
        } else {
            rxBox.innerHTML = '';
            rxBox.style.display = 'none';
        }
    }
}

/* 📸 NISA 高解像度レポート画像のエクスポート（アスペクト比完全維持・歪み解消版） */
function exportChartImage() {
    const chartCanvas = document.getElementById('simChart');
    if (!chartCanvas) {
        showToast('グラフが生成されていません');
        return;
    }

    const prevView = displayView;
    if (prevView === 'diag') {
        switchDisplayView('line');
    }

    setTimeout(() => {
        try {
            const outW = 1200;
            const outH = 800;
            const offCanvas = document.createElement('canvas');
            offCanvas.width = outW;
            offCanvas.height = outH;
            const ctx = offCanvas.getContext('2d');

            const bgGrad = ctx.createLinearGradient(0, 0, 0, outH);
            bgGrad.addColorStop(0, '#0f172a');
            bgGrad.addColorStop(1, '#090d16');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, outW, outH);

            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, outW - 2, outH - 2);

            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(currentTab === 'growth' ? '新NISA 資産形成シミュレーション レポート' : '新NISA 出口・取り崩しシミュレーション レポート', 36, 40);

            const cardX = 36, cardY = 55, cardW = outW - 72, cardH = 145;
            ctx.fillStyle = '#131c2e';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.5;
            roundRect(ctx, cardX, cardY, cardW, cardH, 10, true, true);

            const totalVal = document.getElementById('mainStatHeaderValue')?.innerText || '¥0';
            const prVal = document.getElementById('chipPrincipal')?.innerText || '¥0';
            const gnVal = document.getElementById('chipGains')?.innerText || '¥0';
            const taxVal = document.getElementById('chipTax')?.innerText || '¥0';
            const title = currentDiagTitle || '新NISA資産形成診断';

            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(currentTab === 'growth' ? '💰 最終到達 資産総額' : '⏳ 資産寿命 / 最終判定', cardX + 20, cardY + 26);
            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(totalVal, cardX + 20, cardY + 54);

            if (currentTab === 'growth') {
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px sans-serif';
                ctx.fillText(`投資元本: `, cardX + 20, cardY + 85);
                ctx.fillStyle = '#93c5fd';
                ctx.font = 'bold 13px sans-serif';
                ctx.fillText(prVal, cardX + 80, cardY + 85);

                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px sans-serif';
                ctx.fillText(`運用益(非課税): `, cardX + 210, cardY + 85);
                ctx.fillStyle = '#34d399';
                ctx.font = 'bold 13px sans-serif';
                ctx.fillText(gnVal, cardX + 310, cardY + 85);

                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px sans-serif';
                ctx.fillText(`節税効果: `, cardX + 440, cardY + 85);
                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold 13px sans-serif';
                ctx.fillText(taxVal, cardX + 500, cardY + 85);
            } else {
                const dAnn = document.getElementById('chipDrawAnnual')?.innerText || '¥0';
                const dTot = document.getElementById('chipDrawTotal')?.innerText || '¥0';
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px sans-serif';
                ctx.fillText(`年間取崩額: `, cardX + 20, cardY + 85);
                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold 13px sans-serif';
                ctx.fillText(dAnn, cardX + 90, cardY + 85);

                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px sans-serif';
                ctx.fillText(`受取累計額: `, cardX + 220, cardY + 85);
                ctx.fillStyle = '#34d399';
                ctx.font = 'bold 13px sans-serif';
                ctx.fillText(dTot, cardX + 295, cardY + 85);
            }

            ctx.fillStyle = '#fef08a';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(title, cardX + 20, cardY + 122);

            const m = parseInt(document.getElementById('numMonthly')?.value) || 0;
            const y = document.getElementById('numHorizon')?.value || 0;
            const r = document.getElementById('numReturn')?.value || 0;

            const cond1 = currentTab === 'growth' ? `【投資枠】 新NISA (つみたて＋成長枠)` : `【出口方式】 ${drawdownMode === 'fixed' ? '定額取り崩し' : '定率取り崩し'}`;
            const cond2 = currentTab === 'growth' ? `【積立条件】 毎月 ¥${m.toLocaleString()}  /  期間 ${y}年  /  年利 ${r}%` : `【取崩条件】 想定利回り ${document.getElementById('numDrawReturn')?.value}%`;

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px sans-serif';
            ctx.fillText(cond1, cardX + 650, cardY + 45);
            ctx.fillText(cond2, cardX + 650, cardY + 75);

            const graphX = 36, graphY = 215, graphW = outW - 72, graphH = 540;
            ctx.fillStyle = '#0f172a';
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            roundRect(ctx, graphX, graphY, graphW, graphH, 10, true, true);

            const srcW = chartCanvas.width;
            const srcH = chartCanvas.height;
            const maxDrawW = graphW - 20;
            const maxDrawH = graphH - 20;

            const scale = Math.min(maxDrawW / srcW, maxDrawH / srcH);
            const drawW = srcW * scale;
            const drawH = srcH * scale;
            const drawX = graphX + 10 + (maxDrawW - drawW) / 2;
            const drawY = graphY + 10 + (maxDrawH - drawH) / 2;

            ctx.drawImage(chartCanvas, drawX, drawY, drawW, drawH);

            ctx.fillStyle = '#64748b';
            ctx.font = '11px sans-serif';
            const nowStr = new Date().toLocaleString('ja-JP');
            ctx.fillText(`作成日時: ${nowStr}  |  新NISA 資産形成・戦闘力シミュレーター`, 40, outH - 15);

            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = offCanvas.toDataURL('image/png', 1.0);
            a.download = `新NISAシミュレーション_${dateStr}.png`;
            a.click();
            showToast('📸 高解像度レポート画像を保存しました！');

        } catch (e) {
            console.error(e);
            showToast('画像の生成に失敗しました');
        } finally {
            if (prevView === 'diag') {
                switchDisplayView('diag');
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

function shareOnX() {
    const totStr = document.getElementById('mainStatHeaderValue')?.innerText || '¥0';
    const bpStr = document.getElementById('bpValue')?.innerText || '0';
    const siteUrl = window.location.href.split('?')[0];

    const text = `【新NISAシミュレーター】
私の新NISA投資戦闘力は…【 BP: ${bpStr} 】！
最終到達資産は 【 ${totStr} 】！

#新NISA #つみたてNISA #FIRE #資産形成
`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`;
    window.open(shareUrl, '_blank');
}

function copySimulationUrl() {
    const params = new URLSearchParams();
    params.set('m', document.getElementById('numMonthly')?.value || 50000);
    params.set('init', document.getElementById('numInitial')?.value || 0);
    params.set('y', document.getElementById('numHorizon')?.value || 25);
    params.set('r', document.getElementById('numReturn')?.value || 5.0);

    const fullUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('シミュレーション設定URLをコピーしました！');
    }).catch(() => {
        prompt('以下のURLをコピーしてください:', fullUrl);
    });
}

function exportCsvReport() {
    if (!latestTableData || latestTableData.length === 0) {
        showToast('出力可能なデータがありません');
        return;
    }
    const lines = [];
    const nowStr = new Date().toLocaleString('ja-JP');
    const dateFileStr = new Date().toISOString().slice(0, 10);

    lines.push('# ==========================================');
    lines.push('# 新NISA 資産形成・戦闘力シミュレーション レポート');
    lines.push(`# 出力日時: ${nowStr}`);
    lines.push('# ------------------------------------------');
    lines.push(`# モード, ${currentTab === 'growth' ? '資産形成' : '出口・取り崩し'}`);
    lines.push(`# 最終到達, ${document.getElementById('mainStatHeaderValue')?.innerText}`);
    lines.push('# ==========================================');
    lines.push('');

    if (currentTab === 'growth') {
        lines.push('経過年数,投資元本累計(円),運用総額(円),運用益(円),非課税節税額(円)');
        latestTableData.forEach(row => {
            lines.push(`${row.year}年目,${row.principal},${row.balance},${row.gains},${row.taxSavings}`);
        });
    } else {
        lines.push('経過年数,年間受取額(円),受取累計額(円),資産残高(円)');
        latestTableData.forEach(row => {
            lines.push(`${row.year}年目,${row.annualDraw},${row.totalWithdrawn},${row.balance}`);
        });
    }

    const csvContent = '\uFEFF' + lines.join('\n') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `新NISAシミュレーション_${dateFileStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📄 CSVレポートを出力しました！');
}

function initNisaApp() {
    loadSlotData(1);
    const params = new URLSearchParams(window.location.search);
    if (params.has('m')) setPreset('monthly', params.get('m'));
    if (params.has('init')) setPreset('initial', params.get('init'));
    if (params.has('y')) setPreset('horizon', params.get('y'));
    if (params.has('r')) setPreset('return', params.get('r'));

    updateAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNisaApp);
} else {
    initNisaApp();
}