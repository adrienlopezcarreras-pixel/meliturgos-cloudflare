// Whitespace keeps a long JSON response live through idle HTTP proxies.
// It is transport only: the caller still validates the final result.
export function jsonHeartbeatResponse(promise, { intervalMs = 15000 } = {}) {
  const encoder = new TextEncoder();
  let closed = false, timer;
  const stream = new ReadableStream({
    start(controller) {
      const write = text => { if (!closed) controller.enqueue(encoder.encode(text)); };
      write('\n');
      timer = setInterval(() => write('\n'), intervalMs);
      const finish = value => {
        if (closed) return;
        clearInterval(timer);
        try { write(JSON.stringify(value)); }
        catch { write('{"ok":false,"error":"JSON_STREAM_FAILED"}'); }
        closed = true;
        controller.close();
      };
      Promise.resolve(promise).then(finish, () => finish({ ok: false, error: 'JSON_STREAM_FAILED' }));
    },
    cancel() { closed = true; clearInterval(timer); },
  });
  return new Response(stream, { headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-encoding': 'identity',
  } });
}
