// Bound stalled requests so sync/auth controls can recover even if a native
// transport fails to reject promptly after cancellation.
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal;
  const abort = () => controller.abort();
  if (upstream?.aborted) controller.abort();
  else upstream?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      new Promise<Response>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Connection timed out. Please try again.')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); upstream?.removeEventListener('abort', abort); }
}
