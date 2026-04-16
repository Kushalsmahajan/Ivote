import { useState, useEffect } from 'react';
import { Election, getDerivedElectionStatus } from '../utils/election';

export const useElectionStatus = (election: Election | null) => {
  const [status, setStatus] = useState<'upcoming' | 'active' | 'completed' | null>(
    election ? getDerivedElectionStatus(election) : null
  );

  useEffect(() => {
    if (!election) {
      setStatus(null);
      return;
    }

    // Initial set
    setStatus(getDerivedElectionStatus(election));

    // Update every 10 seconds
    const interval = setInterval(() => {
      setStatus(getDerivedElectionStatus(election));
    }, 10000);

    return () => clearInterval(interval);
  }, [election]);

  return status;
};
