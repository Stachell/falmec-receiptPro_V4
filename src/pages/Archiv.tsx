import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';

export default function Archiv() {
  return (
    <AppLayout>
      <div className="pt-3 pb-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="mb-1" style={{ color: '#D9D4C7' }}>
            Übersicht aller archivierten Verarbeitungsläufe
          </p>
          <h1 className="text-2xl font-bold" style={{ color: '#D8E6E7' }}>
            Archiv
          </h1>
        </div>

        {/* Content */}
        <div className="enterprise-card p-6">
          {/* Box Header with Back Button and Title */}
          <div className="flex items-center mb-4">
            <Link to="/">
              <Button size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h2 className="text-lg font-semibold text-foreground flex-1 text-center">
              Archivierte Läufe
            </h2>
          </div>

          {/* Content */}
          <p className="text-muted-foreground">
            Hier werden archivierte Verarbeitungsläufe angezeigt.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
