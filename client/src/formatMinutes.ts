const numberFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 8 });

export function formatMinutes(minutes: number | undefined): string {
  return minutes !== undefined && Number.isFinite(minutes) ? `${numberFormat.format(minutes)} min` : '—';
}
