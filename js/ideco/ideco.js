let currentJob = 'employee1';
let displayView = 'line';
let chartInstance = null;
let latestTableData = [];

// 職種別の上限設定
const JOB_CONFIG = {
  employee1: { name: '会社員(企業年金なし)', max: 23000, default: 23000, desc: '第2号被保険者（企業年金未加入）' },
  employee2: { name: '会社員(企業年金あり)', max: 20000, default: 20000, desc: '第2号被保険者（企業型DC・確定給付型あり）' },
  public:    { name: '公務員', max: 12000, default: 12000, desc: '第2号被保険者（共済組合員）' },
  self:      { name: '自営業・フリーランス', max: 68000, default: 68000, desc: '第1号被保険者（国民年金基金と合算枠）' },
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

  if (jobKey === 'homemaker') {
    const numInc = document.getElementById('numIncome');
    const rangeInc = document.getElementById('rangeIncome');
    if (numInc) numInc.value = 0;
    if (rangeInc) rangeInc.value = 0;
  } else if (parseInt(document.getElementById('numIncome')?.value || 0) === 0) {
    const numInc = document.getElementById('numIncome');
    const rangeInc = document.getElementById('rangeIncome');
    if (numInc) numInc.value = 500;
    if (rangeInc) rangeInc.value = 500;
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
  document.getElementById('btnViewLine').classList.toggle('active', view === 'line');
  document.getElementById('btnViewDiag').classList.toggle('active', view === 'diag');

  const canvas = document.getElementById('idecoChart');
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

  if (displayView === 'line') {
    renderIdecoLineChart(labels, dataPrincipal, dataTotal, dataRealCost);
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

function updateIdecoDiagnosis(income, monthly, horizon, ret, annualTax, totalTax, gains, total) {
  let title = '';
  let level = '';
  let tags = [];
  let carteHtml = '';

  if (income >= 800) {
    title = '🔥 超高所得・節税ブースト無双級';
    level = 'TAX SAVER SSS';
    tags = ['#税率30%超', '#節税効果最強', '#即効手取り増'];
    carteHtml = `
      <div class="carte-block"><span class="carte-heading">【節税診断】</span><span class="carte-text">高い税率区分（実効税率約30〜43%）に位置しているため、毎年の節税額【${fmtYen(annualTax)}】と抜群の破壊力を誇ります。</span></div>
      <div class="carte-block"><span class="carte-heading">【確定利回り】</span><span class="carte-text">拠出した瞬間に約30%以上の確定リターンを得ているのと同等です。新NISAを満額埋めつつ、iDeCoも最優先で枠を使い切るのが鉄則です。</span></div>
      <div class="carte-block"><span class="carte-heading">【受取時戦略】</span><span class="carte-text">60歳以降の受取時は「退職所得控除」をフル活用できるよう、退職金の一時金受取時期との重複に注意して出口を設計しましょう。</span></div>
    `;
  } else if (currentJob === 'self') {
    title = '🚜 自営業最強・月6.8万フルハック級';
    level = 'FREELANCE GOD';
    tags = ['#月6.8万上限', '#年81.6万控除', '#社会保険対策'];
    carteHtml = `
      <div class="carte-block"><span class="carte-heading">【節税診断】</span><span class="carte-text">自営業・フリーランス最大の特権である「月6.8万円（年81.6万円）」の全額所得控除を活用。通算で【${fmtYen(totalTax)}】もの税金を手元に残せます。</span></div>
      <div class="carte-block"><span class="carte-heading">【年金補強】</span><span class="carte-text">国民年金のみで手薄になりがちな老後保障を、強力な私的年金としてカバーできます。小規模企業共済との併用も非常に有効です。</span></div>
    `;
  } else if (currentJob === 'homemaker' || income === 0) {
    title = '🏠 運用益非課税・マイペース形成級';
    level = 'TAX SAVER B';
    tags = ['#所得控除なし', '#運用益非課税', '#新NISA優先推奨'];
    carteHtml = `
      <div class="carte-block"><span class="carte-heading">【現状分析】</span><span class="carte-text">ご自身の所得税・住民税が発生していない場合、iDeCo最大のメリットである「掛金の所得控除（年末調整還付）」は受けられません。</span></div>
      <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">いつでも引き出し可能で非課税枠が1,800万円ある「新NISA」を最優先で活用し、資金ロックのない柔軟な資産形成をおすすめします。</span></div>
    `;
  } else {
    title = '👔 堅実サラリーマン・黄金バランス級';
    level = 'TAX SAVER A';
    tags = ['#年末調整で還付', '#複利の雪だるま', '#新NISA併用'];
    carteHtml = `
      <div class="carte-block"><span class="carte-heading">【節税診断】</span><span class="carte-text">毎年【${fmtYen(annualTax)}】が年末調整で指定口座に還付されます。通算で【${fmtYen(totalTax)}】の手取りが増加します。</span></div>
      <div class="carte-block"><span class="carte-heading">【実質利回り】</span><span class="carte-text">相場が横ばい（利回り0%）であっても、税金還付分だけで年約15〜20%の利回りを得ている計算になります。</span></div>
      <div class="carte-block"><span class="carte-heading">【実践戦略】</span><span class="carte-text">60歳まで使わない強制貯金枠としてiDeCoを運用しつつ、日常の突発費用には新NISAを組み合わせる二刀流が最強です。</span></div>
    `;
  }

  const diagTitleEl = document.getElementById('diagTitle');
  const diagLevelEl = document.getElementById('diagLevelTag');
  const diagTagsEl = document.getElementById('diagTags');
  const carteEl = document.getElementById('carteContentArea');

  if (diagTitleEl) diagTitleEl.innerText = title;
  if (diagLevelEl) diagLevelEl.innerText = level;
  if (diagTagsEl) diagTagsEl.innerHTML = tags.map(t => `<span class="style-tag">${t}</span>`).join('');
  if (carteEl) carteEl.innerHTML = carteHtml;
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