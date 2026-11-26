const numberFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 8 });
const minutesPerHour = 60;
const minutesPerDay = 24 * minutesPerHour;
const durationUnits = [
  [30 * minutesPerDay, 'mo'],
  [minutesPerDay, 'd'],
  [minutesPerHour, 'hr'],
] as const;

export function formatMinutes(minutes: number | undefined): string {
  return minutes !== undefined && Number.isFinite(minutes) && minutes >= 0 ? `${minutes} min` : '—';
}

export function formatDuration(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return '—';

  let remaining = minutes;
  const parts: string[] = [];
  for (const [unitMinutes, label] of durationUnits) {
    const whole = Math.floor(remaining / unitMinutes);
    if (whole > 0) {
      parts.push(`${whole} ${label}`);
      remaining %= unitMinutes;
    }
  }
  if (remaining > 0 || parts.length === 0) parts.push(`${numberFormat.format(remaining)} min`);
  return parts.join(' ');
}
