/**
 * Time-aware greeting that feels personal and warm.
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  const month = new Date().getMonth(); // 0-indexed

  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  }
  if (hour >= 17 && hour < 21) {
    return 'Good evening';
  }
  return 'Good night';
}
