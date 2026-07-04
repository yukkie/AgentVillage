import { useSearchParams } from 'react-router-dom';

export function viewerModeFromSearchParams(searchParams) {
  return searchParams.get('view') === 'public' ? 'public' : 'spectator';
}

export function searchForViewerMode(viewerMode) {
  return viewerMode === 'public' ? '?view=public' : '';
}

export function viewerModeToggleLabel(viewerMode) {
  return viewerMode === 'spectator' ? '🔍 観戦者モード' : '👤 参加者視点';
}

export function useViewerMode() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewerMode = viewerModeFromSearchParams(searchParams);

  const toggleViewerMode = () => {
    setSearchParams(viewerMode === 'spectator' ? { view: 'public' } : {});
  };

  return {
    viewerMode,
    viewerSearch: searchForViewerMode(viewerMode),
    toggleViewerMode,
  };
}
