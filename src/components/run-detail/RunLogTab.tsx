import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Terminal, ChevronDown, ChevronRight, Copy, ArrowDownToLine, Circle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { logService, LogEntry } from '@/services/logService';

type LogLevel = LogEntry['level'];

const LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: 'text-red-500',
  WARN: 'text-amber-500',
  INFO: 'text-foreground',
  DEBUG: 'text-muted-foreground',
};

const LEVEL_BG: Record<LogLevel, string> = {
  ERROR: 'bg-red-500/10',
  WARN: 'bg-amber-500/10',
  INFO: '',
  DEBUG: '',
};

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

interface RunLogTabProps {
  runId: string;
  /** "live" = active run (RAM buffer), "archive" = archived run (localStorage) */
  mode: 'live' | 'archive';
  /** Optional: compact layout for embedding in dialogs */
  compact?: boolean;
}

export function RunLogTab({ runId, mode, compact = false }: RunLogTabProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [followMode, setFollowMode] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(
    () => new Set(ALL_LEVELS)
  );
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Live mode: poll logService buffer every second
  useEffect(() => {
    if (mode !== 'live') return;

    const poll = () => {
      const buffer = logService.getRunBuffer(runId);
      setEntries([...buffer]);
    };

    poll(); // initial
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [runId, mode]);

  // Archive mode: load from localStorage once
  useEffect(() => {
    if (mode !== 'archive') return;
    const logs = logService.getRunLog(runId);
    setEntries(logs);
  }, [runId, mode]);

  // Auto-scroll when follow mode is on and entries change
  useEffect(() => {
    if (followMode && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, followMode]);

  const filteredEntries = useMemo(
    () => entries.filter(e => activeFilters.has(e.level)),
    [entries, activeFilters]
  );

  const toggleFilter = useCallback((level: LogLevel) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const formatTime = (timestamp: string) => {
    try {
      const d = new Date(timestamp);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return '??:??:??';
    }
  };

  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    for (const e of entries) {
      counts[e.level]++;
    }
    return counts;
  }, [entries]);

  const scrollHeight = compact ? 'h-[250px]' : 'h-[420px]';

  /** Build plain-text from filtered entries, including expanded details */
  const buildLogText = useCallback(() => {
    return filteredEntries.map(entry => {
      const time = formatTime(entry.timestamp);
      const level = entry.level.padEnd(5);
      const step = entry.step ? ` [${entry.step}]` : '';
      const line = `${time} ${level}${step} ${entry.message}`;
      if (entry.details && expandedEntries.has(entry.id)) {
        return `${line}\n${entry.details}`;
      }
      return line;
    }).join('\n');
  }, [filteredEntries, expandedEntries, formatTime]);

  const handleCopy = useCallback(async () => {
    const text = buildLogText();
    await navigator.clipboard.writeText(text);
  }, [buildLogText]);

  const handleDownload = useCallback(() => {
    const text = buildLogText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-log-${runId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildLogText, runId]);

  const toolbarBtnStyle = {
    backgroundColor: '#c9c3b6',
    color: '#666666',
  };
  const toolbarBtnHoverStyle = {
    backgroundColor: '#008C99',
    color: '#E3E0CF',
  };

  return (
    <div className="enterprise-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            Run Log
          </span>
          <span className="text-xs text-muted-foreground">
            ({filteredEntries.length}/{entries.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Level filter chips */}
          <div className="flex items-center gap-1">
            {ALL_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => toggleFilter(level)}
                className={`
                  px-2 py-0.5 rounded text-xs font-medium transition-all
                  ${activeFilters.has(level)
                    ? `${LEVEL_COLORS[level]} border border-current opacity-100`
                    : 'text-muted-foreground/40 border border-transparent opacity-50'
                  }
                `}
              >
                {level}
                {levelCounts[level] > 0 && (
                  <span className="ml-1 opacity-70">{levelCounts[level]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Copy */}
          <button
            onClick={handleCopy}
            title="Log kopieren"
            className="h-6 px-2 rounded text-xs font-medium flex items-center gap-1 transition-colors"
            style={toolbarBtnStyle}
            onMouseEnter={e => Object.assign(e.currentTarget.style, toolbarBtnHoverStyle)}
            onMouseLeave={e => Object.assign(e.currentTarget.style, toolbarBtnStyle)}
          >
            <Copy className="w-3 h-3" />
            Kopieren
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            title="Log herunterladen"
            className="h-6 px-2 rounded text-xs font-medium flex items-center gap-1 transition-colors"
            style={toolbarBtnStyle}
            onMouseEnter={e => Object.assign(e.currentTarget.style, toolbarBtnHoverStyle)}
            onMouseLeave={e => Object.assign(e.currentTarget.style, toolbarBtnStyle)}
          >
            <ArrowDownToLine className="w-3 h-3" />
            Download
          </button>

          {/* Follow mode toggle (only in live mode) */}
          {mode === 'live' && (
            <button
              onClick={() => setFollowMode(f => !f)}
              title="Auto-Scroll"
              className="h-6 px-2 rounded text-xs font-medium flex items-center gap-1 transition-colors"
              style={followMode ? { ...toolbarBtnStyle, color: undefined } as React.CSSProperties : toolbarBtnStyle}
              onMouseEnter={e => { if (!followMode) Object.assign(e.currentTarget.style, toolbarBtnHoverStyle); }}
              onMouseLeave={e => { if (!followMode) Object.assign(e.currentTarget.style, toolbarBtnStyle); }}
            >
              <Circle
                className={`w-3 h-3 ${followMode ? 'animate-pulse' : ''}`}
                style={followMode ? { color: '#ef4444' } : {}}
              />
              Follow
            </button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <ScrollArea className={scrollHeight} ref={scrollRef}>
        <div className="p-2 font-mono text-xs leading-relaxed">
          {filteredEntries.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
              {entries.length === 0
                ? 'Keine Log-Einträge vorhanden'
                : 'Alle Einträge herausgefiltert'}
            </div>
          ) : (
            filteredEntries.map(entry => (
              <LogLine
                key={entry.id}
                entry={entry}
                isExpanded={expandedEntries.has(entry.id)}
                onToggle={() => toggleExpanded(entry.id)}
                formatTime={formatTime}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Log Line ──────────────────────────────────────────────────────────

interface LogLineProps {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  formatTime: (ts: string) => string;
}

function LogLine({ entry, isExpanded, onToggle, formatTime }: LogLineProps) {
  const hasDetails = !!entry.details;
  const colorClass = LEVEL_COLORS[entry.level];
  const bgClass = LEVEL_BG[entry.level];
  const levelPad = entry.level.padEnd(5);

  if (!hasDetails) {
    return (
      <div className={`flex gap-2 px-1 py-0.5 rounded ${bgClass}`}>
        <span className="text-muted-foreground shrink-0 select-none">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`shrink-0 font-semibold select-none ${colorClass}`}>
          {levelPad}
        </span>
        {entry.step && (
          <span className="text-muted-foreground shrink-0">[{entry.step}]</span>
        )}
        <span className={colorClass}>{entry.message}</span>
      </div>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={`w-full flex gap-2 px-1 py-0.5 rounded text-left hover:bg-muted/30 cursor-pointer ${bgClass}`}
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-muted-foreground shrink-0 select-none">
            {formatTime(entry.timestamp)}
          </span>
          <span className={`shrink-0 font-semibold select-none ${colorClass}`}>
            {levelPad}
          </span>
          {entry.step && (
            <span className="text-muted-foreground shrink-0">[{entry.step}]</span>
          )}
          <span className={colorClass}>{entry.message}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="ml-6 p-2 my-1 rounded bg-muted/40 text-muted-foreground text-[11px] whitespace-pre-wrap break-all border border-border/50 max-h-[200px] overflow-auto">
          {entry.details}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
