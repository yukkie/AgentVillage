import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentLink from './AgentLink.jsx';
import Avatar from './Avatar.jsx';
import styles from './AgentLink.module.css';

afterEach(() => {
  cleanup();
});

describe('AgentLink', () => {
  it('統合: AgentLink: agentDetailPath で href を組み立てる（spectator はクエリなし）', () => {
    /*
     * SUT: AgentLink
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: sessionId / name / viewerMode=spectator から /game/{sessionId}/agent/{name}（クエリなし）の href を組み立てることを検証する（AC-586-1）。
     */
    render(
      <MemoryRouter>
        <AgentLink sessionId="s1" name="Alice" viewerMode="spectator">Alice</AgentLink>
      </MemoryRouter>
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/game/s1/agent/Alice');
  });

  it('統合: AgentLink: viewerMode=public で ?view=public を付与する', () => {
    /*
     * SUT: AgentLink
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: viewerMode=public のとき href に ?view=public を付与し、viewer モードをリンク先へ引き継ぐことを検証する（AC-586-1）。
     */
    render(
      <MemoryRouter>
        <AgentLink sessionId="s1" name="Alice" viewerMode="public">Alice</AgentLink>
      </MemoryRouter>
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/game/s1/agent/Alice?view=public');
  });

  it('統合: AgentLink: children を agentLink クラスの Link 内に描画する', () => {
    /*
     * SUT: AgentLink
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: children が Link 要素の内側に描画され、Link に AgentLink.module.css の agentLink クラスが付くことを検証する（AC-586-1）。
     */
    render(
      <MemoryRouter>
        <AgentLink sessionId="s1" name="Alice" viewerMode="spectator">
          <span data-testid="child">Alice</span>
        </AgentLink>
      </MemoryRouter>
    );
    const link = screen.getByRole('link');
    expect(link.classList.contains(styles.agentLink)).toBe(true);
    expect(link.contains(screen.getByTestId('child'))).toBe(true);
  });

  it('統合: AgentLink: style を Link に引き継ぐ', () => {
    /*
     * SUT: AgentLink
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: style prop（CSS 変数 --r-color 等）が Link 要素の inline style へ素通しされることを検証する（SpectatorScreen NightActions target の役職色の契約。AC-586-3 の className/style 面）。
     */
    render(
      <MemoryRouter>
        <AgentLink sessionId="s1" name="Alice" viewerMode="spectator" style={{ '--r-color': 'rgb(1, 2, 3)' }}>Alice</AgentLink>
      </MemoryRouter>
    );
    expect(screen.getByRole('link').style.getPropertyValue('--r-color')).toBe('rgb(1, 2, 3)');
  });

  it('統合: AgentLink: bare Avatar 子のリンクは name をアクセシブルネームに持つ', () => {
    /*
     * SUT: AgentLink（+ bare Avatar）
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: 可視テキストのない bare Avatar のみを包むリンクが img alt={name} をアクセシブルネームとして持つことを検証する（#585×#586 の組み合わせ境界: SystemRow 型 icon-only リンク）。
     */
    const { container } = render(
      <MemoryRouter>
        <AgentLink sessionId="s1" name="Nox" viewerMode="spectator">
          <Avatar name="Nox" />
        </AgentLink>
      </MemoryRouter>
    );
    // jsdom は img の load を発火しないため頭文字フォールバック "N" が残り、
    // アクセシブルネームが "Nox N" になる。実ブラウザの画像ロード後状態に合わせて load を発火する。
    fireEvent.load(container.querySelector('img'));
    expect(screen.getByRole('link', { name: 'Nox' })).toBeTruthy();
  });
});
