import { useEffect, useState } from 'react';
import { CheckCircle, Save, Shield, Users, User as UserIcon } from 'lucide-react';
import { userProfileService, UserProfile } from '../services/userProfileService';

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = userProfileService.subscribeToCurrentUserProfile((nextProfile) => {
      setProfile(nextProfile);
      setName(nextProfile?.name || '');
      setPhone(nextProfile?.phone || '');
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    await userProfileService.updateCurrentUserProfile({
      name: name.trim(),
      phone: phone.trim(),
    });
    setSuccessMessage('Profile saved');
    window.setTimeout(() => setSuccessMessage(null), 2500);
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Profile</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">User foundation for permissions and teams</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
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
              className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Profile
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
              Role is stored now so permissions can expand later without replacing the profile model.
            </p>
            <div className="mt-4 rounded-3xl bg-gray-50 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Role</p>
              <p className="text-sm font-black text-gray-900 mt-2">{profile?.role || 'owner'}</p>
            </div>
          </div>

          <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-black text-gray-900">Teams</h3>
            </div>
            <p className="text-sm font-bold text-gray-500">
              Team memberships are reserved here so future crew assignment can plug into the profile cleanly.
            </p>
            <div className="mt-4 rounded-3xl bg-gray-50 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Team Memberships</p>
              <p className="text-sm font-black text-gray-900 mt-2">
                {profile?.team_memberships?.length ? profile.team_memberships.join(', ') : 'No teams assigned yet'}
              </p>
            </div>
          </div>
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
