import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedItem, SystemRow } from './FeedCard.jsx';

const roleAssignment = { Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' };

afterEach(() => {
  cleanup();
});

// AC-1 / AC-3: FeedItem / SystemRow を新モジュールから、特定 screen の state（useParams 等）に
// 依存せず props（sessionId 含む）のみで描画できることを検証する。Route ラッパは張らない。

describe('FeedCard: FeedItem (props-based, sessionId prop)', () => {
  it('統合: FeedItem: speech を描画し sessionId prop からエージェント詳細リンクを組み立てる', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: useParams ではなく props.sessionId を使って /game/{sessionId}/agent/{name} へのリンクを描画することを検証する（AC-3）。
     */
    const ev = { day: 1, event_type: 'speech', agent: 'Alice', content: 'hello', speech_id: 1, is_public: true };
    const { container } = render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator" />
      </MemoryRouter>
    );

    expect(screen.getByText('hello')).toBeTruthy();
    expect(container.querySelector('a[href="/game/s1/agent/Alice"]')).toBeTruthy();
  });

  it('統合: FeedItem: public viewerMode の query をリンクに引き継ぐ', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: viewerMode=public のとき agentDetailPath が ?view=public を付与することを検証する。
     */
    const ev = { day: 1, event_type: 'speech', agent: 'Alice', content: 'hello', speech_id: 1, is_public: true };
    const { container } = render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="public" />
      </MemoryRouter>
    );

    expect(container.querySelector('a[href="/game/s1/agent/Alice?view=public"]')).toBeTruthy();
  });
});

describe('FeedCard: FeedItem game_over winner styling', () => {
  it.each([
    ['Werewolves', 'gameOverWolf'],
    ['Villagers', 'gameOverVillage'],
    ['Draw', 'gameOverUnknown'],
  ])('統合: FeedItem: game_over winner=%s に対応する勝敗テキストclassを付与する', (winner, expectedClass) => {
    /*
     * SUT: FeedItem (game_over branch)
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: game_over イベントの winner に応じて陣営別の勝敗テキスト class が選ばれ、content が表示されることを検証する。
     */
    const ev = { day: 3, event_type: 'game_over', winner, content: `${winner} win`, is_public: true };
    const { container } = render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator" />
      </MemoryRouter>
    );

    expect(screen.getByText(`${winner} win`)).toBeTruthy();
    expect(container.querySelector(`[class*="${expectedClass}"]`)).toBeTruthy();
  });
});

describe('FeedCard: FeedItem branch coverage', () => {
  it('統合: FeedItem: 公開 guard_block（is_public=true）を護衛システム行として表示する', () => {
    /*
     * SUT: FeedItem (guard_block branch)
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: is_public=true の guard_block が公開向け「護衛」システム行として content を表示することを検証する。
     */
    const ev = { day: 2, event_type: 'guard_block', is_public: true, content: 'The attack was blocked.' };
    render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator" />
      </MemoryRouter>
    );

    expect(screen.getByText('The attack was blocked.')).toBeTruthy();
  });

  it('統合: FeedItem: vote_strategy を持つ投票で spectator のとき strategy バッジを表示する', () => {
    /*
     * SUT: FeedItem → SystemRow (strategy badge)
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: 投票イベントが vote_strategy を持つとき spectator モードで [strategy: ...] バッジを表示することを検証する。
     */
    const ev = { day: 1, event_type: 'vote', agent: 'Alice', target: 'Bob', content: 'votes', vote_strategy: 'aggressive', is_public: true };
    render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator" />
      </MemoryRouter>
    );

    expect(screen.getByText(/strategy: aggressive/)).toBeTruthy();
  });

  it.each([
    ['day_opening'],
    ['day_discussion'],
  ])('統合: FeedItem: phase_start phase=%s は中央フィードに表示しない', (phase) => {
    /*
     * SUT: FeedItem (phase_start day_opening/day_discussion branch)
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: 議論系フェーズ開始（day_opening/day_discussion）の phase_start を中央フィードに描画しないことを検証する。
     */
    const ev = { day: 1, event_type: 'phase_start', phase, content: `=== ${phase} ===` };
    const { container } = render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator" />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('統合: FeedItem: 非表示対象外の phase_start をフェーズ行として描画する', () => {
    /*
     * SUT: FeedItem (phase_start fallthrough)
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: 明示的に隠すフェーズ（day_vote/night 等）以外の phase_start はフェーズ行として content を表示することを検証する。
     */
    const ev = { day: 1, event_type: 'phase_start', phase: 'day_revote', content: '=== DAY 1 REVOTE ===' };
    render(
      <MemoryRouter>
        <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator" />
      </MemoryRouter>
    );

    expect(screen.getByText('=== DAY 1 REVOTE ===')).toBeTruthy();
  });
});

describe('FeedCard: SystemRow (standalone export)', () => {
  it('統合: SystemRow: leftName/rightName Avatar が sessionId prop でリンクを組み立てる', () => {
    /*
     * SUT: SystemRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: SpectatorScreen から直接使う SystemRow が props.sessionId からエージェントリンクを組み立てることを検証する（AC-1 export / AC-3）。
     */
    const { container } = render(
      <MemoryRouter>
        <SystemRow kind="exec" label="投票" leftName="Alice" rightName="Bob" roleAssignment={roleAssignment} sessionId="s1" viewerMode="spectator">
          Alice votes for Bob
        </SystemRow>
      </MemoryRouter>
    );

    expect(screen.getByText('Alice votes for Bob')).toBeTruthy();
    expect(container.querySelector('a[href="/game/s1/agent/Alice"]')).toBeTruthy();
    expect(container.querySelector('a[href="/game/s1/agent/Bob"]')).toBeTruthy();
  });
});
