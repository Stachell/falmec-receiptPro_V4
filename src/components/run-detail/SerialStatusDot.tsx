/**
 * SerialStatusDot — PROJ-34 SSOT
 *
 * Extracted from inline duplicates in ItemsTable.tsx and InvoicePreview.tsx.
 * Renders a small coloured square indicating serial-number status.
 * Tooltip remains the responsibility of the consuming component.
 */

interface SerialStatusDotProps {
  serialRequired: boolean;
  serialAssigned: boolean;
}

export function SerialStatusDot({ serialRequired, serialAssigned }: SerialStatusDotProps) {
  const bg = !serialRequired
    ? '#000000'
    : serialAssigned
      ? '#22C55E'
      : '#E5E7EB';

  const border = !serialRequired
    ? '#000000'
    : serialAssigned
      ? '#16A34A'
      : '#9CA3AF';

  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border flex-shrink-0"
      style={{ backgroundColor: bg, borderColor: border }}
    />
  );
}
