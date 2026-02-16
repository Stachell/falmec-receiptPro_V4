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
        <Table>
          <TableHeader>
            <TableRow className="data-table-header">
              <TableHead className="w-[40px] text-center">#</TableHead>
              <TableHead className="w-[48px]">Checkbox</TableHead>
              <TableHead className="w-[80px]">Artikel-# (DE)</TableHead>
              <TableHead className="w-[160px]">Artikel-# (IT)</TableHead>
              <TableHead className="w-[140px]">EAN</TableHead>
              <TableHead className="min-w-[200px]">Bezeichnung (DE)</TableHead>
              <TableHead className="w-[60px] text-right">Menge</TableHead>
              <TableHead className="w-[120px] text-right">Preis</TableHead>
              <TableHead className="w-[120px]">Bestellung</TableHead>
              <TableHead className="w-[100px]">Lagerort</TableHead>
              <TableHead className="w-[60px]">Serial-#</TableHead>
              <TableHead className="w-[48px]">Details</TableHead>
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
                <TableCell className="font-mono text-muted-foreground text-center">
                  {line.positionIndex + 1}
                </TableCell>

                {/* #2: Checkbox (Match-Status) */}
                <TableCell>
                  <StatusCheckbox
                    status={line.matchStatus}
                    onClick={() => setDetailLine(line)}
                  />
                </TableCell>

                {/* #3: Artikel-# (DE) */}
                <TableCell className="font-mono text-sm">
                  {line.falmecArticleNo ?? <span className="text-muted-foreground">--</span>}
                </TableCell>

                {/* #4: Artikel-# (IT) */}
                <TableCell className="font-mono text-sm">
                  {line.manufacturerArticleNo}
                </TableCell>

                {/* #5: EAN */}
                <TableCell className="font-mono text-sm">
                  {line.ean}
                </TableCell>

                {/* #6: Bezeichnung (DE) */}
                <TableCell>
                  <div className="max-w-[200px]">
                    <div className="text-sm truncate" title={line.descriptionDE ?? line.descriptionIT}>
                      {line.descriptionDE ?? line.descriptionIT}
                    </div>
                    {line.descriptionDE && (
                      <div className="text-xs text-muted-foreground truncate" title={line.descriptionIT}>
                        {line.descriptionIT}
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* #7: Menge */}
                <TableCell className="text-right font-medium">
                  {line.qty}
                </TableCell>

                {/* #8: Preis (dynamic) */}
                <TableCell className="text-right">
                  <PriceCell line={line} onSetPrice={handleSetPrice} />
                </TableCell>

                {/* #9: Bestellung */}
                <TableCell>
                  {line.orderNumberAssigned ? (
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">{line.orderNumberAssigned}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {line.orderAssignmentReason.replace(/-/g, ' ')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-status-soft-fail">Nicht bestellt</span>
                  )}
                </TableCell>

                {/* #10: Lagerort */}
                <TableCell>
                  {line.storageLocation ? (
                    <span className="text-sm">{line.storageLocation.split(';')[0]}</span>
                  ) : (
                    <span className="text-sm text-status-failed">Fehlt</span>
                  )}
                </TableCell>

                {/* #11: Serial-# */}
                <TableCell className="text-sm">
                  {line.serialNumber
                    ? line.serialNumber
                    : line.serialRequired
                      ? <span className="text-muted-foreground">ja</span>
                      : <span className="text-muted-foreground">nein</span>
                  }
                </TableCell>

                {/* #12: Details */}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDetailLine(line)}
                  >
                    <Info className="w-4 h-4" />
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
