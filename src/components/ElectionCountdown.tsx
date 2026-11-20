import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';

interface ElectionCountdownProps {
  endTime: string;
  variant?: 'card' | 'compact';
  onExpire?: () => void;
}

interface TimeRemaining {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeRemaining(endTime: string, nowMs: number): TimeRemaining | null {
  const targetMs = new Date(endTime).getTime();
  if (Number.isNaN(targetMs)) return null;

  const totalMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { totalMs, days, hours, minutes, seconds };
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export default function ElectionCountdown({
  endTime,
  variant = 'card',
  onExpire,
}: ElectionCountdownProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredNotifiedRef = useRef(false);

  useEffect(() => {
    expiredNotifiedRef.current = false;
    setNowMs(Date.now());

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [endTime]);

  const remaining = calculateTimeRemaining(endTime, nowMs);

  useEffect(() => {
    if (remaining && remaining.totalMs === 0 && !expiredNotifiedRef.current) {
      expiredNotifiedRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  if (!remaining) return null;

  const isExpired = remaining.totalMs === 0;
  const isClosingSoon = !isExpired && remaining.totalMs < 3600 * 1000;

  const formattedCompact =
    remaining.days > 0
      ? `${remaining.days}d ${padTwo(remaining.hours)}h ${padTwo(remaining.minutes)}m ${padTwo(remaining.seconds)}s`
      : `${padTwo(remaining.hours)}h ${padTwo(remaining.minutes)}m ${padTwo(remaining.seconds)}s`;

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-1.5 text-xs font-medium ${
          isExpired
            ? 'text-slate-500'
            : isClosingSoon
              ? 'text-amber-700'
              : 'text-emerald-700'
        }`}
        aria-live="polite"
      >
        <Timer className="w-3.5 h-3.5 shrink-0" />
        <span>{isExpired ? 'Voting closed' : 'Ends in'}</span>
        {!isExpired && (
          <span className="font-mono tabular-nums font-semibold">{formattedCompact}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 flex items-center justify-between gap-3 ${
        isExpired
          ? 'bg-slate-50 border-slate-200 text-slate-700'
          : isClosingSoon
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
      }`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Timer
          className={`w-4 h-4 shrink-0 ${
            isExpired
              ? 'text-slate-500'
              : isClosingSoon
                ? 'text-amber-700'
                : 'text-emerald-700'
          }`}
        />
        <span className="text-xs font-semibold truncate">
          {isExpired
            ? 'Voting closed'
            : isClosingSoon
              ? 'Closing soon'
              : 'Time left to vote'}
        </span>
      </div>

      {!isExpired && (
        <div
          className={`flex items-center gap-1 font-mono tabular-nums text-xs sm:text-sm font-bold shrink-0 ${
            isClosingSoon ? 'text-amber-800' : 'text-emerald-800'
          }`}
        >
          {remaining.days > 0 && (
            <>
              <span className="bg-white/80 border border-black/5 rounded px-1.5 py-0.5">
                {remaining.days}d
              </span>
              <span className="opacity-50" aria-hidden="true">:</span>
            </>
          )}
          <span className="bg-white/80 border border-black/5 rounded px-1.5 py-0.5">
            {padTwo(remaining.hours)}h
          </span>
          <span className="opacity-50" aria-hidden="true">:</span>
          <span className="bg-white/80 border border-black/5 rounded px-1.5 py-0.5">
            {padTwo(remaining.minutes)}m
          </span>
          <span className="opacity-50" aria-hidden="true">:</span>
          <span className="bg-white/80 border border-black/5 rounded px-1.5 py-0.5">
            {padTwo(remaining.seconds)}s
          </span>
        </div>
      )}
    </div>
  );
}
