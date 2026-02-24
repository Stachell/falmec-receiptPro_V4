/**
 * OverrideEditorModal — PROJ-28 Phase C
 *
 * Reusable modal for editing alias lists and regex overrides for Step 2 (Matcher) and Step 4 (OrderMapper).
 * Two sections:
 *   1. Alias-Listen: CSV text fields per alias field
 *   2. Zahlenformate / Regex: Named, validated regex fields
 *
 * Used from SettingsPopup for stepNo 2 and 4.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle } from 'lucide-react';
import type {
  MatcherProfileOverrides,
  MatcherFieldAliases,
  OrderParserProfile,
  OrderParserProfileOverrides,
  OrderParserFieldAliases,
} from '@/types';

// ---------------------------------------------------------------------------
// Helpers (CSV serialization)
// ---------------------------------------------------------------------------

function toCsvValue(values: string[] | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

function fromCsvValue(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isValidRegex(pattern: string): boolean {
  if (!pattern) return true; // empty = no override = valid
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alias field definitions per step
// ---------------------------------------------------------------------------

const STEP2_ALIAS_FIELDS: Array<{ field: keyof MatcherFieldAliases; label: string }> = [
  { field: 'artNoDE',         label: 'Art-# (DE) Aliase' },
  { field: 'artNoIT',         label: 'Art-# (IT) Aliase' },
  { field: 'ean',             label: 'EAN Aliase' },
  { field: 'falmecArticleNo', label: 'Falmec Art-# Aliase' },
];

const STEP4_ALIAS_FIELDS: Array<{ field: keyof OrderParserFieldAliases; label: string }> = [
  { field: 'orderNumberCandidates', label: 'Ordernummer Kandidaten' },
  { field: 'orderYear',             label: 'Order-Jahr' },
  { field: 'openQuantity',          label: 'Offene Menge' },
  { field: 'artNoDE',               label: 'Art-# (DE)' },
  { field: 'artNoIT',               label: 'Art-# (IT)' },
  { field: 'ean',                   label: 'EAN' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OverrideEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stepNo: 2 | 4;

  // Step 2 path
  matcherOverrides?: MatcherProfileOverrides;
  onSaveMatcherOverrides?: (overrides: MatcherProfileOverrides) => void;

  // Step 4 path (existing data, migrated from inline inputs)
  orderParserProfile?: OrderParserProfile;            // resolved effective profile (for display defaults)
  orderParserOverrides?: OrderParserProfileOverrides; // current raw overrides (may be undefined)
  onSaveOrderParserOverrides?: (overrides: OrderParserProfileOverrides) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverrideEditorModal({
  open,
  onOpenChange,
  stepNo,
  matcherOverrides,
  onSaveMatcherOverrides,
  orderParserProfile,
  orderParserOverrides,
  onSaveOrderParserOverrides,
}: OverrideEditorModalProps) {
  // Shared: alias CSV values keyed by field name
  const [localAliases, setLocalAliases] = useState<Record<string, string>>({});

  // Step 2 specific regex fields
  const [artNoDeRegex,       setArtNoDeRegex]       = useState('');
  const [eanRegex,           setEanRegex]           = useState('');
  const [manufacturerNoRegex, setManufacturerNoRegex] = useState('');

  // Step 4 specific regex fields
  const [orderNumberRegex, setOrderNumberRegex] = useState('');
  const [orderYearRegex,   setOrderYearRegex]   = useState('');

  // Regex validation errors: field-name -> error message
  const [regexErrors, setRegexErrors] = useState<Record<string, string>>({});

  // -------------------------------------------------------------------------
  // Initialize local state when modal opens
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    if (stepNo === 2) {
      // Populate alias CSV from current matcher overrides (or empty)
      const aliasSource = matcherOverrides?.aliases ?? {};
      const initialAliases: Record<string, string> = {};
      for (const { field } of STEP2_ALIAS_FIELDS) {
        initialAliases[field] = toCsvValue(aliasSource[field as keyof MatcherFieldAliases]);
      }
      setLocalAliases(initialAliases);
      setArtNoDeRegex(matcherOverrides?.artNoDeRegex ?? '');
      setEanRegex(matcherOverrides?.eanRegex ?? '');
      setManufacturerNoRegex(matcherOverrides?.manufacturerNoRegex ?? '');
    } else {
      // Step 4: use effective profile aliases as defaults, overlay with current overrides
      const effectiveAliases = orderParserProfile?.aliases ?? {} as OrderParserProfile['aliases'];
      const overrideAliases = orderParserOverrides?.aliases ?? {};
      const initialAliases: Record<string, string> = {};
      for (const { field } of STEP4_ALIAS_FIELDS) {
        const overrideVal = overrideAliases[field as keyof OrderParserFieldAliases];
        const effectiveVal = effectiveAliases[field as keyof OrderParserFieldAliases];
        initialAliases[field] = toCsvValue(overrideVal ?? effectiveVal);
      }
      setLocalAliases(initialAliases);
      setOrderNumberRegex(orderParserOverrides?.orderNumberRegex ?? '');
      setOrderYearRegex(orderParserOverrides?.orderYearRegex ?? '');
    }

    // Reset validation errors on open
    setRegexErrors({});
  }, [open, stepNo]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Live regex validation
  // -------------------------------------------------------------------------

  const validateAndSetRegex = (
    fieldName: string,
    value: string,
    setter: (v: string) => void,
  ) => {
    setter(value);
    const errors = { ...regexErrors };
    if (!isValidRegex(value)) {
      errors[fieldName] = 'Ungueltige Regex';
    } else {
      delete errors[fieldName];
    }
    setRegexErrors(errors);
  };

  const hasErrors = Object.keys(regexErrors).length > 0;

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSave = () => {
    if (stepNo === 2) {
      const aliases: Partial<MatcherFieldAliases> = {};
      for (const { field } of STEP2_ALIAS_FIELDS) {
        const parsed = fromCsvValue(localAliases[field] ?? '');
        if (parsed.length > 0) {
          aliases[field as keyof MatcherFieldAliases] = parsed;
        }
      }
      onSaveMatcherOverrides?.({
        enabled: true,
        aliases,
        artNoDeRegex:       artNoDeRegex || undefined,
        eanRegex:           eanRegex || undefined,
        manufacturerNoRegex: manufacturerNoRegex || undefined,
      });
    } else {
      const aliases: Partial<OrderParserFieldAliases> = {};
      for (const { field } of STEP4_ALIAS_FIELDS) {
        const parsed = fromCsvValue(localAliases[field] ?? '');
        if (parsed.length > 0) {
          aliases[field as keyof OrderParserFieldAliases] = parsed;
        }
      }
      onSaveOrderParserOverrides?.({
        ...orderParserOverrides,
        aliases: {
          ...(orderParserOverrides?.aliases ?? {}),
          ...aliases,
        } as OrderParserProfile['aliases'],
        orderNumberRegex: orderNumberRegex || undefined,
        orderYearRegex:   orderYearRegex || undefined,
      });
    }
    onOpenChange(false);
  };

  // -------------------------------------------------------------------------
  // Derived labels
  // -------------------------------------------------------------------------

  const stepName = stepNo === 2 ? 'Artikel extrahieren' : 'Bestellung mappen';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[520px] w-full"
        style={{ backgroundColor: '#D8E6E7' }}
      >
        <DialogHeader>
          <DialogTitle>Override-Editor — {stepName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Sektion 1: Alias-Listen */}
          <div className="border-t border-border pt-3 space-y-3">
            <div>
              <Label className="text-sm font-semibold">Alias-Listen</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Spaltennamen als kommagetrennte Liste (CSV)
              </p>
            </div>

            {stepNo === 2
              ? STEP2_ALIAS_FIELDS.map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      value={localAliases[field] ?? ''}
                      onChange={(e) =>
                        setLocalAliases((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                      className="h-8 text-xs bg-white"
                      placeholder="Alias1, Alias2, Alias3"
                    />
                  </div>
                ))
              : STEP4_ALIAS_FIELDS.map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      value={localAliases[field] ?? ''}
                      onChange={(e) =>
                        setLocalAliases((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                      className="h-8 text-xs bg-white"
                      placeholder="Alias1, Alias2, Alias3"
                    />
                  </div>
                ))}
          </div>

          {/* Sektion 2: Zahlenformate / Regex */}
          <div className="border-t border-border pt-3 mt-3 space-y-3">
            <div>
              <Label className="text-sm font-semibold">Zahlenformate / Regex</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Regulaere Ausdruecke zur Feld-Erkennung
              </p>
            </div>

            {stepNo === 2 ? (
              <>
                <RegexField
                  label="Falmec Art-Nr Regex"
                  value={artNoDeRegex}
                  error={regexErrors['artNoDeRegex']}
                  onChange={(v) => validateAndSetRegex('artNoDeRegex', v, setArtNoDeRegex)}
                />
                <RegexField
                  label="EAN Regex"
                  value={eanRegex}
                  error={regexErrors['eanRegex']}
                  onChange={(v) => validateAndSetRegex('eanRegex', v, setEanRegex)}
                />
                <RegexField
                  label="Hersteller-Nr Regex"
                  value={manufacturerNoRegex}
                  error={regexErrors['manufacturerNoRegex']}
                  onChange={(v) => validateAndSetRegex('manufacturerNoRegex', v, setManufacturerNoRegex)}
                />
              </>
            ) : (
              <>
                <RegexField
                  label="Bestellnummer Regex"
                  value={orderNumberRegex}
                  error={regexErrors['orderNumberRegex']}
                  onChange={(v) => validateAndSetRegex('orderNumberRegex', v, setOrderNumberRegex)}
                />
                <RegexField
                  label="Bestelljahr Regex"
                  value={orderYearRegex}
                  error={regexErrors['orderYearRegex']}
                  onChange={(v) => validateAndSetRegex('orderYearRegex', v, setOrderYearRegex)}
                />
              </>
            )}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-border gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSave}
            disabled={hasErrors}
            className="h-9 text-white"
            style={{ backgroundColor: '#008C99' }}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// RegexField — named regex input with live validation indicator
// ---------------------------------------------------------------------------

function RegexField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const isValid = !error;
  const showIcon = value.length > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium flex-1">{label}</Label>
        {showIcon && (
          isValid
            ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs font-mono bg-white"
        placeholder="z.B. ^1\d{4}$"
      />
      {error && (
        <p className="text-[10px] text-red-600">{error}</p>
      )}
    </div>
  );
}
