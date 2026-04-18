import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar, ChevronRight, BarChart2, User as UserIcon, Edit2, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Election, getDerivedElectionStatus } from '../utils/election';
import { useCurrentTime } from '../hooks/useCurrentTime';

export default function Dashboard() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, updateProfile } = useAuth();
  const currentTime = useCurrentTime(10000); // Re-render every 10s

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({
    rollNo: profile?.rollNo || '',
    collegeName: profile?.collegeName || ''
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setEditProfileData({
      rollNo: profile?.rollNo || '',
      collegeName: profile?.collegeName || ''
    });
  }, [profile]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await updateProfile(editProfileData);
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Failed to update profile", error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'elections'), orderBy('startTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const electionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Election[];
      setElections(electionsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'elections');
    });

    return unsubscribe;
  }, []);

  const [searchRoomId, setSearchRoomId] = useState('');
  const [searchError, setSearchError] = useState('');
  const navigate = useNavigate();

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    
    if (!searchRoomId.trim()) return;

    const formattedId = searchRoomId.trim().toUpperCase();
    const foundElection = electionsWithStatus.find(e => e.roomId === formattedId);

    if (foundElection) {
      if (foundElection.derivedStatus === 'active') {
        navigate(`/vote/${foundElection.id}`);
      } else if (foundElection.derivedStatus === 'completed' || foundElection.showResults) {
        navigate(`/results/${foundElection.id}`);
      } else {
        setSearchError('This election is not currently active.');
      }
    } else {
      setSearchError('No election found with this Room ID.');
    }
  };

  if (loading) {
    return <div className="animate-pulse flex space-x-4">Loading elections...</div>;
  }

  const electionsWithStatus = elections.map(e => ({
    ...e,
    derivedStatus: getDerivedElectionStatus(e)
  }));

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-10">
      {/* Sidebar */}
      <aside className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col gap-8 h-fit">
        {/* Profile Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Your Profile</h3>
            {!isEditingProfile && (
              <button 
                onClick={() => setIsEditingProfile(true)}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit Profile"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              {profile?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div>
              <div className="font-bold text-gray-900">{profile?.name || 'Student'}</div>
              <div className="text-xs text-gray-500">{user?.email}</div>
            </div>
          </div>

          {isEditingProfile ? (
            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Roll No</label>
                <input 
                  type="text" 
                  value={editProfileData.rollNo} 
                  onChange={e => setEditProfileData({...editProfileData, rollNo: e.target.value})}
                  className="w-full text-sm p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. 2023CS01"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">College Name</label>
                <input 
                  type="text" 
                  value={editProfileData.collegeName} 
                  onChange={e => setEditProfileData({...editProfileData, collegeName: e.target.value})}
                  className="w-full text-sm p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. Engineering College"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  onClick={() => {
                    setIsEditingProfile(false);
                    setEditProfileData({ rollNo: profile?.rollNo || '', collegeName: profile?.collegeName || '' });
                  }}
                  className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="p-1.5 text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Roll No:</span>
                <span className="font-medium text-gray-900">{profile?.rollNo || <span className="text-gray-400 italic">Not set</span>}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">College:</span>
                <span className="font-medium text-gray-900 text-right">{profile?.collegeName || <span className="text-gray-400 italic">Not set</span>}</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Active Election</h3>
          {electionsWithStatus.filter(e => e.derivedStatus === 'active').length > 0 ? (
            electionsWithStatus.filter(e => e.derivedStatus === 'active').map(election => (
              <div key={election.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3">
                <div className="font-semibold text-gray-900 mb-2">{election.title}</div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 mt-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                  Live Now
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500">No active elections</div>
          )}
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Your Activity</h3>
          <ul className="text-sm text-gray-500 flex flex-col gap-3">
            <li>• Check specific elections to see your voting status.</li>
          </ul>
        </div>
      </aside>

      {/* Main Content */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">All Elections</h1>
            <p className="text-gray-500 mt-1">View and participate in college elections.</p>
          </div>
          
          <form onSubmit={handleJoinRoom} className="w-full sm:w-auto flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Enter Room ID"
                value={searchRoomId}
                onChange={(e) => setSearchRoomId(e.target.value.toUpperCase())}
                className="w-full font-mono text-sm border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border"
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={!searchRoomId.trim()}
              className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </form>
        </div>
        {searchError && (
          <div className="text-red-600 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-100">
            {searchError}
          </div>
        )}

        {electionsWithStatus.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-200">
            <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No elections found</h3>
            <p className="mt-1 text-gray-500">There are currently no elections scheduled.</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {electionsWithStatus.map((election) => (
              <div key={election.id} className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-blue-600 transition-colors flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{election.title}</h3>
                    {election.type === 'student_association' && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full mt-1.5 block w-max">
                        👑 Student Association President
                      </span>
                    )}
                    {election.roomId && (
                      <span className="inline-block mt-2 font-mono text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
                        Room ID: {election.roomId}
                      </span>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize
                    ${election.derivedStatus === 'active' ? 'bg-green-100 text-green-800' : 
                      election.derivedStatus === 'upcoming' ? 'bg-blue-100 text-blue-800' : 
                      'bg-gray-100 text-gray-800'}`}>
                    {election.derivedStatus}
                  </span>
                </div>
                
                <div className="space-y-2 text-sm text-gray-500 mb-6 flex-grow">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Starts: {format(new Date(election.startTime), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Ends: {format(new Date(election.endTime), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3 mt-auto">
                  {election.derivedStatus === 'active' && (
                    <Link
                      to={`/vote/${election.id}`}
                      className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                      Vote Now <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                  
                  {(election.derivedStatus === 'completed' || election.showResults) && (
                    <Link
                      to={`/results/${election.id}`}
                      className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                    >
                      <BarChart2 className="w-4 h-4" /> Results
                    </Link>
                  )}
                  
                  {election.derivedStatus === 'upcoming' && (
                    <button disabled className="flex-1 inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed">
                      Voting not started
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
