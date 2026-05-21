import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventLine, parseGameData, normalizeEvents, aggregateDayResults } from './parseGameData.js';

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

  it('merges private THINK wolf_chat rows into their visible wolf_chat event', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: speech_id を持たない wolf_chat の THINK 行が同じカードの thought に結合されることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: 'Nox: Renを噛みたい' },
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: '[THINK] Renは騎士ではなさそう' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Nox: Renを噛みたい');
    expect(events[0].thought).toBe('Renは騎士ではなさそう');
  });

  it('merges pending private THINK wolf_chat rows when they appear before visible chat', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: JSONL 順序が逆転しても wolf_chat THINK 行を後続の表示イベントへ結合できることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: '[THINK] 先に考えた内容' },
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: 'Nox: Soraを噛もう' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Nox: Soraを噛もう');
    expect(events[0].thought).toBe('先に考えた内容');
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

  it('includes daySummary in returned GameData', () => {
    /*
     * SUT: parseGameData
     * Mock: なし（design/proposal/source_logs/ の実ログを fixture に使用）
     * Level: unit
     * Objective: parseGameData の返り値に daySummary が含まれ、実ログの elimination/night_attack から正しく導出されることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'));
    expect(gameData.daySummary).toBeDefined();
    const day1 = gameData.daySummary[1];
    expect(day1.target).toBeTruthy();
    expect(typeof day1.votes).toBe('number');
    expect(typeof day1.nightDone).toBe('boolean');
  });
});

describe('aggregateDayResults', () => {
  it('extracts elimination target and top vote count', () => {
    /*
     * SUT: aggregateDayResults
     * Mock: なし
     * Level: unit
     * Objective: elimination イベントの agent フィールドが daySummary の target に反映され、vote 集計で最多票数が votes に入ることを検証する。
     */
    const events = [
      { day: 1, event_type: 'elimination', agent: 'Kael', is_public: true },
      { day: 1, event_type: 'vote', agent: 'Nox',  target: 'Kael' },
      { day: 1, event_type: 'vote', agent: 'Mira', target: 'Kael' },
      { day: 1, event_type: 'vote', agent: 'Ren',  target: 'Sora' },
    ];
    const summary = aggregateDayResults(events);
    expect(summary[1].target).toBe('Kael');
    expect(summary[1].votes).toBe(2);
  });

  it('sets nightDone true when public night_attack exists', () => {
    /*
     * SUT: aggregateDayResults
     * Mock: なし
     * Level: unit
     * Objective: is_public な night_attack イベントがある日は nightDone が true、ない日は false になることを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Rei',  is_public: true },
      { day: 2, event_type: 'night_attack', agent: 'Sora', is_public: false },
    ];
    const summary = aggregateDayResults(events);
    expect(summary[1].nightDone).toBe(true);
    expect(summary[2]).toBeUndefined();
  });

  it('returns no entry for days with only speech events', () => {
    /*
     * SUT: aggregateDayResults
     * Mock: なし
     * Level: unit
     * Objective: speech のみのイベント列では daySummary にエントリが作られないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1 },
    ];
    const summary = aggregateDayResults(events);
    expect(summary[1]).toBeUndefined();
  });
});
