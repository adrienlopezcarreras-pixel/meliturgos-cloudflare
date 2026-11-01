import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v2.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { melAttachmentContext, LOCAL_PHOTO_PREVIEW_SOURCE } from '../src/pages/local-photo-preview.js';

async function professorRuntime() {
  return (await (await onRequestGet()).text()).match(/<script>([\s\S]*?)<\/script>/)[1];
}

test('both emitted browser runtimes parse and share the actual attachment context function', async () => {
  for (const source of [await professorRuntime(), NORMAL_RUNTIME_SOURCE]) {
    assert.doesNotThrow(() => new vm.Script(source));
    assert.ok(source.includes(melAttachmentContext.toString()));
    assert.match(source, /const attachment=melAttachmentContext\(item\)/);
  }
});

for (const [kind, status, label] of [['isImage', 'IMAGE_DESCRIBED', 'Description visuelle'], ['isAudio', 'AUDIO_TRANSCRIBED', 'Transcription audio']]) {
  test(`${kind}: only the matching server success status admits the extracted content`, () => {
    const item = { name: 'private-file', [kind]: true, preview: 'Real extracted fixture content', analysis_status: status, analysis_provider: 'server-proof', localUrl: 'blob:never-send', mediaUrl: 'blob:never-send' };
    const text = melAttachmentContext(item);
    assert.match(text, new RegExp(label));
    assert.ok(text.includes(item.preview) && text.includes(status) && text.includes('server-proof'));
    assert.doesNotMatch(text, /blob:/);
    const failed = melAttachmentContext({ ...item, analysis_status: 'ANALYSIS_FAILED' });
    assert.doesNotMatch(failed, /Real extracted fixture content/);
    assert.match(failed, /NON ANALYSÉ|NON TRANSCRIT/);
    assert.match(melAttachmentContext({ ...item, preview: '' }), /NON ANALYSÉ|NON TRANSCRIT/);
  });
}

test('video preview text and thumbnail never become claimed visual or audio analysis', () => {
  const result = melAttachmentContext({ name: 'private-video', isVideo: true, preview: 'unverified video text', analysis_status: 'STORED_PRIVATE' });
  assert.match(result, /NON ANALYSÉ/);
  assert.doesNotMatch(result, /unverified video text/);
});

test('normal-page camelCase metadata follows the same extraction contract', () => {
  const input = { name: 'photo', isImage: true, preview: 'A real description', analysisStatus: 'IMAGE_DESCRIBED' };
  assert.equal(melAttachmentContext(input), vm.runInNewContext(LOCAL_PHOTO_PREVIEW_SOURCE + '\nmelAttachmentContext(input)', { input }));
});

test('emitted Professor handler sends analyzed content and retains the actual Code mode', async () => {
  const runtime = await professorRuntime();
  const code = runtime.slice(runtime.indexOf('async function executeChatTurn('), runtime.indexOf('const pendingChatFiles=[]'));
  const requests = [];
  const elements = new Map();
  const context = vm.createContext({
    ...{ console, AbortController },
    pendingChatFiles: [{ name: 'photo.png', isImage: true, preview: 'Verified visual fixture', analysis_status: 'IMAGE_DESCRIBED' }],
    conversationId: 'conversation', deviceId: 'device', crypto: { randomUUID: () => 'turn-id' },
    qs: selector => { if (!elements.has(selector)) elements.set(selector, { value: '', checked: false, focus() {} }); return elements.get(selector); },
    renderPendingChatFiles() {}, addMsg() { return null; }, melCodeLiveReceipt() {}, melCodeScheduleAuto() {},
    melCodeLiveRecord() {}, melCodeCancelAuto() {},
    async melChatFetch(request) { requests.push(request); return { text: 'fixture response' }; },
  });
  vm.runInContext(LOCAL_PHOTO_PREVIEW_SOURCE + '\n' + code, context);
  await vm.runInContext("executeChatTurn('Inspect this', 'code-auto', new AbortController(), 'code')", context);
  assert.equal(requests.length, 1);
  assert.match(requests[0].text, /Verified visual fixture/);
  assert.equal(requests[0].intent_context.requested_mode, 'code');
  assert.equal(requests[0].client_message_id, 'turn-id');
});

test('queued explicit Code mode survives a current Conversation selection', async () => {
  const runtime = await professorRuntime();
  const start = runtime.indexOf('async function sendChat(');
  const code = runtime.slice(start, runtime.indexOf('async function executeChatTurn(', start));
  const queue = [];
  const context = vm.createContext({ chatActiveController: {}, chatPendingTurns: queue, pendingChatFiles: [{ id: 'private-attachment' }], melChatRole: 'assistant',
    qs: () => ({ value: 'Next request' }), renderPendingChatFiles() {}, chatQueueStatus() {},
  });
  vm.runInContext(code, context);
  await vm.runInContext("sendChat('Queued request', 'text', 'code')", context);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].role, 'code');
  assert.equal(queue[0].files[0].id, 'private-attachment');
});

// MEL-CHAT-03: verified byte reads, not thumbnails or URLs, back the rendered analysis.
test('a thumbnail or URL never counts as a complete image or video analysis; a missing transcript keeps vision partial', async () => {
  const { imageAnalysisCoverage } = await import('../src/media/image-vision-runtime.js');
  const { videoAnalysisCoverage } = await import('../src/media/video-runtime.js');
  assert.equal(imageAnalysisCoverage({ input_kind: 'thumbnail' }).error, 'IMAGE_THUMBNAIL_ONLY');
  assert.equal(imageAnalysisCoverage({ input_kind: 'url' }).complete, false);
  assert.equal(imageAnalysisCoverage({ input_kind: 'bytes', bytes_read: true }).scope, 'FULL');
  assert.equal(videoAnalysisCoverage({ input_kind: 'thumbnail' }).scope, 'REFERENCE_ONLY');
  const partial = videoAnalysisCoverage({ input_kind: 'bytes', bytes_read: true });
  assert.deepEqual([partial.scope, partial.error], ['PARTIAL', 'VIDEO_TRANSCRIPT_MISSING']);
});
