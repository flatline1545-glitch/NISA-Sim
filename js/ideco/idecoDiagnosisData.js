/* 📋 iDeCo 診断カルテ・テキスト生成エンジン */
window.generateIdecoDiagnosis = function (data) {
  const { income, monthly, horizon, annualReturn, annualTax, totalTax, gains, total, currentJob } = data;

  const fmtYen = (num) => '¥' + Math.round(num).toLocaleString('ja-JP');

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

  return { title, level, tags, carteHtml };
};