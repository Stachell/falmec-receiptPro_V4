import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Filter, ExternalLink, Download } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { SeverityBadge, StatusChip } from '@/components/StatusChip';
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
import { Issue } from '@/types';

const issueTypeLabels: Record<string, string> = {
  'order-assignment': 'Bestellzuordnung',
  'serial-mismatch': 'Seriennummer-Fehler',
  'price-mismatch': 'Preisabweichung',
  'inactive-article': 'Inaktiver Artikel',
  'missing-storage-location': 'Fehlender Lagerort',
  'missing-ean': 'Fehlende EAN',
};

export function IssuesCenter() {
  const { issues, resolveIssue } = useRunStore();
  const [stepFilter, setStepFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const filteredIssues = issues.filter(issue => {
    return (
      (stepFilter === 'all' || issue.stepNo.toString() === stepFilter) &&
      (severityFilter === 'all' || issue.severity === severityFilter) &&
      (typeFilter === 'all' || issue.type === typeFilter)
    );
  });

  const openIssues = filteredIssues.filter(i => i.status === 'open');
  const resolvedIssues = filteredIssues.filter(i => i.status === 'resolved');

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
      ...issues.map(issue => [
        issue.id,
        issue.severity,
        issue.stepNo,
        issue.type,
        `"${issue.message}"`,
        `"${issue.details}"`,
        issue.status
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'issues-report.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="enterprise-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
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
              <SelectItem value="6">Schritt 6</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px] bg-surface-elevated">
              <SelectValue placeholder="Schweregrad" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="blocking">Blockierend</SelectItem>
              <SelectItem value="soft-fail">Warnung</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-surface-elevated">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle Typen</SelectItem>
              {Object.entries(issueTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
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
          <span className="text-lg font-semibold">{openIssues.length}</span>
          <span className="text-muted-foreground">Offen</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-status-ok" />
          <span className="text-lg font-semibold">{resolvedIssues.length}</span>
          <span className="text-muted-foreground">Gelöst</span>
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-3">
        {openIssues.length === 0 && resolvedIssues.length === 0 ? (
          <div className="enterprise-card p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-status-ok mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Keine Issues</h3>
            <p className="text-muted-foreground mt-1">
              Alle Validierungen wurden erfolgreich abgeschlossen.
            </p>
          </div>
        ) : (
          <>
            {openIssues.map((issue) => (
              <div 
                key={issue.id} 
                className="enterprise-card p-4 border-l-4 border-l-status-soft-fail"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <SeverityBadge severity={issue.severity} />
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        Schritt {issue.stepNo}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {issueTypeLabels[issue.type]}
                      </span>
                    </div>
                    <h4 className="font-medium text-foreground mb-1">
                      {issue.message}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {issue.details}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1"
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Lösen
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {resolvedIssues.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Gelöste Issues ({resolvedIssues.length})
                </h3>
                {resolvedIssues.map((issue) => (
                  <div 
                    key={issue.id} 
                    className="enterprise-card p-4 opacity-60 mb-3"
                  >
                    <div className="flex items-start gap-4">
                      <CheckCircle2 className="w-5 h-5 text-status-ok flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-foreground line-through">
                          {issue.message}
                        </h4>
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
            <DialogTitle>Issue lösen</DialogTitle>
            <DialogDescription>
              {selectedIssue?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              {selectedIssue?.details}
            </p>
            <Textarea
              placeholder="Lösungsnotiz (optional)..."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              className="bg-surface-elevated"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedIssue(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleResolve}>
              Als gelöst markieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
