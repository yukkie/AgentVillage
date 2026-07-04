import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  searchForViewerMode,
  useViewerMode,
  viewerModeFromSearchParams,
  viewerModeToggleLabel,
} from './useViewerMode.js';

afterEach(() => {
  cleanup();
});

function ViewerModeProbe() {
  const { viewerMode, viewerSearch, toggleViewerMode } = useViewerMode();
  const location = useLocation();

  return (
    <>
      <output aria-label="viewer-mode">{viewerMode}</output>
      <output aria-label="viewer-search">{viewerSearch}</output>
      <output aria-label="current-location">{location.pathname}{location.search}</output>
      <button type="button" onClick={toggleViewerMode}>toggle</button>
    </>
  );
}

function renderProbe(initialEntry = '/game/s1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/game/:sessionId" element={<ViewerModeProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useViewerMode URL contract', () => {
  it('pure: viewerModeFromSearchParams: view=public のみ public にする', () => {
    /*
     * SUT: viewerModeFromSearchParams
     * Mock: なし（URLSearchParams を直接入力）
     * Level: unit
     * Objective: ?view=public のみ public viewerMode として解釈し、それ以外は spectator にフォールバックすることを検証する。
     */
    expect(viewerModeFromSearchParams(new URLSearchParams('view=public'))).toBe('public');
    expect(viewerModeFromSearchParams(new URLSearchParams('view=spectator'))).toBe('spectator');
    expect(viewerModeFromSearchParams(new URLSearchParams('view=unknown'))).toBe('spectator');
    expect(viewerModeFromSearchParams(new URLSearchParams(''))).toBe('spectator');
  });

  it('pure: searchForViewerMode: public のみ ?view=public を返す', () => {
    /*
     * SUT: searchForViewerMode
     * Mock: なし
     * Level: unit
     * Objective: viewerMode を URL query へ serialize するとき public のみ ?view=public を返すことを検証する。
     */
    expect(searchForViewerMode('public')).toBe('?view=public');
    expect(searchForViewerMode('spectator')).toBe('');
    expect(searchForViewerMode('unknown')).toBe('');
  });

  it('pure: viewerModeToggleLabel: 現在 mode に対応する表示ラベルを返す', () => {
    /*
     * SUT: viewerModeToggleLabel
     * Mock: なし
     * Level: unit
     * Objective: mode-toggle button label を1箇所の関数で定義することを検証する。
     */
    expect(viewerModeToggleLabel('spectator')).toBe('🔍 観戦者モード');
    expect(viewerModeToggleLabel('public')).toBe('👤 参加者視点');
  });

  it('統合: useViewerMode: toggleViewerMode が URL query を付与/削除する', async () => {
    /*
     * SUT: useViewerMode
     * Mock: なし（MemoryRouter）
     * Level: integration
     * Objective: shared hook が URL query を正本として viewerMode/viewerSearch/toggle を一貫して扱うことを検証する。
     */
    const user = userEvent.setup();
    renderProbe('/game/s1');

    expect(screen.getByLabelText('viewer-mode').textContent).toBe('spectator');
    expect(screen.getByLabelText('viewer-search').textContent).toBe('');
    expect(screen.getByLabelText('current-location').textContent).toBe('/game/s1');

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByLabelText('viewer-mode').textContent).toBe('public');
    expect(screen.getByLabelText('viewer-search').textContent).toBe('?view=public');
    expect(screen.getByLabelText('current-location').textContent).toBe('/game/s1?view=public');

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByLabelText('viewer-mode').textContent).toBe('spectator');
    expect(screen.getByLabelText('viewer-search').textContent).toBe('');
    expect(screen.getByLabelText('current-location').textContent).toBe('/game/s1');
  });
});
