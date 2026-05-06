#!/usr/bin/env node
import { exec, execSync } from 'child_process';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_TOKEN = 'MkaSbEeEFaRYNQs62yOcmVXonBc';
const TABLE_ID = 'tblNb7RBoZb9SVcp';
const PORT = 3456;

const FN = {
  word:'文本', phonetic:'phonetic', pos:'pos', definition:'definition',
  examples:'examples', collocations:'collocations', synonyms:'synonyms',
  wordFamily:'wordFamily', category:'category', difficulty:'difficulty',
  masteryLevel:'masteryLevel', reviewCount:'reviewCount',
  averageScore:'averageScore', nextReview:'nextReview',
};

const LEVELS = ['L0-陌生 (0%)','L1-了解 (10%)','L2-认识 (25%)','L3-熟悉 (50%)','L4-掌握 (75%)','L5-熟练 (90%)','L6-精通 (100%)'];
const INTERVALS = [1,2,4,8,15,30,60,90];

function buildCmd(cmd, args) {
  const parts = [`base ${cmd}`, `--base-token ${BASE_TOKEN}`];
  if (cmd !== '+data-query') parts.push(`--table-id ${TABLE_ID}`);
  for (const [k,v] of Object.entries(args||{})) {
    if (v != null) parts.push(typeof v==='object' ? `--${k} '${JSON.stringify(v).replace(/'/g,"'\\''")}'` : `--${k} ${v}`);
  }
  return `lark-cli ${parts.join(' ')}`;
}

async function larkAsync(cmd, args) {
  const { stdout } = await execAsync(buildCmd(cmd, args), { timeout:30000, maxBuffer:50*1024*1024 });
  const j = stdout.indexOf('{');
  return j>=0 ? JSON.parse(stdout.slice(j)) : null;
}

function lark(cmd, args) {
  try {
    const stdout = execSync(buildCmd(cmd, args), { timeout:30000, maxBuffer:50*1024*1024, encoding:'utf-8' });
    const j = stdout.indexOf('{'); return j>=0 ? JSON.parse(stdout.slice(j)) : null;
  } catch(e) {
    if (e.stdout) { try { const j=e.stdout.indexOf('{'); return j>=0?JSON.parse(e.stdout.slice(j)):null; } catch{} }
    return null;
  }
}

function parseRecords(data) {
  if (!data?.data?.data) return [];
  const fn = data.data.fields||[];
  return data.data.data.map((r,i)=>{
    const o = {_id: data.data.record_id_list?.[i]};
    fn.forEach((f,j)=>o[f]=r[j]); return o;
  });
}

function getLevelIdx(val) {
  if (!val) return 0;
  const v = Array.isArray(val)?val[0]:val;
  for (let i=0;i<LEVELS.length;i++) { if (v.includes(LEVELS[i].split('-')[0])) return i; }
  return 0;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function fetchAll() {
  const all=[]; let off=0;
  do {
    const data = lark('+record-list',{limit:200,offset:off});
    if (!data?.data?.data) break;
    const recs = parseRecords(data); all.push(...recs);
    if (recs.length<200) break;
    off += 200;
  } while (off<2000);
  return all;
}

// Cache
let cache = null, cacheTime = 0;
function cachedFetch() {
  const now = Date.now();
  if (!cache || now - cacheTime > 300000) { cache = fetchAll(); cacheTime = now; }
  return cache;
}
function invalidateCache() { cache = null; }

function formatWord(rec) {
  const ml = rec[FN.masteryLevel];
  return {
    recordId:rec._id, word:rec[FN.word]||'', phonetic:rec[FN.phonetic]||'',
    pos:rec[FN.pos]||'', definition:rec[FN.definition]||'', examples:rec[FN.examples]||'',
    collocations:rec[FN.collocations]||'', synonyms:rec[FN.synonyms]||'',
    wordFamily:rec[FN.wordFamily]||'', category:rec[FN.category]||'',
    difficulty:rec[FN.difficulty]||'',
    masteryLevel: ml ? (Array.isArray(ml)?ml.join(', '):ml) : '',
    masteryIndex: getLevelIdx(ml),
    reviewCount: rec[FN.reviewCount]||0, averageScore:rec[FN.averageScore]||0,
  };
}

function isOverdue(rec) {
  const nr=rec[FN.nextReview]; if (!nr) return false;
  return (typeof nr==='string'?nr.split(' ')[0]:nr) <= todayStr();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function respond(res, code, obj) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(code, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(obj));
}

const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // GET /api/stats
  if (path === '/api/stats' && req.method === 'GET') {
    try {
      const all = cachedFetch();
      const s = {total:all.length,newW:0,l0:0,l1:0,l2:0,l3:0,l4:0,l5:0,l6:0,overdue:0,dueToday:0};
      for (const r of all) {
        const ml=r[FN.masteryLevel]; const idx=getLevelIdx(ml);
        const nr=r[FN.nextReview]; const nrS=nr?(typeof nr==='string'?nr.split(' ')[0]:''):'';
        const td=todayStr();
        if (!ml){s.newW++; continue;}
        const ks=['l0','l1','l2','l3','l4','l5','l6']; s[ks[idx]]++;
        if (nrS && nrS<=td){ s.overdue++; if(nrS===td)s.dueToday++; }
      }
      respond(res, 200, s);
    } catch(e) { respond(res, 500, {error:e.message}); }
    return;
  }

  // POST /api/words
  if (path === '/api/words' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const {type='daily',limit=20} = JSON.parse(body);
      const all = cachedFetch(); let words=[];
      if (type==='overdue') words=all.filter(r=>isOverdue(r)&&r[FN.masteryLevel]);
      else if (type==='new') words=all.filter(r=>!r[FN.masteryLevel]);
      else if (type==='daily') {
        const ov=all.filter(r=>isOverdue(r)&&r[FN.masteryLevel]);
        const nw=all.filter(r=>!r[FN.masteryLevel]);
        words=[...ov.slice(0,15),...nw.slice(0,5)];
      } else words=all;
      words.sort(()=>Math.random()-0.5);
      respond(res, 200, {words:words.slice(0,Math.min(limit,200)).map(formatWord)});
    } catch(e) { respond(res, 400, {error:e.message}); }
    return;
  }

  // POST /api/review
  if (path === '/api/review' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const {recordId,score,currentMasteryIndex}=JSON.parse(body);
      let newIdx=currentMasteryIndex;
      if (score<=1) newIdx=Math.max(0,currentMasteryIndex-1);
      else if (score>=4) newIdx=Math.min(6,currentMasteryIndex+1);
      const days=INTERVALS[Math.min(newIdx,INTERVALS.length-1)];
      const nd=new Date(); nd.setDate(nd.getDate()+days); nd.setHours(0,0,0,0);
      const td=new Date(); td.setHours(0,0,0,0);
      const cur=lark('+record-get',{'record-id':recordId});
      let oa=0,oc=0;
      if (cur?.data?.record){ oa=cur.data.record[FN.averageScore]||0; oc=cur.data.record[FN.reviewCount]||0; }
      const na=parseFloat(((oa*oc+score)/(oc+1)).toFixed(1));
      lark('+record-upsert',{'record-id':recordId,json:{masteryLevel:LEVELS[newIdx],lastReviewed:td.getTime(),nextReview:nd.getTime(),reviewCount:oc+1,averageScore:na}});
      invalidateCache();
      respond(res, 200, {ok:true,newMasteryLevel:LEVELS[newIdx],nextReview:nd.toISOString().split('T')[0],intervalDays:days});
    } catch(e) { respond(res, 400, {error:e.message}); }
    return;
  }

  // Reject unknown POSTs
  if (req.method === 'POST') { respond(res, 404, {error:'Not found'}); return; }

  // Static files
  const filePath = join(__dirname, 'public', path==='/'?'index.html':path);
  const ext = extname(filePath);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {'Content-Type': MIME[ext]||'application/octet-stream'});
    res.end(content);
  } catch {
    if (!res.headersSent) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('Not found');
    }
  }
}

const server = createServer(handleRequest);
server.on('error', (err) => { if (err.code!=='EADDRINUSE') console.error('Server error:', err.message); });

server.listen(PORT, () => {
  console.log(`\n  AutoEnglish -> http://localhost:${PORT}\n`);
});
