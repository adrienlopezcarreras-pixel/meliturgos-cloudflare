/** Canonical public entry: MEL lives at /professor. */
export async function onRequestGet() {
  return new Response(null, {
    status: 308,
    headers: {
      location: "/professor",
      "cache-control": "no-store"
    }
  });
}
