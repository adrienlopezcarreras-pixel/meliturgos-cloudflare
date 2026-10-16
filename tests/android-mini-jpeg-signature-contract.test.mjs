import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI media receives JPEG marker validation before publishing photo or adding MJPEG frame', async () => {
 const src = await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
 const photo=src.slice(src.indexOf('private fun receivePhoto('),src.indexOf('private fun receiveVideo('));
 const video=src.slice(src.indexOf('private fun receiveVideo('),src.indexOf('private fun receiveAudio('));
 const readPhoto=photo.indexOf('val bytes = MiniPhotoDeadlineReader.read(input, size, beforeRead = { socket.soTimeout = it })');
 const gatePhoto=photo.indexOf('if (!MiniJpegFrameSignature.hasMarkers(bytes)) return');
 const publishPhoto=photo.indexOf('val uri = createMediaStoreEntry(');
 assert.ok(readPhoto>=0 && readPhoto < gatePhoto && gatePhoto < publishPhoto);
 const readFrame=video.indexOf('val jpeg = readFully(input, size)');
 const deadline=video.indexOf('if (!budget.withinDeadline()) return',readFrame);
 const gateFrame=video.indexOf('if (!MiniJpegFrameSignature.hasMarkers(jpeg)) return');
 const writeFrame=video.indexOf('avi.addFrame(jpeg)');
 assert.ok(readFrame>=0 && readFrame < deadline && deadline < gateFrame && gateFrame < writeFrame);
});
