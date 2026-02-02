import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { useRunStore } from '@/store/runStore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
const Index = () => {
  const { runs } = useRunStore();
  return <AppLayout>
      <div className="pt-3 pb-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-6 text-xs" style={{ color: '#D9D4C7' }}>
            Konsolidierung | Eingangskontrolle | Bestellnummer Routing | Serienummern Parsing | Lagerplatzzuordnung | Rechnungsprüfung | Exporterstellung für Sage100 Belegimport | Archiv | Logs | Datenanpassung
          </p>
          <h1 className="text-2xl font-bold" style={{ color: '#D8E6E7' }}>
            Dashboard Wareneingang
          </h1>
        </div>

        {/* Runs Table */}
        <div className="enterprise-card">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              Dasboard Archiv 
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead>Zeitstempel</TableHead>
                <TableHead>Fattura</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Export</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map(run => {
              const totalIssues = run.steps.reduce((acc, step) => acc + step.issuesCount, 0);
              return <TableRow key={run.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      {format(new Date(run.createdAt), 'dd.MM.yyyy HH:mm', {
                    locale: de
                  })}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{run.invoice.fattura}</span>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={run.status} />
                    </TableCell>
                    <TableCell>
                      {totalIssues > 0 ? <span className="flex items-center gap-1.5 text-status-soft-fail">
                          <AlertTriangle className="w-4 h-4" />
                          {totalIssues}
                        </span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {run.stats.exportReady ? <span className="text-status-ok text-sm">Bereit</span> : <span className="text-muted-foreground text-sm">Ausstehend</span>}
                    </TableCell>
                    <TableCell>
                      <Link to={`/run/${run.id}`}>
                        <Button variant="ghost" size="icon">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>;
            })}
              {runs.length === 0 && <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Keine Verarbeitungsläufe vorhanden. Starten Sie einen neuen Lauf.
                  </TableCell>
                </TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>;
};
export default Index;