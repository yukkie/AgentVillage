import { describe, it, expect } from 'vitest';
import { AGENT_COLORS, ALL_AGENT_NAMES, parseBlurb } from './agentMeta.js';
import AGENT_CONFIG from '../config/agents.json';

// --- agents.json color data (AC-2) ---

describe('agents.json color data', () => {
  it('unit: agents.json の全エージェントに color が存在する', () => {
    /*
    SUT: frontend/src/config/agents.json
    Mock: なし
    Level: unit
    Objective: 全エージェントに非空の color 文字列が存在することを検証する (AC-2)
    */
    expect(AGENT_CONFIG.length).toBeGreaterThan(0);
    for (const agent of AGENT_CONFIG) {
      expect(typeof agent.color).toBe('string');
      expect(agent.color.trim().length).toBeGreaterThan(0);
    }
  });
});

// --- agentMeta adapter (AC-3) ---

describe('agentMeta adapter', () => {
  it('unit: AGENT_COLORS が name で引け未知 name は undefined', () => {
    /*
    SUT: AGENT_COLORS
    Mock: なし
    Level: unit
    Objective: 旧 AGENT_PALETTE[name] と同じく name から個人カラーを引け、未知 name は undefined（Avatar の '#888' フォールバック維持）を返すことを検証する (AC-3)
    */
    expect(AGENT_COLORS.Mira).toBe('#7fb0e0');
    expect(AGENT_COLORS.Unknown).toBeUndefined();
  });

  it('unit: ALL_AGENT_NAMES が agents.json の配列順の name 一覧を返す', () => {
    /*
    SUT: ALL_AGENT_NAMES
    Mock: なし
    Level: unit
    Objective: 旧 Object.keys(AGENT_PALETTE) 相当の全エージェント名一覧を agents.json の配列順で提供することを検証する (AC-3)
    */
    expect(ALL_AGENT_NAMES).toEqual(AGENT_CONFIG.map(a => a.name));
    expect(ALL_AGENT_NAMES.length).toBe(AGENT_CONFIG.length);
  });
});

// --- parseBlurb（#640: archiveLoader.js から移動。旧テストは #519 由来） ---

const CONFIG_FIXTURE = [
  { name: 'Nox', style: 'cynical, detached, intelligent', blurb: 'Finds the frayed edge in every word, quiet as a moonless night.' },
  { name: 'Mira', style: 'analytical, methodical, honest', blurb: 'Stands where instinct meets logic, smelling a lie before it lands.' },
];

describe('parseBlurb', () => {
  it('pure: parseBlurb が name 一致の blurb を返す', () => {
    /*
    SUT: parseBlurb
    Mock: なし
    Level: unit
    Objective: config 配列から name 一致エントリの blurb 文字列を返すことを検証する (AC-2/AC-3)
    */
    expect(parseBlurb(CONFIG_FIXTURE, 'Nox')).toBe('Finds the frayed edge in every word, quiet as a moonless night.');
  });

  it('pure: parseBlurb は未知 name に null を返す', () => {
    /*
    SUT: parseBlurb
    Mock: なし
    Level: unit
    Objective: config に存在しない名前では null を返し、表示側のフォールバックに委ねることを検証する (AC-4)
    */
    expect(parseBlurb(CONFIG_FIXTURE, 'Unknown')).toBeNull();
  });

  it('pure: parseBlurb は config が null でも null を返す', () => {
    /*
    SUT: parseBlurb
    Mock: なし
    Level: unit
    Objective: fetch 失敗で config が null のとき例外を投げず null を返すことを検証する (AC-4)
    */
    expect(parseBlurb(null, 'Nox')).toBeNull();
  });
});

describe('agents.json blurb data', () => {
  it('pure: agents.json の全エージェントに英語 blurb が存在する', () => {
    /*
    SUT: frontend/src/config/agents.json
    Mock: なし
    Level: unit
    Objective: 全エージェントに非空の英語 blurb 文字列が存在することを検証する (AC-1)
    */
    expect(AGENT_CONFIG.length).toBeGreaterThan(0);
    for (const agent of AGENT_CONFIG) {
      expect(typeof agent.blurb).toBe('string');
      expect(agent.blurb.trim().length).toBeGreaterThan(0);
      // 英語版（ASCII のみ・日本語文字を含まない）であることを担保する
      expect(/[　-鿿]/.test(agent.blurb)).toBe(false);
    }
  });
});
