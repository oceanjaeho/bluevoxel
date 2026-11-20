// 갯벌 수호대 밸런스 점검: 자동 조종으로 스테이지·캐릭터별 승률을 봐요
//   node tools/game-balance.mjs [판 수=3] [--meta]
import { loadGS, autoRun } from '../tests/game-harness.mjs';

const GS = loadGS();
const args = process.argv.slice(2);
const n = parseInt(args.find(a => /^\d+$/.test(a)) || '3', 10);
const metaLevels = args.includes('--meta')
  ? { hp: 4, might: 4, speed: 2, magnet: 2, regen: 2, growth: 2, reroll: 2 }
  : {};
console.log(`판 수 ${n} · 영구 강화 ${args.includes('--meta') ? '있음' : '없음'}\n`);
console.log('스테이지 | 캐릭터 | 승리 | 평균 시간 | 평균 레벨 | 평균 처치 | 평균 복원 | 진주');
for (const st of GS.DATA.STAGES) {
  for (const ch of GS.DATA.CHARS) {
    let win = 0, t = 0, lv = 0, k = 0, rs = 0, pe = 0;
    for (let seed = 1; seed <= n; seed++) {
      const { r } = autoRun(GS, { stage: st.id, char: ch.id, seed, meta: metaLevels });
      win += r.win ? 1 : 0; t += r.time; lv += r.level; k += r.kills; rs += r.restored; pe += r.pearls;
    }
    console.log([st.name, ch.name, `${win}/${n}`, GS.U.fmtTime(t / n), (lv / n).toFixed(1), Math.round(k / n), Math.round(rs / n * 100) + '%', Math.round(pe / n)].join(' | '));
  }
}
