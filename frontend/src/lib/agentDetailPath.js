// AgentDetail へのリンクパスを組み立てる純粋関数。
// FeedCard（中央フィード）と SpectatorScreen 右ペインの両方で共有する（screen 非依存）。
import { searchForViewerMode } from './useViewerMode.js';

export function agentDetailPath(sessionId, agentName, viewerMode) {
  return `/game/${sessionId}/agent/${encodeURIComponent(agentName)}${searchForViewerMode(viewerMode)}`;
}
