export const BACKUP_RETENTION_MS = 8 * 60 * 60 * 1000;

export function backupExpiresAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + BACKUP_RETENTION_MS);
}

export function isBackupExpired(
  expiresAt: string | Date | undefined | null,
  now = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expiryTime = new Date(expiresAt).getTime();
  return !Number.isFinite(expiryTime) || expiryTime <= now;
}

export function formatBackupCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0
      ? `${hours} hr ${minutes} min`
      : `${hours} hr`;
  }
  if (minutes > 0) return `${minutes} min`;
  return "<1 min";
}