/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/proof/:jobId/:shareToken" element={<PublicJobProof />} />
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
