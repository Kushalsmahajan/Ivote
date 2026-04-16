import { useState, useEffect } from 'react';

export const useCurrentTime = (intervalMs: number = 10000) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return currentTime;
};
