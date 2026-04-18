import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, updateDoc, deleteDoc, doc, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Plus, Trash2, Edit2, Eye, EyeOff, Download, Users, BarChart2, Activity, Sparkles, X, Upload, Bell, Check, ChevronDown, ChevronRight, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { Election, getDerivedElectionStatus } from '../utils/election';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Candidate {
  id: string;
  electionId: string;
  name: string;
  position: string;
  photoUrl: string;
  voteCount: number;
  rollNo?: string;
}

export default function AdminDashboard() {
  const [elections, setElections] = useState<Election[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedElection, setSelectedElection] = useState<string | null>(null);
  
  const currentTime = useCurrentTime(10000);

  // Forms
  const [showElectionForm, setShowElectionForm] = useState(false);
  const [newElection, setNewElection] = useState<{title: string, startTime: string, endTime: string, passcode: string, type: 'general' | 'student_association'}>({ title: '', startTime: '', endTime: '', passcode: '', type: 'general' });
  
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [newCandidate, setNewCandidate] = useState({ name: '', position: '', photoUrl: '', rollNo: '' });
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Delete Modals
  const [electionToDelete, setElectionToDelete] = useState<string | null>(null);
  const [candidateToDelete, setCandidateToDelete] = useState<string | null>(null);

  // Stats
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [totalVotes, setTotalVotes] = useState<number>(0); // specifically for selected election

  // Share state
  const [copiedElectionId, setCopiedElectionId] = useState<string | null>(null);

  const handleShare = (electionId: string, type: 'vote' | 'results', e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/${type === 'results' ? 'results' : 'vote'}/${electionId}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'College Election',
        url: url
      }).catch((error) => console.log('Error sharing', error));
    } else {
      navigator.clipboard.writeText(url);
      setCopiedElectionId(electionId);
      setTimeout(() => setCopiedElectionId(null), 2000);
    }
  };

  // Passcode visibility
  const [visiblePasscodes, setVisiblePasscodes] = useState<Record<string, boolean>>({});

  const togglePasscodeVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVisiblePasscodes(prev => ({...prev, [id]: !prev[id]}));
  };

  // Election grouping state
  const [expandedSections, setExpandedSections] = useState({ active: true, upcoming: true, completed: false });
  const [electionFilter, setElectionFilter] = useState<'all' | 'general' | 'student_association'>('all');
  
  const toggleSection = (section: 'active' | 'upcoming' | 'completed') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Global Analytics Stats
  const [globalTotalVotes, setGlobalTotalVotes] = useState<number>(0);
  const [uniqueVoters, setUniqueVoters] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'manage' | 'monitor' | 'analytics'>('manage');

  // Notifications
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);
  const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(null);

  // Gemini Intelligence
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [intelligenceReport, setIntelligenceReport] = useState<string | null>(null);

  const handleSendAnnouncement = async (electionId: string, type: 'start' | 'end' | 'results') => {
    setIsSendingEmail(`${electionId}-${type}`);
    setEmailSuccessMessage(null);
    try {
      const election = elections.find(e => e.id === electionId);
      if (!election) throw new Error("Election not found");

      const usersSnap = await getDocs(collection(db, 'users'));
      const emails: string[] = [];
      usersSnap.forEach(userDoc => {
        const u = userDoc.data();
        if (u.email && (u.role === 'student' || u.role === 'admin')) {
          emails.push(u.email);
        }
      });

      if (emails.length === 0) {
        throw new Error("No recipients found.");
      }

      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          electionTitle: election.title,
          recipients: emails
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send emails");
      }

      setEmailSuccessMessage(`Success! Sent ${type} announcement to ${emails.length} users.`);
      setTimeout(() => setEmailSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Email Error: ${err.message}`);
    } finally {
      setIsSendingEmail(null);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'elections'), orderBy('startTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedElections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Election[];
      setElections(fetchedElections);
      
      // Auto-backfill roomId for legacy elections
      fetchedElections.forEach(async (election) => {
        if (!election.roomId) {
          const generateRoomId = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let result = '';
            for (let i = 0; i < 6; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
          };
          try {
            await updateDoc(doc(db, 'elections', election.id), { roomId: generateRoomId() });
          } catch (e) {
            console.error("Failed to backfill roomId", e);
          }
        }
      });

    }, (err) => handleFirestoreError(err, OperationType.LIST, 'elections'));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'student'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTotalStudents(snapshot.size);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    return unsubscribe;
  }, []);

  // Fetch all receipts for global analytics
  useEffect(() => {
    const q = query(collection(db, 'voter_receipts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGlobalTotalVotes(snapshot.size);
      
      const userIds = new Set();
      snapshot.docs.forEach(doc => {
         userIds.add(doc.data().userId);
      });
      setUniqueVoters(userIds.size);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'voter_receipts'));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedElection) {
      setCandidates([]);
      setTotalVotes(0);
      return;
    }
    
    // Fetch Candidates
    const qCandidates = query(collection(db, 'candidates'), where('electionId', '==', selectedElection));
    const unsubscribeCandidates = onSnapshot(qCandidates, (snapshot) => {
      const fetchedCandidates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Candidate[];
      setCandidates(fetchedCandidates);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'candidates'));

    // Fetch Total Ballots Cast (Receipts) for Turnout
    const qReceipts = query(collection(db, 'voter_receipts'), where('electionId', '==', selectedElection));
    const unsubscribeReceipts = onSnapshot(qReceipts, (snapshot) => {
      setTotalVotes(snapshot.size);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'voter_receipts'));

    return () => {
      unsubscribeCandidates();
      unsubscribeReceipts();
    };
  }, [selectedElection]);

  const handleCreateElection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const generateRoomId = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      const electionData: any = {
        title: newElection.title,
        startTime: newElection.startTime,
        endTime: newElection.endTime,
        status: 'upcoming', // Legacy field, kept for backwards compatibility
        showResults: false,
        type: newElection.type,
        roomId: generateRoomId(),
      };
      
      if (newElection.passcode.trim()) {
        electionData.passcode = newElection.passcode.trim();
      }

      const docRef = await addDoc(collection(db, 'elections'), electionData);
      
      // If it's a student association election, we can optionally pre-create a President position or just let them know.
      // We will just let the admin add candidates, but the badge will show.
      
      setShowElectionForm(false);
      setNewElection({ title: '', startTime: '', endTime: '', passcode: '', type: 'general' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'elections');
    }
  };

  const handleToggleResults = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'elections', id), { showResults: !currentStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `elections/${id}`);
    }
  };

  const handleDeleteElection = (id: string) => setElectionToDelete(id);

  const confirmDeleteElection = async () => {
    if (!electionToDelete) return;
    try {
      await deleteDoc(doc(db, 'elections', electionToDelete));
      if (selectedElection === electionToDelete) setSelectedElection(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `elections/${electionToDelete}`);
    } finally {
      setElectionToDelete(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `candidates/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setNewCandidate(prev => ({ ...prev, photoUrl: downloadURL }));
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedElection) return;
    try {
      if (editingCandidateId) {
        await updateDoc(doc(db, 'candidates', editingCandidateId), {
          name: newCandidate.name,
          position: newCandidate.position,
          photoUrl: newCandidate.photoUrl,
          rollNo: newCandidate.rollNo
        });
      } else {
        await addDoc(collection(db, 'candidates'), {
          ...newCandidate,
          electionId: selectedElection,
          voteCount: 0
        });
      }
      setShowCandidateForm(false);
      setNewCandidate({ name: '', position: '', photoUrl: '', rollNo: '' });
      setEditingCandidateId(null);
    } catch (err) {
      handleFirestoreError(err, editingCandidateId ? OperationType.UPDATE : OperationType.CREATE, 'candidates');
    }
  };

  const handleEditCandidate = (candidate: Candidate) => {
    setNewCandidate({ name: candidate.name, position: candidate.position, photoUrl: candidate.photoUrl || '', rollNo: candidate.rollNo || '' });
    setEditingCandidateId(candidate.id);
    setShowCandidateForm(true);
  };

  const handleDeleteCandidate = (id: string) => setCandidateToDelete(id);

  const confirmDeleteCandidate = async () => {
    if (!candidateToDelete) return;
    try {
      await deleteDoc(doc(db, 'candidates', candidateToDelete));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `candidates/${candidateToDelete}`);
    } finally {
      setCandidateToDelete(null);
    }
  };

  const handleExportCSV = () => {
    if (!selectedElection || candidates.length === 0) return;
    const election = elections.find(e => e.id === selectedElection);
    const title = election?.title || 'election';
    
    const headers = ['Candidate Name', 'Roll No', 'Position', 'Votes'];
    const rows = candidates.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.rollNo || '').replace(/"/g, '""')}"`,
      `"${c.position.replace(/"/g, '""')}"`,
      c.voteCount
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSynthesizeReport = async () => {
    if (!selectedElection) return;
    const election = elections.find(e => e.id === selectedElection);
    if (!election) return;

    setIsSynthesizing(true);
    setIntelligenceReport(null);

    try {
      const prompt = `
      You are an expert election analyst. Generate an executive summary of the following election data.
      Include:
      1. Election trends and overall turnout (if available).
      2. Any close races or tie-breakers.
      3. A celebratory draft message for the current winners/leaders.

      Election Title: ${election.title}
      Total Ballots Cast: ${totalVotes}
      Total Eligible Students: ${totalStudents}
      Turnout: ${totalStudents > 0 ? ((totalVotes / totalStudents) * 100).toFixed(1) : 0}%

      Candidates Data:
      ${candidates.map(c => `- ${c.name} (${c.position}): ${c.voteCount} votes`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      setIntelligenceReport(response.text || 'No report generated.');
    } catch (error) {
      console.error('Failed to synthesize report:', error);
      setIntelligenceReport('Failed to generate the report. Please try again later.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const electionsWithStatus = elections.map(e => ({
    ...e,
    derivedStatus: getDerivedElectionStatus(e)
  }));

  const candidatesByPosition = candidates.reduce((acc, candidate) => {
    if (!acc[candidate.position]) acc[candidate.position] = [];
    acc[candidate.position].push(candidate);
    return acc;
  }, {} as Record<string, Candidate[]>);

  // Sort candidates within each position by voteCount descending
  Object.keys(candidatesByPosition).forEach(pos => {
    candidatesByPosition[pos].sort((a, b) => b.voteCount - a.voteCount);
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <button
          onClick={() => setShowElectionForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> New Election
        </button>
      </div>

      {showElectionForm && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-6">Create New Election</h2>
          <form onSubmit={handleCreateElection} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title</label>
              <input required type="text" value={newElection.title} onChange={e => setNewElection({...newElection, title: e.target.value})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border" />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time</label>
                <input required type="datetime-local" value={newElection.startTime} onChange={e => setNewElection({...newElection, startTime: e.target.value})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time</label>
                <input required type="datetime-local" value={newElection.endTime} onChange={e => setNewElection({...newElection, endTime: e.target.value})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Election Type</label>
                <select value={newElection.type} onChange={e => setNewElection({...newElection, type: e.target.value as 'general' | 'student_association'})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border bg-white">
                  <option value="general">General Election</option>
                  <option value="student_association">Student Association (President Voting)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Voting Passcode (Optional)</label>
                <input type="password" value={newElection.passcode} onChange={e => setNewElection({...newElection, passcode: e.target.value})} placeholder="Leave blank for no passcode" className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowElectionForm(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors">Create</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Elections List */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold text-gray-900">Elections</h2>
            <select 
              value={electionFilter}
              onChange={(e) => setElectionFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="general">General</option>
              <option value="student_association">Student Association</option>
            </select>
          </div>
          
          {(['active', 'upcoming', 'completed'] as const).map(section => {
            const sectionElections = electionsWithStatus.filter(e => {
              if (e.derivedStatus !== section) return false;
              if (electionFilter !== 'all' && e.type !== electionFilter) return false;
              return true;
            });
            if (sectionElections.length === 0) return null;

            return (
              <div key={section} className="space-y-3">
                <button 
                  onClick={() => toggleSection(section)}
                  className="flex items-center justify-between w-full p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <h3 className="font-semibold text-gray-800 capitalize flex items-center gap-2">
                    {section} <span className="bg-white text-gray-500 text-xs px-2 py-0.5 rounded-full border border-gray-200">{sectionElections.length}</span>
                  </h3>
                  {expandedSections[section] ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                </button>
                
                {expandedSections[section] && (
                  <div className="space-y-4">
                    {sectionElections.map(election => (
                      <div 
                        key={election.id} 
                        onClick={() => setSelectedElection(election.id)}
                        className={`p-5 rounded-2xl border cursor-pointer transition-colors shadow-sm ${selectedElection === election.id ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-bold text-gray-900">{election.title}</h3>
                            {election.type === 'student_association' && (
                              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full mt-1 block">
                                👑 President Voting
                              </span>
                            )}
                            {election.roomId && (
                              <span className="inline-block mt-1 font-mono text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
                                Room ID: {election.roomId}
                              </span>
                            )}
                            {election.passcode && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="inline-block font-mono text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
                                  Passcode: {visiblePasscodes[election.id] ? election.passcode : '••••••••'}
                                </span>
                                <button 
                                  onClick={(e) => togglePasscodeVisibility(election.id, e)}
                                  className="text-gray-500 hover:bg-gray-200 p-1 rounded transition-colors"
                                  title={visiblePasscodes[election.id] ? "Hide Passcode" : "Show Passcode"}
                                >
                                  {visiblePasscodes[election.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1.5 mb-5">
                          <p>Starts: {election.startTime ? format(new Date(election.startTime), 'PP p') : 'N/A'}</p>
                          <p>Ends: {election.endTime ? format(new Date(election.endTime), 'PP p') : 'N/A'}</p>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                          <button onClick={(e) => { e.stopPropagation(); handleToggleResults(election.id, election.showResults); }} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Toggle Results Visibility">
                            {election.showResults ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          
                          <button 
                            onClick={(e) => handleShare(election.id, 'vote', e)} 
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1" 
                            title="Share Voting Page Link"
                          >
                            {copiedElectionId === election.id ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
                          </button>
                          
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteElection(election.id); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto" title="Delete Election">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Candidates Management & Stats */}
        <div className="lg:col-span-2">
          {selectedElection ? (
            <div className="space-y-6">
              {/* Turnout Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-2">
                     <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unique Voters</div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{totalVotes}</div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                      <Check className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Ballots Cast</div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {candidates.reduce((sum, c) => sum + c.voteCount, 0)}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Voter Turnout</div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {totalStudents > 0 ? ((totalVotes / totalStudents) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <div className="flex space-x-6 mb-8 border-b border-gray-200">
                  <button 
                    onClick={() => setActiveTab('manage')} 
                    className={`pb-3 font-semibold text-sm transition-colors ${activeTab === 'manage' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Manage Candidates
                  </button>
                  <button 
                    onClick={() => setActiveTab('monitor')} 
                    className={`pb-3 font-semibold text-sm transition-colors flex items-center gap-2 ${activeTab === 'monitor' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <Activity className="w-4 h-4" /> Live Monitor
                  </button>
                  <button 
                    onClick={() => setActiveTab('analytics')} 
                    className={`pb-3 font-semibold text-sm transition-colors flex items-center gap-2 ${activeTab === 'analytics' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <BarChart2 className="w-4 h-4" /> Analytics
                  </button>
                </div>

                {activeTab === 'manage' ? (
                  <>
                    {emailSuccessMessage && (
                      <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl font-medium flex items-center gap-2">
                        <Check className="w-5 h-5 text-green-600" />
                        {emailSuccessMessage}
                      </div>
                    )}

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                      <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                          <Bell className="w-5 h-5 text-gray-500" />
                          Email Announcements
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Notify all registered students and admins about key events.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleSendAnnouncement(selectedElection, 'start')}
                          disabled={isSendingEmail !== null}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {isSendingEmail === `${selectedElection}-start` ? 'Sending...' : 'Announce Start'}
                        </button>
                        <button
                          onClick={() => handleSendAnnouncement(selectedElection, 'end')}
                          disabled={isSendingEmail !== null}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {isSendingEmail === `${selectedElection}-end` ? 'Sending...' : 'Announce End'}
                        </button>
                        <button
                          onClick={() => handleSendAnnouncement(selectedElection, 'results')}
                          disabled={isSendingEmail !== null}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {isSendingEmail === `${selectedElection}-results` ? 'Sending...' : 'Announce Results'}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mb-8">
                      <h2 className="text-xl font-bold text-gray-900">Manage Candidates</h2>
                      <div className="flex gap-3">
                        <button 
                          onClick={handleExportCSV}
                          disabled={candidates.length === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                        <button 
                          onClick={() => {
                            setNewCandidate({ name: '', position: '', photoUrl: '', rollNo: '' });
                            setEditingCandidateId(null);
                            setShowCandidateForm(true);
                          }} 
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-semibold transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Add Candidate
                        </button>
                      </div>
                    </div>

                    {showCandidateForm && (
                      <form onSubmit={handleSaveCandidate} className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-5">
                        <h3 className="font-bold text-gray-900 mb-2">{editingCandidateId ? 'Edit Candidate' : 'Add Candidate'}</h3>
                        <div className="grid grid-cols-2 gap-5">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Name</label>
                            <input required type="text" value={newCandidate.name} onChange={e => setNewCandidate({...newCandidate, name: e.target.value})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Roll No</label>
                            <input type="text" value={newCandidate.rollNo} onChange={e => setNewCandidate({...newCandidate, rollNo: e.target.value})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border" />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Position</label>
                            <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                              {elections.find(e => e.id === selectedElection)?.type === 'student_association' ? (
                                <label className={`flex justify-between items-center p-3 cursor-pointer transition-colors ${newCandidate.position === 'President' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                  <span className="text-gray-900 font-medium text-sm">President</span>
                                  <input type="radio" name="position" value="President" checked={newCandidate.position === 'President'} onChange={e => setNewCandidate({...newCandidate, position: e.target.value})} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300" />
                                </label>
                              ) : (
                                <>
                                  <label className={`flex justify-between items-center p-3 cursor-pointer transition-colors border-b border-gray-200 ${newCandidate.position === 'Class Rep (CR)' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                    <span className="text-gray-900 font-medium text-sm">Class Rep (CR)</span>
                                    <input type="radio" name="position" value="Class Rep (CR)" checked={newCandidate.position === 'Class Rep (CR)'} onChange={e => setNewCandidate({...newCandidate, position: e.target.value})} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300" />
                                  </label>
                                  <label className={`flex justify-between items-center p-3 cursor-pointer transition-colors border-b border-gray-200 ${newCandidate.position === 'Ladies Rep (LR)' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                    <span className="text-gray-900 font-medium text-sm">Ladies Rep (LR)</span>
                                    <input type="radio" name="position" value="Ladies Rep (LR)" checked={newCandidate.position === 'Ladies Rep (LR)'} onChange={e => setNewCandidate({...newCandidate, position: e.target.value})} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300" />
                                  </label>
                                  <label className={`flex justify-between items-center p-3 cursor-pointer transition-colors ${!['Class Rep (CR)', 'Ladies Rep (LR)'].includes(newCandidate.position) && newCandidate.position !== '' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                    <span className="text-gray-900 font-medium text-sm">Other...</span>
                                    <input type="radio" name="position" value="Other" checked={!['Class Rep (CR)', 'Ladies Rep (LR)'].includes(newCandidate.position) && newCandidate.position !== ''} onChange={() => setNewCandidate({...newCandidate, position: 'President'})} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300" />
                                  </label>
                                </>
                              )}
                            </div>
                            {!['Class Rep (CR)', 'Ladies Rep (LR)', 'President', ''].includes(newCandidate.position) && (
                              <input 
                                required 
                                type="text" 
                                value={newCandidate.position} 
                                onChange={e => setNewCandidate({...newCandidate, position: e.target.value})} 
                                placeholder="Enter custom position"
                                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border mt-2" 
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Photo</label>
                            <div className="flex items-center gap-3">
                              {newCandidate.photoUrl && (
                                <img src={newCandidate.photoUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover border border-gray-200" referrerPolicy="no-referrer" />
                              )}
                              <div className="flex-1 relative">
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={handlePhotoUpload} 
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                  disabled={isUploadingPhoto}
                                />
                                <div className={`w-full border-gray-200 rounded-lg shadow-sm sm:text-sm p-2.5 border flex items-center justify-center gap-2 ${isUploadingPhoto ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                                  {isUploadingPhoto ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-4 h-4" />
                                      {newCandidate.photoUrl ? 'Change Photo' : 'Upload Photo'}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-px bg-gray-200 flex-1"></div>
                              <span className="text-xs text-gray-400 font-medium uppercase">OR</span>
                              <div className="h-px bg-gray-200 flex-1"></div>
                            </div>
                            <input type="url" placeholder="Paste image URL here" value={newCandidate.photoUrl} onChange={e => setNewCandidate({...newCandidate, photoUrl: e.target.value})} className="w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5 border mt-2" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <button type="button" onClick={() => { setShowCandidateForm(false); setEditingCandidateId(null); }} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                          <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors">
                            {editingCandidateId ? 'Update Candidate' : 'Save Candidate'}
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="overflow-x-auto border border-gray-200 rounded-xl">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Roll No</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Position</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Votes</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {candidates.map(candidate => (
                            <tr key={candidate.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    {candidate.photoUrl ? (
                                      <img className="h-10 w-10 rounded-full object-cover border border-gray-200" src={candidate.photoUrl} alt="" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold border border-gray-200">
                                        {candidate.name.charAt(0)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-bold text-gray-900">{candidate.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{candidate.rollNo || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{candidate.position}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{candidate.voteCount}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => handleEditCandidate(candidate)} className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Candidate">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDeleteCandidate(candidate.id)} className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete Candidate">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {candidates.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                                No candidates added yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : activeTab === 'analytics' ? (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 border-l-4 border-blue-600 pl-3">
                          Analytics Dashboard
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 pl-4">Review voting trends and performance</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-blue-600" />
                        Votes per Candidate
                      </h3>
                      {candidates.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          Not enough data to display. Please add candidates to view analytics.
                        </div>
                      ) : (
                        <div className="h-[400px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={candidates.map(c => ({ name: c.name, votes: c.voteCount, position: c.position }))}
                              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false}
                                tickLine={false}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }}
                              />
                              <YAxis 
                                allowDecimals={false}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                              />
                              <Tooltip
                                cursor={{ fill: '#F3F4F6' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number) => [`${value} Votes`, 'Results']}
                              />
                              <Bar 
                                dataKey="votes" 
                                fill="#2563EB" 
                                radius={[4, 4, 0, 0]}
                                maxBarSize={60}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 border-l-4 border-blue-600 pl-3">
                          {elections.find(e => e.id === selectedElection)?.title || 'Live Monitor'}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 pl-4">Live real-time vote tracking and monitoring</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse mr-1"></div>
                        Live
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                      <div>
                        <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-blue-600" />
                          Gemini Election Intelligence
                        </h3>
                        <p className="text-sm text-blue-700 mt-1">Generate an instant executive summary of the election trends, tie-breakers, and a celebratory draft for the winners.</p>
                      </div>
                      <button
                        onClick={handleSynthesizeReport}
                        disabled={isSynthesizing || candidates.length === 0}
                        className="flex-shrink-0 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                      >
                        {isSynthesizing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Synthesizing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Synthesize Report
                          </>
                        )}
                      </button>
                    </div>

                    {intelligenceReport && (
                      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm relative">
                        <button 
                          onClick={() => setIntelligenceReport(null)}
                          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                          <Sparkles className="w-5 h-5 text-blue-600" />
                          Executive Summary
                        </h3>
                        <div className="prose prose-blue max-w-none text-gray-700">
                          <Markdown>{intelligenceReport}</Markdown>
                        </div>
                      </div>
                    )}

                    {Object.entries(candidatesByPosition).length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        No candidates available to monitor.
                      </div>
                    ) : (
                      Object.entries(candidatesByPosition).map(([position, posCandidates]) => {
                        const totalPosVotes = posCandidates.reduce((sum, c) => sum + c.voteCount, 0);
                        return (
                          <div key={position} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                            <div className="flex justify-between items-end mb-6">
                              <h3 className="text-lg font-bold text-gray-900">{position}</h3>
                              <span className="text-sm font-semibold text-gray-500 uppercase tracking-widest">{totalPosVotes} Votes</span>
                            </div>
                            <div className="space-y-5">
                              {posCandidates.map((candidate, index) => {
                                const percentage = totalPosVotes > 0 ? (candidate.voteCount / totalPosVotes) * 100 : 0;
                                return (
                                  <div key={candidate.id}>
                                    <div className="flex justify-between items-center mb-2">
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-gray-900">{candidate.name}</span>
                                        {index === 0 && candidate.voteCount > 0 && (
                                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] uppercase tracking-wider font-bold rounded-full">Leader</span>
                                        )}
                                      </div>
                                      <div className="text-sm font-medium text-gray-600">
                                        {candidate.voteCount} <span className="text-gray-400">({percentage.toFixed(1)}%)</span>
                                      </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                      <div 
                                        className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${index === 0 && candidate.voteCount > 0 ? 'bg-blue-600' : 'bg-gray-400'}`}
                                        style={{ width: `${percentage}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Administered Votes (All-Time)</div>
                    <div className="text-2xl font-bold text-gray-900">{globalTotalVotes}</div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Unique Voter Turnout</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {totalStudents > 0 ? ((uniqueVoters / totalStudents) * 100).toFixed(1) : 0}% <span className="text-lg font-medium text-gray-500">({uniqueVoters}/{totalStudents})</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">Global Elections Overview</h2>
                <div className="space-y-6">
                  {/* Status Grouping */}
                  {(['active', 'upcoming', 'completed'] as const).map(status => {
                    const filtered = electionsWithStatus.filter(e => e.derivedStatus === status);
                    if (filtered.length === 0) return null;
                    
                    return (
                      <div key={status}>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                          {status} Elections ({filtered.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filtered.map(election => (
                            <div key={election.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                              <div>
                                <h4 className="font-bold text-gray-800">{election.title}</h4>
                                <p className="text-xs text-gray-500 mt-1">{format(new Date(election.startTime), 'MMM d, yyyy')}</p>
                              </div>
                              <button 
                                onClick={() => setSelectedElection(election.id)}
                                className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                              >
                                View
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {electionsWithStatus.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No elections have been created yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Election Modal */}
      {electionToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Election</h3>
            <p className="text-gray-500 mb-6">Are you sure you want to delete this election? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setElectionToDelete(null)} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={confirmDeleteElection} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Candidate Modal */}
      {candidateToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Candidate</h3>
            <p className="text-gray-500 mb-6">Are you sure you want to delete this candidate? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCandidateToDelete(null)} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={confirmDeleteCandidate} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
