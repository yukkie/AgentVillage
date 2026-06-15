import { describe, it, expect } from 'vitest';
import { ROLE_META_BY_KEY, ROLE_KEYS, listRoles } from './roleMeta.js';
import ROLE_META from '../../public/config/role_meta.json';
import ROLES_ROSTER from '../../public/config/roles.json';

// --- role_meta.json data shape (AC-1) ---

describe('role_meta.json data', () => {
  it('unit: role_meta の全役職に key/ja/short/team/color が存在する', () => {
    /*
    SUT: frontend/public/config/role_meta.json
    Mock: なし
    Level: unit
    Objective: 役職メタ JSON の全エントリが key/ja/short/team/color を持つことを検証する (AC-1)
    */
    expect(ROLE_META.length).toBeGreaterThan(0);
    for (const r of ROLE_META) {
      expect(typeof r.key).toBe('string');
      expect(r.key.length).toBeGreaterThan(0);
      expect(typeof r.ja).toBe('string');
      expect(typeof r.short).toBe('string');
      expect(['village', 'wolf']).toContain(r.team);
      expect(typeof r.color).toBe('string');
    }
  });

  it('unit: roles.json の全 role key が role_meta に存在する', () => {
    /*
    SUT: frontend/public/config/role_meta.json
    Mock: なし
    Level: unit
    Objective: 配分表 roles.json に現れる全役職キーが role_meta に定義されていることを検証する (AC-1 SSOT 退行防止)
    */
    const rosterKeys = new Set();
    for (const roster of Object.values(ROLES_ROSTER)) {
      for (const role of roster) rosterKeys.add(role);
    }
    for (const key of rosterKeys) {
      expect(ROLE_META_BY_KEY[key]).toBeDefined();
    }
  });
});

// --- roleMeta adapter (AC-3) ---

describe('roleMeta adapter', () => {
  it('unit: ROLE_META_BY_KEY が役職キーで引ける', () => {
    /*
    SUT: ROLE_META_BY_KEY
    Mock: なし
    Level: unit
    Objective: 旧 ROLES[role] と同じく役職キーからメタを引けることを検証する (AC-3)
    */
    expect(ROLE_META_BY_KEY.Seer.ja).toBe('占い師');
    expect(ROLE_META_BY_KEY.Werewolf.team).toBe('wolf');
  });

  it('unit: ROLE_META_BY_KEY は未知キーに undefined を返す', () => {
    /*
    SUT: ROLE_META_BY_KEY
    Mock: なし
    Level: unit
    Objective: 未知役職キーで undefined を返し、表示側のフォールバック（生キー表示）が維持されることを検証する (AC-3)
    */
    expect(ROLE_META_BY_KEY.Unknown).toBeUndefined();
  });

  it('unit: ROLE_KEYS が定義順の役職キー配列を返す', () => {
    /*
    SUT: ROLE_KEYS
    Mock: なし
    Level: unit
    Objective: 旧 Object.keys(ROLES) 相当の定義順キー配列を提供することを検証する (AC-3)
    */
    expect(ROLE_KEYS).toEqual(ROLE_META.map(r => r.key));
    expect(ROLE_KEYS[0]).toBe('Villager');
  });

  it('unit: listRoles が role_meta 配列をそのまま返す', () => {
    /*
    SUT: listRoles
    Mock: なし
    Level: unit
    Objective: 旧 Object.entries(ROLES) 相当の順序付き一覧を提供することを検証する (AC-3)
    */
    expect(listRoles()).toEqual(ROLE_META);
  });
});
