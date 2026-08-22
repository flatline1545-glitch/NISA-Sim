/**
 * マイカーローン 資産カルテ・危険度称号 判定エンジン (carDiagnosisData.js)
 * 4大方式・金利搾取・残クレ沼・返済負担率・新NISA機会損失 完全対応版
 */
(function () {
    const fmt = (v) => '¥' + Math.round(v).toLocaleString('ja-JP');

    const CAR_DIAGNOSIS_DATABASE = [
        /* ===================================================
           【1. 緊急警告・高金利搾取 ＆ 破綻リスク】(Priority 100〜85)
           =================================================== */
        {
            id: 'warn_dealer_rip_off',
            priority: 100,
            match: (p) => p.currentMethod === 'dealer' && p.dealerRate >= 7.5,
            title: '🥩 ディーラーの極上カモ・金利寄付ボランティア',
            level: 'INTEREST TRAP',
            statusBadge: '🚨 金利搾取警報',
            tags: ['#ディーラー金利8%超', '#値引きが利息で消滅', '#銀行ローンへ緊急避難'],
            carte: (p) => [
                ['【金利の罠】', `ディーラー金利【${p.dealerRate.toFixed(1)}%】はあまりに高すぎます。支払利息だけで【${fmt(p.currentInterest)}】が吹き飛んでいます。`],
                ['【値引きの真実】', '「車体を15万円値引きします」と言われても、利息で数十万円余分に払っては完全にディーラーの思う壺です。'],
                ['【実践戦略】', '金利1.5〜2.5%前後の「銀行マイカーローン」に切り替えるだけで、一瞬で数十万円の手取りが浮きます。']
            ],
            rx: { text: '⚡ 処方箋: 銀行ローン（年2.0%）に切り替える', fn: () => window.applyMethodPreset('bank') }
        },
        {
            id: 'warn_dti_danger',
            priority: 99,
            match: (p) => p.dti >= 25.0,
            title: '💣 返済負担率レッドゾーン・車のために働く社畜級',
            level: 'DTI DANGER',
            statusBadge: '🚨 破綻警戒',
            tags: ['#返済負担率25%超', '#ローン審査否決濃厚', '#維持費で詰む'],
            carte: (p) => [
                ['【審査・家計診断】', `返済負担率が【${p.dti.toFixed(1)}%】に達しています。マイカーローンの安全圏（20%以下）を大幅に超過しています。`],
                ['【維持費の現実】', '車の維持にはガソリン代、自動車税、保険、車検など月2〜3万円が別にかかります。生活費が圧迫され高確率で家計破綻します。'],
                ['【実践戦略】', '車種を見直して予算を下げるか、頭金を増やして借入元金を減らしてください。']
            ]
        },
        {
            id: 'warn_nisa_opportunity_loss',
            priority: 98,
            match: (p) => p.currentTotalPay >= 4000000 && p.income <= 450,
            title: '💸 新NISAを捨てて車に捧げる人生・機会損失モンスター',
            level: 'OPPORTUNITY LOSS',
            statusBadge: '⚠️ 機会損失',
            tags: ['#年収に見合わない高級車', '#複利の機会損失', '#新NISAなら数百万'],
            carte: (p) => [
                ['【資産形成の比較】', `総支払額【${fmt(p.currentTotalPay)}】の車を購入予定です。もしこの資金を「新NISA」に回していれば、将来数百万円の資産になっていました。`],
                ['【価値の減価】', '車は買った瞬間に価値が落ちる「消費財」です。資産が形成される20代〜30代の時期に過度な車代をかけるのは危険です。'],
                ['【実践戦略】', '手頃な中古車やコンパクトカーに抑え、浮いた月3〜5万円を新NISAに投資するのが経済的自由への最短ルートです。']
            ],
            rx: { 
                text: '📈 新NISAでこの金額を運用した場合を見る', 
                fn: () => {
                    const init = p.downPayment;
                    const m = Math.round(p.currentMonthly);
                    const y = p.periodYears;
                    window.location.href = `index.html?init=${init}&m=${m}&y=${y}&r=5.0`;
                } 
            }
        },
        {
            id: 'warn_over_loan_7y',
            priority: 97,
            match: (p) => p.periodYears >= 7 && p.downPayment === 0,
            title: '📉 資産価値マイナス確定・フルローン沈没船',
            level: 'OVER LOAN',
            statusBadge: '⚠️ 残債割れリスク',
            tags: ['#頭金0円', '#7年長期フルローン', '#事故時即借金残り'],
            carte: (p) => [
                ['【リスク分析】', '頭金ゼロの7年フルローンは「車の価値の下落スピード」が「ローンの残債が減るスピード」を上回る危険な状態（オーバーローン）です。'],
                ['【最悪のシナリオ】', '3〜4年目に事故で廃車になったり売却しようとしても、車の査定額よりローン残高が多く、手元に多額の借金だけが残ります。'],
                ['【実践戦略】', '最低でも車両価格の20%以上は頭金を用意し、返済期間は最長でも5年以内に設定しましょう。']
            ]
        },

        /* ===================================================
           【2. 残クレ（残価設定型）特有の罠 ＆ 診断】(Priority 84〜70)
           =================================================== */
        {
            id: 'zan_reloan_infinite',
            priority: 84,
            match: (p) => p.currentMethod === 'residual' && p.residualAction === 'reloan',
            title: '♾️ 終わらない借金輪廻・8年目の新車（再ローン地獄）',
            level: 'DEBT SPIRAL',
            statusBadge: '🚨 泥沼ローン',
            tags: ['#残価を再ローン', '#利息二重払い', '#一生払い続ける'],
            carte: (p) => [
                ['【最悪の出口戦略】', `最終回残価【${fmt(p.residualValue)}】を一括で払えず、再ローン（年利6〜9%）に切り替える最悪のパターンです。`],
                ['【利息の二重搾取】', '据え置いていた残価にさらに高金利が上乗せされ、もはや「新車の支払いをしながらボロボロの中古車に乗っている」状態になります。'],
                ['【実践戦略】', '残クレを利用するなら、5年後に確実に一括返済できる現金を別口座で積み立てておくのが絶対条件です。']
            ]
        },
        {
            id: 'zan_trap_hidden_interest',
            priority: 83,
            match: (p) => p.currentMethod === 'residual' && p.currentInterest >= 400000,
            title: '🎯 残価マジック被弾・据置利息の養分ホルダー',
            level: 'RESIDUAL TRAP',
            statusBadge: '⚠️ 隠れ利息大',
            tags: ['#月々は安く見える罠', '#据置残価にも金利発生', '#銀行ローンより高額'],
            carte: (p) => [
                ['【残クレのカラクリ】', `毎月の支払いは安く見えますが、据え置いた残価【${fmt(p.residualValue)}】に対しても毎月金利が課され、通算利息は【${fmt(p.currentInterest)}】に達します。`],
                ['【銀行ローンとの比較】', `同じ車を銀行ローンで買った場合に比べ、利息だけで【+${fmt(p.diffBankInterest)}】も余計に支払っています。`],
                ['【実践戦略】', '「月々の安さ」に騙されず、総支払額で比較して銀行ローンを検討してください。']
            ],
            rx: { text: '⚡ 処方箋: 銀行ローンで総額を安くする', fn: () => window.applyMethodPreset('bank') }
        },
        {
            id: 'zan_smart_user',
            priority: 80,
            match: (p) => p.currentMethod === 'residual' && p.residualRate >= 45 && p.periodYears <= 3,
            title: '🏎️ 3年スパン乗り換えマスター・高残価ハッカー',
            level: 'CAR HACKER',
            statusBadge: '✨ 短期乗換型',
            tags: ['#人気SUVミニバン', '#高残価率', '#3年乗換ライフ'],
            carte: (p) => [
                ['【現状分析】', 'リセールバリューが極めて高い人気車種（アルファード、ランクル等）を3年サイクルの残クレで賢く乗り継ぐ上級者スタイルです。'],
                ['【運用のコツ】', '走行距離制限やキズ・凹みによる減点精算ペナルティに注意し、丁寧に乗って査定額を残価以上に保つことが必須条件です。'],
                ['【実践戦略】', '手元に残した手持ち資金は新NISAで運用し、金利差を上回るリターンを狙いましょう。']
            ]
        },

        /* ===================================================
           【3. カーリース（サブスク）特化診断】(Priority 69〜60)
           =================================================== */
        {
            id: 'lease_convenient_peace',
            priority: 65,
            match: (p) => p.currentMethod === 'lease',
            title: '📦 家計フラット・税金車検コミコミ安心ドライバー',
            level: 'LEASE USER',
            statusBadge: '🌿 家計安定',
            tags: ['#突発出費ゼロ', '#税金車検コミコミ', '#中途解約不可'],
            carte: (p) => [
                ['【現状分析】', `自動車税、車検代、自賠責保険がすべて月額定額に含まれるため、毎年の突発的な出費に怯える必要がありません。`],
                ['【注意点】', 'トータルの総支払額は銀行ローン購入より割高になり、原則として契約期間中の「中途解約」ができない点に留意してください。'],
                ['【実践戦略】', '「車の維持管理に頭を使いたくない」「家計の支出を毎月完全に均等化したい」人には最適な選択肢です。']
            ]
        },

        /* ===================================================
           【4. 銀行マイカーローン・優等生判定】(Priority 59〜50)
           =================================================== */
        {
            id: 'bank_champion',
            priority: 59,
            match: (p) => p.currentMethod === 'bank' && p.dti <= 15.0 && p.bankRate <= 2.0,
            title: '👑 家計防衛の覇者・スマートマイカーマスター',
            level: 'SMART BUYER SSS',
            statusBadge: '👑 最安完全防衛',
            tags: ['#超低金利調達', '#返済負担率安全', '#所有権は自分'],
            carte: (p) => [
                ['【完璧な購入設計】', `低金利【${p.bankRate.toFixed(1)}%】で賢く調達し、返済負担率も【${p.dti.toFixed(1)}%】と極めて健全です。`],
                ['【最大のメリット】', `完済後は車が100%あなたの「資産」として残り、売るのも乗り続けるのも自由自在です。ディーラーローンと比べて【約${fmt(p.diffDealerInterest)}】の利息を節約しました。`],
                ['【実践戦略】', '浮いた利息分をそのまま新NISAの積立投資に回し、完璧な資産形成ピラミッドを築きましょう。']
            ],
            rx: { 
                text: '📈 浮いたお金を新NISAに回すシミュレーション', 
                fn: () => {
                    window.location.href = `index.html?m=30000&r=5.0&y=20`;
                } 
            }
        },
        {
            id: 'bank_standard',
            priority: 50,
            match: (p) => p.currentMethod === 'bank',
            title: '👔 堅実ドライバー・王道の銀行ローン選択',
            level: 'SMART BUYER A',
            statusBadge: '🌿 堅実調達',
            tags: ['#低金利', '#総支払額最安', '#審査の手間を惜しまない'],
            carte: (p) => [
                ['【現状分析】', 'ディーラーの手軽な高金利に流されず、銀行のWeb本審査等を経て低金利ローンを活用する賢明な判断です。'],
                ['【安心感】', '走行距離制限や所有権留保などの縛りがなく、最もトラブルの少ない購入方法です。'],
                ['【実践戦略】', 'ボーナス払いは設定せず、毎月均等返済で淡々と完済を目指すのが家計管理の鉄則です。']
            ]
        },

        /* ===================================================
           【5. 汎用フォールバック判定】(Priority 10)
           =================================================== */
        {
            id: 'car_fallback_standard',
            priority: 10,
            match: () => true,
            title: '🚗 マイカー検討中・損得バランス検証中',
            level: 'BUYER STANDARD',
            statusBadge: '📋 診断完了',
            tags: ['#マイカーローン比較', '#金利比較', '#返済負担率チェック'],
            carte: (p) => [
                ['【現状分析】', `車両価格【${fmt(p.carPrice)}】に対し、頭金【${fmt(p.downPayment)}】、期間【${p.periodYears}年】で試算中です。`],
                ['【アドバイス】', '月々の安さだけでなく「最終的に支払う利息の総額」を必ず確認し、無理のない返済計画を立てましょう。'],
                ['【実践戦略】', '上部のプリセットボタンを切り替えて、銀行ローンや残クレとの総額差を比較してみてください。']
            ]
        }
    ];

    /* ===================================================
       公開API：診断結果の生成
       =================================================== */
    window.generateCarDiagnosis = function (params) {
        const sorted = CAR_DIAGNOSIS_DATABASE.slice().sort((a, b) => b.priority - a.priority);
        const item = sorted.find(def => def.match(params)) || CAR_DIAGNOSIS_DATABASE[CAR_DIAGNOSIS_DATABASE.length - 1];

        const cartePairs = typeof item.carte === 'function' ? item.carte(params) : [];
        const carteHtml = cartePairs.map(([head, body]) => `
      <div class="carte-block">
        <span class="carte-heading">${head}</span>
        <span class="carte-text">${body}</span>
      </div>
    `).join('');

        let rxButtonHtml = '';
        if (item.rx && item.rx.text && typeof item.rx.fn === 'function') {
            const fnName = `__car_rx_${item.id}`;
            window[fnName] = item.rx.fn;
            rxButtonHtml = `<div class="prescription-btn-wrap"><button class="btn-rx-action" onclick="window['${fnName}']()">${item.rx.text}</button></div>`;
        }

        return {
            title: item.title,
            level: item.level,
            tags: item.tags || [],
            carteHtml: carteHtml,
            rxButtonHtml: rxButtonHtml,
            statusBadgeText: item.statusBadge || '診断完了'
        };
    };
})();