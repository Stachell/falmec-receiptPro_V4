import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Info, Barcode, Type, ChevronsDown, ChevronsUp } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusCheckbox } from './StatusCheckbox';
import { PriceCell } from './PriceCell';
import { DetailPopup } from './DetailPopup';
import { ManualOrderPopup } from './ManualOrderPopup';
import { InvoiceLine } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ItemsTable() {
  const { invoiceLines: allInvoiceLines, highlightedLineIds, scrollToLineId, currentRun } = useRunStore();
  // HOTFIX-1: Filter lines to current run only (prevents cross-run data leak)
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailLine, setDetailLine] = useState<InvoiceLine | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsedHeightPx, setCollapsedHeightPx] = useState(400);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const toggleContainerRef = useRef<HTMLDivElement | null>(null);

  // PROJ-21: Scroll to highlighted row when navigating from IssuesCenter
  useEffect(() => {
    if (!scrollToLineId) return;
    // If table is collapsed, expand first and let DOM update
    if (!expanded) {
      setExpanded(true);
      // Wait for DOM re-render after expand, then scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`row-${scrollToLineId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    } else {
      requestAnimationFrame(() => {
        const el = document.getElementById(`row-${scrollToLineId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [scrollToLineId, expanded]);

  const filteredLines = invoiceLines.filter(line => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      line.manufacturerArticleNo.toLowerCase().includes(term) ||
      line.ean.includes(searchTerm) ||
      line.descriptionIT.toLowerCase().includes(term) ||
      (line.falmecArticleNo?.toLowerCase().includes(term)) ||
      (line.descriptionDE?.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'full-match' && line.matchStatus === 'full-match') ||
      (statusFilter === 'partial-match' && (line.matchStatus === 'code-it-only' || line.matchStatus === 'ean-only')) ||
      (statusFilter === 'no-match' && line.matchStatus === 'no-match') ||
      (statusFilter === 'pending' && line.matchStatus === 'pending') ||
      (statusFilter === 'price-mismatch' && line.priceCheckStatus === 'mismatch') ||
      (statusFilter === 'price-missing' && line.priceCheckStatus === 'missing') ||
      (statusFilter === 'not-ordered' && !line.orderNumberAssigned);

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    const updateCollapsedHeight = () => {
      const containerTop = tableContainerRef.current?.getBoundingClientRect().top;
      const toggleHeight = toggleContainerRef.current?.getBoundingClientRect().height ?? 0;

      if (typeof containerTop !== 'number' || Number.isNaN(containerTop)) {
        setCollapsedHeightPx(400);
        return;
      }

      const nextHeight = Math.max(260, Math.floor(window.innerHeight - containerTop - toggleHeight - 8));
      setCollapsedHeightPx(Number.isFinite(nextHeight) ? nextHeight : 400);
    };

    const rafId = window.requestAnimationFrame(updateCollapsedHeight);
    window.addEventListener('resize', updateCollapsedHeight);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateCollapsedHeight);
    };
  }, [expanded, filteredLines.length]);

  // PROJ-22 B2: readOnly for ItemsTable — Preis is READ-ONLY here
  const handleSetPrice = (_lineId: string, _price: number, _source: 'invoice' | 'sage' | 'custom') => {
    // No-op: Price editing is READ-ONLY in Artikelliste (only active in RE-Positionen)
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);

  return (
    <div className="enterprise-card">
      {/* PROJ-22 B2: Toolbar — Suchleiste links, "Einzelartikel Listung" rechts */}
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-4">
        {/* Left: search + filter */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Artikelnummer, EAN, Bezeichnung..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-surface-elevated"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-surface-elevated">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle anzeigen</SelectItem>
              <SelectItem value="full-match">Match</SelectItem>
              <SelectItem value="partial-match">Teilmatch</SelectItem>
              <SelectItem value="no-match">Kein Match</SelectItem>
              <SelectItem value="pending">Ausstehend</SelectItem>
              <SelectItem value="price-mismatch">Preisabweichung</SelectItem>
              <SelectItem value="price-missing">Preis fehlt</SelectItem>
              <SelectItem value="not-ordered">Nicht bestellt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredLines.length} von {invoiceLines.length} Positionen
        </div>
        {/* Right: label (matches RE-Positionen title + subtitle typography) */}
        <div className="ml-auto text-right">
          <h3 className="text-2xl font-semibold leading-none tracking-tight">
            Artikel Liste
          </h3>
          <p className="text-sm text-muted-foreground">
            /article list ({invoiceLines.length})
          </p>
        </div>
      </div>

      {/* Table — collapsible with sticky header */}
      <div
        ref={tableContainerRef}
        className={`overflow-x-auto transition-all duration-500 ease-in-out ${
          expanded ? 'overflow-y-hidden' : 'overflow-y-auto'
        }`}
        style={expanded ? { maxHeight: 'none' } : { maxHeight: `${collapsedHeightPx}px` }}
      >
        {/* PROJ-22 B2: Unified column order matching InvoicePreview
            1. Info-Icon | 2. Pos | 3. Match-Status | 4. Art.-Nr. | 5. Herstellerartikelnr.
            | 6. EAN | 7. Bezeichnung | 8. Menge | 9. Preis (READ-ONLY) | 10. SN | 11. Bestellung */}
        <Table className="table-fixed w-full">
          {/* PROJ-22 B1: sticky header */}
          <TableHeader className={expanded ? 'bg-card' : 'sticky top-0 z-10 bg-card'}>
            <TableRow className="data-table-header">
              <TableHead className="w-16 text-center">DETAILS</TableHead>
              <TableHead className="w-9 text-center">#</TableHead>
              <TableHead className="w-20">ARTIKEL</TableHead>
              <TableHead className="w-[8ch] whitespace-nowrap">- MATCH</TableHead>
              <TableHead className="w-36">BESTELLNUMMER</TableHead>
              <TableHead className="w-28">EAN</TableHead>
              <TableHead>BEZEICHNUNG</TableHead>
              <TableHead className="w-12 text-right">MENGE</TableHead>
              <TableHead className="w-36 text-right">PREIS</TableHead>
              <TableHead className="w-[120px]">SN / SERIAL</TableHead>
              <TableHead className="w-24">BESTELLUNG</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.map((line) => (
              <TableRow
                key={line.lineId}
                id={`row-${line.lineId}`}
                className={`hover:bg-muted/30 ${
                  line.positionIndex % 2 === 1 ? 'bg-slate-50/50' : ''
                } ${!line.activeFlag ? 'bg-status-soft-fail/5' : ''} ${
                  highlightedLineIds.includes(line.lineId)
                    ? 'ring-2 ring-amber-400/60 bg-amber-500/10 transition-all duration-300'
                    : ''
                }`}
              >
                {/* Col 1: Info-Icon (moved to first — PROJ-22 B2) */}
                <TableCell className="px-1 text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => { setDetailLine(line); setDetailOpen(true); }}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>

                {/* Col 2: Pos */}
                <TableCell className="font-mono text-xs text-muted-foreground text-center">
                  {line.positionIndex}
                </TableCell>

                {/* Col 3: Art.-Nr. (DE) = falmecArticleNo — renamed from "Art-# (DE)" */}
                <TableCell className="font-mono text-xs truncate">
                  <div className="flex items-center gap-1">
                    {line.matchStatus === 'ean-only' && (
                      <Barcode className="w-3 h-3 text-orange-400 flex-shrink-0" title="EAN-Match" />
                    )}
                    {(line.matchStatus === 'code-it-only' || line.matchStatus === 'full-match') && (
                      <Type className="w-3 h-3 text-green-500 flex-shrink-0" title="ArtNo-Match" />
                    )}
                    <span className="truncate">
                      {line.falmecArticleNo ?? <span className="text-muted-foreground">--</span>}
                    </span>
                  </div>
                </TableCell>

                {/* Col 4: Match-Status checkbox */}
                <TableCell className="px-1 text-center">
                  <div className="flex justify-center">
                    <StatusCheckbox
                      status={line.matchStatus}
                      onClick={() => setDetailLine(line)}
                    />
                  </div>
                </TableCell>

                {/* Col 5: Herstellerartikelnr. (renamed from "Art-# (IT)") */}
                <TableCell className="font-mono text-xs truncate" title={line.manufacturerArticleNo}>
                  {line.manufacturerArticleNo}
                </TableCell>

                {/* Col 6: EAN */}
                <TableCell className="font-mono text-xs truncate" title={line.ean}>
                  {line.ean}
                </TableCell>

                {/* Col 7: Bezeichnung — dynamic width, truncate by available space */}
                <TableCell className="min-w-0">
                  <div
                    className="text-xs truncate w-full"
                    title={line.descriptionDE ?? line.descriptionIT}
                  >
                    {line.descriptionDE ?? line.descriptionIT}
                  </div>
                  {line.descriptionDE && (
                    <div
                      className="text-[11px] text-muted-foreground truncate w-full"
                      title={line.descriptionIT}
                    >
                      {line.descriptionIT}
                    </div>
                  )}
                </TableCell>

                {/* Col 8: Menge */}
                <TableCell className="text-right text-xs font-medium">
                  {line.qty}
                </TableCell>

                {/* Col 9: Preis — READ-ONLY in Artikelliste (PROJ-22 B2) */}
                <TableCell className="text-right">
                  <PriceCell line={line} onSetPrice={handleSetPrice} readOnly />
                </TableCell>

                {/* Col 10: SN status */}
                <TableCell className="text-xs whitespace-nowrap">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    {/* S/N Status Square */}
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-block w-3 h-3 rounded-sm flex-shrink-0 border"
                            style={{
                              backgroundColor: !line.serialRequired
                                ? '#000000'
                                : line.serialNumber
                                  ? '#22C55E'
                                  : '#E5E7EB',
                              borderColor: !line.serialRequired
                                ? '#000000'
                                : line.serialNumber
                                  ? '#16A34A'
                                  : '#9CA3AF',
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {!line.serialRequired
                            ? 'Keine S/N-Pflicht'
                            : line.serialNumber
                              ? `${line.serialNumber} (${line.serialSource})`
                              : 'S/N ausstehend'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {/* S/N Text */}
                    {line.serialRequired && line.serialNumber ? (
                      <span className="font-mono whitespace-nowrap">{line.serialNumber}</span>
                    ) : null}
                  </div>
                </TableCell>

                {/* Col 11: Bestellung — last position (PROJ-22 B2); ACTIVE when run.isExpanded */}
                <TableCell>
                  {currentRun?.isExpanded ? (
                    <ManualOrderPopup line={line} />
                  ) : line.orderNumberAssigned ? (
                    <span className="font-mono text-xs">{line.orderNumberAssigned}</span>
                  ) : (
                    <span className="text-xs text-status-soft-fail">--</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* PROJ-22 B1: Expand / Collapse Toggle — 25% groesser (w-6 h-6) */}
      {filteredLines.length > 0 && (
        <div ref={toggleContainerRef} className="flex justify-center items-center h-[50px] border-t border-border/40 sticky bottom-0 bg-card">
          <button
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Einklappen' : 'Ausklappen'}
          >
            {expanded ? (
              <ChevronsUp className="w-7 h-7 text-muted-foreground/85" />
            ) : (
              <ChevronsDown className="w-7 h-7 animate-[pulse_1.1s_ease-in-out_infinite] text-muted-foreground/75" />
            )}
          </button>
        </div>
      )}

      {filteredLines.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          Keine Positionen gefunden.
        </div>
      )}

      {/* Detail Popup */}
      {/* Crash-Fix: detailLine is NOT cleared on close — it stays until the next open.
          This prevents shadcn Dialog's exit-animation frame from rendering with an empty object,
          which caused runtime errors when FIELDS accessors ran on {} as InvoiceLine. */}
      <DetailPopup
        line={detailLine ?? ({} as InvoiceLine)}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
