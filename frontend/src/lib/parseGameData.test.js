import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventLine, parseGameData, normalizeEvents, aggregateDayResults, aggregateCoStatus, aggregateDayActions } from './parseGameData.js';

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
    expect(events[0].reasoning).toBe('内心');
  });

  it('merges private THINK wolf_chat rows into their visible wolf_chat event', () => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: speech_id を持たない wolf_chat の THINK 行が同じカードの reasoning に結合されることを検証する。
     */
    const events = normalizeEvents([
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: 'Nox: Renを噛みたい' },
      { day: 1, phase: 'night_wolf_chat', event_type: 'wolf_chat', agent: 'Nox', is_public: false, content: '[THINK] Renは騎士ではなさそう' },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Nox: Renを噛みたい');
    expect(events[0].reasoning).toBe('Renは騎士ではなさそう');
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
    expect(events[0].reasoning).toBe('先に考えた内容');
  });
});

describe('normalizeEvents: reasoning passthrough for non-THINK event types', () => {
  it.each([
    ['vote',          { event_type: 'vote',          agent: 'Alice', target: 'Bob',  content: 'Alice votes for Bob',              is_public: true  }],
    ['inspection',    { event_type: 'inspection',    agent: 'Alice', target: 'Bob',  content: 'Alice inspects Bob: Werewolf',     is_public: false }],
    ['guard',         { event_type: 'guard',         agent: 'Carol', target: 'Alice', content: 'Carol guards Alice',             is_public: false }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob',  content: 'Alice senses: Bob was Werewolf',  is_public: false }],
  ])('preserves ev.reasoning for %s events', (_eventType, rawEvent) => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: vote / inspection / guard / medium_result の reasoning フィールドが
     *            normalizeEvents を通過しても失われないことを検証する。
     *            これらはTHINKハックの対象外であり、ログの reasoning フィールドをそのまま
     *            FeedItem に渡す必要がある（contract テスト）。
     */
    const events = normalizeEvents([{ ...rawEvent, reasoning: '対象選択の理由。' }]);

    expect(events).toHaveLength(1);
    expect(events[0].reasoning).toBe('対象選択の理由。');
  });

  it.each([
    ['vote',          { event_type: 'vote',          agent: 'Alice', target: 'Bob',  content: 'Alice votes for Bob',              is_public: true  }],
    ['inspection',    { event_type: 'inspection',    agent: 'Alice', target: 'Bob',  content: 'Alice inspects Bob: Werewolf',     is_public: false }],
    ['guard',         { event_type: 'guard',         agent: 'Carol', target: 'Alice', content: 'Carol guards Alice',             is_public: false }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob',  content: 'Alice senses: Bob was Werewolf',  is_public: false }],
  ])('reasoning is undefined when absent for %s events', (_eventType, rawEvent) => {
    /**
     * SUT: normalizeEvents
     * Mock: なし
     * Level: unit
     * Objective: reasoning フィールドがないイベントでは undefined のまま出力されることを検証する。
     */
    const events = normalizeEvents([rawEvent]);

    expect(events).toHaveLength(1);
    expect(events[0].reasoning).toBeUndefined();
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
     * Objective: 実 spectator log の THINK 行が speech.reasoning として利用できることを検証する。
     */
    const gameData = parseGameData(readFixture('spectator_log.jsonl'));
    const miraSpeech = gameData.events.find(
      event => event.event_type === 'speech' && event.agent === 'Mira' && event.speech_id === 1
    );

    expect(miraSpeech.reasoning).toContain('Day 1');
    expect(miraSpeech.reasoning).not.toContain('[THINK]');
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

describe('aggregateCoStatus', () => {
  it('returns agent→claimed_role map from co_announcement events', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: co_announcement イベントから { エージェント名: claimed_role } マップを生成できることを検証する。
     */
    const events = [
      { day: 2, event_type: 'co_announcement', agent: 'Jonas', claimed_role: 'Seer', is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'SQ',    claimed_role: 'Medium', is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({ Jonas: 'Seer', SQ: 'Medium' });
  });

  it('returns empty object when no co_announcement events', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: co_announcement がない場合は空オブジェクトを返すことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1, is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({});
  });

  it('uses the last co_announcement when the same agent CO twice', () => {
    /*
     * SUT: aggregateCoStatus
     * Mock: なし
     * Level: unit
     * Objective: 同一エージェントが複数回COした場合、最後のCOが上書きされることを検証する。
     */
    const events = [
      { day: 2, event_type: 'co_announcement', agent: 'Ren', claimed_role: 'Seer',   is_public: true },
      { day: 3, event_type: 'co_announcement', agent: 'Ren', claimed_role: 'Villager', is_public: true },
    ];
    expect(aggregateCoStatus(events)).toEqual({ Ren: 'Villager' });
  });
});

describe('aggregateDayActions', () => {
  it('collects night actions and exec result per day', () => {
    /*
     * SUT: aggregateDayActions
     * Mock: なし
     * Level: unit
     * Objective: inspection / guard / night_attack(private) / elimination / vote から日別サマリを生成することを検証する。
     */
    const events = [
      { day: 1, event_type: 'inspection',  agent: 'Nox',   target: 'Kai', content: 'Nox inspects Kai: Werewolf', is_public: false },
      { day: 1, event_type: 'guard',       agent: 'Rei',   target: 'Nox', content: 'Rei guards Nox',             is_public: false },
      { day: 1, event_type: 'night_attack', agent: 'Kai',  target: 'Sora', content: 'Werewolves attack Sora',    is_public: false },
      { day: 1, event_type: 'vote',         agent: 'Nox',  target: 'Toma', content: 'Nox votes for Toma',        is_public: true },
      { day: 1, event_type: 'vote',         agent: 'Mira', target: 'Toma', content: 'Mira votes for Toma',       is_public: true },
      { day: 1, event_type: 'vote',         agent: 'Kai',  target: 'Nox',  content: 'Kai votes for Nox',         is_public: true },
      { day: 1, event_type: 'elimination',  agent: 'Toma', target: null,   content: 'Toma was executed.',        is_public: true },
    ];
    const result = aggregateDayActions(events);
    const d1 = result[1];

    expect(d1.nightActions).toHaveLength(3);
    expect(d1.nightActions.find(a => a.event_type === 'inspection')).toBeTruthy();
    expect(d1.nightActions.find(a => a.event_type === 'guard')).toBeTruthy();
    expect(d1.nightActions.find(a => a.event_type === 'night_attack' && !a.is_public)).toBeTruthy();

    expect(d1.execResult.target).toBe('Toma');
    expect(d1.execResult.voteTable).toEqual([
      { from: 'Nox',  to: 'Toma' },
      { from: 'Mira', to: 'Toma' },
      { from: 'Kai',  to: 'Nox' },
    ]);
  });

  it('excludes public night_attack from nightActions (already shown in feed)', () => {
    /*
     * SUT: aggregateDayActions
     * Mock: なし
     * Level: unit
     * Objective: is_public な night_attack（夜明け公知イベント）は nightActions に含まれないことを検証する。
     */
    const events = [
      { day: 1, event_type: 'night_attack', agent: 'Kai',  target: 'Sora', is_public: false },
      { day: 1, event_type: 'night_attack', agent: 'Sora', target: null,   is_public: true },
    ];
    const result = aggregateDayActions(events);
    expect(result[1].nightActions).toHaveLength(1);
    expect(result[1].nightActions[0].is_public).toBe(false);
  });

  it('returns empty nightActions and null execResult for days with no relevant events', () => {
    /*
     * SUT: aggregateDayActions
     * Mock: なし
     * Level: unit
     * Objective: 該当イベントがない日はデフォルト値を返すことを検証する。
     */
    const events = [
      { day: 1, event_type: 'speech', agent: 'Mira', speech_id: 1 },
    ];
    const result = aggregateDayActions(events);
    expect(result[1]).toBeUndefined();
  });
});
