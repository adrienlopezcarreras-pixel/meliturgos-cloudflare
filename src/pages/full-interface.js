/** Legacy full-control entry retained only as a redirect to the canonical Professor UI. */
export async function onRequestGet() {
  return new Response(null, {
    status: 308,
    headers: {
      location: "/professor",
      "cache-control": "no-store"
    }
  });
}
