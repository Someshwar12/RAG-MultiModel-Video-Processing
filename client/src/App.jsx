import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { initSocket } from '@services/socket';

import LandingPage from './pages/LandingPage';
import ProcessingPage from './pages/ProcessingPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  useEffect(() => { initSocket(); }, []);

  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '!bg-surface-200 !text-slate-200 !border !border-white/[0.06] !shadow-card !text-sm',
          duration: 4000,
        }}
      />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/processing/:videoId" element={<ProcessingPage />} />
        <Route path="/dashboard/:videoId" element={<DashboardPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </Router>
  );
}

export default App;
