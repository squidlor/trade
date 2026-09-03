import { Route, Routes } from 'react-router';
import { Shell } from './components/Shell';
import { BoardPage } from './pages/Board';
import { CreatorPage } from './pages/Creator';
import { LaunchPage } from './pages/Launch';
import { NotFound } from './pages/NotFound';
import { TokenPage } from './pages/Token';

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/me" element={<CreatorPage />} />
        <Route path="/t/:key" element={<TokenPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
