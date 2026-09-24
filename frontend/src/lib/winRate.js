// 勝率の計算と表示表記（#629）。GameListScreen ランキング・AgentDetailScreen global hero の両方が使う。
// 母数 0 は null（データなし）とし、表示側で NaN / 0% にしない。

// 「データなし」表記。既存の値欠落フォールバック（BLURB_FALLBACK 等）と揃える。
const NO_DATA = '—';

/**
 * @param {number} wins
 * @param {number} games
 * @returns {number | null} 四捨五入した勝率(%)。games が 0 なら null
 */
export function winRate(wins, games) {
  return games > 0 ? Math.round((wins / games) * 100) : null;
}

/**
 * @param {number | null} rate - winRate() の戻り値
 * @returns {string} "67%"、null なら "—"
 */
export function formatWinRate(rate) {
  return rate === null ? NO_DATA : `${rate}%`;
}
