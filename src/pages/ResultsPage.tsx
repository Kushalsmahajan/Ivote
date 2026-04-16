import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, query, where, onSnapshot, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Trophy, ArrowLeft, AlertCircle } from 'lucide-react';
import { Election, getDerivedElectionStatus } from '../utils/election';
import { useCurrentTime } from '../hooks/useCurrentTime';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';

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
        <div className="flex justify-between items-end mb-10 pb-6 border-b border-gray-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{election.title}</h1>
            <p className="text-gray-500">Live Election Results</p>
          </div>
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
                          <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white bg-yellow-500 rounded-full shadow-sm">
                            Winner
                          </span>
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
    </div>
  );
}
