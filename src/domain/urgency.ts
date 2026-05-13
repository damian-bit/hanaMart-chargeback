export function computeUrgency(responseDeadline: Date): { daysRemaining: number; critical: boolean } {
  const days = Math.ceil((responseDeadline.getTime() - Date.now()) / 86_400_000);
  return { daysRemaining: days, critical: days < 5 };
}
