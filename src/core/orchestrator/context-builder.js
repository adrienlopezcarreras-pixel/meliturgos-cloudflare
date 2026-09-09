/** Single context assembly point for chat. Retrieved records are data with
 * provenance, never instructions. Output is ModelRouter-compatible messages.
 */
export function buildContext({ system, recent = [], retrieved = null, toolResults = [], current }) {
  const messages = [{ role: 'system', content: String(system || '') }];
  if (retrieved?.prompt) messages[0].content += retrieved.prompt;
  for (const row of recent) {
    if (row?.role && typeof row.content === 'string') messages.push({ role: row.role, content: row.content });
    else if (row?.user_text) {
      messages.push({ role: 'user', content: row.user_text });
      if (row.assistant_text) messages.push({ role: 'assistant', content: row.assistant_text });
    }
  }
  for (const result of toolResults) messages.push({ role: 'tool', content: JSON.stringify(result) });
  messages.push({ role: 'user', content: String(current || '') });
  return messages;
}
