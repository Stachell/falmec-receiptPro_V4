import { useState } from 'react';
import { Search, Filter, MoreHorizontal, Edit2 } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { PriceStatusChip, StatusChip } from '@/components/StatusChip';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ItemsTable() {
  const { invoiceLines } = useRunStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredLines = invoiceLines.filter(line => {
    const matchesSearch = 
      line.manufacturerArticleNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      line.ean.includes(searchTerm) ||
      line.descriptionIT.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (line.falmecArticleNo?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'price-ok' && line.priceCheckStatus === 'ok') ||
      (statusFilter === 'price-mismatch' && line.priceCheckStatus === 'mismatch') ||
      (statusFilter === 'inactive' && !line.activeFlag) ||
      (statusFilter === 'missing-location' && !line.storageLocation) ||
      (statusFilter === 'not-ordered' && !line.orderNumberAssigned);

    return matchesSearch && matchesStatus;
  });

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);

  return (
    <div className="enterprise-card">
      {/* Toolbar */}
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Artikelnummer, EAN, Beschreibung..."
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
              <SelectItem value="price-ok">Preis OK</SelectItem>
              <SelectItem value="price-mismatch">Preisabweichung</SelectItem>
              <SelectItem value="inactive">Inaktive Artikel</SelectItem>
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
              <TableHead className="w-12">#</TableHead>
              <TableHead>Artikelnummer (IT)</TableHead>
              <TableHead>EAN</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead className="text-right">Menge</TableHead>
              <TableHead className="text-right">Preis (Rechnung)</TableHead>
              <TableHead className="text-right">Preis (Sage)</TableHead>
              <TableHead>Preis-Status</TableHead>
              <TableHead>Bestellung</TableHead>
              <TableHead>Lagerort</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.map((line, index) => (
              <TableRow 
                key={line.lineId} 
                className={`hover:bg-muted/30 ${!line.activeFlag ? 'bg-status-soft-fail/5' : ''}`}
              >
                <TableCell className="font-mono text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-sm">{line.manufacturerArticleNo}</span>
                    {line.falmecArticleNo && (
                      <span className="text-xs text-muted-foreground">
                        DE: {line.falmecArticleNo}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">{line.ean}</TableCell>
                <TableCell>
                  <div className="max-w-[200px]">
                    <div className="text-sm truncate" title={line.descriptionIT}>
                      {line.descriptionIT}
                    </div>
                    {line.descriptionDE && (
                      <div className="text-xs text-muted-foreground truncate" title={line.descriptionDE}>
                        {line.descriptionDE}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {line.qty}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPrice(line.unitPriceInvoice)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {line.unitPriceSage !== null ? formatPrice(line.unitPriceSage) : '—'}
                </TableCell>
                <TableCell>
                  <PriceStatusChip status={line.priceCheckStatus} />
                </TableCell>
                <TableCell>
                  {line.orderNumberAssigned ? (
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">{line.orderNumberAssigned}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {line.orderAssignmentReason.replace('-', ' ')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-status-soft-fail">Nicht bestellt</span>
                  )}
                </TableCell>
                <TableCell>
                  {line.storageLocation ? (
                    <span className="text-sm">{line.storageLocation.split(';')[0]}</span>
                  ) : (
                    <span className="text-sm text-status-failed">Fehlt</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover">
                      <DropdownMenuItem className="gap-2">
                        <Edit2 className="w-4 h-4" />
                        Bearbeiten
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
    </div>
  );
}
