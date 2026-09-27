// 人数ルール（GameListScreen 左ナビのルールフィルター・#623）。
// frontend/src/config/roles.json（Python/JS 共有の人数別役職編成・SSOT）を静的 import し、
// そのキー（人数）をルール項目として提供する。人数リストはここにも画面側にも持たない。
// 共有 config の JSON import は lib に集約する（#628 と同方針）。
import ROLES from '../config/roles.json';

// roles.json のキーを数値昇順に並べたルール項目。
export const PLAYER_COUNT_RULES = Object.keys(ROLES).map(Number).sort((a, b) => a - b);

/**
 * ゲームが人数ルールに一致するか。
 * 人数は cast.length（index.json の agent_count と同値）で判定する。
 *
 * @param {{cast: string[]}} game - archiveLoader の game エントリ
 * @param {number | null} rule - 選択中の人数。null は未選択（すべて）
 * @returns {boolean}
 */
export function matchesPlayerCountRule(game, rule) {
  return rule === null || game.cast.length === rule;
}
