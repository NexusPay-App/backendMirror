export async function botRpc<T>(url: string, method: string, params: unknown[] = [], retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`BOT RPC returned HTTP ${response.status}`);
      const json = await response.json() as { result?: T; error?: { message: string } };
      if (json.error) throw new Error(`BOT RPC ${method} failed: ${json.error.message}`);
      if (!Object.hasOwn(json, 'result')) throw new Error('Invalid BOT RPC response');
      return json.result as T;
    } catch (error) {
      lastError = error;
      // Retry transient network / HTTP failures; do not retry JSON-RPC application errors.
      const message = error instanceof Error ? error.message : String(error);
      const transient = /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|HTTP 5\d\d|network/i.test(message)
        || (error instanceof TypeError && /fetch/i.test(message));
      if (!transient || attempt === retries - 1) break;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}
