// AgentDetail へのリンクパスを組み立てる純粋関数。
// FeedCard（中央フィード）と SpectatorScreen 右ペインの両方で共有する（screen 非依存）。

export function searchForViewerMode(viewerMode) {
  return viewerMode === 'public' ? '?view=public' : '';
}

export function agentDetailPath(sessionId, agentName, viewerMode) {
  return `/game/${sessionId}/agent/${agentName}${searchForViewerMode(viewerMode)}`;
}
