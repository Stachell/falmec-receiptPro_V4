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
  DialogFooter,
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
  'match-ambiguous': 'Mehrdeutige Artikelzuordnung',
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
      return `${pos}: ${line.falmecArticleNo ?? line.manufacturerArticleNo ?? ''} — PDF-Rechnung ${(line.unitPriceInvoice ?? 0).toFixed(2)} EUR vs. Sage ERP ${(line.unitPriceSage ?? 0).toFixed(2)} EUR`;
    case 'no-article-match':
    case 'match-artno-not-found':
    case 'match-ean-not-found':
    case 'match-ambiguous':
      return `${pos}: EAN ${line.ean ?? '—'} / Art-Nr ${line.manufacturerArticleNo ?? '—'} / ${line.descriptionIT ?? '—'}`;
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
  unitPriceSage: string;         // PROJ-45-R5: String wegen Input (parseFloat bei Submit)
  quantity: number;              // PROJ-45-R5: Zahl, min=1
  serialNumbers: string[];       // PROJ-45-R5: Array für S/N-Pop-up
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
    unitPriceSage: line.unitPriceSage != null ? String(line.unitPriceSage) : '',  // PROJ-45-R5
    quantity: line.qty ?? 1,                                                       // PROJ-45-R5
    serialNumbers: line.serialNumbers?.length ? [...line.serialNumbers] : [],      // PROJ-45-R5
  }));
  const [saved, setSaved] = useState(false);
  const [showSerialDialog, setShowSerialDialog] = useState(false);  // PROJ-45-R5

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

    // PROJ-45-R5: S/N bereinigen — slice auf quantity, trim, leere rauswerfen
    const cleanedSerials = formData.serialNumbers
      .slice(0, formData.quantity)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    setManualArticleByPosition(line.positionIndex, {
      falmecArticleNo: formData.falmecArticleNo.trim(),
      manufacturerArticleNo: formData.manufacturerArticleNo || undefined,
      ean: formData.ean || undefined,
      serialRequired: formData.serialRequired,
      storageLocation: formData.storageLocation || undefined,
      descriptionDE: formData.descriptionDE || undefined,
      supplierId: formData.supplierId || undefined,
      orderNumberAssigned: formData.orderNumberAssigned || undefined,
      unitPriceSage: formData.unitPriceSage ? parseFloat(formData.unitPriceSage) : undefined,  // PROJ-45-R5
      quantity: formData.quantity,                                                               // PROJ-45-R5
      serialNumbers: cleanedSerials.length > 0 ? cleanedSerials : undefined,                   // PROJ-45-R5
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
        {/* PROJ-45-R5: Sage ERP Preis */}
        <div>
          <Label className="text-xs mb-0.5 block">Sage ERP Preis (Netto)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.unitPriceSage}
            onChange={(e) => {
              setSaved(false);
              setFormData(prev => ({ ...prev, unitPriceSage: e.target.value }));
            }}
            placeholder="0.00"
            className="h-7 text-xs text-white"
          />
        </div>
        {/* PROJ-45-R5: Menge Stepper */}
        <div>
          <Label className="text-xs mb-0.5 block">Menge</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={formData.quantity}
            onChange={(e) => {
              setSaved(false);
              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
              setFormData(prev => ({
                ...prev,
                quantity: val,
                // PROJ-45-R5: Überschüssige S/N abschneiden wenn Menge reduziert wird
                serialNumbers: prev.serialNumbers.slice(0, val),
              }));
            }}
            className="h-7 w-20 text-xs text-white"
          />
        </div>
      </div>
      {/* PROJ-45-R5: Serial eintragen Button */}
      {formData.serialRequired && (
        <div>
          <button
            type="button"
            onClick={() => setShowSerialDialog(true)}
            className="h-7 px-3 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Serial eintragen ({formData.serialNumbers.filter(s => s.trim()).length}/{formData.quantity})
          </button>
        </div>
      )}
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

      {/* PROJ-45-R5: S/N-Pop-up-Dialog — KEIN text-white (weißer shadcn bg-background)! */}
      <Dialog open={showSerialDialog} onOpenChange={setShowSerialDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-foreground">
              Seriennummern eintragen ({formData.quantity} Stück)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto py-2">
            {Array.from({ length: formData.quantity }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Label className="text-xs w-8 shrink-0">#{i + 1}</Label>
                <Input
                  value={formData.serialNumbers[i] ?? ''}
                  onChange={(e) => {
                    setSaved(false);
                    setFormData(prev => {
                      const updated = [...prev.serialNumbers];
                      while (updated.length <= i) updated.push('');
                      updated[i] = e.target.value;
                      return { ...prev, serialNumbers: updated };
                    });
                  }}
                  placeholder="z.B. K25645407008K"
                  className="h-7 text-xs text-foreground"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowSerialDialog(false)}
              className="h-7 px-3 text-xs rounded bg-teal-600 text-white hover:bg-teal-700"
            >
              Übernehmen
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    reopenIssue,
    setManualPriceByPosition,
    refreshIssues,
    confirmManualFix,
  } = useRunStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [resolutionNote, setResolutionNote] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);  // PROJ-48-ADD-ON
  const { isCopied, copy } = useCopyToClipboard(2000);

  // PROJ-44-ADD-ON-R7: Pending-Preis für Bestätigungs-Workflow
  const [pendingPrice, setPendingPrice] = useState<{
    positionIndex: number;
    price: number;
    lineLabel: string;
  } | null>(null);

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
    // PROJ-44-ADD-ON-R7: Pending-Preis zurücksetzen bei Issue-Wechsel (Ghost-Value-Schutz)
    setPendingPrice(null);
    // PROJ-44-R9: Vollständiger State-Reset bei Issue-Wechsel (Ghost-State-Fix)
    setActiveTab('overview');
    setResolutionNote('');
    setSelectedEmail('');
    setManualEmail('');
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
    resolveIssue(issue.id, resolutionNote.trim());
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

  return (
    <Dialog open={!!issue} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-6xl w-full h-[85vh] max-h-[850px] flex flex-col"
        style={{ backgroundColor: '#D8E6E7' }}
        onInteractOutside={(e) => e.preventDefault()}
      >
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

            {/* Affected line */}
            {affectedLines.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Betroffene Position:</Label>
                <p className="text-xs font-mono text-foreground">
                  {getLineLabel(issue, affectedLines[0])}
                </p>
              </div>
            )}

            {/* PROJ-45-ADD-ON-round2: PriceCell prominent (Block 3) — vor Warnung */}
            {issue?.type === 'price-mismatch' && (() => {
              // PROJ-46: Auch custom+draft matchen (nach Preiswahl bleibt PriceCell sichtbar)
              const mismatchLine = affectedLines.find(l =>
                l.priceCheckStatus === 'mismatch' ||
                (l.priceCheckStatus === 'custom' && l.manualStatus === 'draft')
              );
              if (!mismatchLine) return null;
              return (
                <div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3">
                  <p className="text-sm font-semibold mb-0.5">Preis korrigieren:</p>
                  <p className="text-xs text-muted-foreground mb-2">Waehlen Sie die korrekte Preisquelle</p>
                  <div
                    className="inline-flex items-center gap-2 rounded border border-black/60 bg-green-50/40 px-3 py-1.5 shadow-sm cursor-pointer hover:bg-green-100/60 transition-colors"
                    onClick={(e) => {
                      // Klick auf Container → inneren Popover-Trigger oeffnen
                      const btn = (e.currentTarget as HTMLElement).querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement | null;
                      if (btn && !(e.target as HTMLElement).closest('button')) btn.click();
                    }}
                  >
                    <PriceCell
                      line={mismatchLine}
                      onSetPrice={(_lineId, price) => {
                        // PROJ-46: Sofort als Draft in Store schreiben (Issue bleibt offen)
                        if (currentRun) {
                          setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* PROJ-45-ADD-ON-round4: ArticleMatchForm — nur bei no-article-match / match-ambiguous */}
            {(issue?.type === 'no-article-match' || issue?.type === 'match-artno-not-found' || issue?.type === 'match-ambiguous') && currentRun && (() => {
              const candidates = issue?.context?.candidates;
              const isAmbiguous = issue?.type === 'match-ambiguous' && candidates && candidates.length > 1;
              return (
                <div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold mb-0.5">
                      {isAmbiguous ? 'Artikel auswählen:' : 'Artikel manuell zuordnen:'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAmbiguous
                        ? `${candidates!.length} Artikel mit gleicher Kennung im Stamm. Bitte den korrekten Artikel auswählen.`
                        : 'Fehlende Stammdaten ergänzen. Bekannte Daten sind vorbefüllt.'}
                    </p>
                  </div>
                  {/* PROJ-48-ADD-ON: Candidate picker for ambiguous matches */}
                  {isAmbiguous && (
                    <div className="space-y-1.5">
                      {candidates!.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (affectedLines.length > 0) {
                              const { setManualArticleByPosition } = useRunStore.getState();
                              setManualArticleByPosition(affectedLines[0].positionIndex, {
                                falmecArticleNo: c.falmecArticleNo,
                                manufacturerArticleNo: c.manufacturerArticleNo || undefined,
                                ean: c.ean || undefined,
                                serialRequired: c.serialRequirement ?? false,
                                storageLocation: c.storageLocation || undefined,
                                descriptionDE: c.descriptionDE || undefined,
                                supplierId: c.supplierId || undefined,
                                unitPriceSage: c.unitPriceNet ?? undefined,
                              }, currentRun!.id);
                              setSelectedCandidateId(c.id);
                            }
                          }}
                          className={`w-full text-left rounded-md border transition-colors p-2 space-y-0.5 ${
                            selectedCandidateId === c.id
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300'
                              : 'border-slate-300/60 bg-white/50 hover:bg-teal-50 hover:border-teal-400'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800">
                              {selectedCandidateId === c.id && <Check className="inline-block w-3.5 h-3.5 text-blue-600 mr-1" />}
                              {c.falmecArticleNo}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {selectedCandidateId === c.id ? <span className="text-blue-600 font-medium">Manuell zugewiesen</span> : (c.ean || '—')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 truncate">{c.descriptionDE || c.manufacturerArticleNo || '—'}</p>
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            <span>Herst-ArtNr: {c.manufacturerArticleNo || '—'}</span>
                            <span>Lager: {c.storageLocation || '—'}</span>
                            <span>Preis: {c.unitPriceNet != null ? `${c.unitPriceNet.toFixed(2)} €` : '—'}</span>
                            <span>S/N: {c.serialRequirement ? 'Ja' : 'Nein'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Standard manual form (also shown for ambiguous after selection as fallback) */}
                  {!isAmbiguous && affectedLines.length > 0 && (
                    <ArticleMatchCard line={affectedLines[0]} runId={currentRun.id} />
                  )}
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

          {/* ── Tab 3: Loesung erzwingen (PROJ-46 Redesign) ──────────── */}
          <TabsContent value="resolve" className="flex-1 min-h-0 w-full outline-none mt-0">
            <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="rounded border border-orange-300/60 bg-orange-50/10 p-2 text-xs text-orange-700">
                <span className="font-semibold">Achtung:</span> Manuelle Loesungen koennen die Sage-ERP-Integritaet beeintraechtigen.
              </div>

              {/* PROJ-46: Readonly-Zusammenfassung — Preisabweichung (liest aus Store-Draft) */}
              {issue.type === 'price-mismatch' && (() => {
                const draftLine = affectedLines.find(l => l.priceCheckStatus === 'custom' && l.manualStatus === 'draft');
                if (!draftLine) return null;
                return (
                  <div className="rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-1">
                    <p className="text-sm font-semibold text-teal-800">
                      Preiskorrektur bestaetigen
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Folgende Werte werden bei Klick auf &bdquo;Loesung anwenden&ldquo; persistent geschrieben:
                    </p>
                    <div className="flex items-center gap-3 rounded border border-teal-300/50 bg-white/40 px-3 py-2">
                      <span className="text-xs font-mono text-foreground">{getLineLabel(issue, draftLine)}</span>
                      <span className="ml-auto text-sm font-bold text-teal-700">
                        {draftLine.unitPriceFinal?.toFixed(2) ?? '—'} EUR
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* PROJ-46: Readonly-Zusammenfassung — Artikel-Issues */}
              {(issue.type === 'no-article-match' || issue.type === 'match-artno-not-found' || issue.type === 'match-ean-not-found') && affectedLines.length > 0 && (
                <div className="rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-2">
                  <p className="text-sm font-semibold text-teal-800">
                    Artikeldaten bestaetigen
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Folgende Werte werden bei Klick auf &bdquo;Loesung anwenden&ldquo; persistent geschrieben:
                  </p>
                  {affectedLines.map(line => (
                    <div key={line.lineId} className="text-xs space-y-0.5 border border-teal-300/50 bg-white/40 rounded p-2">
                      <div className="grid grid-cols-[140px_1fr] gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-teal-800">Position:</span>
                        <span>{line.positionIndex + 1}</span>
                        <span className="font-semibold text-teal-800">Falmec Art-Nr:</span>
                        <span className="font-mono">{line.falmecArticleNo ?? '—'}</span>
                        <span className="font-semibold text-teal-800">Hersteller-Nr:</span>
                        <span className="font-mono">{line.manufacturerArticleNo ?? '—'}</span>
                        <span className="font-semibold text-teal-800">EAN:</span>
                        <span className="font-mono">{line.ean ?? '—'}</span>
                        <span className="font-semibold text-teal-800">Bezeichnung (DE):</span>
                        <span>{line.descriptionDE ?? '—'}</span>
                        <span className="font-semibold text-teal-800">S/N-Pflicht:</span>
                        <span>{line.serialRequired ? 'Ja' : 'Nein'}</span>
                        <span className="font-semibold text-teal-800">Lagerort:</span>
                        <span>{line.storageLocation ?? '—'}</span>
                        <span className="font-semibold text-teal-800">Lieferant:</span>
                        <span>{line.supplierId ?? '—'}</span>
                        <span className="font-semibold text-teal-800">Sage ERP Preis:</span>
                        <span>{line.unitPriceSage != null ? `${line.unitPriceSage.toFixed(2)} EUR` : '—'}</span>
                        <span className="font-semibold text-teal-800">Menge:</span>
                        <span>{line.qty}</span>
                        {line.serialRequired && line.serialNumbers.length > 0 && (
                          <>
                            <span className="font-semibold text-teal-800">Seriennummern:</span>
                            <span className="font-mono">{line.serialNumbers.join(', ')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* PROJ-46: Readonly-Zusammenfassung — Sonstige Issue-Types (generisch) */}
              {!['price-mismatch', 'no-article-match', 'match-artno-not-found', 'match-ean-not-found'].includes(issue.type) && affectedLines.length > 0 && (
                <div className="rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-1">
                  <p className="text-sm font-semibold text-teal-800">Betroffene Positionen</p>
                  <pre className="text-xs font-mono bg-white/30 rounded p-2 whitespace-pre-wrap leading-relaxed">
                    {affectedLines.map(l => formatLineForDisplay(l)).join('\n')}
                  </pre>
                </div>
              )}

              {/* Resolution note (optional) */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Loesungsbeschreibung (optional)</Label>
                <Textarea
                  placeholder="Optionale Begruendung fuer die manuelle Loesung..."
                  value={resolutionNote}
                  onChange={e => setResolutionNote(e.target.value)}
                  className="bg-white/40 text-sm"
                  rows={2}
                />
              </div>
            </div>

            <div className="pt-2 shrink-0">
              <Button
                disabled={!affectedLines.some(l => l.manualStatus === 'draft')}
                onClick={() => {
                  if (!currentRun) return;
                  // PROJ-46: confirmManualFix → draft→confirmed + resolve + refresh
                  confirmManualFix(issue.id, resolutionNote || undefined);
                  onClose();
                }}
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
                        onClick={() => { resolveIssue(pi.id, 'Manuell als geloest markiert'); onClose(); }}
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
                        className="gap-1 text-xs h-7 px-2"
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
