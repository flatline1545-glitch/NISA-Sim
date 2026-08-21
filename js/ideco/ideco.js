/**
 * iDeCo(イデコ) 節税＆資産形成シミュレーター コアエンジン (ideco.js)
 * 所得控除・運用益非課税・節税レーダー・専業主婦アラート・高解像度画像出力・スマホUI快適化 完全対応版
 */

let currentJob = 'employee1';
let displayView = 'line';
let chartInstance = null;
let latestTableData = [];
let radarStats = [50, 50, 50, 50, 50];
let currentDiagTitle = '';

// 職種別の上限設定
const JOB_CONFIG = {
    employee1: { name: '会社員(企業年金なし)', max: 23000, default: 23000, desc: '第2号被保険者（企業年金未加入）' },
    employee2: { name: '会社員(企業年金あり)', max: 20000, default: 20000, desc: '第2号被保険者（企業型DC・確定給付型あり）' },
    public: { name: '公務員', max: 12000, default: 12000, desc: '第2号被保険者（共済組合員）' },
    self: { name: '自営業・フリーランス', max: 68000, default: 68000, desc: '第1号被保険者（国民年金基金と合算枠）' },
    homemaker: { name: '専業主婦・主夫', max: 23000, default: 23000, desc: '第3号被保険者（配偶者の扶養内）' }
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

// 職種プリセットの適用
function applyJobPreset(jobKey) {
    currentJob = jobKey;
    const cfg = JOB_CONFIG[jobKey];

    Object.keys(JOB_CONFIG).forEach(k => {
        const btn = document.getElementById('scJob_' + k);
        if (btn) btn.classList.toggle('active', k === jobKey);
    });

    const rangeMonthly = document.getElementById('rangeMonthly');
    const numMonthly = document.getElementById('numMonthly');
    const maxBtn = document.getElementById('btnMaxMonthly');
    const homemakerAlert = document.getElementById('homemakerAlert');
    const numInc = document.getElementById('numIncome');
    const rangeInc = document.getElementById('rangeIncome');

    if (rangeMonthly && numMonthly) {
        rangeMonthly.max = cfg.max;
        numMonthly.max = cfg.max;

        const curVal = parseInt(numMonthly.value) || cfg.default;
        const nextVal = Math.min(cfg.max, curVal);
        numMonthly.value = nextVal;
        rangeMonthly.value = nextVal;
    }

    if (maxBtn) {
        maxBtn.innerText = `${(cfg.max / 10000).toFixed(cfg.max % 10000 === 0 ? 0 : 1)}万(上限)`;
        maxBtn.setAttribute('onclick', `setIdecoPreset('monthly', ${cfg.max})`);
    }

    // 専業主婦選択時の特別UI制御
    if (jobKey === 'homemaker') {
        if (homemakerAlert) homemakerAlert.style.display = 'block';
        if (numInc) { numInc.value = 0; numInc.disabled = true; }
        if (rangeInc) { rangeInc.value = 0; rangeInc.disabled = true; }
    } else {
        if (homemakerAlert) homemakerAlert.style.display = 'none';
        if (numInc) { numInc.disabled = false; if (parseInt(numInc.value) === 0) numInc.value = 500; }
        if (rangeInc) { rangeInc.disabled = false; if (parseInt(rangeInc.value) === 0) rangeInc.value = 500; }
    }

    updateAll();
}

// 年収から概算所得税率＋住民税率（10%）を判定
function estimateTaxRate(incomeManYen, jobKey) {
    if (jobKey === 'homemaker' || incomeManYen <= 103) {
        return { incomeTaxRate: 0, residentTaxRate: 0, totalRate: 0 };
    }

    const incomeYen = incomeManYen * 10000;
    let employmentDeduction = 0;

    if (incomeYen <= 1625000) {
        employmentDeduction = 550000;
    } else if (incomeYen <= 1800000) {
        employmentDeduction = incomeYen * 0.4 - 100000;
    } else if (incomeYen <= 3600000) {
        employmentDeduction = incomeYen * 0.3 + 80000;
    } else if (incomeYen <= 6600000) {
        employmentDeduction = incomeYen * 0.2 + 440000;
    } else if (incomeYen <= 8500000) {
        employmentDeduction = incomeYen * 0.1 + 1100000;
    } else {
        employmentDeduction = 1950000;
    }

    const basicDeduction = 480000;
    const socialInsurance = incomeYen * 0.145;
    const taxableIncome = Math.max(0, incomeYen - employmentDeduction - basicDeduction - socialInsurance);

    let incomeTaxRate = 0.05;
    if (taxableIncome <= 1950000) {
        incomeTaxRate = 0.05;
    } else if (taxableIncome <= 3300000) {
        incomeTaxRate = 0.10;
    } else if (taxableIncome <= 6950000) {
        incomeTaxRate = 0.20;
    } else if (taxableIncome <= 9000000) {
        incomeTaxRate = 0.23;
    } else if (taxableIncome <= 18000000) {
        incomeTaxRate = 0.33;
    } else {
        incomeTaxRate = 0.40;
    }

    const residentTaxRate = 0.10;

    return {
        incomeTaxRate: incomeTaxRate,
        residentTaxRate: residentTaxRate,
        totalRate: incomeTaxRate + residentTaxRate
    };
}

function syncIdecoInputs(field, source) {
    const numEl = document.getElementById(
        field === 'income' ? 'numIncome' :
            field === 'monthly' ? 'numMonthly' :
                field === 'horizon' ? 'numHorizon' : 'numReturn'
    );
    const rangeEl = document.getElementById(
        field === 'income' ? 'rangeIncome' :
            field === 'monthly' ? 'rangeMonthly' :
                field === 'horizon' ? 'rangeHorizon' : 'rangeReturn'
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
    updateAll();
}

function setIdecoPreset(field, val) {
    if (field === 'income') {
        document.getElementById('numIncome').value = val;
        document.getElementById('rangeIncome').value = val;
    } else if (field === 'monthly') {
        document.getElementById('numMonthly').value = val;
        document.getElementById('rangeMonthly').value = val;
    } else if (field === 'horizon') {
        document.getElementById('numHorizon').value = val;
        document.getElementById('rangeHorizon').value = val;
    } else if (field === 'return') {
        document.getElementById('numReturn').value = val;
        document.getElementById('rangeReturn').value = val;
    }
    updateAll();
}

function switchIdecoDisplay(view) {
    displayView = view;
    document.getElementById('btnViewLine')?.classList.toggle('active', view === 'line');
    document.getElementById('btnViewRadar')?.classList.toggle('active', view === 'radar');
    document.getElementById('btnViewDiag')?.classList.toggle('active', view === 'diag');

    const canvas = document.getElementById('idecoChart');
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

function updateAll() {
    const incomeManYen = Math.max(0, parseInt(document.getElementById('numIncome')?.value) || 0);
    const monthly = Math.max(5000, parseInt(document.getElementById('numMonthly')?.value) || 5000);
    const horizon = Math.max(1, parseInt(document.getElementById('numHorizon')?.value) || 1);
    const annualReturn = Math.max(0, parseFloat(document.getElementById('numReturn')?.value) || 0);
    const jobCfg = JOB_CONFIG[currentJob] || JOB_CONFIG.employee1;

    const taxRates = estimateTaxRate(incomeManYen, currentJob);
    const annualContribution = monthly * 12;
    const annualTaxSave = annualContribution * taxRates.totalRate;
    const totalTaxSave = annualTaxSave * horizon;

    const monthlyRate = (annualReturn / 100) / 12;
    const totalMonths = horizon * 12;

    let balance = 0;
    let principal = 0;

    const labels = ['0年'];
    const dataPrincipal = [0];
    const dataTotal = [0];
    const dataRealCost = [0];
    const tableRows = [];
    latestTableData = [];

    let accTaxSave = 0;

    for (let m = 1; m <= totalMonths; m++) {
        principal += monthly;
        balance = balance * (1 + monthlyRate) + monthly;

        if (m % 12 === 0) {
            const y = m / 12;
            accTaxSave = annualTaxSave * y;
            const gains = balance - principal;
            const realCost = Math.max(0, principal - accTaxSave);
            const totalBenefit = gains + accTaxSave;

            labels.push(y + '年目');
            dataPrincipal.push(Math.round(principal));
            dataTotal.push(Math.round(balance));
            dataRealCost.push(Math.round(realCost));

            latestTableData.push({
                year: y,
                principal: Math.round(principal),
                balance: Math.round(balance),
                annualTaxSave: Math.round(annualTaxSave),
                accTaxSave: Math.round(accTaxSave),
                totalBenefit: Math.round(totalBenefit)
            });

            tableRows.push(`
        <tr>
          <td>${y}年目</td>
          <td>${fmtYen(principal)}</td>
          <td style="font-weight:700; color:#60a5fa;">${fmtYen(balance)}</td>
          <td style="color:#fbbf24;">${fmtYen(annualTaxSave)}</td>
          <td style="color:#fbbf24; font-weight:700;">+${fmtYen(accTaxSave)}</td>
          <td style="color:#34d399; font-weight:700;">+${fmtYen(totalBenefit)}</td>
        </tr>
      `);
        }
    }

    const finalPrincipal = principal;
    const finalTotal = balance;
    const finalGains = finalTotal - finalPrincipal;

    const mainTaxEl = document.getElementById('mainTaxSaveValue');
    const mainTotEl = document.getElementById('mainTotalValue');
    const chipTaxEl = document.getElementById('chipAnnualTaxSave');
    const chipPrEl = document.getElementById('chipPrincipal');
    const chipGnEl = document.getElementById('chipGains');
    const tblBody = document.getElementById('tableBody');

    if (mainTaxEl) mainTaxEl.innerText = fmtYen(totalTaxSave);
    if (mainTotEl) mainTotEl.innerText = fmtYen(finalTotal);
    if (chipTaxEl) chipTaxEl.innerText = `${fmtYen(annualTaxSave)}/年`;
    if (chipPrEl) chipPrEl.innerText = fmtYen(finalPrincipal);
    if (chipGnEl) chipGnEl.innerText = `+${fmtYen(finalGains)}`;
    if (tblBody) tblBody.innerHTML = tableRows.join('');

    // 📊 5大ステータス計算 (0〜100)
    const fillRatio = Math.min(1.0, monthly / jobCfg.max);

    let baseTaxScore = 0;
    if (currentJob === 'homemaker' || incomeManYen <= 103) {
        baseTaxScore = 10;
    } else if (taxRates.totalRate <= 0.15) {
        baseTaxScore = 50 + (taxRates.totalRate / 0.15) * 10;
    } else if (taxRates.totalRate <= 0.20) {
        baseTaxScore = 65 + ((taxRates.totalRate - 0.15) / 0.05) * 10;
    } else if (taxRates.totalRate <= 0.30) {
        baseTaxScore = 75 + ((taxRates.totalRate - 0.20) / 0.10) * 15;
    } else {
        baseTaxScore = Math.min(100, 90 + ((taxRates.totalRate - 0.30) / 0.13) * 10);
    }
    const atk = Math.min(100, Math.max(10, Math.round(baseTaxScore * (0.5 + fillRatio * 0.5))));

    let def = 0;
    if (horizon <= 10) {
        def = Math.round(20 + (horizon / 10) * 30);
    } else if (horizon <= 20) {
        def = Math.round(50 + ((horizon - 10) / 10) * 22);
    } else if (horizon <= 30) {
        def = Math.round(72 + ((horizon - 20) / 10) * 23);
    } else {
        def = Math.min(100, Math.round(95 + ((horizon - 30) / 8) * 5));
    }

    let cri = 0;
    if (annualReturn <= 0) {
        cri = 0;
    } else if (annualReturn <= 3.0) {
        cri = Math.round((annualReturn / 3.0) * 50);
    } else if (annualReturn <= 5.0) {
        cri = Math.round(50 + ((annualReturn - 3.0) / 2.0) * 25);
    } else if (annualReturn <= 7.0) {
        cri = Math.round(75 + ((annualReturn - 5.0) / 2.0) * 15);
    } else {
        cri = Math.min(100, Math.round(90 + ((annualReturn - 7.0) / 3.0) * 10));
    }

    let guard = 0;
    if (currentJob === 'homemaker' || incomeManYen <= 103) {
        guard = 15;
    } else {
        guard = Math.min(100, Math.round(30 + fillRatio * 70));
    }

    let vit = 0;
    if (finalTotal <= 0) {
        vit = 0;
    } else if (finalTotal <= 5000000) {
        vit = Math.round((finalTotal / 5000000) * 55);
    } else if (finalTotal <= 10000000) {
        vit = Math.round(55 + ((finalTotal - 5000000) / 5000000) * 20);
    } else if (finalTotal <= 20000000) {
        vit = Math.round(75 + ((finalTotal - 10000000) / 10000000) * 15);
    } else {
        vit = Math.min(100, Math.round(90 + ((finalTotal - 20000000) / 10000000) * 10));
    }

    radarStats = [atk, def, cri, guard, vit];

    if (displayView === 'line') {
        renderIdecoLineChart(labels, dataPrincipal, dataTotal, dataRealCost);
    } else if (displayView === 'radar') {
        renderIdecoRadarChart(['所得税粉砕 (ATK)', '年金防衛 (DEF)', '会心利回り (CRI)', '節税障壁 (GUARD)', '資産体力 (VIT)'], radarStats);
    }

    updateIdecoDiagnosis(incomeManYen, monthly, horizon, annualReturn, annualTaxSave, totalTaxSave, finalGains, finalTotal);
}

function renderIdecoLineChart(labels, dataPrincipal, dataTotal, dataRealCost) {
    const canvas = document.getElementById('idecoChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartInstance && chartInstance.config.type === 'line') {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = dataPrincipal;
        chartInstance.data.datasets[1].data = dataTotal;
        chartInstance.data.datasets[2].data = dataRealCost;
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
                    label: '掛金元本合計',
                    data: dataPrincipal,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.75)',
                    borderWidth: 1.5,
                    fill: 'origin',
                    pointStyle: 'circle',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 3
                },
                {
                    label: '受取資産総額(元本+運用益)',
                    data: dataTotal,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.45)',
                    borderWidth: 1.8,
                    fill: 0,
                    pointStyle: 'circle',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 2
                },
                {
                    label: '実質負担額(節税引後)',
                    data: dataRealCost,
                    borderColor: '#fbbf24',
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

function renderIdecoRadarChart(labels, stats) {
    const canvas = document.getElementById('idecoChart');
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
                label: '節税ビルド',
                data: stats,
                backgroundColor: 'rgba(59, 130, 246, 0.35)',
                borderColor: '#60a5fa',
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
                tooltip: {
                    callbacks: {
                        label: (context) => `節税ステータス: ${context.raw} / 100`
                    }
                }
            }
        }
    });
}

function updateIdecoDiagnosis(income, monthly, horizon, annualReturn, annualTax, totalTax, gains, total) {
    if (typeof window.generateIdecoDiagnosis !== 'function') return;

    const diag = window.generateIdecoDiagnosis({
        income,
        monthly,
        horizon,
        annualReturn,
        annualTax,
        totalTax,
        gains,
        total,
        currentJob
    });

    currentDiagTitle = diag.title;
    const diagTitleEl = document.getElementById('diagTitle');
    const diagLevelEl = document.getElementById('diagLevelTag');
    const diagTagsEl = document.getElementById('diagTags');
    const carteEl = document.getElementById('carteContentArea');

    if (diagTitleEl) diagTitleEl.innerText = diag.title;
    if (diagLevelEl) diagLevelEl.innerText = diag.level;
    if (diagTagsEl) diagTagsEl.innerHTML = diag.tags.map(t => `<span class="style-tag">${t}</span>`).join('');
    if (carteEl) carteEl.innerHTML = diag.carteHtml + (diag.rxButtonHtml || '');
}

/* 📸 iDeCo 高解像度レポート画像のエクスポート（アスペクト比完全維持・歪み解消版） */
function exportIdecoChartImage() {
    const chartCanvas = document.getElementById('idecoChart');
    if (!chartCanvas) {
        showToast('グラフが生成されていません');
        return;
    }

    const prevView = displayView;
    if (prevView === 'diag') {
        switchIdecoDisplay('line');
    }

    setTimeout(() => {
        try {
            const outW = 1200;
            const outH = 800;
            const offCanvas = document.createElement('canvas');
            offCanvas.width = outW;
            offCanvas.height = outH;
            const ctx = offCanvas.getContext('2d');

            // 1. 背景グラデーション
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
            ctx.fillText('iDeCo(イデコ) 節税＆資産形成シミュレーション レポート', 36, 40);

            // 3. サマリーカード
            const cardX = 36, cardY = 55, cardW = outW - 72, cardH = 145;
            ctx.fillStyle = '#131c2e';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            roundRect(ctx, cardX, cardY, cardW, cardH, 10, true, true);

            const taxVal = document.getElementById('mainTaxSaveValue')?.innerText || '¥0';
            const totalVal = document.getElementById('mainTotalValue')?.innerText || '¥0';
            const annualTaxVal = document.getElementById('chipAnnualTaxSave')?.innerText || '¥0/年';
            const prVal = document.getElementById('chipPrincipal')?.innerText || '¥0';
            const gnVal = document.getElementById('chipGains')?.innerText || '¥0';
            const title = currentDiagTitle || 'iDeCo節税診断';

            // メインスタッツ（通算節税額 ＆ 60歳資産総額）
            ctx.fillStyle = '#93c5fd';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('🛡️ 通算節税額（手取り増）', cardX + 20, cardY + 26);
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(taxVal, cardX + 20, cardY + 54);

            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('💰 60歳受取 資産総額', cardX + 250, cardY + 26);
            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(totalVal, cardX + 250, cardY + 54);

            // サブスタッツ（毎年の節税 / 掛金元本 / 運用益）
            ctx.fillStyle = '#cbd5e1';
            ctx.font = '12px sans-serif';
            ctx.fillText(`毎年の節税: `, cardX + 20, cardY + 85);
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(annualTaxVal, cardX + 90, cardY + 85);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '12px sans-serif';
            ctx.fillText(`掛金元本: `, cardX + 200, cardY + 85);
            ctx.fillStyle = '#93c5fd';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(prVal, cardX + 260, cardY + 85);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '12px sans-serif';
            ctx.fillText(`運用益: `, cardX + 370, cardY + 85);
            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(gnVal, cardX + 420, cardY + 85);

            // 称号
            ctx.fillStyle = '#fef08a';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(title, cardX + 20, cardY + 122);

            // 右側：設定条件
            const jobName = JOB_CONFIG[currentJob].name;
            const inc = document.getElementById('numIncome')?.value || 0;
            const m = parseInt(document.getElementById('numMonthly')?.value) || 0;
            const y = document.getElementById('numHorizon')?.value || 0;
            const r = document.getElementById('numReturn')?.value || 0;

            const cond1 = `【職種区分】 ${jobName}  (年収目安: ¥${inc}万)`;
            const cond2 = `【積立条件】 毎月 ¥${m.toLocaleString()}  /  期間 ${y}年  /  年利 ${r}%`;

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px sans-serif';
            ctx.fillText(cond1, cardX + 620, cardY + 45);
            ctx.fillText(cond2, cardX + 620, cardY + 75);

            // 4. グラフ描画（アスペクト比完全維持）
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

            // 5. フッター
            ctx.fillStyle = '#64748b';
            ctx.font = '11px sans-serif';
            const nowStr = new Date().toLocaleString('ja-JP');
            ctx.fillText(`作成日時: ${nowStr}  |  iDeCo(イデコ) 節税＆資産形成シミュレーター`, 40, outH - 15);

            // ダウンロード実行
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = offCanvas.toDataURL('image/png', 1.0);
            a.download = `iDeCo節税シミュレーション_${dateStr}.png`;
            a.click();
            showToast('📸 高解像度レポート画像を保存しました！');

        } catch (e) {
            console.error(e);
            showToast('画像の生成に失敗しました');
        } finally {
            if (prevView === 'diag') {
                switchIdecoDisplay('diag');
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

function shareIdecoOnX() {
    const taxStr = document.getElementById('mainTaxSaveValue')?.innerText || '¥0';
    const totStr = document.getElementById('mainTotalValue')?.innerText || '¥0';
    const siteUrl = window.location.href.split('?')[0];

    const text = `【iDeCo節税シミュレーター】
私のiDeCo通算節税額は…【 ${taxStr} 】！
60歳時点の資産総額は 【 ${totStr} 】！

掛金の全額所得控除と運用益非課税のダブル節税効果を試算しました。
#iDeCo #イデコ #新NISA #節税
`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`;
    window.open(shareUrl, '_blank');
}

function copyIdecoUrl() {
    const params = new URLSearchParams();
    params.set('job', currentJob);
    params.set('income', document.getElementById('numIncome').value);
    params.set('m', document.getElementById('numMonthly').value);
    params.set('y', document.getElementById('numHorizon').value);
    params.set('r', document.getElementById('numReturn').value);

    const fullUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('iDeCo設定URLをコピーしました！');
    }).catch(() => {
        prompt('以下のURLをコピーしてください:', fullUrl);
    });
}

function exportIdecoCsv() {
    if (!latestTableData || latestTableData.length === 0) {
        showToast('出力可能なデータがありません');
        return;
    }
    const lines = [];
    const nowStr = new Date().toLocaleString('ja-JP');
    const dateFileStr = new Date().toISOString().slice(0, 10);

    lines.push('# ==========================================');
    lines.push('# iDeCo(イデコ) 節税＆複利シミュレーション レポート');
    lines.push(`# 出力日時: ${nowStr}`);
    lines.push('# ------------------------------------------');
    lines.push(`# 職種区分, ${JOB_CONFIG[currentJob].name}`);
    lines.push(`# 年収目安, ¥${document.getElementById('numIncome').value}万円`);
    lines.push(`# 毎月の掛金, ¥${document.getElementById('numMonthly').value}`);
    lines.push(`# 運用期間, ${document.getElementById('numHorizon').value}年`);
    lines.push(`# 想定年利回り, ${document.getElementById('numReturn').value}%`);
    lines.push('# ------------------------------------------');
    lines.push(`# 通算節税額, ${document.getElementById('mainTaxSaveValue').innerText}`);
    lines.push(`# 60歳資産総額, ${document.getElementById('mainTotalValue').innerText}`);
    lines.push('# ==========================================');
    lines.push('');
    lines.push('経過年数,掛金累計(円),運用残高(円),年間節税額(円),節税累計額(円),実質メリット合計(円)');

    latestTableData.forEach(row => {
        lines.push(`${row.year}年目,${row.principal},${row.balance},${row.annualTaxSave},${row.accTaxSave},${row.totalBenefit}`);
    });

    const csvContent = '\uFEFF' + lines.join('\n') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iDeCo節税シミュレーション_${dateFileStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📄 iDeCoレポートCSVを出力しました！');
}

/* 📱 スマホUI快適化：画面タップ・スクロール・タイマーでツールチップを即消去 */
(function setupIdecoMobileTooltipCloser() {
    let tooltipTimer = null;

    const dismissIdecoTooltip = () => {
        if (chartInstance && chartInstance.tooltip) {
            chartInstance.tooltip.setActiveElements([], { x: 0, y: 0 });
            chartInstance.update('none');
        }
        if (tooltipTimer) clearTimeout(tooltipTimer);
    };

    // 1. グラフキャンバス以外の画面をタップしたら即消去
    document.addEventListener('touchstart', (e) => {
        const canvas = document.getElementById('idecoChart');
        if (canvas && e.target !== canvas) {
            dismissIdecoTooltip();
        } else {
            // グラフを触った場合は3秒後に自動消去
            if (tooltipTimer) clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(dismissIdecoTooltip, 3000);
        }
    }, { passive: true });

    // 2. 画面スクロール時も即消去
    window.addEventListener('scroll', dismissIdecoTooltip, { passive: true });
})();

// 確実に実行される安全な初期起動処理
function initIdecoApp() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('job')) currentJob = params.get('job');
    if (params.has('income')) document.getElementById('numIncome').value = params.get('income');
    if (params.has('m')) document.getElementById('numMonthly').value = params.get('m');
    if (params.has('y')) document.getElementById('numHorizon').value = params.get('y');
    if (params.has('r')) document.getElementById('numReturn').value = params.get('r');

    ['income', 'monthly', 'horizon', 'return'].forEach(f => syncIdecoInputs(f, 'num'));
    applyJobPreset(currentJob);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIdecoApp);
} else {
    initIdecoApp();
}