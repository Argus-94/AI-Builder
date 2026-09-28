import { execFileSync } from 'node:child_process';

const script = `
import assert from 'node:assert/strict';
import { parseAgentReply } from './lib/termux-agent-protocol.ts';
const reasoning = "Пользователь хочет APK игры 2048. Нам нужно создать проект.\\nНужно выполнить TERMUX_RUN с командами.\\nНам нужно проверить наличие Android SDK.";
const parsedReasoning = parseAgentReply(reasoning);
assert.equal(parsedReasoning.kind, 'final');
assert.equal(parsedReasoning.message, reasoning);
const proseWithMarkerMention = "We need to continue with TERMUX_RUN:\\nthen inspect the SDK. TERMUX_DONE: should only be final.";
assert.equal(parseAgentReply(proseWithMarkerMention).kind, 'final');
assert.deepEqual(parseAgentReply('**TERMUX_RUN:**\\ncommand -v gradle'), { kind: 'run', command: 'command -v gradle' });
assert.deepEqual(parseAgentReply('TERMUX_DONE:\\n/storage/emulated/0/app.apk'), { kind: 'final', message: '/storage/emulated/0/app.apk' });
console.log('AIB_TERMUX_PROTOCOL_LOG_REGRESSION_SELFTEST_OK');
`;
process.stdout.write(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8' }));
