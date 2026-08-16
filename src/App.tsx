/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Globe, BarChart3, Video, Library, Briefcase, Users, LogOut, Loader2, User as UserIcon, Code, Settings as SettingsIcon, Menu, X, Star, MessageSquareText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTracker, useLanguage } from './lib/hooks';
import { AuthProvider, useAuth } from './lib/auth';
import { ViewingProvider, useViewing } from './lib/ViewingContext';
import { OnboardingOverlayProvider } from './lib/onboarding-overlay';
import OnboardingOverlay from './components/onboarding/OnboardingOverlay';
import LeaveTestimonialModal from './components/testimonial/LeaveTestimonialModal';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Videos from './pages/Videos';
import Analytics from './pages/Analytics';
import Installation from './pages/Installation';
import VideoDetail from './pages/VideoDetail';
import AssetDetail from './pages/AssetDetail';
import AssetAnalytics from './pages/AssetAnalytics';
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
import MarketerAnalytics from './pages/MarketerAnalytics';
import AssignmentDetail from './pages/AssignmentDetail';
import CreateAssignment from './pages/CreateAssignment';
import PromotionDetail from './pages/PromotionDetail';
import IndividualPromotionAnalytics from './pages/IndividualPromotionAnalytics';
import TrackingDomainDetail from './pages/TrackingDomainDetail';
import Overview from './pages/operator/Overview';
import Members from './pages/operator/Members';
import MemberDetail from './pages/operator/MemberDetail';
import InviteMember from './pages/operator/InviteMember';
import AcceptInvitation from './pages/operator/AcceptInvitation';
import TrackingDomains from './pages/TrackingDomains';
import AdminTestimonials from './pages/AdminTestimonials';
import Testimonials from './pages/Testimonials';
import Website from './pages/Website';
import AllAssetsAnalytics from './pages/AllAssetsAnalytics';
import AllPromotionsAnalytics from './pages/AllPromotionsAnalytics';
function Navigation() {
  const { lang, toggleLanguage, t } = useLanguage();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [testimonialModalOpen, setTestimonialModalOpen] = useState(false);

  const links = [
    { to: '/dashboard', icon: LayoutDashboard, label: t.nav.dashboard },
    { to: '/campaigns', icon: Briefcase, label: t.nav.campaigns },
    { to: '/videos', icon: Video, label: t.nav.videos, children: [
      { to: '/analytics/indepth', label: 'Content Analytics' },
    ] },
    { to: '/assets', icon: Library, label: t.nav.assets, children: [
      { to: '/assets/analytics', label: 'Asset Analytics' },
    ] },
    { to: '/marketplace', icon: Briefcase, label: t.nav.marketplace, children: [
      { to: '/marketplace/marketer-analytics', label: 'Marketer Analytics' },
      { to: '/marketplace/promotions-analytics', label: 'Promotions Analytics' },
    ] },
    { to: '/operator', icon: Users, label: t.nav.operator },
    { to: '/workspace', icon: Briefcase, label: t.nav.workspace },
    { to: '/analytics', icon: BarChart3, label: t.nav.analytics },
    { to: '/installation', icon: Code, label: t.nav.installation || 'Install' },
  ];

  // Close the drawer whenever the route changes (e.g. after clicking a link).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  // Prevent background scroll/overflow while the drawer is open on mobile.
  useEffect(() => {
    if (mobileOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [mobileOpen]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-900/50 h-14 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4 md:gap-10 min-w-0">
          {user && (
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden -ml-1 w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <Menu size={20} />
            </button>
          )}
          <Link to="/dashboard" className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 bg-red-600 rounded-sm shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
            VS-Track
          </Link>
          {user && (
            <div className="hidden md:flex items-center gap-6">
              {links.map(({ to, icon: Icon, label, children }) => {
                const isActive =
                  location.pathname === to ||
                  (children?.some(child => child.to === location.pathname) ?? false);
                return (
                  <div key={to} className="relative group">
                    <Link
                      to={to}
                      className={`text-[10px] font-bold uppercase tracking-widest transition-all inline-flex items-center gap-2 ${
                        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {label}
                    </Link>
                    {children && children.length > 0 && (
                      <div className="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg py-1.5 min-w-[180px] shadow-xl">
                          {children.map(child => (
                            <Link
                              key={child.to}
                              to={child.to}
                              className={`block px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all ${
                                location.pathname === child.to
                                  ? 'text-white bg-zinc-900'
                                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                              }`}
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="hidden md:flex items-center gap-2 px-3 py-1 rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 transition-all text-[10px] font-bold uppercase tracking-widest"
          >
            <Globe size={11} />
            {lang === 'en' ? 'EN' : '中文'}
          </button>
          {user && (
            <div className="hidden md:flex items-center gap-4 pl-4 border-l border-zinc-900">
              <button
                onClick={() => setTestimonialModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                <Star size={12} />
                Leave a Testimonial
              </button>
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
          {user && (
            <button
              className="md:hidden w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0"
              aria-label="Account"
            >
              <UserIcon size={14} />
            </button>
          )}
        </div>
      </nav>

      {/* Mobile navigation drawer */}
      <AnimatePresence>
        {mobileOpen && user && (
          <React.Fragment key="mobile-nav">
            <motion.div
              key="mobile-nav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
            <motion.div
              key="mobile-nav-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="fixed top-0 left-0 bottom-0 z-[70] w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-900/50 flex flex-col overflow-y-auto md:hidden"
            >
              <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-900/50 shrink-0">
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2"
                >
                  <div className="w-2 h-2 bg-red-600 rounded-sm shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                  VS-Track
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-1 px-3 py-4">
                {links.map(({ to, icon: Icon, label }) => {
                  const isActive = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                        isActive
                          ? 'text-white bg-zinc-900 border border-zinc-800'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                      }`}
                    >
                      <Icon size={15} className={isActive ? 'text-red-500' : ''} />
                      {label}
                    </Link>
                  );
                })}
              </div>

              <div className="px-3 py-4 border-t border-zinc-900/50 flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    setTestimonialModalOpen(true);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-all"
                >
                  <Star size={15} />
                  Leave a Testimonial
                </button>
                                <Link
                  to="/testimonials"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                    location.pathname === '/testimonials'
                      ? 'text-white bg-zinc-900 border border-zinc-800'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                  }`}
                >
                  <MessageSquareText size={15} className={location.pathname === '/testimonials' ? 'text-red-500' : ''} />
                  Testimonials
                </Link>
                <button
                  onClick={toggleLanguage}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-all"
                >
                  <Globe size={15} />
                  {lang === 'en' ? 'EN' : '中文'}
                </button>
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                    location.pathname === '/settings'
                      ? 'text-violet-400 bg-zinc-900 border border-zinc-800'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                  }`}
                >
                  <SettingsIcon size={15} />
                  Settings
                </Link>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    signOut();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-600 hover:text-red-500 hover:bg-zinc-900/50 transition-all"
                >
                  <LogOut size={15} />
                  Logout
                </button>
              </div>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>

      {user && (
        <LeaveTestimonialModal
          isOpen={testimonialModalOpen}
          onClose={() => setTestimonialModalOpen(false)}
        />
      )}
    </>
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
        <Route path="/testimonials" element={<PageWrapper><Testimonials /></PageWrapper>} />
        <Route path="/website" element={<PageWrapper><Website /></PageWrapper>} />
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
        <Route path="/assets/:id" element={<PageWrapper><AssetDetail /></PageWrapper>} />
        <Route path="/assets/:id/analytics" element={<PageWrapper><AssetAnalytics /></PageWrapper>} />
        <Route path="/assets/:id/analytics" element={<PageWrapper><AssetAnalytics /></PageWrapper>} />
        <Route path="/assets/analytics" element={<PageWrapper><AllAssetsAnalytics /></PageWrapper>} />
        <Route path="/campaigns/:id" element={<PageWrapper><CampaignDetail /></PageWrapper>} />
        <Route path="/analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
        <Route path="/analytics/indepth" element={<InDepthAnalytics />} />
        <Route path="/installation" element={<PageWrapper><Installation /></PageWrapper>} />
        <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
        <Route path="/settings/tracking-domains" element={<PageWrapper><TrackingDomains /></PageWrapper>} />
        <Route path="/track/:token" element={<Track />} />
        <Route path="/:token" element={<Track />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/analytics-test" element={<AnalyticsTest />} />
        <Route path="/pricing" element={<PageWrapper><Pricing /></PageWrapper>} />
        <Route path="/workspace" element={<PageWrapper><Workspace /></PageWrapper>} />
        <Route path="/workspace/hub" element={<WorkspaceHub />} />
        <Route path="/workspace/:boardId" element={<BoardPage />} />
        <Route path="/marketplace" element={<PageWrapper><Marketplace /></PageWrapper>} />
        <Route path="/marketplace/marketer-analytics" element={<PageWrapper><MarketerAnalytics /></PageWrapper>} />
        <Route path="/marketplace/marketer-analytics" element={<PageWrapper><MarketerAnalytics /></PageWrapper>} />
        <Route path="/marketplace/promotions-analytics" element={<PageWrapper><AllPromotionsAnalytics /></PageWrapper>} />
        <Route path="/marketplace/assignments/new" element={<PageWrapper><CreateAssignment /></PageWrapper>} />
        <Route path="/marketplace/assignments/:assignmentId" element={<PageWrapper><AssignmentDetail /></PageWrapper>} />
        <Route path="/marketplace/promotions/:id" element={<PageWrapper><PromotionDetail /></PageWrapper>} />
        <Route path="/marketplace/promotions/:id/analytics" element={<PageWrapper><IndividualPromotionAnalytics /></PageWrapper>} />
        <Route path="/marketplace/tracking-domains/:domainId" element={<PageWrapper><TrackingDomainDetail /></PageWrapper>} />
        <Route path="/operator" element={<PageWrapper><Overview /></PageWrapper>} />
        <Route path="/operator/members" element={<PageWrapper><Members /></PageWrapper>} />
        <Route path="/operator/members/:id" element={<PageWrapper><MemberDetail /></PageWrapper>} />
        <Route path="/operator/members/invite" element={<PageWrapper><InviteMember /></PageWrapper>} />
        <Route path="/invite/:token" element={<AcceptInvitation />} />
        {/* Private admin moderation inbox — AdminTestimonials itself checks
            user.email against ADMIN_EMAIL and blocks/redirects anyone else. */}
        <Route path="/testimonialss" element={<PageWrapper><AdminTestimonials /></PageWrapper>} />
                <Route path="/testimonials" element={<PageWrapper><Testimonials /></PageWrapper>} />
        <Route path="/website" element={<PageWrapper><Website /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

function ViewingBanner() {
  const { isReadOnly, viewingMemberName, exitViewing } = useViewing();

  if (!isReadOnly) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-widest text-center py-1.5 px-4">
      Viewing {viewingMemberName ?? 'member'} · Read-only ·{' '}
      <button
        onClick={exitViewing}
        className="underline hover:text-amber-100 transition-colors"
      >
        Exit
      </button>
    </div>
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
        <ViewingProvider>
          <OnboardingOverlayProvider>
            <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-red-500/30 selection:text-white font-sans antialiased">
              <Navigation />
              <ViewingBanner />
              <MainContent />
              <OnboardingOverlay />
            </div>
          </OnboardingOverlayProvider>
        </ViewingProvider>
      </AuthProvider>
    </Router>
  );
}