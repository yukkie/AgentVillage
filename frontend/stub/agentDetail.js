// スタブデータ — Issue #311 Agent detail screen
// spectator.js と同じエージェント・役職割り当てを使用

import { ROLE_ASSIGNMENT } from './spectator.js';
export { ROLE_ASSIGNMENT };

// エージェントリスト（順序: 生存優先、死亡者は末尾）
export const ALL_AGENTS = ['Nox','Mira','Ren','Kai','Shiki','Rei','Sable','Sera','Kael','Sora','Toma'];
export const DEAD_AGENTS = new Set(['Sora', 'Toma']);

// blurb（1行プロフィール）は config/agents.json の blurb フィールドへ実データ化済み（#519）。

// エージェントごとの通算戦績（スタブ）
export const AGENT_STATS = {
  Nox:   { games: 47, wins: 32, speeches: 9,  cheers: 312 },
  Mira:  { games: 38, wins: 24, speeches: 12, cheers: 198 },
  Ren:   { games: 52, wins: 28, speeches: 14, cheers: 445 },
  Kai:   { games: 41, wins: 20, speeches: 6,  cheers: 87  },
  Shiki: { games: 33, wins: 22, speeches: 10, cheers: 261 },
  Rei:   { games: 29, wins: 18, speeches: 11, cheers: 153 },
  Sable: { games: 44, wins: 25, speeches: 8,  cheers: 175 },
  Sera:  { games: 36, wins: 19, speeches: 7,  cheers: 99  },
  Kael:  { games: 31, wins: 14, speeches: 13, cheers: 221 },
  Sora:  { games: 26, wins: 15, speeches: 5,  cheers: 134 },
  Toma:  { games: 22, wins: 10, speeches: 4,  cheers: 56  },
};

// 推論ログ（spectator 限定 thought）
export const THOUGHTS = {
  Nox: [
    { day: 1, speechId: 3, text: 'Kai の初日の沈黙が気になる。情報を集めながら様子を見る。占い先は Kai を最優先にしたい。' },
    { day: 2, speechId: 1, text: 'Ren が占い師 CO してきた。自分と競合する。Ren の昨日の行動パターンを振り返ると明らかに人狼側の情報収集に見える。対抗 CO するべきか。' },
    { day: 2, speechId: 4, text: 'Kai を黒と出た。この情報を出すタイミングは今しかない。Ren の偽占いを崩す絶好のチャンスだ。' },
    { day: 3, speechId: 2, text: 'Ren が処刑された。これで偽占いは消えた。次は Sera を追う。Kai の動向が鍵になる。' },
  ],
};

// 夜の行動ログ
export const NIGHT_ACTIONS = {
  Nox: [
    { day: 1, phase: 'N', action: '占いを実行', target: 'Kai',  result: 'black' },
    { day: 2, phase: 'N', action: '占いを実行', target: 'Sera', result: 'black' },
  ],
  Rei: [
    { day: 1, phase: 'N', action: '護衛を実行', target: 'Nox',   result: 'safe'    },
    { day: 2, phase: 'N', action: '護衛を実行', target: 'Shiki', result: 'blocked' },
  ],
};

// 疑い・信頼スコア（選択エージェントから見た各エージェントへの双方向）
export function getSuspicionMatrix(agent) {
  const others = ALL_AGENTS.filter(n => n !== agent);
  return others.map(n => {
    const seed = [...(agent + n)].reduce((s, ch) => s + ch.charCodeAt(0), 0);
    return {
      name:      n,
      suspicion: (seed * 17 + 7) % 101,
      trust:     (seed * 13 + 30) % 101,
    };
  }).sort((a, b) => b.suspicion - a.suspicion);
}
