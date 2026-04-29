export function resolveCompletionEmailIntentThreadId<T>(
  requestedThreadId: string,
  intentByThread: Record<string, T | undefined>,
  resolveCanonicalThreadId: (threadId: string) => string,
): string {
  if (intentByThread[requestedThreadId]) {
    return requestedThreadId;
  }

  const canonicalThreadId = resolveCanonicalThreadId(requestedThreadId);
  if (canonicalThreadId && intentByThread[canonicalThreadId]) {
    return canonicalThreadId;
  }

  return requestedThreadId;
}
