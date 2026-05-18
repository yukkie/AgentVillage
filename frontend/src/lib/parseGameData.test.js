import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventLine, parseGameData, normalizeEvents } from './parseGameData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const sourceLogDir = path.join(repoRoot, 'design/proposal/source_logs');

function readFixture(relativePath) {
  return fs.readFileSync(path.join(sourceLogDir, relativePath), 'utf8');
}

function readAgent(name) {
  return JSON.parse(readFixture(`agents/${name.toLowerCase()}.json`));
}

describe('parseEventLine', () => {
  it('parses one JSONL event line', () => {
    /**
     * SUT: parseEventLine
     * Mock: なし
     * Level: unit
     * Objective: JSONL の1行を LogEvent オブジェクトに変換できることを検証する。
     */
    const event = parseEventLine('{"event_type":"speech","agent":"Mira"}');
    expect(event).toEqual({ event_type: 'speech', agent: 'Mira' });
  });

  it('returns null for blank lines', () => {
    /**
     * SUT: parseEventLine
     * Mock: なし
     * Level: unit
     * Objective: JSONL 末尾の空行を無視できることを検証する。
     */
    expect(parseEventLine('   ')).toBeNull();
  });
});

describe('normalizeEvents', () => {
  it('merges private THINK rows into their public speech event', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: spectator_log.jsonl の非公開 THINK 行が公開 speech の thought に結合されることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: true, content: 'おはよう' },
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: false, content: '[THINK] 内心' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('おはよう');
    expect(events[0].thought).toBe('内心');
  });
});

describe('parseGameData', () => {
  it('parses real spectator_log.jsonl into events and agents', () => {
    /**
     * SUT: parseGameData
     * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
     * Level: unit
     * Objective: 実ログから GameData の events と agents を生成できることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'), {
      Mira: readAgent('Mira'),
      Ren: readAgent('Ren'),
      Nox: readAgent('Nox'),
    });

    expect(gameData.events.length).toBeGreaterThan(0);
    expect(gameData.agents.Mira.name).toBe('Mira');
    expect(gameData.agents.Ren.name).toBe('Ren');
    expect(gameData.agents.Nox.name).toBe('Nox');
  });

  it('attaches thought text from real spectator_log.jsonl', () => {
    /**
     * SUT: parseGameData
     * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
     * Level: unit
     * Objective: 実 spectator log の THINK 行が speech.thought として利用できることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'));
    const miraSpeech = gameData.events.find(
      event => event.event_type === 'speech' && event.agent === 'Mira' && event.speech_id === 1
    );

    expect(miraSpeech.thought).toContain('Day 1');
    expect(miraSpeech.thought).not.toContain('[THINK]');
  });
});
