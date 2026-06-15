// エージェントメタの SSOT アダプタ。
// frontend/public/config/agents.json（Python/JS 共有のエージェント定義）を静的 import し、
// 旧 constants.js の AGENT_PALETTE（object）と同じ参照形を提供する。
// public 配下の JSON import はこのモジュールに集約し、本番 build の検証点を一箇所にする。
import AGENT_CONFIG from '../../public/config/agents.json';

// 旧 AGENT_PALETTE[name] 互換: エージェント名 → 個人カラー。未知 name は undefined（Avatar の '#888' フォールバックを維持）。
export const AGENT_COLORS = Object.fromEntries(AGENT_CONFIG.map(a => [a.name, a.color]));

// 旧 Object.keys(AGENT_PALETTE) 互換: agents.json の配列順の全エージェント名一覧。
export const ALL_AGENT_NAMES = AGENT_CONFIG.map(a => a.name);
