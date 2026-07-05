/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Globe, BarChart3, Video, Briefcase, LogOut, Loader2, User as UserIcon, Code, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTracker, useLanguage } from './lib/hooks';
import { AuthProvider, useAuth } from './lib/auth';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Videos from './pages/Videos';
import Analytics from './pages/Analytics';
import Installation from './pages/Installation';
import VideoDetail from './pages/VideoDetail';
import CampaignDetail from './pages/CampaignDetail';
import InDepthAnalytics from './pages/InDepthAnalytics';
import Track from './pages/Track';
import Settings from './pages/Settings';
import AnalyticsTest from './pages/AnalyticsTest';
import Pricing from './pages/Pricing';
import Workspace from './pages/Workspace';
import WorkspaceHub from './pages/WorkspaceHub';
import BoardPage from './pages/BoardPage';
import UnmappedVideos from './pages/UnmappedVideos';
import Assets from './pages/Assets';
import Marketplace from './pages/Marketplace';
import AssignmentDetail from './pages/AssignmentDetail';
function Navigation() {
  const { lang, toggleLanguage, t } = useLanguage();
  const { user, signOut } = useAuth();
  const location = useLocation();

  const links = [
    { to: '/dashboard', icon: LayoutDashboard, label: t.nav.dashboard },
    { to: '/campaigns', icon: Briefcase, label: t.nav.campaigns },
    { to: '/videos', icon: Video, label: t.nav.videos },
    { to: '/marketplace', icon: Briefcase, label: t.nav.marketplace },
    { to: '/workspace', icon: Briefcase, label: t.nav.workspace },
    { to: '/analytics', icon: BarChart3, label: t.nav.analytics },
    { to: '/installation', icon: Code, label: t.nav.installation || 'Install' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-900/50 h-14 flex items-center justify-between px-6">
      <div className="flex items-center gap-10">
        <Link to="/dashboard" className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
          <div className="w-2 h-2 bg-red-600 rounded-sm shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
          VS-Track
        </Link>
        {user && (
          <div className="hidden md:flex items-center gap-6">
            {links.map(({ to, icon: Icon, label }) => {
              const isActive = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-all inline-flex items-center gap-2 ${
                    isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-3 py-1 rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 transition-all text-[10px] font-bold uppercase tracking-widest"
        >
          <Globe size={11} />
          {lang === 'en' ? 'EN' : '中文'}
        </button>
        {user && (
          <div className="flex items-center gap-4 pl-4 border-l border-zinc-900">
            <Link
              to="/settings"
              className={`w-8 h-8 rounded-full bg-zinc-900 border flex items-center justify-center transition-colors ${
                location.pathname === '/settings'
                  ? 'border-violet-500 text-violet-400'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <SettingsIcon size={14} />
            </Link>
            <button className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <UserIcon size={14} />
            </button>
            <button onClick={() => signOut()} className="text-zinc-600 hover:text-red-500 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

function MainContent() {
  const { user, loading } = useAuth();
  useTracker();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="text-red-600 animate-spin" size={32} />
      </div>
    );
  }

  if (!user) {
    // Allow public token redirects even when not logged in
    return (
      <Routes>
        <Route path="/track/:token" element={<Track />} />
        <Route path="/:token" element={<Track />} />
        <Route path="*" element={<PageWrapper><Auth /></PageWrapper>} />
      </Routes>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/dashboard" element={<PageWrapper><Dashboard /></PageWrapper>} />
        <Route path="/campaigns" element={<PageWrapper><Campaigns /></PageWrapper>} />
        <Route path="/videos" element={<PageWrapper><Videos /></PageWrapper>} />
        <Route path="/assets" element={<PageWrapper><Assets /></PageWrapper>} />
        <Route path="/unmapped-videos" element={<PageWrapper><UnmappedVideos /></PageWrapper>} />
        <Route path="/videos/:id" element={<PageWrapper><VideoDetail /></PageWrapper>} />
        <Route path="/campaigns/:id" element={<PageWrapper><CampaignDetail /></PageWrapper>} />
        <Route path="/analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
        <Route path="/analytics/indepth" element={<InDepthAnalytics />} />
        <Route path="/installation" element={<PageWrapper><Installation /></PageWrapper>} />
        <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
        <Route path="/track/:token" element={<Track />} />
        <Route path="/:token" element={<Track />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/analytics-test" element={<AnalyticsTest />} />
        <Route path="/pricing" element={<PageWrapper><Pricing /></PageWrapper>} />
        <Route path="/workspace" element={<PageWrapper><Workspace /></PageWrapper>} />
        <Route path="/workspace/hub" element={<WorkspaceHub />} />
        <Route path="/workspace/:boardId" element={<BoardPage />} />
        <Route path="/marketplace" element={<PageWrapper><Marketplace /></PageWrapper>} />
        <Route path="/marketplace/assignments/:assignmentId" element={<PageWrapper><AssignmentDetail /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-6 pt-24 pb-20 w-full min-h-screen flex flex-col"
    >
      {children}
    </motion.main>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-red-500/30 selection:text-white font-sans antialiased">
          <Navigation />
          <MainContent />
        </div>
      </AuthProvider>
    </Router>
  );
}
