import { describe, it, expect } from 'vitest';
import { AGENT_COLORS, ALL_AGENT_NAMES } from './agentMeta.js';
import AGENT_CONFIG from '../../public/config/agents.json';

// --- agents.json color data (AC-2) ---

describe('agents.json color data', () => {
  it('unit: agents.json の全エージェントに color が存在する', () => {
    /*
    SUT: frontend/public/config/agents.json
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
