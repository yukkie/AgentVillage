import { useState } from 'react';
import SpectatorScreen from './screens/SpectatorScreen.jsx';
import GameListScreen from './screens/GameListScreen.jsx';
import AgentDetailScreen from './screens/AgentDetailScreen.jsx';

const SCREENS = {
  list: GameListScreen,
  spectator: SpectatorScreen,
  agent: AgentDetailScreen,
};

export default function App() {
  const [screen, setScreen] = useState('list');
  const Screen = SCREENS[screen];
  return <Screen />;
}
