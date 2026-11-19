// 밸런스 점검: 여러 전략으로 2026→2050을 끝까지 돌려 결과를 표로 보여줘요.
//   node tools/balance.mjs [수업코드]
import { loadBV, play, CHOICES } from '../tests/harness.mjs';

const BV = loadBV();
const code = process.argv[2] || 'MULTTAE';
const rows = [];
for (const strategy of Object.keys(CHOICES)) {
  const s = play(BV, strategy, code);
  const ev = BV.sim.evaluate(s);
  const h = s.history;
  const mid = h.find((x) => x.year === 2038) || {};
  rows.push({
    전략: strategy,
    엔딩: ev.ending.title,
    '탄소중립%': Math.round(ev.neutrality * 100),
    '2050흡수': Math.round(ev.last.effAbsorb),
    '2050배출': Math.round(ev.last.emitVillage + ev.last.emitLand),
    누적순흡수: Math.round(ev.cumNet),
    생물: ev.species,
    '면적ha': `${ev.eco0}→${ev.eco}`,
    염습지: ev.marsh,
    잘피: ev.seagrass,
    수질: Math.round(s.wq),
    지지도: s.support,
    예산: s.budget,
    '2038예산': mid.budget,
    '2038흡수': mid.absorb
  });
}
console.table(rows);
if (process.argv.includes('--species')) {
  for (const strategy of Object.keys(CHOICES)) {
    const s = play(BV, strategy, code);
    const st = BV.sim.speciesStatus(s);
    const miss = st.filter((x) => !x.present).map((x) => x.id + '(' + x.needs.filter((n) => !n.ok).map((n) => n.key + ' ' + n.have + '/' + n.need).join(',') + ')');
    console.log(strategy.padEnd(14), 'missing:', miss.join(' '));
  }
}
