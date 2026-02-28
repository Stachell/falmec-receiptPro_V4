import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Download,
  ExternalLink,
  Filter,
  FilterX,
  Lightbulb,
  X,
} from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { SeverityBadge } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Issue, IssueType, InvoiceLine } from '@/types';
import { formatLineForDisplay, buildIssueClipboardText } from '@/lib/issueLineFormatter';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

// ── Label map (existing + PROJ-17 new subtypes) ────────────────────────────
const issueTypeLabels: Record<string, string> = {
  'order-assignment': 'Bestellzuordnung',
  'serial-mismatch': 'Seriennummer-Fehler',
  'price-mismatch': 'Preisabweichung',
  'inactive-article': 'Inaktiver Artikel',
  'missing-storage-location': 'Fehlender Lagerort',
  'missing-ean': 'Fehlende EAN',
  'parser-error': 'Parser-Fehler',
  'no-article-match': 'Artikel nicht gefunden',
  'price-missing': 'Preis fehlt',
  'order-no-match': 'Bestellung nicht zuordenbar',
  'conflict': 'Identifier-Konflikt',
  // PROJ-17 Step 2
  'match-artno-not-found': 'Artikelnummer/EAN nicht im Stamm',
  'match-ean-not-found': 'EAN nicht im Stamm',
  'match-conflict-id': 'Artikelnummer/EAN-Konflikt',
  // PROJ-17 Step 3
  'sn-invoice-ref-missing': 'Rechnungsreferenz fehlt',
  'sn-regex-failed': 'S/N Regex kein Treffer',
  'sn-insufficient-count': 'Zu wenige Seriennummern',
  // PROJ-21 Step 4
  'order-incomplete': 'Bestellung unvollständig',
  'order-multi-split': 'Mehrfach-Split (3+)',
  'order-fifo-only': 'Nur FIFO-Zuweisung',
};

// ── Quick-Fix hints per issue type (Lightbulb banners) ────────────────────
const quickFixHints: Partial<Record<IssueType, string>> = {
  'match-artno-not-found':
    'Artikelstamm aktualisieren oder Artikelnummer in der Rechnung pruefen. Der Stamm muss die Herstellerartikelnummer enthalten.',
  'match-ean-not-found':
    'EAN im Artikelstamm fehlt oder weicht von der Rechnung ab. Stammdaten ergaenzen.',
  'match-conflict-id':
    'Artikelnummer und EAN zeigen auf unterschiedliche Artikel im Stamm - Stammdaten bereinigen, damit Artikelnummer und EAN denselben Artikel referenzieren.',
  'sn-invoice-ref-missing':
    'Die 5-stellige Rechnungsreferenz fehlt im Warenbegleitschein. Stimmt die Rechnungsnummer im Dokument? Format: letzte 5 Ziffern der Fattura-Nr. / Rechnungsnummer',
  'sn-insufficient-count':
    'Nicht genug Seriennummern im S/N-Dokument fuer alle Pflicht-Zeilen. Weitere Zeilen im Warenbegleitschein suchen oder S/N manuell nachtragen.',
  // PROJ-21 Step 4
  'order-incomplete':
    'Position nicht vollständig zugeordnet - Restmenge pruefen. Offene Bestellungen ergaenzen oder manuell zuweisen.',
  'order-multi-split':
    'Position wurde auf 3+ verschiedene Bestellungen aufgeteilt. pruefen, ob die Splittung korrekt ist.',
  'order-fifo-only':
    'Keine Belegnummer aus dem PDF erkannt. "Zuordnung erfolgte nur nach FIFO-Regel (aelterste zuerst). Belegnummer im PDF oder des offenen Bestell-Verzeichnises pruefen."',
};

const quickFixLabelOverrides: Partial<Record<IssueType, string>> = {
  'order-fifo-only': 'STEP 4 - BESTELLZUWEISUNG FIFO Zuweisung',
};

// Step labels for section headers
const stepLabels: Record<number, string> = {
  1: 'Schritt 1 - Rechnung auslesen',
  2: 'Schritt 2 - Artikel extrahieren',
  3: 'Schritt 3 - Seriennummer anfuegen',
  4: 'Schritt 4 - Bestellungen mappen',
  5: 'Schritt 5 - Export',
};

const BODY_LINE_LIMIT = 30;

// ── IssueCard sub-component ────────────────────────────────────────────────

interface IssueCardProps {
  issue: Issue;
  invoiceLines: InvoiceLine[];
  onSend: (issue: Issue) => void;
  onIsolate: (ids: string[]) => void;
}

function IssueCard({ issue, invoiceLines, onSend, onIsolate }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { isCopied, copy } = useCopyToClipboard(1500);

  // On-the-fly rendering: look up InvoiceLines for affectedLineIds
  const affectedLines = useMemo(() => {
    if (!issue.affectedLineIds || issue.affectedLineIds.length === 0) return [];
    const lineMap = new Map(invoiceLines.map(l => [l.lineId, l]));
    return issue.affectedLineIds
      .map(id => lineMap.get(id))
      .filter((l): l is InvoiceLine => l != null);
  }, [issue.affectedLineIds, invoiceLines]);

  const displayLines = affectedLines.slice(0, BODY_LINE_LIMIT);
  const overflow = affectedLines.length - BODY_LINE_LIMIT;

  const handleCopy = () => {
    const text = buildIssueClipboardText(issue, invoiceLines);
    copy(text);
  };

  const hasBody = affectedLines.length > 0;

  return (
    <div
      className={`enterprise-card border-l-4 ${
        issue.severity === 'error'
          ? 'border-l-status-failed'
          : issue.severity === 'warning'
          ? 'border-l-status-soft-fail'
          : 'border-l-blue-400'
      }`}
    >
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-2">
        {/* Left: badges + message */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <SeverityBadge severity={issue.severity} />
            <span className="text-xs text-white bg-muted px-2 py-0.5 rounded">
              {issueTypeLabels[issue.type] ?? issue.type}
            </span>
          </div>
          <p className="font-medium text-foreground text-sm leading-snug">{issue.message}</p>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
          {/* Betroffene Zeilen isolieren */}
          {issue.affectedLineIds && issue.affectedLineIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs h-7 px-2"
              onClick={() => onIsolate(issue.affectedLineIds)}
              title="Betroffene Zeilen in Artikelliste isolieren"
            >
              <Filter className="w-3.5 h-3.5" />
              Zeilen isolieren
            </Button>
          )}

          {/* Kopieren */}
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1 text-xs h-7 px-2 ${isCopied ? 'text-green-600' : ''}`}
            onClick={handleCopy}
            title="Problem-Details in die Zwischenablage kopieren"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Kopiert!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                kopieren
              </>
            )}
          </Button>

          {/* Senden — bestehend, UNVERAENDERT */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs h-7 px-2"
            onClick={() => onSend(issue)}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Senden
          </Button>
        </div>
      </div>

      {/* BODY — on-the-fly rendered lines from affectedLineIds */}
      {hasBody && (
        <div className="px-4">
          <div
            className={`
              transition-all duration-500 ease-in-out overflow-y-auto
              ${expanded ? 'max-h-[5000px]' : 'max-h-[130px]'}
            `}
          >
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground leading-relaxed">
              {displayLines.map(formatLineForDisplay).join('\n')}
              {overflow > 0 && `\n... (+${overflow} weitere Positionen)`}
            </pre>
          </div>
        </div>
      )}

      {/* FOOTER — ChevronsDown/Up (only when body has content) */}
      {hasBody && (
        <div className="flex justify-center py-1 border-t border-border/30 mt-2">
          <button
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Einklappen' : 'Ausklappen'}
          >
            {expanded ? (
              <ChevronsUp className="w-5 h-5" />
            ) : (
              <ChevronsDown className="w-5 h-5 animate-pulse" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── IssuesCenter (main export) ─────────────────────────────────────────────

export function IssuesCenter() {
  const {
    issues,
    resolveIssue,
    currentRun,
    issuesStepFilter,
    setIssuesStepFilter,
    invoiceLines: allInvoiceLines,
    setActiveIssueFilterIds,
    setActiveTab,
  } = useRunStore();

  // Sync store-driven filter (from KPI-click navigation) into local state
  const [stepFilter, setStepFilter] = useState<string>(issuesStepFilter ?? 'all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  // Filter invoice lines to current run
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;

  // When the store filter changes (KPI navigation), sync local state
  useEffect(() => {
    if (issuesStepFilter !== null) {
      setStepFilter(issuesStepFilter);
      // Reset after consuming so next manual change works cleanly
      setIssuesStepFilter(null);
    }
  }, [issuesStepFilter, setIssuesStepFilter]);

  const scopedIssues = currentRun
    ? issues.filter(issue => !issue.runId || issue.runId === currentRun.id)
    : issues;

  const filteredIssues = scopedIssues.filter(issue => {
    return (
      (stepFilter === 'all' || issue.stepNo.toString() === stepFilter) &&
      (severityFilter === 'all' || issue.severity === severityFilter) &&
      (typeFilter === 'all' || issue.type === typeFilter)
    );
  });

  const openIssues = filteredIssues.filter(i => i.status === 'open');
  const resolvedIssues = filteredIssues.filter(i => i.status === 'resolved');

  // Group open issues by stepNo for sectioned display
  const issuesByStep = new Map<number, Issue[]>();
  for (const issue of openIssues) {
    const existing = issuesByStep.get(issue.stepNo) ?? [];
    existing.push(issue);
    issuesByStep.set(issue.stepNo, existing);
  }
  const stepNos = [...issuesByStep.keys()].sort((a, b) => a - b);

  // Collect which quick-fix types are present in open issues
  const presentQuickFixTypes = [...new Set(openIssues.map(i => i.type as IssueType))].filter(
    t => t in quickFixHints,
  );

  const handleResolve = () => {
    if (selectedIssue) {
      resolveIssue(selectedIssue.id, resolutionNote);
      setSelectedIssue(null);
      setResolutionNote('');
    }
  };

  const handleExportIssues = () => {
    const csvContent = [
      ['ID', 'Schweregrad', 'Schritt', 'Typ', 'Nachricht', 'Details', 'Status'].join(','),
      ...scopedIssues.map(issue =>
        [
          issue.id,
          issue.severity,
          issue.stepNo,
          issue.type,
          `"${issue.message}"`,
          `"${issue.details}"`,
          issue.status,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'issues-report.csv';
    a.click();
  };

  // "Betroffene Zeilen isolieren" — sets filter + switches to items tab
  const handleIsolate = (ids: string[]) => {
    setActiveIssueFilterIds(ids);
    setActiveTab('items');
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="enterprise-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {/* PROJ-37: FilterX — reset all 3 dropdowns, visible when any filter is active */}
            {(stepFilter !== 'all' || severityFilter !== 'all' || typeFilter !== 'all') && (
              <button
                className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground"
                onClick={() => {
                  setStepFilter('all');
                  setSeverityFilter('all');
                  setTypeFilter('all');
                }}
                title="Alle Filter zuruecksetzen"
              >
                <FilterX className="w-4 h-4" />
              </button>
            )}
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter:</span>
          </div>

          <Select value={stepFilter} onValueChange={setStepFilter}>
            <SelectTrigger className="w-[140px] bg-surface-elevated">
              <SelectValue placeholder="Schritt" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle Schritte</SelectItem>
              <SelectItem value="1">Schritt 1</SelectItem>
              <SelectItem value="2">Schritt 2</SelectItem>
              <SelectItem value="3">Schritt 3</SelectItem>
              <SelectItem value="4">Schritt 4</SelectItem>
              <SelectItem value="5">Schritt 5</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px] bg-surface-elevated">
              <SelectValue placeholder="Schweregrad" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="error">Fehler</SelectItem>
              <SelectItem value="warning">Warnung</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px] bg-surface-elevated">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle Typen</SelectItem>
              {Object.entries(issueTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportIssues}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-status-soft-fail" />
          <span className="text-lg font-semibold text-[#fff3e6]">{openIssues.length}</span>
          <span className="text-white">Offen</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-status-ok" />
          <span className="text-lg font-semibold text-[#eaffef]">{resolvedIssues.length}</span>
          <span className="text-white">Erledigt</span>
        </div>
      </div>

      {/* Quick-Fix Banners (Lightbulb) — shown when relevant issue types are open */}
      {presentQuickFixTypes.length > 0 && (
        <div className="space-y-2">
          {presentQuickFixTypes.map(type => (
            <div
              key={type}
              className="flex items-start gap-3 rounded-md border border-amber-300/50 bg-amber-50/10 px-4 py-3 text-sm"
            >
              <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <div>
                <span className="font-medium text-amber-300">
                  {(quickFixLabelOverrides[type] ?? issueTypeLabels[type] ?? type)}:
                </span>{' '}
                <span className="text-black">
                  {quickFixHints[type]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issues List */}
      <div className="space-y-6">
        {openIssues.length === 0 && resolvedIssues.length === 0 ? (
          <div className="enterprise-card p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-status-ok mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Keine Probleme</h3>
            <p className="text-muted-foreground mt-1">
              Alle Validierungen wurden erfolgreich abgeschlossen.
            </p>
          </div>
        ) : (
          <>
            {/* Open issues — grouped by step */}
            {stepNos.map(stepNo => {
              const stepIssues = issuesByStep.get(stepNo) ?? [];
              return (
                <div key={stepNo} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white">
                    {stepLabels[stepNo] ?? `Schritt ${stepNo}`}
                    <span className="ml-2 text-xs font-normal normal-case px-1.5 py-0.5 rounded bg-status-soft-fail/20 text-status-soft-fail border border-status-soft-fail/40">
                      {stepIssues.length} Problem{stepIssues.length !== 1 ? 'e' : ''}
                    </span>
                  </h3>
                  {stepIssues.map(issue => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      invoiceLines={invoiceLines}
                      onSend={setSelectedIssue}
                      onIsolate={handleIsolate}
                    />
                  ))}
                </div>
              );
            })}

            {/* Resolved issues */}
            {resolvedIssues.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-white mb-3">
                  Erledigte Probleme ({resolvedIssues.length})
                </h3>
                {resolvedIssues.map(issue => (
                  <div key={issue.id} className="enterprise-card p-4 opacity-60 mb-3">
                    <div className="flex items-start gap-4">
                      <CheckCircle2 className="w-5 h-5 text-status-ok flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-foreground line-through">{issue.message}</h4>
                        {issue.resolutionNote && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Lösung: {issue.resolutionNote}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Resolution Dialog */}
      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Problem lösen</DialogTitle>
            <DialogDescription>{selectedIssue?.message}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">{selectedIssue?.details}</p>
            <Textarea
              placeholder="Lösungsnotiz (optional)..."
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              className="bg-surface-elevated"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedIssue(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleResolve}>Als gelöst markieren</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
