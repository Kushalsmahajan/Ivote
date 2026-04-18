import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, query, where, onSnapshot, getDoc, writeBatch, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, AlertCircle, Award, Download, X, Info, Share2, Check } from 'lucide-react';
import { Election, getDerivedElectionStatus } from '../utils/election';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { toPng } from 'html-to-image';

interface Candidate {
  id: string;
  name: string;
  position: string;
  photoUrl?: string;
}

const AwardsPattern = () => (
  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="star" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M20 5l4.5 13.5H38l-11 8 4.5 13.5L20 32l-11 8 4.5-13.5-11-8h13.5z" fill="currentColor"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#star)" />
  </svg>
);

export default function VotingPage() {
  const { electionId } = useParams<{ electionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentTime = useCurrentTime(10000);
  
  const [election, setElection] = useState<Election | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasVoted, setHasVoted] = useState<boolean | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Passcode state
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [isPasscodeVerified, setIsPasscodeVerified] = useState(false);
  const [passcodeError, setPasscodeError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeLeft, setLockTimeLeft] = useState(0);

  const [copiedLink, setCopiedLink] = useState(false);

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: election?.title || 'College Election',
        url: url
      }).catch((error) => console.log('Error sharing', error));
    } else {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLocked && lockTimeLeft > 0) {
      timer = setTimeout(() => {
        setLockTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isLocked && lockTimeLeft === 0) {
      setIsLocked(false);
      setFailedAttempts(0);
      setPasscodeError('');
    }
    return () => clearTimeout(timer);
  }, [isLocked, lockTimeLeft]);

  // Badge state
  const badgeRef = useRef<HTMLDivElement>(null);
  const [showBadge, setShowBadge] = useState(false);

  const handleDownloadBadge = async () => {
    if (!badgeRef.current) return;
    try {
      const dataUrl = await toPng(badgeRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `I_Voted_Badge_${election?.title?.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate badge', err);
      alert('Failed to generate badge.');
    }
  };

  useEffect(() => {
    if (!electionId || !user) return;

    // Fetch Election
    const fetchElection = async () => {
      try {
        const docRef = doc(db, 'elections', electionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setElection({ id: docSnap.id, ...docSnap.data() } as Election);
        } else {
          setError("Election not found.");
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `elections/${electionId}`);
      }
    };
    fetchElection();

    // Fetch Candidates
    const q = query(collection(db, 'candidates'), where('electionId', '==', electionId));
    const unsubscribeCandidates = onSnapshot(q, (snapshot) => {
      const cands = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Candidate[];
      setCandidates(cands);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'candidates'));

    // Check if voted
    const receiptId = `${user.uid}_${electionId}`;
    const receiptRef = doc(db, 'voter_receipts', receiptId);
    const unsubscribeReceipt = onSnapshot(receiptRef, (docSnap) => {
      setHasVoted(docSnap.exists());
    }, (err) => handleFirestoreError(err, OperationType.GET, `voter_receipts/${receiptId}`));

    return () => {
      unsubscribeCandidates();
      unsubscribeReceipt();
    };
  }, [electionId, user]);

  const candidatesByPosition = candidates.reduce((acc, candidate) => {
    if (!acc[candidate.position]) acc[candidate.position] = [];
    acc[candidate.position].push(candidate);
    return acc;
  }, {} as Record<string, Candidate[]>);

  const allPositionsSelected = Object.keys(candidatesByPosition).length > 0 &&
    Object.keys(candidatesByPosition).every(pos => selectedCandidates[pos]);

  const handleVote = async () => {
    if (!allPositionsSelected || !electionId || !user) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const batch = writeBatch(db);
      
      // 1. Increment candidate vote counts
      Object.values(selectedCandidates).forEach(candidateId => {
        const candidateRef = doc(db, 'candidates', candidateId);
        batch.update(candidateRef, { voteCount: increment(1) });
      });

      // 2. Create voter receipt
      const receiptId = `${user.uid}_${electionId}`;
      const receiptRef = doc(db, 'voter_receipts', receiptId);
      batch.set(receiptRef, {
        electionId,
        userId: user.uid,
        timestamp: new Date().toISOString()
      });

      await batch.commit();
      // hasVoted will automatically update via onSnapshot
    } catch (err) {
      console.error(err);
      setError("Failed to submit vote. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    if (election?.passcode && enteredPasscode === election.passcode) {
      setIsPasscodeVerified(true);
      setPasscodeError('');
      setFailedAttempts(0);
    } else {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= 3) {
        setIsLocked(true);
        setLockTimeLeft(5);
        setPasscodeError(`Too many incorrect attempts. Please wait 5 seconds.`);
      } else {
        setPasscodeError(`Incorrect passcode. You have ${3 - newAttempts} attempt${3 - newAttempts === 1 ? '' : 's'} left.`);
      }
    }
  };

  if (hasVoted === null || !election) {
    return <div className="p-8 text-center text-gray-500">Loading election details...</div>;
  }

  const derivedStatus = getDerivedElectionStatus(election);

  if (derivedStatus !== 'active') {
    return (
      <div className="max-w-2xl mx-auto mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-yellow-800">Voting is not active</h2>
        <p className="text-yellow-700 mt-2">This election is currently {derivedStatus}.</p>
        <button onClick={() => navigate('/')} className="mt-6 px-4 py-2 bg-white border border-yellow-300 rounded-lg text-yellow-800 font-medium hover:bg-yellow-100">
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (hasVoted) {
    return (
      <div className="max-w-2xl mx-auto mt-8 space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center shadow-sm">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-green-900">Vote Cast Successfully!</h2>
          <p className="text-green-700 mt-2">Your vote has been securely recorded. You cannot vote again in this election.</p>
          
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-white border border-green-300 text-green-800 rounded-lg font-medium hover:bg-green-100 transition shadow-sm">
              Return to Dashboard
            </button>
            <button onClick={() => setShowBadge(true)} className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition flex justify-center items-center gap-2 shadow-sm">
              <Award className="w-5 h-5" /> View 'I Voted' Badge
            </button>
          </div>
        </div>

        {showBadge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" /> Your Voter Badge
                </h2>
                <button onClick={() => setShowBadge(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="bg-gray-50 flex justify-center p-6 rounded-xl border border-gray-100">
                {/* The Badge to Screenshot */}
                <div 
                  ref={badgeRef}
                  className="w-[280px] h-[280px] rounded-full border-8 border-blue-900 flex flex-col items-center justify-center relative shadow-lg overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #bfdbfe 100%)'
                  }}
                >
                  <div className="absolute inset-0 opacity-10">
                    <AwardsPattern />
                  </div>
                  <div className="bg-white p-3 rounded-full shadow-md mb-2 z-10 border-2 border-blue-200">
                    <CheckCircle2 className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-3xl font-black text-blue-900 tracking-tight z-10">I VOTED</h3>
                  <div className="h-1 w-12 bg-blue-500 rounded-full my-2 z-10"></div>
                  <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest text-center px-8 z-10">
                    {election.title}
                  </p>
                  <p className="text-[9px] font-medium text-blue-600/80 mt-2 z-10">
                    {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button 
                onClick={handleDownloadBadge}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex justify-center items-center gap-2 shadow-sm"
              >
                <Download className="w-5 h-5" /> Save Badge
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (election.passcode && !isPasscodeVerified) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Voting Passcode Required</h2>
        <p className="text-gray-500 mb-6">Please enter the passcode provided by the administrator to access this election.</p>
        
        <form onSubmit={handleVerifyPasscode} className="space-y-4">
          <div>
            <div className="relative">
              <input
                type="password"
                value={enteredPasscode}
                onChange={(e) => setEnteredPasscode(e.target.value)}
                placeholder="Enter passcode"
                className={`w-full border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-3 border font-mono tracking-widest ${isLocked ? 'bg-gray-100 cursor-not-allowed text-gray-400' : ''}`}
                required
                disabled={isLocked}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500" title="Passcodes are case-sensitive">
                <Info className="w-5 h-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 flex items-start gap-1">
              Hint: Passcodes are case-sensitive (e.g., SECRET123, 12345). Contact your administrator if you haven't received one.
            </p>
          </div>
          {passcodeError && (
            <p className={`text-sm ${isLocked ? 'text-orange-600 font-semibold' : 'text-red-600'}`}>{passcodeError}</p>
          )}
          <button
            type="submit"
            disabled={isLocked}
            className={`w-full py-3 text-white rounded-lg font-semibold transition-colors flex justify-center items-center gap-2 ${isLocked ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isLocked ? (
              <>Locked out ({lockTimeLeft}s)</>
            ) : (
              'Verify Passcode'
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-end mb-8 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{election.title}</h1>
          {election.type === 'student_association' && (
            <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full mt-2">
              👑 Student Association President Election
            </span>
          )}
          <p className="text-gray-500 mt-2">Please select one candidate for each position.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-sm font-medium bg-red-50 text-red-700 px-3 py-1.5 rounded-md border border-red-100">
            Vote cannot be changed
          </div>
          <button 
            onClick={handleShare}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors font-medium text-sm"
          >
            {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
            {copiedLink ? 'Copied' : 'Share'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {Object.entries(candidatesByPosition).map(([position, posCandidates]) => (
        <div key={position} className="mb-10">
          <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">{position}</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {posCandidates.map((candidate) => (
              <div
                key={candidate.id}
                onClick={() => setSelectedCandidates(prev => ({ ...prev, [position]: candidate.id }))}
                className={`relative p-6 rounded-2xl border bg-white cursor-pointer transition-all duration-200 flex gap-5 ${
                  selectedCandidates[position] === candidate.id
                    ? 'border-blue-600 ring-1 ring-blue-600 shadow-sm'
                    : 'border-gray-200 hover:border-blue-600'
                }`}
              >
                {selectedCandidates[position] === candidate.id && (
                  <div className="absolute top-4 right-4 text-blue-600">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                )}
                <div className="w-[100px] h-[100px] rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200">
                  {candidate.photoUrl ? (
                    <img src={candidate.photoUrl} alt={candidate.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-3xl font-bold text-gray-400">{candidate.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex flex-col flex-grow">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">{candidate.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{candidate.position}</p>
                  
                  <button
                    className={`mt-auto w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      selectedCandidates[position] === candidate.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {selectedCandidates[position] === candidate.id ? 'Selected' : `Vote for ${candidate.name.split(' ')[0]}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-8 border-t border-gray-200 mt-8">
        <button
          onClick={handleVote}
          disabled={!allPositionsSelected || isSubmitting}
          className={`px-8 py-3 rounded-lg font-semibold transition-all ${
            !allPositionsSelected || isSubmitting
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
          }`}
        >
          {isSubmitting ? 'Submitting...' : 'Confirm Vote'}
        </button>
      </div>
    </div>
  );
}
