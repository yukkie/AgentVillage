const DAY_PHASE_LABEL = { discuss: '議論', vote: '投票・処刑', night: '夜フェーズ' };

/**
 * フェーズ見出しラベルを導出する純粋関数。
 * `SpectatorScreen.jsx` の TopBar パンくずとフィード見出し（旧: 同一の長い三項式が2箇所）で共有する（#596）。
 * 未知 phase では `Day {day} undefined` を返す（既存インライン三項式と同じ挙動。あえてフォールバックを足さない）。
 */
export function phaseHeading(day, phase) {
  if (phase === 'game_over') return '勝敗結果';
  if (phase === 'eve') return '前夜 プロローグ';
  return `Day ${day} ${DAY_PHASE_LABEL[phase]}`;
}
