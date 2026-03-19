/**
 * PROJ-43 / PROJ-44-ADD-ON: IssueDialog — Tabbed Dialog for Issue Management
 *
 * Architecture:
 * - 5 horizontal top tabs (800px fixed height 600px, bg=#D8E6E7, border-b tab bar)
 * - Tab 1: Uebersicht — summary, affected lines, action shortcuts
 * - Tab 2: Fehlerbericht — copyable full error text
 * - Tab 3: Loesung erzwingen — checkbox line-picker + dynamic resolve actions
 * - Tab 4: E-Mail erzeugen — email dropdown/input, mailto link
 * - Tab 5: Anfragen — only visible when pending issues exist
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Eye,
  FileText,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { useRunStore, resolveIssueLines } from '@/store/runStore';
import { SeverityBadge } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { Issue, InvoiceLine } from '@/types';
import { STORAGE_LOCATIONS } from '@/types';
import {
  formatLineForDisplay,
  buildIssueClipboardText,
} from '@/lib/issueLineFormatter';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getStoredEmailAddresses } from '@/lib/errorHandlingConfig';
import { PriceCell } from './PriceCell';

// ── Type label map (shared with IssuesCenter) ─────────────────────────────
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
  'match-artno-not-found': 'Artikelnummer/EAN nicht im Stamm',
  'match-ean-not-found': 'EAN nicht im Stamm',
  'match-conflict-id': 'Artikelnummer/EAN-Konflikt',
  'sn-invoice-ref-missing': 'Rechnungsreferenz fehlt',
  'sn-regex-failed': 'S/N Regex kein Treffer',
  'sn-insufficient-count': 'Zu wenige Seriennummern',
  'order-incomplete': 'Bestellung unvollstaendig',
  'order-multi-split': 'Mehrfach-Split (3+)',
  'order-fifo-only': 'Nur FIFO-Zuweisung',
  'pool-empty-mismatch': 'Pool leer',
  'supplier-missing': 'Lieferant fehlt',
  'export-no-lines': 'Keine Rechnungszeilen',
};

// ── Readable line label for a specific issue type ─────────────────────────
function getLineLabel(issue: Issue, line: InvoiceLine): string {
  const pos = `Pos. ${line.positionIndex}`;
  switch (issue.type) {
    case 'price-mismatch':
      return `${pos}: ${line.falmecArticleNo ?? line.manufacturerArticleNo ?? ''} — RE ${(line.unitPriceInvoice ?? 0).toFixed(2)} EUR vs. Sage ${(line.unitPriceSage ?? 0).toFixed(2)} EUR`;
    case 'no-article-match':
    case 'match-artno-not-found':
    case 'match-ean-not-found':
      return `${pos}: EAN ${line.ean ?? '—'} / Art-Nr ${line.manufacturerArticleNo ?? '—'} / ${line.descriptionIT?.slice(0, 30) ?? '—'}`;
    case 'serial-mismatch':
    case 'sn-insufficient-count':
      return `${pos}: ${line.falmecArticleNo ?? line.manufacturerArticleNo ?? ''} — benoetigt ${line.qty}, zugewiesen ${line.serialNumbers.length}`;
    case 'missing-storage-location':
      return `${pos}: ${line.falmecArticleNo ?? line.manufacturerArticleNo ?? ''} — Lagerort: ${line.storageLocation ?? '(leer)'}`;
    default:
      return `${pos}: ${line.lineId}`;
  }
}

// ── PROJ-45-ADD-ON-round4: ArticleMatchCard ───────────────────────────────
const ARTNO_REGEX = /^1\d{5}$/;

interface ArticleFormData {
  falmecArticleNo: string;
  manufacturerArticleNo: string;
  ean: string;
  serialRequired: boolean;
  storageLocation: string;
  descriptionDE: string;
  supplierId: string;
  orderNumberAssigned: string;
}

function ArticleMatchCard({ line, runId }: { line: InvoiceLine; runId: string }) {
  const { setManualArticleByPosition, globalConfig } = useRunStore();
  const [formData, setFormData] = useState<ArticleFormData>(() => ({
    falmecArticleNo: line.falmecArticleNo ?? '',
    manufacturerArticleNo: line.manufacturerArticleNo ?? '',
    ean: line.ean ?? '',
    serialRequired: line.serialRequired ?? false,
    storageLocation: line.storageLocation ?? '',
    descriptionDE: line.descriptionDE ?? '',
    supplierId: line.supplierId ?? '',
    orderNumberAssigned: line.orderNumberAssigned ?? '',
  }));
  const [saved, setSaved] = useState(false);

  const artNoRegexStr = globalConfig?.matcherProfileOverrides?.artNoDeRegex;
  const artNoRegex = artNoRegexStr
    ? (() => { try { return new RegExp(artNoRegexStr); } catch { return ARTNO_REGEX; } })()
    : ARTNO_REGEX;
  const isValid = artNoRegex.test(formData.falmecArticleNo.trim());

  const update = (field: keyof ArticleFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);  // Hotfix: saved-State zurücksetzen bei Eingabe
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = () => {
    if (!isValid) return;
    setManualArticleByPosition(line.positionIndex, {
      falmecArticleNo: formData.falmecArticleNo.trim(),
      manufacturerArticleNo: formData.manufacturerArticleNo || undefined,
      ean: formData.ean || undefined,
      serialRequired: formData.serialRequired,
      storageLocation: formData.storageLocation || undefined,
      descriptionDE: formData.descriptionDE || undefined,
      supplierId: formData.supplierId || undefined,
      orderNumberAssigned: formData.orderNumberAssigned || undefined,
    }, runId);
    setSaved(true);
  };

  return (
    <div className="rounded-lg border border-slate-200/60 bg-white/30 p-3 space-y-2">
      <p className="text-xs text-muted-foreground font-medium">
        POS {line.positionIndex + 1}:{line.ean ? ` EAN ${line.ean}` : ''}{line.manufacturerArticleNo ? ` / ${line.manufacturerArticleNo}` : ''}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs mb-0.5 block">Artikelnr (Falmec)*</Label>
          <Input
            value={formData.falmecArticleNo}
            onChange={update('falmecArticleNo')}
            placeholder="1XXXXX"
            className={`h-7 text-xs text-white ${!isValid && formData.falmecArticleNo ? 'border-red-400' : ''}`}
          />
          {!isValid && formData.falmecArticleNo && (
            <p className="text-xs text-red-500 mt-0.5">{'Format: ^1\\d{5}$'}</p>
          )}
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">Hersteller-Art-Nr</Label>
          <Input value={formData.manufacturerArticleNo} onChange={update('manufacturerArticleNo')} className="h-7 text-xs text-white" />
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">EAN</Label>
          <Input value={formData.ean} onChange={update('ean')} className="h-7 text-xs text-white" />
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">Bezeichnung (DE)</Label>
          <Input value={formData.descriptionDE} onChange={update('descriptionDE')} className="h-7 text-xs text-white" />
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">S/N-Pflicht</Label>
          <Select
            value={formData.serialRequired ? 'ja' : 'nein'}
            onValueChange={v => {
              setSaved(false);  // Hotfix: saved-State zurücksetzen
              setFormData(prev => ({ ...prev, serialRequired: v === 'ja' }));
            }}
          >
            <SelectTrigger className="h-7 text-xs text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nein">Nein</SelectItem>
              <SelectItem value="ja">Ja</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">Wareneingangslager</Label>
          <Select
            value={formData.storageLocation || undefined}  // Hotfix: kein leerer String für Radix
            onValueChange={v => {
              setSaved(false);  // Hotfix: saved-State zurücksetzen
              setFormData(prev => ({ ...prev, storageLocation: v }));
            }}
          >
            <SelectTrigger className="h-7 text-xs text-white"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              {(STORAGE_LOCATIONS as readonly string[]).map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">Lieferant</Label>
          <Input value={formData.supplierId} onChange={update('supplierId')} className="h-7 text-xs text-white" />
        </div>
        <div>
          <Label className="text-xs mb-0.5 block">Bestellnummer (JJJJ-XXXX)</Label>
          <Input value={formData.orderNumberAssigned} onChange={update('orderNumberAssigned')} className="h-7 text-xs text-white" placeholder="2024-0001" />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          disabled={!isValid}
          onClick={handleSubmit}
          className={`h-7 px-3 text-xs rounded transition-colors ${
            saved
              ? 'bg-green-500 text-white cursor-default'
              : 'bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {saved ? '✓ Übernommen' : 'Übernehmen'}
        </button>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface IssueDialogProps {
  issue: Issue | null;
  onClose: () => void;
}

export function IssueDialog({ issue, onClose }: IssueDialogProps) {
  const {
    issues,
    invoiceLines: allInvoiceLines,
    currentRun,
    resolveIssue,
    escalateIssue,
    splitIssue,
    reopenIssue,
    setManualPriceByPosition,
  } = useRunStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [resolutionNote, setResolutionNote] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const { isCopied, copy } = useCopyToClipboard(2000);

  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;

  const [storedEmails, setStoredEmails] = useState<string[]>([]);

  // PROJ-44-BUGFIX-R3: Load stored emails when dialog opens (useMemo with [] never updated after mount)
  // PROJ-45-ADD-ON: Initialize emailBody — only on issue change, NOT on invoiceLines change
  // (prevents overwriting user edits when a price correction triggers a store mutation)
  useEffect(() => {
    if (issue) {
      setStoredEmails(getStoredEmailAddresses());
      setEmailBody(buildIssueClipboardText(issue, invoiceLines));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue]);

  // PROJ-43: Pending issues for Tab 5
  const pendingIssues = useMemo(
    () => (currentRun
      ? issues.filter(i => i.runId === currentRun.id && i.status === 'pending')
      : issues.filter(i => i.status === 'pending')),
    [issues, currentRun],
  );

  // PROJ-45: Zentraler Resolver — dedupliziert für UI-Anzeige
  const affectedLines = useMemo(
    () => issue ? resolveIssueLines(issue.affectedLineIds ?? [], invoiceLines, true) : [],
    [issue, invoiceLines],
  );

  if (!issue) return null;

  const typeLabel = issueTypeLabels[issue.type] ?? issue.type;
  const effectiveRecipient = selectedEmail || manualEmail;
  const canSendMail = !!effectiveRecipient.trim();

  const handleResolve = () => {
    if (!resolutionNote.trim()) return;
    if (selectedLineIds.length > 0 && selectedLineIds.length < affectedLines.length) {
      splitIssue(issue.id, selectedLineIds, resolutionNote.trim());
    } else {
      resolveIssue(issue.id, resolutionNote.trim());
    }
    onClose();
  };

  const handleSendMail = () => {
    if (!effectiveRecipient.trim()) return;
    const severityLabel = issue.severity === 'error' ? 'Fehler' : issue.severity === 'warning' ? 'Warnung' : 'Info';
    const subject = encodeURIComponent(`[FALMEC-ReceiptPro] ${severityLabel}: ${issue.message}`);
    const body = encodeURIComponent(emailBody);
    const link = `mailto:${encodeURIComponent(effectiveRecipient)}?subject=${subject}&body=${body}`;
    window.location.href = link;
    copy(emailBody);
    escalateIssue(issue.id, effectiveRecipient);
    onClose();
  };

  const handleCopyReport = () => {
    const text = buildIssueClipboardText(issue, invoiceLines);
    copy(text);
  };

  const toggleLine = (lineId: string) => {
    setSelectedLineIds(prev =>
      prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId]
    );
  };

  return (
    <Dialog open={!!issue} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-6xl w-full h-[85vh] max-h-[850px] flex flex-col" style={{ backgroundColor: '#D8E6E7' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SeverityBadge severity={issue.severity} />
            <span className="text-sm font-medium">{typeLabel}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-foreground/80">
            {issue.message}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 overflow-hidden w-full"
        >
          <TabsList
            className="flex flex-row h-10 items-center justify-start bg-[#c9c3b6] border border-border tab-bar-raised w-full p-1 gap-1 mb-4 rounded-md"
          >
            <TabsTrigger value="overview" className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors">
              <Eye className="w-3 h-3" />
              Uebersicht
            </TabsTrigger>
            <TabsTrigger value="report" className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors">
              <FileText className="w-3 h-3" />
              Fehlerbericht
            </TabsTrigger>
            <TabsTrigger value="resolve" className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors">
              <AlertTriangle className="w-3 h-3" />
              Loesung erzwingen
            </TabsTrigger>
            <TabsTrigger value="email" className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors">
              <Mail className="w-3 h-3" />
              E-Mail erzeugen
            </TabsTrigger>
            {pendingIssues.length > 0 && (
              <TabsTrigger value="pending" className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors">
                <Clock className="w-3 h-3" />
                Anfragen ({pendingIssues.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Tab 1: Uebersicht ──────────────────────────────────────── */}
          <TabsContent value="overview" className="flex-1 min-h-0 w-full overflow-y-auto outline-none mt-0 space-y-3">
            {/* Context: expectedValue vs actualValue */}
            {issue.context && (issue.context.expectedValue || issue.context.actualValue) && (
              <div className="rounded border border-border bg-white/30 p-2 text-xs space-y-0.5">
                {issue.context.field && (
                  <p><span className="font-semibold">Feld:</span> {issue.context.field}</p>
                )}
                {issue.context.expectedValue && (
                  <p><span className="font-semibold">Erwartet:</span> {issue.context.expectedValue}</p>
                )}
                {issue.context.actualValue && (
                  <p><span className="font-semibold">Aktuell:</span> {issue.context.actualValue}</p>
                )}
              </div>
            )}

            {/* Affected lines (max 5) */}
            {affectedLines.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Betroffene Positionen (max. 5):</Label>
                <div className="space-y-0.5">
                  {affectedLines.slice(0, 5).map(line => (
                    <p key={line.lineId} className="text-xs font-mono text-foreground">
                      {getLineLabel(issue, line)}
                    </p>
                  ))}
                  {affectedLines.length > 5 && (
                    <p className="text-xs text-muted-foreground">... (+{affectedLines.length - 5} weitere)</p>
                  )}
                </div>
              </div>
            )}

            {/* PROJ-45-ADD-ON-round2: PriceCell prominent (Block 3) — vor Warnung */}
            {issue?.type === 'price-mismatch' && (currentRun?.isExpanded ?? false) && (() => {
              const mismatchLine = affectedLines.find(l => l.priceCheckStatus === 'mismatch');
              if (!mismatchLine) return null;
              return (
                <div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3">
                  <p className="text-sm font-semibold mb-0.5">Preis korrigieren:</p>
                  <p className="text-xs text-muted-foreground mb-2">Waehlen Sie die korrekte Preisquelle</p>
                  <div
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-2 rounded border border-black/60 bg-green-50/40 px-3 py-1.5 cursor-pointer shadow-sm hover:bg-green-100/50 transition-colors"
                    onClick={(e) => {
                      const btn = e.currentTarget.querySelector('button');
                      if (btn && !btn.contains(e.target as Node)) {
                        btn.click();
                      }
                    }}
                  >
                    <PriceCell
                      line={mismatchLine}
                      onSetPrice={(_lineId, price) => {
                        if (currentRun) {
                          setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* PROJ-45-ADD-ON-round4: ArticleMatchForm — nur bei no-article-match */}
            {(issue?.type === 'no-article-match' || issue?.type === 'match-artno-not-found') && currentRun && (() => {
              return (
                <div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold mb-0.5">Artikel manuell zuordnen:</p>
                    <p className="text-xs text-muted-foreground">
                      Fehlende Stammdaten ergänzen. Bekannte Daten sind vorbefüllt.
                    </p>
                  </div>
                  {affectedLines.map(line => (
                    <ArticleMatchCard key={line.lineId} line={line} runId={currentRun.id} />
                  ))}
                </div>
              );
            })()}

            {/* PROJ-45-ADD-ON-round2: Warntext (Block 4) — kompakter, nach PriceCell */}
            {issue?.type === 'price-mismatch' && (
              <div className="rounded border border-orange-300/40 bg-orange-50/5 py-1.5 px-3 text-xs text-orange-700">
                <span className="font-semibold">ACHTUNG:</span> Um Uploadfehler zu vermeiden, muss bei Auswahl
                des Rechnungspreises dieser bereits in Sage ERP hinterlegt sein.
              </div>
            )}

            {/* Escalation info */}
            {issue.status === 'pending' && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50/20 border border-amber-300/30 rounded px-2 py-1">
                <Clock className="w-3 h-3" />
                <span>In Klaerung — Mail an {issue.escalatedTo}</span>
              </div>
            )}

            {/* Quick navigation buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => setActiveTab('email')}
              >
                <Mail className="w-3.5 h-3.5" />
                E-Mail erzeugen
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
                onClick={() => setActiveTab('resolve')}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Loesung erzwingen
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 2: Fehlerbericht ───────────────────────────────────── */}
          <TabsContent value="report" className="flex-1 min-h-0 w-full overflow-y-auto outline-none mt-0 space-y-3">
            <Label className="text-sm font-semibold">Vollstaendiger Fehlerbericht</Label>
            <pre className="text-xs font-mono bg-white/30 rounded border border-border p-2 whitespace-pre-wrap leading-relaxed">
              {buildIssueClipboardText(issue, invoiceLines)}
            </pre>
            {issue.escalatedAt && (
              <div className="text-xs text-muted-foreground">
                Eskaliert am: {new Date(issue.escalatedAt).toLocaleString('de-DE')}
                {issue.escalatedTo && ` an ${issue.escalatedTo}`}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={handleCopyReport}
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {isCopied ? 'Kopiert!' : 'Kopieren'}
            </Button>
          </TabsContent>

          {/* ── Tab 3: Loesung erzwingen ──────────────────────────────── */}
          <TabsContent value="resolve" className="flex-1 min-h-0 w-full outline-none mt-0">
            <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="rounded border border-orange-300/60 bg-orange-50/10 p-2 text-xs text-orange-700">
                <span className="font-semibold">Achtung:</span> Manuelle Loesungen koennen die Sage-ERP-Integritaet beeintraechtigen.
              </div>

              {/* Line selection */}
              {affectedLines.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Zeilen auswaehlen:</Label>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setSelectedLineIds(
                          selectedLineIds.length === affectedLines.length
                            ? []
                            : affectedLines.map(l => l.lineId)
                        )
                      }
                    >
                      {selectedLineIds.length === affectedLines.length ? 'Alle abwaehlen' : 'Alle auswaehlen'}
                    </button>
                  </div>
                  <div className="max-h-[22vh] overflow-y-auto space-y-1 border border-border rounded p-2 bg-white/20">
                    {affectedLines.map(line => (
                      <div key={line.lineId} className="flex items-start gap-2">
                        <Checkbox
                          id={`line-${line.lineId}`}
                          checked={selectedLineIds.includes(line.lineId)}
                          onCheckedChange={() => toggleLine(line.lineId)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={`line-${line.lineId}`}
                          className="text-xs font-mono cursor-pointer leading-snug"
                        >
                          {getLineLabel(issue, line)}
                        </label>
                      </div>
                    ))}
                  </div>
                  {selectedLineIds.length > 0 && selectedLineIds.length < affectedLines.length && (
                    <p className="text-xs text-amber-600">
                      {selectedLineIds.length} von {affectedLines.length} Zeilen ausgewaehlt — Issue wird gesplittet
                    </p>
                  )}
                </div>
              )}

              {/* Resolution note (required) */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Loesungsbeschreibung (Pflichtfeld)</Label>
                <Textarea
                  placeholder="Begruendung fuer die manuelle Loesung..."
                  value={resolutionNote}
                  onChange={e => setResolutionNote(e.target.value)}
                  className="bg-white/40 text-sm"
                  rows={3}
                />
              </div>
            </div>

            <div className="pt-2 shrink-0">
              <Button
                onClick={handleResolve}
                disabled={!resolutionNote.trim()}
                className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Loesung anwenden
              </Button>
            </div>
            </div>
          </TabsContent>

          {/* ── Tab 4: E-Mail erzeugen ────────────────────────────────── */}
          <TabsContent value="email" className="flex-1 min-h-0 w-full outline-none mt-0">
            <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3">
              <Label className="text-sm font-semibold">E-Mail erzeugen</Label>

              {/* Email recipient selection — side by side */}
              <div className="flex gap-3 items-end">
                {storedEmails.length > 0 && (
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Gespeicherte Adressen:</Label>
                    <Select value={selectedEmail} onValueChange={setSelectedEmail}>
                      <SelectTrigger className="bg-white/40 text-sm h-8">
                        <SelectValue placeholder="Empfaenger auswaehlen..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {storedEmails.map(addr => (
                          <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1 flex-1">
                  <Label className="text-xs">
                    {storedEmails.length > 0 ? 'Manuelle Eingabe:' : 'E-Mail-Adresse:'}
                  </Label>
                  <input
                    type="email"
                    className="w-full h-8 rounded border border-border bg-white/40 px-2 text-sm"
                    placeholder="empfaenger@beispiel.de"
                    value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded border border-border bg-white/20 p-2 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground">Vorschau:</p>
                <p className="font-mono truncate">
                  Betreff: [FALMEC-ReceiptPro] {issue.severity === 'error' ? 'Fehler' : issue.severity === 'warning' ? 'Warnung' : 'Info'}: {issue.message}
                </p>
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="text-xs font-mono bg-white/40 whitespace-pre-wrap leading-relaxed mt-1 min-h-[120px]"
                  rows={8}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Die E-Mail wird in Ihrem Standard-Mail-Programm geoeffnet. Der vollstaendige Text
                wird zusaetzlich in die Zwischenablage kopiert. Der Issue-Status wechselt zu &bdquo;In Klaerung&ldquo;.
              </p>

              {isCopied && (
                <p className="text-xs text-green-600">Text in Zwischenablage kopiert.</p>
              )}
            </div>

            <div className="shrink-0 pt-2">
              <Button
                onClick={handleSendMail}
                disabled={!canSendMail}
                className="gap-1 text-xs"
              >
                <Mail className="w-3.5 h-3.5" />
                E-Mail erzeugen
              </Button>
            </div>
            </div>
          </TabsContent>

          {/* ── Tab 5: Anfragen bearbeiten (nur wenn pending issues) ─── */}
          {pendingIssues.length > 0 && (
            <TabsContent value="pending" className="flex-1 min-h-0 w-full overflow-y-auto outline-none mt-0 space-y-3">
              <Label className="text-sm font-semibold">Ausstehende Anfragen</Label>
              <div className="space-y-3">
                {pendingIssues.map(pi => (
                  <div
                    key={pi.id}
                    className="rounded border border-amber-300/40 bg-amber-50/10 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">{pi.message}</p>
                        {pi.escalatedTo && (
                          <p className="text-xs text-muted-foreground">An: {pi.escalatedTo}</p>
                        )}
                        {pi.escalatedAt && (
                          <p className="text-xs text-muted-foreground">
                            Seit: {new Date(pi.escalatedAt).toLocaleString('de-DE')}
                          </p>
                        )}
                      </div>
                      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2"
                        onClick={() => { resolveIssue(pi.id, 'Manuell als geloest markiert'); }}
                      >
                        <Check className="w-3 h-3" />
                        Als geloest markieren
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2"
                        onClick={() => setActiveTab('email')}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Erneut senden
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2 text-muted-foreground"
                        onClick={() => { reopenIssue(pi.id); }}
                      >
                        Zurueck zu Offen
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
