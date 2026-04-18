import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, query, where, onSnapshot, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Trophy, ArrowLeft, AlertCircle, FileBadge, Download, X, Share2, Check } from 'lucide-react';
import { Election, getDerivedElectionStatus } from '../utils/election';
import { useCurrentTime } from '../hooks/useCurrentTime';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { toPng } from 'html-to-image';

interface Candidate {
  id: string;
  name: string;
  position: string;
  voteCount: number;
}

export default function ResultsPage() {
  const { electionId } = useParams<{ electionId: string }>();
  const navigate = useNavigate();
  const currentTime = useCurrentTime(10000);
  
  const [election, setElection] = useState<Election | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFiredConfetti = useRef(false);

  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState<{name: string, position: string, voteCount: number} | null>(null);
  const certificateRef = useRef<HTMLDivElement>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: election?.title ? `${election.title} Results` : 'Election Results',
        url: url
      }).catch((error) => console.log('Error sharing', error));
    } else {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleDownloadCertificate = async () => {
    if (!certificateRef.current) return;
    try {
      const dataUrl = await toPng(certificateRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${certificateData?.name.replace(/\s+/g, '_')}_Certificate.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate certificate', err);
      alert('Failed to generate certificate.');
    }
  };

  useEffect(() => {
    if (!electionId) return;

    const fetchElection = async () => {
      try {
        const docRef = doc(db, 'elections', electionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setElection({ id: docSnap.id, ...docSnap.data() } as Election);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `elections/${electionId}`);
      }
    };
    fetchElection();

    const q = query(collection(db, 'candidates'), where('electionId', '==', electionId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cands = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Candidate[];
      // Sort by vote count descending
      cands.sort((a, b) => b.voteCount - a.voteCount);
      setCandidates(cands);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'candidates'));

    return () => unsubscribe();
  }, [electionId]);

  const derivedStatus = election ? getDerivedElectionStatus(election) : null;

  useEffect(() => {
    if (derivedStatus === 'completed' && !loading && !hasFiredConfetti.current && election?.showResults) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#fbbf24', '#f87171', '#34d399']
      });
      hasFiredConfetti.current = true;
    }
  }, [derivedStatus, loading, election]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading results...</div>;
  }

  if (!election || (!election.showResults && derivedStatus !== 'completed')) {
    return (
      <div className="max-w-2xl mx-auto mt-8 bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Results Not Available</h2>
        <p className="text-gray-500 mt-2">The results for this election are currently hidden by the administrator.</p>
        <button onClick={() => navigate('/')} className="mt-6 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">
          Return to Dashboard
        </button>
      </div>
    );
  }

  const candidatesByPosition = candidates.reduce((acc, candidate) => {
    if (!acc[candidate.position]) acc[candidate.position] = [];
    acc[candidate.position].push(candidate);
    return acc;
  }, {} as Record<string, Candidate[]>);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <button 
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10">
        <div className="flex justify-between items-start sm:items-end flex-col sm:flex-row gap-4 mb-10 pb-6 border-b border-gray-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{election.title}</h1>
            <p className="text-gray-500">Live Election Results</p>
          </div>
          <button 
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors font-medium text-sm"
          >
            {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
            {copiedLink ? 'Copied Link' : 'Share Results'}
          </button>
        </div>

        <motion.div variants={containerVariants} initial="hidden" animate="show">
          {Object.entries(candidatesByPosition).map(([position, posCandidates]) => {
            const totalVotes = posCandidates.reduce((sum, c) => sum + c.voteCount, 0);
            const winner = posCandidates.length > 0 && posCandidates[0].voteCount > 0 ? posCandidates[0] : null;
            const isCompleted = derivedStatus === 'completed';

            return (
              <motion.div variants={itemVariants} key={position} className="mb-16 last:mb-0">
                <div className="flex justify-between items-end mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">{position}</h2>
                  <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
                    {totalVotes} Votes Cast
                  </div>
                </div>

                {winner && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className={`mb-8 border rounded-2xl p-6 flex items-center gap-6 ${isCompleted ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className={`flex-shrink-0 p-4 rounded-xl shadow-sm border ${isCompleted ? 'bg-yellow-100 border-yellow-300' : 'bg-white border-gray-200'}`}>
                      <Trophy className={`w-8 h-8 ${isCompleted ? 'text-yellow-600' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${isCompleted ? 'text-yellow-700' : 'text-gray-500'}`}>
                        {isCompleted ? 'Winner' : 'Current Leader'}
                      </h3>
                      <div className="flex items-center gap-3">
                        <p className="text-2xl font-bold text-gray-900">{winner.name}</p>
                        {isCompleted && (
                          <div className="flex gap-2">
                            <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white bg-yellow-500 rounded-full shadow-sm">
                              Winner
                            </span>
                            <button
                              onClick={() => {
                                setCertificateData({ name: winner.name, position: position, voteCount: winner.voteCount });
                                setShowCertificate(true);
                              }}
                              className="px-2.5 py-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-yellow-800 bg-yellow-200 hover:bg-yellow-300 rounded-full shadow-sm transition-colors"
                            >
                              <FileBadge className="w-3 h-3" /> Certificate
                            </button>
                          </div>
                        )}
                      </div>
                      <p className={`font-medium ${isCompleted ? 'text-yellow-800' : 'text-gray-600'}`}>{winner.voteCount} votes ({totalVotes > 0 ? (winner.voteCount / totalVotes * 100).toFixed(1) : 0}%)</p>
                    </div>
                  </motion.div>
                )}

                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={posCandidates} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#4b5563', fontSize: 13, fontWeight: 500 }}
                        angle={-45}
                        textAnchor="end"
                        dy={10}
                      />
                      <YAxis 
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#4b5563', fontSize: 13, fontWeight: 500 }}
                        dx={-10}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontWeight: 500 }}
                      />
                      <Bar 
                        dataKey="voteCount" 
                        radius={[6, 6, 0, 0]} 
                        maxBarSize={60} 
                        isAnimationActive={true} 
                        animationDuration={1500} 
                        animationEasing="ease-out"
                      >
                        {posCandidates.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? (isCompleted ? '#eab308' : '#2563eb') : '#9ca3af'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {showCertificate && certificateData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileBadge className="w-5 h-5 text-blue-600" /> Winner Certificate
              </h2>
              <button onClick={() => setShowCertificate(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-gray-100 p-4 rounded-xl overflow-auto flex justify-center">
              {/* Certificate Canvas */}
              <div 
                ref={certificateRef}
                className="w-[600px] h-[400px] bg-white border-[10px] border-blue-900 p-8 shadow-sm flex flex-col items-center justify-between text-center relative"
                style={{
                  backgroundImage: 'radial-gradient(circle, #ffffff 0%, #f1f5f9 100%)'
                }}
              >
                <div className="absolute top-4 left-4 opacity-10">
                  <Trophy className="w-24 h-24" />
                </div>
                <div className="absolute bottom-4 right-4 opacity-10">
                  <Trophy className="w-24 h-24" />
                </div>

                <div>
                  <h1 className="text-4xl font-serif font-bold text-blue-900 tracking-wider mb-2">CERTIFICATE</h1>
                  <h3 className="text-xl font-serif text-blue-700 tracking-widest uppercase">Of Election Victory</h3>
                </div>

                <div className="space-y-4">
                  <p className="text-base text-gray-600 italic">This is to proudly certify that</p>
                  <p className="text-3xl font-bold text-gray-900 underline decoration-gray-300 decoration-2 underline-offset-8">
                    {certificateData.name}
                  </p>
                  <p className="text-base text-gray-600 italic mt-4">
                    has been officially elected as
                  </p>
                  <p className="text-2xl font-bold text-blue-800">
                    {certificateData.position}
                  </p>
                  <p className="text-sm font-semibold text-gray-500 mt-2">
                    with {certificateData.voteCount} confirmed votes in the
                  </p>
                  <p className="text-lg font-bold text-gray-800 px-4">
                    {election.title}
                  </p>
                </div>

                <div className="w-full flex justify-between items-end mt-4 px-10">
                  <div className="text-center w-32 border-t-2 border-gray-400 pt-2">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Date</p>
                    <p className="text-xs font-medium text-gray-800 mt-1">{new Date().toLocaleDateString()}</p>
                  </div>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-400">
                    <Trophy className="w-8 h-8 text-blue-600" />
                  </div>
                  <div className="text-center w-32 border-t-2 border-gray-400 pt-2">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Election Admin</p>
                    <p className="text-xs text-transparent italic select-none mt-1">sign</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={() => setShowCertificate(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                type="button"
              >
                Close
              </button>
              <button 
                onClick={handleDownloadCertificate}
                className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                type="button"
              >
                <Download className="w-4 h-4" /> Download Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
