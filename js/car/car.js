/**
 * マイカーローン 4大方式直接比較＆危険度シミュレーター コアエンジン (car.js)
 * 銀行 / ディーラー / 残クレ / リース 4大方式直接比較
 * 返済負担率(DTI) / 各方式審査通過予想判定 / 残債カーブ / 運命のエンディングカード / 新NISA機会損失試算 / 高解像度画像出力 完全対応版
 */

let currentMethod = 'residual'; // 'bank' | 'dealer' | 'residual' | 'lease'
let displayView = 'line'; // 'bar' | 'line' | 'diag'
let residualAction = 'buyout'; // 'return' | 'buyout' | 'reloan'
let chartInstance = null;
let latestTableData = [];
let currentDiagTitle = '';

// 車種別プリセット
const CAR_TYPE_CONFIG = {
    compact: { name: '大衆コンパクト (ヤリス等)', price: 2500000, down: 300000, resRate3: 45, resRate5: 35, resRate7: 20 },
    kei: { name: '軽自動車 (N-BOX等)', price: 2000000, down: 200000, resRate3: 40, resRate5: 30, resRate7: 15 },
    minivan: { name: '人気ミニバン・SUV (ハリアー等)', price: 4500000, down: 500000, resRate3: 60, resRate5: 50, resRate7: 35 },
    luxury: { name: '高級輸入車・プレミアム', price: 8000000, down: 1000000, resRate3: 50, resRate5: 40, resRate7: 25 }
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

// 元利均等返済の月額計算ヘルパー
function calcPmt(principal, annualRatePct, totalMonths) {
    if (principal <= 0) return 0;
    if (annualRatePct <= 0) return principal / totalMonths;
    const r = (annualRatePct / 100) / 12;
    return (principal * r * Math.pow(1 + r, totalMonths)) / (Math.pow(1 + r, totalMonths) - 1);
}

// 審査難易度・通過予想判定ヘルパー
function judgePassStatus(method, dti, incomeMan) {
    if (method === 'bank') {
        if (incomeMan >= 300 && dti <= 15.0) {
            return { badge: '⭕通過圏内', color: '#34d399', desc: '金利最安・基準クリア' };
        } else if (incomeMan >= 250 && dti <= 20.0) {
            return { badge: '⚠️当落線上', color: '#fbbf24', desc: '頭金増額を推奨' };
        } else {
            return { badge: '❌否決濃厚', color: '#f87171', desc: '年収比率オーバー' };
        }
    } else if (method === 'dealer') {
        if (incomeMan >= 200 && dti <= 22.0) {
            return { badge: '⭕通過圏内', color: '#34d399', desc: '信販審査クリア' };
        } else if (dti <= 28.0) {
            return { badge: '⚠️当落線上', color: '#fbbf24', desc: '保証人・頭金要検討' };
        } else {
            return { badge: '❌否決濃厚', color: '#f87171', desc: '借入総額過大' };
        }
    } else if (method === 'residual') {
        if (dti <= 22.0) {
            return { badge: '⭕通過圏内', color: '#34d399', desc: '残価効果で通過' };
        } else if (dti <= 28.0) {
            return { badge: '⚠️当落線上', color: '#fbbf24', desc: '審査ギリギリ' };
        } else {
            return { badge: '❌否決濃厚', color: '#f87171', desc: '残クレでも過大' };
        }
    } else {
        if (dti <= 25.0) {
            return { badge: '⭕通過圏内', color: '#34d399', desc: 'リース審査OK' };
        } else if (dti <= 30.0) {
            return { badge: '⚠️当落線上', color: '#fbbf24', desc: '信販審査微妙' };
        } else {
            return { badge: '❌否決濃厚', color: '#f87171', desc: '基準超過' };
        }
    }
}

// 車種シナリオプリセット適用
function applyCarTypePreset(typeKey) {
    const cfg = CAR_TYPE_CONFIG[typeKey];
    if (!cfg) return;

    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`scType_${typeKey}`)?.classList.add('active');

    setPreset('price', cfg.price);
    setPreset('down', cfg.down);

    const years = parseInt(document.getElementById('numHorizon')?.value) || 5;
    const autoResRate = years === 3 ? cfg.resRate3 : years === 7 ? cfg.resRate7 : cfg.resRate5;
    setPreset('resRate', autoResRate);

    updateAll();
    showToast(`${cfg.name} のプリセットを適用しました`);
}

// 支払い方式フォーカスの切り替え
function applyMethodPreset(methodKey) {
    currentMethod = methodKey;
    ['bank', 'dealer', 'residual', 'lease'].forEach(k => {
        const btn = document.getElementById(`scMethod_${k}`);
        if (btn) btn.classList.toggle('active', k === methodKey);
    });

    const resActionWrap = document.getElementById('residualActionWrapper');
    if (resActionWrap) {
        resActionWrap.style.display = (methodKey === 'residual') ? 'block' : 'none';
    }

    updateAll();
}

// 残クレ最終回アクション切り替え
function setResidualAction(actionKey) {
    residualAction = actionKey;
    ['return', 'buyout', 'reloan'].forEach(a => {
        const btn = document.getElementById(`resActBtn_${a}`);
        if (btn) btn.classList.toggle('active', a === actionKey);
    });

    const msg = actionKey === 'return' ? '最終回: 車両返却（残価精算）に設定' :
        actionKey === 'buyout' ? '最終回: 現金一括買取に設定' :
            '⚠️ 最終回: 再ローン（年利7%・3年延長）に設定';
    showToast(msg);
    updateAll();
}

function syncCarInputs(field, source) {
    const map = {
        price: ['numPrice', 'rangePrice'],
        down: ['numDown', 'rangeDown'],
        income: ['numIncome', 'rangeIncome'],
        horizon: ['numHorizon', 'rangeHorizon'],
        bankRate: ['numBankRate', 'rangeBankRate'],
        dealerRate: ['numDealerRate', 'rangeDealerRate'],
        resRate: ['numResRate', 'rangeResRate'],
        resLoanRate: ['numResLoanRate', 'rangeResLoanRate']
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
        price: ['numPrice', 'rangePrice'],
        down: ['numDown', 'rangeDown'],
        income: ['numIncome', 'rangeIncome'],
        horizon: ['numHorizon', 'rangeHorizon'],
        bankRate: ['numBankRate', 'rangeBankRate'],
        dealerRate: ['numDealerRate', 'rangeDealerRate'],
        resRate: ['numResRate', 'rangeResRate'],
        resLoanRate: ['numResLoanRate', 'rangeResLoanRate']
    };
    const [numId, rangeId] = map[field] || [];
    if (numId && document.getElementById(numId)) document.getElementById(numId).value = val;
    if (rangeId && document.getElementById(rangeId)) document.getElementById(rangeId).value = val;
    updateAll();
}

function switchCarDisplay(view) {
    displayView = view;
    document.getElementById('btnViewBar')?.classList.toggle('active', view === 'bar');
    document.getElementById('btnViewLine')?.classList.toggle('active', view === 'line');
    document.getElementById('btnViewDiag')?.classList.toggle('active', view === 'diag');

    const canvas = document.getElementById('carChart');
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

// メイン計算エンジン
function updateAll() {
    const carPrice = Math.max(100000, parseInt(document.getElementById('numPrice')?.value) || 3000000);
    const downPayment = Math.max(0, Math.min(carPrice, parseInt(document.getElementById('numDown')?.value) || 0));
    const incomeMan = Math.max(100, parseInt(document.getElementById('numIncome')?.value) || 450);
    const periodYears = Math.max(1, parseInt(document.getElementById('numHorizon')?.value) || 5);
    const totalMonths = periodYears * 12;

    const bankRate = Math.max(0.1, parseFloat(document.getElementById('numBankRate')?.value) || 2.0);
    const dealerRate = Math.max(0.1, parseFloat(document.getElementById('numDealerRate')?.value) || 6.0);
    const residualRate = Math.max(5, parseFloat(document.getElementById('numResRate')?.value) || 35.0);
    const resLoanRate = Math.max(0.1, parseFloat(document.getElementById('numResLoanRate')?.value) || 4.5);

    const loanPrincipal = Math.max(0, carPrice - downPayment);
    const residualValue = Math.round(carPrice * (residualRate / 100));
    const grossIncomeYen = incomeMan * 10000;

    // 1. 銀行ローン計算
    const bankMonthly = Math.round(calcPmt(loanPrincipal, bankRate, totalMonths));
    const bankTotalPay = bankMonthly * totalMonths + downPayment;
    const bankInterest = Math.max(0, bankTotalPay - carPrice);
    const bankDti = ((bankMonthly * 12) / grossIncomeYen) * 100;
    const bankPass = judgePassStatus('bank', bankDti, incomeMan);

    // 2. ディーラー通常ローン計算
    const dealerMonthly = Math.round(calcPmt(loanPrincipal, dealerRate, totalMonths));
    const dealerTotalPay = dealerMonthly * totalMonths + downPayment;
    const dealerInterest = Math.max(0, dealerTotalPay - carPrice);
    const dealerDti = ((dealerMonthly * 12) / grossIncomeYen) * 100;
    const dealerPass = judgePassStatus('dealer', dealerDti, incomeMan);

    // 3. 残クレ計算
    const resSplitPrincipal = Math.max(0, loanPrincipal - residualValue);
    const resSplitMonthly = calcPmt(resSplitPrincipal, resLoanRate, totalMonths);
    const resInterestMonthly = residualValue * ((resLoanRate / 100) / 12);
    const resMonthly = Math.round(resSplitMonthly + resInterestMonthly);
    const resDti = ((resMonthly * 12) / grossIncomeYen) * 100;
    const resPass = judgePassStatus('residual', resDti, incomeMan);

    let resFinalTotalPay = 0;
    let resFinalInterest = 0;

    if (residualAction === 'return') {
        resFinalTotalPay = resMonthly * totalMonths + downPayment;
        resFinalInterest = (resMonthly * totalMonths) - resSplitPrincipal;
    } else if (residualAction === 'buyout') {
        resFinalTotalPay = resMonthly * totalMonths + residualValue + downPayment;
        resFinalInterest = Math.max(0, resFinalTotalPay - carPrice);
    } else {
        const reloanPmt = calcPmt(residualValue, 7.0, 36);
        const reloanTotal = reloanPmt * 36;
        resFinalTotalPay = resMonthly * totalMonths + reloanTotal + downPayment;
        resFinalInterest = Math.max(0, resFinalTotalPay - carPrice);
    }

    // 4. カーリース計算
    const taxMaintenanceMonthly = 5500;
    const leaseMonthly = Math.round(calcPmt(loanPrincipal, 7.0, totalMonths) + taxMaintenanceMonthly);
    const leaseTotalPay = leaseMonthly * totalMonths + downPayment;
    const leaseTaxTotal = taxMaintenanceMonthly * totalMonths;
    const leaseInterest = Math.max(0, leaseTotalPay - carPrice - leaseTaxTotal);
    const leaseDti = ((leaseMonthly * 12) / grossIncomeYen) * 100;
    const leasePass = judgePassStatus('lease', leaseDti, incomeMan);

    // 選択方式の集計
    let currentMonthly = bankMonthly;
    let currentTotalPay = bankTotalPay;
    let currentInterest = bankInterest;
    let currentMethodName = '銀行マイカーローン';
    let currentPass = bankPass;

    if (currentMethod === 'dealer') {
        currentMonthly = dealerMonthly;
        currentTotalPay = dealerTotalPay;
        currentInterest = dealerInterest;
        currentMethodName = 'ディーラー通常ローン';
        currentPass = dealerPass;
    } else if (currentMethod === 'residual') {
        currentMonthly = resMonthly;
        currentTotalPay = resFinalTotalPay;
        currentInterest = resFinalInterest;
        currentMethodName = `残クレ (${residualAction === 'return' ? '返却' : residualAction === 'buyout' ? '一括買取' : '再ローン'})`;
        currentPass = resPass;
    } else if (currentMethod === 'lease') {
        currentMonthly = leaseMonthly;
        currentTotalPay = leaseTotalPay;
        currentInterest = leaseInterest;
        currentMethodName = 'カーリース (サブスク)';
        currentPass = leasePass;
    }

    // 返済負担率（DTI）
    const annualRepay = currentMonthly * 12;
    const dti = (annualRepay / grossIncomeYen) * 100;

    const diffBankInterest = Math.max(0, currentInterest - bankInterest);
    const diffDealerInterest = Math.max(0, dealerInterest - bankInterest);

    // 新NISA機会損失
    const nisaMonthlyRate = 0.05 / 12;
    const nisaFv = downPayment * Math.pow(1 + nisaMonthlyRate, totalMonths) +
        currentMonthly * ((Math.pow(1 + nisaMonthlyRate, totalMonths) - 1) / nisaMonthlyRate);
    const nisaProfit = nisaFv - (downPayment + currentMonthly * totalMonths);

    // UI要素の更新
    const mainMonEl = document.getElementById('mainMonthlyValue');
    const mainTotEl = document.getElementById('mainTotalValue');
    const chipDtiEl = document.getElementById('chipDti');
    const chipDiffBankEl = document.getElementById('chipDiffBank');
    const chipResidualValEl = document.getElementById('chipResidualVal');
    const nisaLossBoxEl = document.getElementById('nisaLossBox');
    const dtiGaugeBarEl = document.getElementById('dtiGaugeBar');
    const dtiGaugeTextEl = document.getElementById('dtiGaugeText');

    if (mainMonEl) mainMonEl.innerText = fmtYen(currentMonthly);
    if (mainTotEl) mainTotEl.innerText = `${fmtYen(currentTotalPay)} (利息: ${fmtYen(currentInterest)})`;

    // 3連チップ内に審査判定をスマート統合
    if (chipDtiEl) {
        chipDtiEl.innerHTML = `${dti.toFixed(1)}% <span style="font-size:10px; font-weight:800; color:${currentPass.color};">(${currentPass.badge})</span>`;
        chipDtiEl.className = 'chip-val ' + (dti <= 15 ? 'gains' : dti <= 22 ? 'tax' : 'danger');
    }

    if (chipDiffBankEl) {
        if (currentMethod === 'bank') {
            chipDiffBankEl.innerText = '★最安基準';
            chipDiffBankEl.className = 'chip-val gains';
        } else {
            chipDiffBankEl.innerText = `+${fmtYen(diffBankInterest)} 割高`;
            chipDiffBankEl.className = 'chip-val danger';
        }
    }

    if (chipResidualValEl) {
        chipResidualValEl.innerText = (currentMethod === 'residual') ? fmtYen(residualValue) : 'なし';
    }

    if (dtiGaugeBarEl && dtiGaugeTextEl) {
        const fillW = Math.min(100, (dti / 35) * 100);
        dtiGaugeBarEl.style.width = `${fillW}%`;
        if (dti <= 15) {
            dtiGaugeBarEl.style.background = '#10b981';
            dtiGaugeTextEl.innerHTML = `返済負担率 <b>${dti.toFixed(1)}%</b>（安全圏）: 審査通過確度が高く、生活を圧迫しません。`;
        } else if (dti <= 22) {
            dtiGaugeBarEl.style.background = '#fbbf24';
            dtiGaugeTextEl.innerHTML = `返済負担率 <b>${dti.toFixed(1)}%</b>（注意域）: 維持費を含めると毎月の家計が圧迫される可能性があります。`;
        } else {
            dtiGaugeBarEl.style.background = '#ef4444';
            dtiGaugeTextEl.innerHTML = `返済負担率 <b>${dti.toFixed(1)}%</b>（危険域）: ローン審査落ちや家計破綻のリスクが高いです。`;
        }
    }

    // 🎬 残クレ 運命のエンディングカード描画
    const endingCardEl = document.getElementById('residualEndingCard');
    if (endingCardEl) {
        if (currentMethod === 'residual') {
            endingCardEl.style.display = 'block';
            if (residualAction === 'return') {
                endingCardEl.style.background = 'rgba(59, 130, 246, 0.12)';
                endingCardEl.style.border = '1px solid rgba(59, 130, 246, 0.4)';
                endingCardEl.innerHTML = `
                    <div style="font-weight: 800; color: #60a5fa; margin-bottom: 2px;">
                        🎬 結末: 資産ゼロの手ぶらリセット
                    </div>
                    <div style="color: #cbd5e1; font-size: 10.5px; line-height: 1.45;">
                        車をディーラーに返却して契約終了。これまで支払った <b>${fmtYen(currentTotalPay)}</b> は全額消滅し、手元に車も資産も残りません。次の車に乗るには再び頭金とローンが必要です。
                    </div>
                `;
            } else if (residualAction === 'buyout') {
                endingCardEl.style.background = 'rgba(16, 185, 129, 0.12)';
                endingCardEl.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                endingCardEl.innerHTML = `
                    <div style="font-weight: 800; color: #34d399; margin-bottom: 2px;">
                        🎬 結末: 真の愛車化（ただし手元資金即死）
                    </div>
                    <div style="color: #cbd5e1; font-size: 10.5px; line-height: 1.45;">
                        据置残価 <b>${fmtYen(residualValue)}</b> を現金一括払いし、完全に自分の資産に！口座の貯金は減りますが、再ローンの金利搾取は防ぎ切りました。
                    </div>
                `;
            } else {
                endingCardEl.style.background = 'rgba(239, 68, 68, 0.15)';
                endingCardEl.style.border = '1px solid rgba(239, 68, 68, 0.5)';
                endingCardEl.innerHTML = `
                    <div style="font-weight: 800; color: #f87171; margin-bottom: 2px;">
                        🚨 結末: 終わらない借金輪廻（泥沼の${periodYears + 3}年目へ）
                    </div>
                    <div style="color: #fecaca; font-size: 10.5px; line-height: 1.45;">
                        残価 <b>${fmtYen(residualValue)}</b> を年利7.0%でさらに3年再分割！新車並みの支払いを続けながら、手元にあるのは${periodYears}年落ちの中古車。利息がさらに上乗せされます。
                    </div>
                `;
            }
        } else {
            endingCardEl.style.display = 'none';
        }
    }

    // 新NISA機会損失カードの更新
    if (nisaLossBoxEl) {
        nisaLossBoxEl.innerHTML = `
      <div style="font-weight: 800; color: #34d399; margin-bottom: 4px;">
        💡 もしこの支払いを「新NISA」に回したら？
      </div>
      <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 6px; line-height: 1.45;">
        頭金 <b>${fmtYen(downPayment)}</b> ＋ 毎月 <b>${fmtYen(currentMonthly)}</b> を ${periodYears}年間（年利5.0%）運用すると…<br>
        将来 <b style="color:#fbbf24; font-size:1.15em;">${fmtYen(nisaFv)}</b>（運用益: +${fmtYen(nisaProfit)}）の資産になります。
      </div>
      <a href="index.html?init=${downPayment}&m=${currentMonthly}&y=${periodYears}&r=5.0" class="btn-auto-adjust" style="text-decoration:none; justify-content:center; background:#10b981; color:#0a0d14;">
        📈 新NISAシミュレーターで資産カーブを見る →
      </a>
    `;
    }

    const tableRows = [
        { name: '👔 銀行マイカーローン', monthly: bankMonthly, interest: bankInterest, total: bankTotalPay, pass: bankPass.badge, passColor: bankPass.color, remark: '所有権自分・最安' },
        { name: '🏢 ディーラー通常ローン', monthly: dealerMonthly, interest: dealerInterest, total: dealerTotalPay, pass: dealerPass.badge, passColor: dealerPass.color, remark: '店頭即決・金利高め' },
        { name: `🎯 残クレ (${residualAction === 'return' ? '返却' : residualAction === 'buyout' ? '一括買取' : '再ローン'})`, monthly: resMonthly, interest: resFinalInterest, total: resFinalTotalPay, pass: resPass.badge, passColor: resPass.color, remark: `残価 ${fmtYen(residualValue)} 据置` },
        { name: '📦 カーリース (定額サブスク)', monthly: leaseMonthly, interest: leaseInterest, total: leaseTotalPay, pass: leasePass.badge, passColor: leasePass.color, remark: '税金・車検コミコミ' }
    ];
    latestTableData = tableRows;

    const tblBody = document.getElementById('tableBody');
    if (tblBody) {
        tblBody.innerHTML = tableRows.map(r => `
      <tr style="${(r.name.includes('残クレ') && currentMethod === 'residual') || (r.name.includes(currentMethodName.slice(0, 2)) && currentMethod !== 'residual') ? 'background: rgba(59, 130, 246, 0.15); font-weight:bold;' : ''}">
        <td style="text-align:left;">${r.name}</td>
        <td style="color:#60a5fa;">${fmtYen(r.monthly)}</td>
        <td style="color:#f87171;">${fmtYen(r.interest)}</td>
        <td style="font-weight:800; color:#fbbf24;">${fmtYen(r.total)}</td>
        <td style="color:${r.passColor}; font-weight:700;">${r.pass}</td>
        <td style="font-size:10px; color:#94a3b8;">${r.remark}</td>
      </tr>
    `).join('');
    }

    if (displayView === 'bar') {
        renderCarStackedBarChart(carPrice, [bankInterest, dealerInterest, resFinalInterest, leaseInterest], [0, 0, 0, leaseTaxTotal], [bankTotalPay, dealerTotalPay, resFinalTotalPay, leaseTotalPay]);
    } else if (displayView === 'line') {
        renderCarDebtCurveChart(totalMonths, carPrice, downPayment, bankRate, dealerRate, resLoanRate, residualValue, residualAction);
    }

    updateCarDiagnosis({
        currentMethod,
        currentMethodName,
        carPrice,
        downPayment,
        periodYears,
        income: incomeMan,
        bankRate,
        dealerRate,
        residualRate,
        residualValue,
        residualAction,
        currentMonthly,
        currentInterest,
        currentTotalPay,
        dti,
        diffBankInterest,
        diffDealerInterest
    });
}

// 📊 4大方式 総額・利息比較（横棒積層グラフ）
function renderCarStackedBarChart(carPrice, interests, extras, totals) {
    const canvas = document.getElementById('carChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = ['銀行ローン', 'ディーラー', '残クレ', 'カーリース'];
    const dataPrincipal = [carPrice, carPrice, carPrice, carPrice];
    const dataInterest = interests;
    const dataExtra = extras;

    if (chartInstance && chartInstance.config.type === 'bar') {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = dataPrincipal;
        chartInstance.data.datasets[1].data = dataInterest;
        chartInstance.data.datasets[2].data = dataExtra;
        chartInstance.update('none');
        return;
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '車両本体・元金',
                    data: dataPrincipal,
                    backgroundColor: '#3b82f6',
                    stack: 'total'
                },
                {
                    label: '支払利息',
                    data: dataInterest,
                    backgroundColor: '#ef4444',
                    stack: 'total'
                },
                {
                    label: '税金・車検コミ分',
                    data: dataExtra,
                    backgroundColor: '#fbbf24',
                    stack: 'total'
                }
            ]
        },
        options: {
            indexAxis: 'y',
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#d1d5db', font: { size: 10 }, boxWidth: 12 }
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    callbacks: {
                        footer: (items) => {
                            const idx = items[0].dataIndex;
                            return `総支払額: ${fmtYen(totals[idx])}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 10 },
                        callback: (v) => (v / 10000).toLocaleString() + '万'
                    }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#cbd5e1', font: { size: 10.5, weight: 'bold' } }
                }
            }
        }
    });
}

// 📈 返済残債カーブ（最終回アクション連動版）
function renderCarDebtCurveChart(totalMonths, carPrice, downPayment, bankRate, dealerRate, resLoanRate, residualValue, resAction) {
    const canvas = document.getElementById('carChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const isReloan = (resAction === 'reloan');
    const reloanMonths = isReloan ? 36 : 0;
    const maxMonths = totalMonths + reloanMonths;

    const initialDebt = carPrice - downPayment;
    const labels = ['開始'];
    const dataBankDebt = [initialDebt];
    const dataDealerDebt = [initialDebt];
    const dataResDebt = [initialDebt];

    let balBank = initialDebt;
    let balDealer = initialDebt;
    let balRes = initialDebt;

    const pmtBank = calcPmt(balBank, bankRate, totalMonths);
    const rBank = (bankRate / 100) / 12;

    const pmtDealer = calcPmt(balDealer, dealerRate, totalMonths);
    const rDealer = (dealerRate / 100) / 12;

    const splitP = Math.max(0, balRes - residualValue);
    const pmtResSplit = calcPmt(splitP, resLoanRate, totalMonths);
    const rRes = (resLoanRate / 100) / 12;

    // 再ローン計算用
    const pmtReloan = isReloan ? calcPmt(residualValue, 7.0, 36) : 0;
    const rReloan = (7.0 / 100) / 12;
    let balReloan = residualValue;

    for (let m = 1; m <= maxMonths; m++) {
        // 1. 銀行ローン
        if (m <= totalMonths) {
            const intBank = balBank * rBank;
            balBank = Math.max(0, balBank - (pmtBank - intBank));
        } else {
            balBank = 0;
        }

        // 2. ディーラー通常ローン
        if (m <= totalMonths) {
            const intDealer = balDealer * rDealer;
            balDealer = Math.max(0, balDealer - (pmtDealer - intDealer));
        } else {
            balDealer = 0;
        }

        // 3. 残クレ
        if (m < totalMonths) {
            const intRes = splitP * rRes;
            balRes = Math.max(residualValue, balRes - (pmtResSplit - intRes));
        } else if (m === totalMonths) {
            if (resAction === 'buyout') {
                balRes = 0; // 一括買取で完済
            } else if (resAction === 'return') {
                balRes = 0; // 車両返却で清算
            } else {
                balRes = residualValue; // 再ローン開始
            }
        } else {
            if (isReloan && balReloan > 0) {
                const intReloan = balReloan * rReloan;
                balReloan = Math.max(0, balReloan - (pmtReloan - intReloan));
                balRes = balReloan;
            } else {
                balRes = 0;
            }
        }

        if (m % 12 === 0 || m === maxMonths) {
            const y = (m / 12).toFixed(m % 12 === 0 ? 0 : 1);
            labels.push(`${y}年目`);
            dataBankDebt.push(Math.round(balBank));
            dataDealerDebt.push(Math.round(balDealer));
            dataResDebt.push(Math.round(balRes));
        }
    }

    const resLabel = (resAction === 'buyout') ? '残クレ (5年目に一括買取・完済)' :
        (resAction === 'return') ? '残クレ (5年目に車両返却・資産ゼロ)' :
            '残クレ (再ローン発動・8年目まで借金延長)';

    if (chartInstance && chartInstance.config.type === 'line') {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = dataBankDebt;
        chartInstance.data.datasets[1].data = dataDealerDebt;
        chartInstance.data.datasets[2].label = resLabel;
        chartInstance.data.datasets[2].data = dataResDebt;
        chartInstance.data.datasets[2].borderColor = isReloan ? '#ef4444' : '#f59e0b';
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
                    label: '銀行ローン (低金利・最速完済)',
                    data: dataBankDebt,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 3
                },
                {
                    label: 'ディーラー通常 (高金利・残債高止まり)',
                    data: dataDealerDebt,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 3
                },
                {
                    label: resLabel,
                    data: dataResDebt,
                    borderColor: isReloan ? '#ef4444' : '#f59e0b',
                    backgroundColor: isReloan ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    borderWidth: 2.5,
                    borderDash: [5, 4],
                    fill: false,
                    pointRadius: 3.5
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
                    labels: { color: '#d1d5db', font: { size: 10 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    callbacks: {
                        label: (c) => `${c.dataset.label.split(' ')[0]}: ${fmtYen(c.raw)}`
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
                        callback: (v) => (v / 10000).toLocaleString() + '万'
                    }
                }
            }
        }
    });
}

function updateCarDiagnosis(params) {
    if (typeof window.generateCarDiagnosis !== 'function') return;

    const diag = window.generateCarDiagnosis(params);
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

/* 📸 マイカーローン商談対抗 高解像度レポート画像エクスポート */
function exportCarChartImage() {
    const chartCanvas = document.getElementById('carChart');
    if (!chartCanvas) {
        showToast('グラフが生成されていません');
        return;
    }

    const prevView = displayView;
    if (prevView === 'diag') {
        switchCarDisplay('line');
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

            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('マイカーローン 4大方式直接比較＆損得判定レポート', 36, 40);

            const cardX = 36, cardY = 55, cardW = outW - 72, cardH = 145;
            ctx.fillStyle = '#131c2e';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            roundRect(ctx, cardX, cardY, cardW, cardH, 10, true, true);

            const monVal = document.getElementById('mainMonthlyValue')?.innerText || '¥0';
            const totVal = document.getElementById('mainTotalValue')?.innerText || '¥0';
            const dtiVal = document.getElementById('chipDti')?.innerText || '0%';
            const diffVal = document.getElementById('chipDiffBank')?.innerText || '0円';

            ctx.fillStyle = '#93c5fd';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(`🚗 選択方式: ${currentMethod.toUpperCase()}`, cardX + 20, cardY + 26);
            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(monVal, cardX + 20, cardY + 54);

            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('💰 総支払額（利息含む）', cardX + 250, cardY + 26);
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(totVal, cardX + 250, cardY + 54);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '12px sans-serif';
            ctx.fillText(`返済負担率: `, cardX + 20, cardY + 85);
            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(dtiVal, cardX + 95, cardY + 85);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '12px sans-serif';
            ctx.fillText(`銀行ローン比較: `, cardX + 200, cardY + 85);
            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(diffVal, cardX + 295, cardY + 85);

            ctx.fillStyle = '#fef08a';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(currentDiagTitle || 'マイカーローン診断', cardX + 20, cardY + 122);

            const p = document.getElementById('numPrice')?.value || 0;
            const d = document.getElementById('numDown')?.value || 0;
            const y = document.getElementById('numHorizon')?.value || 0;

            const cond1 = `【車両条件】 本体価格 ¥${parseInt(p).toLocaleString()} / 頭金 ¥${parseInt(d).toLocaleString()}`;
            const cond2 = `【返済期間】 ${y}年間 (${parseInt(y) * 12}回払い)`;

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px sans-serif';
            ctx.fillText(cond1, cardX + 620, cardY + 45);
            ctx.fillText(cond2, cardX + 620, cardY + 75);

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
            ctx.fillText(`作成日時: ${nowStr}  |  マイカーローン 4大方式直接比較シミュレーター`, 40, outH - 15);

            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = offCanvas.toDataURL('image/png', 1.0);
            a.download = `マイカーローン試算レポート_${dateStr}.png`;
            a.click();
            showToast('📸 高解像度レポート画像を保存しました！');

        } catch (e) {
            console.error(e);
            showToast('画像の生成に失敗しました');
        } finally {
            if (prevView === 'diag') {
                switchCarDisplay('diag');
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
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function shareCarOnX() {
    const monStr = document.getElementById('mainMonthlyValue')?.innerText || '¥0';
    const totStr = document.getElementById('mainTotalValue')?.innerText || '¥0';
    const siteUrl = window.location.href.split('?')[0];

    const text = `【マイカーローン 損得シミュレーター】
月々の支払額は【 ${monStr} 】！
総支払額は【 ${totStr} 】！

銀行ローン・ディーラー・残クレ・リースの総額比較と審査通過度を試算しました。
#マイカーローン #残クレ #新車購入 #カーリース
`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`;
    window.open(shareUrl, '_blank');
}

function copyCarUrl() {
    const params = new URLSearchParams();
    params.set('p', document.getElementById('numPrice')?.value || 3000000);
    params.set('d', document.getElementById('numDown')?.value || 500000);
    params.set('y', document.getElementById('numHorizon')?.value || 5);
    params.set('inc', document.getElementById('numIncome')?.value || 450);
    params.set('m', currentMethod);

    const fullUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('マイカーローン設定URLをコピーしました！');
    }).catch(() => {
        prompt('以下のURLをコピーしてください:', fullUrl);
    });
}

function exportCarCsv() {
    if (!latestTableData || latestTableData.length === 0) {
        showToast('出力可能なデータがありません');
        return;
    }
    const lines = [];
    const nowStr = new Date().toLocaleString('ja-JP');
    const dateFileStr = new Date().toISOString().slice(0, 10);

    lines.push('# ==========================================');
    lines.push('# マイカーローン 4大方式直接比較 レポート');
    lines.push(`# 出力日時: ${nowStr}`);
    lines.push('# ==========================================');
    lines.push('');
    lines.push('方式名,毎月の支払額(円),支払利息(円),総支払額(円),審査予想,備考');

    latestTableData.forEach(row => {
        lines.push(`${row.name},${row.monthly},${row.interest},${row.total},${row.pass},${row.remark}`);
    });

    const csvContent = '\uFEFF' + lines.join('\n') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `マイカーローン比較_${dateFileStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📄 CSVレポートを出力しました！');
}

/* 📱 スマホUI快適化：ツールチップ即消去 */
(function setupCarMobileTooltipCloser() {
    let tooltipTimer = null;
    const dismissTooltip = () => {
        if (chartInstance && chartInstance.tooltip) {
            chartInstance.tooltip.setActiveElements([], { x: 0, y: 0 });
            chartInstance.update('none');
        }
        if (tooltipTimer) clearTimeout(tooltipTimer);
    };

    document.addEventListener('touchstart', (e) => {
        const canvas = document.getElementById('carChart');
        if (canvas && e.target !== canvas) {
            dismissTooltip();
        } else {
            if (tooltipTimer) clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(dismissTooltip, 3000);
        }
    }, { passive: true });

    window.addEventListener('scroll', dismissTooltip, { passive: true });
})();

function initCarApp() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('p')) setPreset('price', params.get('p'));
    if (params.has('d')) setPreset('down', params.get('d'));
    if (params.has('y')) setPreset('horizon', params.get('y'));
    if (params.has('inc')) setPreset('income', params.get('inc'));
    if (params.has('m')) applyMethodPreset(params.get('m'));

    ['price', 'down', 'income', 'horizon', 'bankRate', 'dealerRate', 'resRate', 'resLoanRate'].forEach(f => syncCarInputs(f, 'num'));
    updateAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarApp);
} else {
    initCarApp();
}