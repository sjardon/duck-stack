import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RouteVisitTracker from './components/analytics/RouteVisitTracker';

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <RouteVisitTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
