import { useState } from 'react';
import { Search, Filter, Info } from 'lucide-react';
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
import { InvoiceLine } from '@/types';

export function ItemsTable() {
  const { invoiceLines } = useRunStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailLine, setDetailLine] = useState<InvoiceLine | null>(null);

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
      (statusFilter === 'missing-location' && !line.storageLocation) ||
      (statusFilter === 'not-ordered' && !line.orderNumberAssigned);

    return matchesSearch && matchesStatus;
  });

  const handleSetPrice = (lineId: string, price: number, source: 'invoice' | 'sage' | 'custom') => {
    // TODO: Wire to store action (Phase B)
    console.log('setPrice', lineId, price, source);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);

  return (
    <div className="enterprise-card">
      {/* Toolbar */}
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-4">
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
              <SelectItem value="missing-location">Ohne Lagerort</SelectItem>
              <SelectItem value="not-ordered">Nicht bestellt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredLines.length} von {invoiceLines.length} Positionen
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="data-table-header">
              <TableHead className="w-9 text-center">#</TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-16">DE</TableHead>
              <TableHead className="w-36">Artikel-# (IT)</TableHead>
              <TableHead className="w-28">EAN</TableHead>
              <TableHead>Bezeichnung (DE)</TableHead>
              <TableHead className="w-12 text-right">Menge</TableHead>
              <TableHead className="w-36 text-right">Preis</TableHead>
              <TableHead className="w-24">Bestellung</TableHead>
              <TableHead className="w-20">Lagerort</TableHead>
              <TableHead className="w-14">SN</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.map((line) => (
              <TableRow
                key={line.lineId}
                className={`hover:bg-muted/30 ${
                  line.positionIndex % 2 === 1 ? 'bg-slate-50/50' : ''
                } ${!line.activeFlag ? 'bg-status-soft-fail/5' : ''}`}
              >
                {/* #1: Position */}
                <TableCell className="font-mono text-xs text-muted-foreground text-center">
                  {line.positionIndex + 1}
                </TableCell>

                {/* #2: Checkbox (Match-Status) */}
                <TableCell className="px-1">
                  <StatusCheckbox
                    status={line.matchStatus}
                    onClick={() => setDetailLine(line)}
                  />
                </TableCell>

                {/* #3: Artikel-# (DE) */}
                <TableCell className="font-mono text-xs truncate">
                  {line.falmecArticleNo ?? <span className="text-muted-foreground">--</span>}
                </TableCell>

                {/* #4: Artikel-# (IT) */}
                <TableCell className="font-mono text-xs truncate" title={line.manufacturerArticleNo}>
                  {line.manufacturerArticleNo}
                </TableCell>

                {/* #5: EAN */}
                <TableCell className="font-mono text-xs truncate" title={line.ean}>
                  {line.ean}
                </TableCell>

                {/* #6: Bezeichnung (DE) */}
                <TableCell>
                  <div className="text-xs truncate" title={line.descriptionDE ?? line.descriptionIT}>
                    {line.descriptionDE ?? line.descriptionIT}
                  </div>
                  {line.descriptionDE && (
                    <div className="text-[11px] text-muted-foreground truncate" title={line.descriptionIT}>
                      {line.descriptionIT}
                    </div>
                  )}
                </TableCell>

                {/* #7: Menge */}
                <TableCell className="text-right text-xs font-medium">
                  {line.qty}
                </TableCell>

                {/* #8: Preis (dynamic) */}
                <TableCell className="text-right">
                  <PriceCell line={line} onSetPrice={handleSetPrice} />
                </TableCell>

                {/* #9: Bestellung */}
                <TableCell>
                  {line.orderNumberAssigned ? (
                    <div>
                      <span className="font-mono text-xs">{line.orderNumberAssigned}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-status-soft-fail">--</span>
                  )}
                </TableCell>

                {/* #10: Lagerort */}
                <TableCell className="text-xs truncate">
                  {line.storageLocation ? (
                    line.storageLocation.split(';')[0]
                  ) : (
                    <span className="text-status-failed">Fehlt</span>
                  )}
                </TableCell>

                {/* #11: Serial-# */}
                <TableCell className="text-xs">
                  {line.serialNumber
                    ? <span className="break-all">{line.serialNumber}</span>
                    : line.serialRequired
                      ? <span className="text-muted-foreground">ja</span>
                      : <span className="text-muted-foreground">nein</span>
                  }
                </TableCell>

                {/* #12: Details */}
                <TableCell className="px-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setDetailLine(line)}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredLines.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          Keine Positionen gefunden.
        </div>
      )}

      {/* Detail Popup */}
      <DetailPopup
        line={detailLine ?? ({} as InvoiceLine)}
        open={detailLine !== null}
        onOpenChange={(open) => { if (!open) setDetailLine(null); }}
      />
    </div>
  );
}
