/**
 * SerialStatusDot — PROJ-34 SSOT
 *
 * Extracted from inline duplicates in ItemsTable.tsx and InvoicePreview.tsx.
 * Renders a small coloured square indicating serial-number status.
 * Tooltip remains the responsibility of the consuming component.
 *
 * PROJ-44-R6: onClick? Prop — wenn übergeben, wird ein <button> gerendert (klickbar).
 * Ohne onClick: reiner <span> Indikator (Backward-Compat).
 */

interface SerialStatusDotProps {
  serialRequired: boolean;
  serialAssigned: boolean;
  /** PROJ-44-R6: Klick-Handler — undefined = nicht klickbar (Backward-Compat) */
  onClick?: () => void;
}

export function SerialStatusDot({ serialRequired, serialAssigned, onClick }: SerialStatusDotProps) {
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

  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      className={`inline-block w-3 h-3 rounded-sm border flex-shrink-0${onClick ? ' cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 focus:outline-none' : ''}`}
      style={{ backgroundColor: bg, borderColor: border }}
      onClick={onClick}
      {...(Tag === 'button' ? { type: 'button' as const } : {})}
    />
  );
}
