// 役職メタの SSOT アダプタ。
// frontend/public/config/role_meta.json（Python/JS 共有の役職メタ）を静的 import し、
// 旧 constants.js の ROLES（object）と同じ参照形を提供する。
// public 配下の JSON import はこのモジュールに集約し、本番 build の検証点を一箇所にする。
import ROLE_META from '../../public/config/role_meta.json';

// 旧 ROLES[role] 互換: 役職キー → メタ object。未知キーは undefined（表示側の生キーフォールバックを維持）。
export const ROLE_META_BY_KEY = Object.fromEntries(ROLE_META.map(r => [r.key, r]));

// 旧 Object.keys(ROLES) 互換: 定義順の役職キー配列。
export const ROLE_KEYS = ROLE_META.map(r => r.key);

// 旧 Object.entries(ROLES) 相当の順序付き一覧用途。
export function listRoles() {
  return ROLE_META;
}
