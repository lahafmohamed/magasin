/**
 * Shared controller error logger.
 * Logs `Erreur <context>:` followed by the error to the console.
 */
export function consoleError(context: string, error: any): void {
  console.error(`Erreur ${context}:`, error);
}
