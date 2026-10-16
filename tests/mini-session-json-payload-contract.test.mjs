import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI Link V2 SESSION rejects hidden bytes and trailing JSON after a valid prefix', async () => {
  const src=await readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp',import.meta.url),'utf8');
  const begin=src.indexOf('static bool apply_android_session_clock(');
  const end=src.indexOf('static void rx_frame(',begin);
  assert.ok(begin>=0 && end>begin);
  const fn=src.slice(begin,end);
  const length=fn.indexOf('len > 512');
  const nul=fn.indexOf('std::memchr(payload, 0, len)');
  const parser=fn.indexOf('cJSON_ParseWithOpts(raw.c_str(), &parse_end, true)');
  const clock=fn.indexOf('mel_link_v2_session_clock_bounds(');
  const sys=fn.indexOf('settimeofday(');
  assert.ok(length>=0 && nul>length && parser>nul && clock>parser && sys>clock);
  assert.doesNotMatch(fn,/cJSON_Parse\(raw\.c_str\(\)\)/);
  assert.match(fn,/if \(!root\) return false/);
});
