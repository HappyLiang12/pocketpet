export function isQuiet(range: { start: string; end: string } | null, date: Date): boolean {
  if (!range) return false;
  const toMinutes = (value: string): number => {
    const [hours, minutes] = value.split(":").map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };
  const now = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(range.start);
  const end = toMinutes(range.end);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}
