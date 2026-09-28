#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aib-selftest-'));
const file=path.join(root,'sample.ts');
fs.writeFileSync(file,'const answer = 1;\nexport function add(a: number, b: number) { return a + b; }\n');
const tool=path.resolve(process.argv[1],'../aib-hashline.mjs');
function run(...args){return spawnSync(process.execPath,[tool,...args],{cwd:root,encoding:'utf8'});}
let r=run('read','sample.ts','1','2'); if(r.status!==0) throw new Error('read failed');
const line=r.stdout.split(/\n/).find(x=>x.startsWith('1|')); const hash=line?.split('|')[1]; if(!hash) throw new Error('hash missing');
r=run('replace','sample.ts','1',hash,'const answer = 2;'); if(r.status!==0) throw new Error('replace failed');
r=run('replace','sample.ts','1',hash,'const answer = 3;'); if(r.status===0 || !/HASHLINE_STALE/.test(r.stderr)) throw new Error('stale hash was not rejected');
const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); r=run('delete','sample.ts',sha); if(r.status!==0 || fs.existsSync(file)) throw new Error('delete failed');
console.log('AIB_AGENT_SELFTEST_OK');
