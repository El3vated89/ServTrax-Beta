/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getRedirectResult, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { servicePlanService } from './services/servicePlanService';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Jobs from './components/Jobs';
import Equip from './components/Equip';
import ActiveRoutePage from './modules/routes/ActiveRoutePage';
import RoutesManagementPage from './modules/routes/RoutesManagementPage';
import PublicJobProof from './components/PublicJobProof';
import PublicCustomerPortal from './components/PublicCustomerPortal';
import Messaging from './components/Messaging';
import Billing from './components/Billing';
import Expenses from './components/Expenses';
import Supplies from './components/Supplies';
import Storage from './components/Storage';
import Settings from './components/Settings';
import Alerts from './components/Alerts';
import Profile from './components/Profile';
import AdminController from './components/AdminController';
import { ErrorBoundary } from './components/ErrorBoundary';
import { userProfileService } from './services/userProfileService';
import { planConfigService } from './services/planConfigService';
import { usageTrackingService } from './services/usageTrackingService';
import { customerPortalService } from './services/customerPortalService';
import { rememberResolvedUser } from './services/authSessionService';
import { clearAuthRedirectPending, isAuthRedirectPending } from './services/authUiState';

const AUTH_BOOT_TIMEOUT_MS = 5000;
const AUTH_REDIRECT_BOOT_TIMEOUT_MS = 20000;

const isPublicHashRoute = () => {
  if (typeof window === 'undefined') return false;

  const hash = window.location.hash || '#/';

  return (
    hash === '#/login' ||
    hash.startsWith('#/portal/') ||
    hash.startsWith('#/proof/')
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    const redirectPending = isAuthRedirectPending();
    const authBootTimeoutMs = redirectPending ? AUTH_REDIRECT_BOOT_TIMEOUT_MS : AUTH_BOOT_TIMEOUT_MS;

    const timeout = window.setTimeout(() => {
      if (!isActive) return;
      console.warn(
        `Firebase Auth bootstrap timed out after ${authBootTimeoutMs}ms. Releasing app shell without an authenticated session.`
      );
      clearAuthRedirectPending();
      setLoading(false);
    }, authBootTimeoutMs);

    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          rememberResolvedUser(result.user);
        }
      })
      .catch((error) => {
        console.error('Google redirect sign-in failed:', error);
      })
      .finally(() => {
        clearAuthRedirectPending();
      });

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!isActive) return;

        window.clearTimeout(timeout);
        clearAuthRedirectPending();
        rememberResolvedUser(currentUser);
        setUser(currentUser);

        try {
          if (currentUser) {
            const startupTasks = await Promise.allSettled([
              userProfileService.ensureCurrentUserProfile(),
              planConfigService.hydrateFramework(),
              servicePlanService.initializeDefaultServices(),
              usageTrackingService.syncStorageUsageForCurrentUser(),
              customerPortalService.repairEnabledPortalsForCurrentUser(),
            ]);

            startupTasks.forEach((result, index) => {
              if (result.status === 'rejected') {
                const taskNames = [
                  'ensureCurrentUserProfile',
                  'hydrateFramework',
                  'initializeDefaultServices',
                  'syncStorageUsageForCurrentUser',
                  'repairEnabledPortalsForCurrentUser',
                ];
                console.error(`Startup task failed: ${taskNames[index]}`, result.reason);
              }
            });
          }
        } catch (error) {
          console.error('Unhandled app startup error:', error);
        } finally {
          if (isActive) {
            setLoading(false);
          }
        }
      },
      (error) => {
        if (!isActive) return;

        window.clearTimeout(timeout);
        clearAuthRedirectPending();
        rememberResolvedUser(null);
        console.error('Firebase Auth bootstrap failed:', error);
        setLoading(false);
      }
    );

    return () => {
      isActive = false;
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  if (loading && !isPublicHashRoute()) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/proof/:jobId/:shareToken" element={<PublicJobProof />} />
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
          <Route path="/portal/:customerId/:portalToken" element={<PublicCustomerPortal />} />
          
          {/* Auth Routes */}
          {!user ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="jobs" element={<Jobs />} />
              <Route path="customers" element={<Customers />} />
              <Route path="routes" element={<RoutesManagementPage />} />
              <Route path="map" element={<ActiveRoutePage />} />
              <Route path="equip" element={<Equip />} />
              <Route path="messaging" element={<Messaging />} />
              <Route path="billing" element={<Billing />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="supplies" element={<Supplies />} />
              <Route path="storage" element={<Storage />} />
              <Route path="settings" element={<Settings />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="profile" element={<Profile />} />
              <Route path="controller" element={<AdminController />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
