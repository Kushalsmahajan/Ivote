export interface Election {
  id: string;
  title: string;
  status: 'upcoming' | 'active' | 'completed';
  showResults: boolean;
  startTime: string;
  endTime: string;
  passcode?: string;
  type?: 'general' | 'student_association';
  roomId?: string;
}

export const getDerivedElectionStatus = (election: Election): 'upcoming' | 'active' | 'completed' => {
  if (!election.startTime || !election.endTime) return election.status;
  
  const now = new Date().getTime();
  const start = new Date(election.startTime).getTime();
  const end = new Date(election.endTime).getTime();
  
  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'active';
  return 'completed';
};
