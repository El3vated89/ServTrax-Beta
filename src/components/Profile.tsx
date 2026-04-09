import { useEffect, useState } from 'react';
import { CheckCircle, Save, Shield, Users, User as UserIcon, Plus, Route, Receipt, ClipboardList } from 'lucide-react';
import { db } from '../firebase';
import { userProfileService, UserProfile } from '../services/userProfileService';
import { teamService, TeamMember } from '../services/teamService';
import { doc, getDoc } from 'firebase/firestore';
import { savePipelineService } from '../services/savePipelineService';
import { subscribeToResolvedUser } from '../services/authSessionService';

const permissionLabels: Array<{
  key: keyof Pick<TeamMember, 'route_access' | 'customer_access' | 'expense_entry_access' | 'job_interaction_access'>;
  label: string;
  description: string;
  icon: any;
}> = [
  { key: 'route_access', label: 'Route Access', description: 'Daily route and assigned route runs', icon: Route },
  { key: 'customer_access', label: 'Customer Access', description: 'View customer records when needed', icon: Users },
  { key: 'expense_entry_access', label: 'Expense Entry', description: 'Add expenses without full billing access', icon: Receipt },
  { key: 'job_interaction_access', label: 'Job Interaction', description: 'Open and update assigned jobs', icon: ClipboardList },
];

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [businessPlanName, setBusinessPlanName] = useState('Free');
  const [newMember, setNewMember] = useState<Omit<TeamMember, 'ownerId'>>(teamService.getDefaultMember());
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingTeamMember, setIsSavingTeamMember] = useState(false);

  useEffect(() => {
    const unsubscribe = userProfileService.subscribeToCurrentUserProfile((nextProfile) => {
      setProfile(nextProfile);
      setName(nextProfile?.name || '');
      setPhone(nextProfile?.phone || '');
    });

    const unsubscribeTeamMembers = teamService.subscribeToTeamMembers(setTeamMembers);
    const unsubscribeAuth = subscribeToResolvedUser(async (user) => {
      if (!user) {
        setBusinessPlanName('Free');
        return;
      }

      const profileSnap = await getDoc(doc(db, 'business_profiles', user.uid));
      if (profileSnap.exists()) {
        setBusinessPlanName((profileSnap.data().plan_name as string) || 'Free');
      } else {
        setBusinessPlanName('Free');
      }
    });

    return () => {
      unsubscribe();
      unsubscribeTeamMembers();
      unsubscribeAuth();
    };
  }, []);

  const supportsTeams = teamService.planAllowsTeams(businessPlanName);
  const isOwnerOrAdmin = profile?.role === 'owner' || userProfileService.isPlatformAdmin(profile);

  const effectivePermissionSummary = [
    { label: 'Route Access', enabled: userProfileService.hasPermission(profile, 'route_access') },
    { label: 'Customer Access', enabled: userProfileService.hasPermission(profile, 'customer_access') },
    { label: 'Expense Entry', enabled: userProfileService.hasPermission(profile, 'expense_entry_access') },
    { label: 'Job Interaction', enabled: userProfileService.hasPermission(profile, 'job_interaction_access') },
  ];

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const debugContext = {
      flow: 'user_profile_save',
      traceId: savePipelineService.createTraceId('user_profile_save'),
    };

    savePipelineService.log(debugContext, 'save_started');
    setErrorMessage(null);
    setIsSavingProfile(true);
    try {
      savePipelineService.log(debugContext, 'validation_passed');
      await savePipelineService.withTimeout(
        userProfileService.updateCurrentUserProfile({
          name: name.trim(),
          phone: phone.trim(),
        }),
        {
          timeoutMs: 25000,
          timeoutMessage: 'Profile save took too long and was stopped. Please try again.',
          debugContext,
        }
      );
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
      setSuccessMessage('Profile saved');
      window.setTimeout(() => setSuccessMessage(null), 2500);
    } catch (error) {
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      console.error('Error saving profile:', error);
      const nextMessage = error instanceof Error && error.message ? error.message : 'Failed to save profile.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSavingProfile(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  const handleAddTeamMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const debugContext = {
      flow: 'team_member_save',
      traceId: savePipelineService.createTraceId('team_member_save'),
    };

    savePipelineService.log(debugContext, 'save_started');
    setErrorMessage(null);
    setIsSavingTeamMember(true);

    try {
      savePipelineService.log(debugContext, 'validation_passed');
      await savePipelineService.withTimeout(
        teamService.addTeamMember({
          ...newMember,
          name: newMember.name.trim(),
          email: newMember.email.trim().toLowerCase(),
        }),
        {
          timeoutMs: 25000,
          timeoutMessage: 'Team member save took too long and was stopped. Please try again.',
          debugContext,
        }
      );
      setNewMember(teamService.getDefaultMember());
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
      setSuccessMessage('Team member saved');
      window.setTimeout(() => setSuccessMessage(null), 2500);
    } catch (error) {
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      console.error('Error saving team member:', error);
      const nextMessage = error instanceof Error && error.message ? error.message : 'Failed to save team member.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSavingTeamMember(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  const handleUpdateTeamMember = async (memberId: string, updates: Partial<TeamMember>) => {
    setErrorMessage(null);
    try {
      await teamService.updateTeamMember(memberId, updates);
      setSuccessMessage('Team permissions updated');
      window.setTimeout(() => setSuccessMessage(null), 2500);
    } catch (error) {
      console.error('Error updating team member:', error);
      setErrorMessage('Failed to update team member.');
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Profile</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">User foundation for permissions and teams</p>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4">
          <p className="text-sm font-bold text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <form onSubmit={handleSave} className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserIcon className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-black text-gray-900">{profile?.name || profile?.email || 'User Profile'}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{profile?.role || 'owner'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Email</label>
              <input
                type="text"
                value={profile?.email || ''}
                disabled
                className="w-full px-5 py-4 bg-gray-100 rounded-2xl border-none text-sm font-bold text-gray-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {isSavingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-black text-gray-900">Permissions</h3>
            </div>
            <p className="text-sm font-bold text-gray-500">
              Solo owners keep full access. Team members stay route-focused unless the owner turns on extra access.
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-3xl bg-gray-50 p-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Role</p>
                <p className="text-sm font-black text-gray-900 mt-2">{profile?.role || 'owner'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {effectivePermissionSummary.map((permission) => (
                  <div key={permission.label} className="rounded-3xl bg-gray-50 p-4 border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{permission.label}</p>
                    <p className={`text-sm font-black mt-2 ${permission.enabled ? 'text-green-700' : 'text-gray-500'}`}>
                      {permission.enabled ? 'On' : 'Off'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {supportsTeams && (
            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-black text-gray-900">Team Mode</h3>
              </div>
              <p className="text-sm font-bold text-gray-500">
                Team tools are active on {businessPlanName}. Solo mode still works first, and owner controls all team permissions.
              </p>

              {isOwnerOrAdmin && (
                <div className="mt-6 space-y-5">
                  <div className="rounded-3xl bg-gray-50 p-4 border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mode</p>
                    <p className="text-sm font-black text-gray-900 mt-2">
                      {teamMembers.length ? `${teamMembers.length} team member${teamMembers.length === 1 ? '' : 's'} configured` : 'Solo operator mode'}
                    </p>
                    <p className="text-xs font-bold text-gray-500 mt-2">
                      Team members start route-focused by default. Login methods attach in the auth expansion step.
                    </p>
                  </div>

                  <form onSubmit={handleAddTeamMember} className="space-y-4 rounded-3xl bg-gray-50 p-4 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-black text-gray-900">Add Team Member</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        value={newMember.name}
                        onChange={(event) => setNewMember((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Full name"
                        className="w-full px-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <input
                        type="email"
                        required
                        value={newMember.email}
                        onChange={(event) => setNewMember((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="Email"
                        className="w-full px-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <select
                        value={newMember.role}
                        onChange={(event) => setNewMember((prev) => ({ ...prev, role: event.target.value as TeamMember['role'] }))}
                        className="w-full px-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="crew_member">Crew Member</option>
                        <option value="crew_lead">Crew Lead</option>
                      </select>
                      <select
                        value={newMember.account_status}
                        onChange={(event) => setNewMember((prev) => ({ ...prev, account_status: event.target.value as TeamMember['account_status'] }))}
                        className="w-full px-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {permissionLabels.map(({ key, label, description, icon: Icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setNewMember((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            newMember[key] ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-100 text-gray-500'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <p className="text-sm font-black">{label}</p>
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-widest mt-2">{description}</p>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSavingTeamMember}
                        className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Save className="h-4 w-4" />
                        {isSavingTeamMember ? 'Saving...' : 'Save Team Member'}
                      </button>
                    </div>
                  </form>

                  <div className="space-y-3">
                    {teamMembers.length === 0 ? (
                      <div className="rounded-3xl bg-gray-50 p-5 border border-gray-100">
                        <p className="text-sm font-black text-gray-900">No team members yet</p>
                        <p className="text-xs font-bold text-gray-500 mt-2">You are still in solo operator mode until you add a crew member.</p>
                      </div>
                    ) : (
                      teamMembers.map((member) => (
                        <div key={member.id} className="rounded-3xl bg-gray-50 p-5 border border-gray-100 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-black text-gray-900">{member.name}</p>
                              <p className="text-xs font-bold text-gray-500 mt-1">{member.email}</p>
                              <div className="flex gap-2 mt-3">
                                <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-blue-100 text-blue-700">
                                  {member.role.replace('_', ' ')}
                                </span>
                                <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                                  member.account_status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : member.account_status === 'inactive'
                                    ? 'bg-gray-200 text-gray-600'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {member.account_status}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <select
                                value={member.role}
                                onChange={(event) => handleUpdateTeamMember(member.id!, { role: event.target.value as TeamMember['role'] })}
                                className="px-4 py-3 bg-white rounded-2xl border border-gray-100 text-xs font-black uppercase tracking-widest text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="crew_member">Crew Member</option>
                                <option value="crew_lead">Crew Lead</option>
                              </select>
                              <select
                                value={member.account_status}
                                onChange={(event) => handleUpdateTeamMember(member.id!, { account_status: event.target.value as TeamMember['account_status'] })}
                                className="px-4 py-3 bg-white rounded-2xl border border-gray-100 text-xs font-black uppercase tracking-widest text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="pending">Pending</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {permissionLabels.map(({ key, label, description, icon: Icon }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => handleUpdateTeamMember(member.id!, { [key]: !member[key] } as Partial<TeamMember>)}
                                className={`rounded-2xl border p-4 text-left transition-all ${
                                  member[key] ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-100 text-gray-500'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  <p className="text-sm font-black">{label}</p>
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-widest mt-2">{description}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {successMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
          <div className="rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3 bg-green-600 text-white">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">{successMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
