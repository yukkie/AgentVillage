import { useState } from 'react';
import SpectatorScreen from './screens/SpectatorScreen.jsx';
import GameListScreen from './screens/GameListScreen.jsx';

const SCREENS = {
  list: GameListScreen,
  spectator: SpectatorScreen,
};

export default function App() {
  const [screen, setScreen] = useState('list');
  const Screen = SCREENS[screen];
  return <Screen />;
}
