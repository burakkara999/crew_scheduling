// Extracts the model code from index.html, solves sample instances with highs (Node),
// and checks the solutions against the rules independently of the LP.
// Exits with a non-zero code if any check fails.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const code = html.split('/*MODEL-START*/')[1].split('/*MODEL-END*/')[0];
const M = new Function(code + '; return {buildLP, readSolution, dateList, wdIdx, addDays, shiftLen, isNight, restGap, unitsOf, allowedUnits, homeUnit};')();

function sample(start) {
  const st = {
    start, days: 14,
    shifts: [{kod:'S',ad:'Sabah',bas:7,bit:15},{kod:'A',ad:'Akşam',bas:15,bit:23},{kod:'G',ad:'Gece',bas:23,bit:7}],
    staff: [['Ayşe',1,4,5,[]],['Mehmet',1,4,5,[]],['Zeynep',0,4,5,['G']],['Can',1,4,5,[]],['Elif',1,4,5,['A']],
      ['Emre',0,4,5,[]],['Selin',0,4,5,['G']],['Murat',0,4,5,[]],['Deniz',0,2,3,['G']],['Gizem',1,4,5,[]],['Okan',0,4,5,[]]]
      .map(([ad,k,mn,mx,kc],i)=>({id:'p'+(i+1),ad,kidemli:!!k,minH:mn,maxH:mx,kacin:kc})),
    demand: [[3,2,2],[3,2,2],[3,2,2],[3,2,2],[3,2,2],[2,2,1],[2,2,1]],
    rules: {ardisik:5,dinlenme:11,kidemli:true,sure:30},
    w: {eksik:1000,fazla:100,kidemli:200,tercih:10,minAlti:20,gece:15,haftasonu:15,birimDisi:5},
    req: {}
  };
  st.req['p3|'+M.addDays(start,2)]='I'; st.req['p3|'+M.addDays(start,3)]='I';
  st.req['p6|'+M.addDays(start,9)]='I'; st.req['p1|'+M.addDays(start,0)]='G';
  return st;
}

// Same staff split over two units (Acil, Yoğun Bakım); some people work in both.
function sampleUnits(start) {
  const st = sample(start);
  delete st.demand;
  st.units = [
    {id:'u1',kod:'AC',ad:'Acil',kidemli:true,demand:[[2,1,1],[2,1,1],[2,1,1],[2,1,1],[2,1,1],[1,1,1],[1,1,1]]},
    {id:'u2',kod:'YB',ad:'Yoğun Bakım',kidemli:false,demand:[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,0],[1,1,0]]}];
  const allowed = {p1:['u1','u2'],p2:['u1'],p3:['u1'],p4:['u2','u1'],p5:['u1'],p6:['u2'],p7:['u1','u2'],p8:['u2'],p9:['u1'],p10:['u2','u1'],p11:['u2']};
  st.staff.forEach(p => { p.birimler = allowed[p.id]; p.ana = p.birimler[0]; });
  return st;
}

function check(st, sol, solB = {}) {
  const D = M.dateList(st), U = M.unitsOf(st), errs = [];
  const at = (p, dt) => sol[p.id+'|'+dt];
  const sh = k => st.shifts.find(s => s.kod === k);
  let short = 0, pref = 0, offHome = 0;
  D.forEach(dt => st.shifts.forEach((s, j) => U.forEach(u => {
    const need = (u.demand[M.wdIdx(dt)] || [])[j] || 0;
    const have = st.staff.filter(p => at(p, dt) === s.kod && (U.length === 1 || solB[p.id+'|'+dt] === u.id)).length;
    if (have < need) short += need - have;
  })));
  st.staff.forEach(p => {
    const L = M.allowedUnits(st, p).map(l => U[l].id), home = U[M.homeUnit(st, p)].id;
    D.forEach((dt, d) => {
      const r = st.req[p.id+'|'+dt];
      if (r === 'I' && at(p, dt)) errs.push(`${p.ad} izinli gün ${dt} atanmış`);
      if (r && r !== 'I' && at(p, dt) !== r) errs.push(`${p.ad} kilit ${dt} uyulmamış`);
      if ((p.kacin||[]).includes(at(p, dt))) pref++;
      if (U.length > 1 && at(p, dt)) {
        const b = solB[p.id+'|'+dt];
        if (!L.includes(b)) errs.push(`${p.ad} ${dt} yetkisiz birime (${b}) atanmış`);
        else if (b !== home) offHome++;
      }
      if (d + 1 < D.length && at(p, dt) && at(p, D[d+1]) && M.restGap(sh(at(p, dt)), sh(at(p, D[d+1]))) < st.rules.dinlenme)
        errs.push(`${p.ad} dinlenme ihlali ${dt} ${at(p,dt)}→${at(p,D[d+1])}`);
    });
    let run = 0;
    D.forEach(dt => { run = at(p, dt) ? run + 1 : 0; if (run > st.rules.ardisik) errs.push(`${p.ad} art arda ${run} gün (${dt})`); });
    for (let b = 0; b * 7 < D.length; b++) {
      const n = D.slice(b*7, b*7+7).filter(dt => at(p, dt)).length;
      if (n > p.maxH) errs.push(`${p.ad} hafta ${b+1}: ${n} > maks ${p.maxH}`);
    }
  });
  const nights = st.staff.map(p => D.filter(dt => at(p, dt) && M.isNight(sh(at(p, dt)))).length);
  return { errs, short, pref, offHome, nights };
}

(async () => {
  const highs = await require('highs')();
  const fails = [];
  const expect = (ok, label) => { if (!ok) fails.push(label); };

  // 1) sample instance
  const st = sample('2026-11-23');
  const m = M.buildLP(st);
  console.log(`vars=${m.nx} cons=${m.nc} lpBytes=${m.lp.length}`);
  let t = Date.now();
  let res = highs.solve(m.lp, { output_flag: false, time_limit: 30, mip_rel_gap: 0.005 });
  console.log('status', res.Status, 'obj', res.ObjectiveValue, 'sec', (Date.now()-t)/1000);
  let out = M.readSolution(st, res, m);
  let c = check(st, out.sol);
  console.log('senior short', out.senior, 'shortage(lp)', out.short, 'shortage(check)', c.short, 'pref', c.pref, 'nights', c.nights.join(','), 'errors', c.errs);
  expect(res.Status === 'Optimal' && !c.errs.length && out.short === c.short, '1) sample');

  // 2) repeated solve in same module (some highs-js versions crash on reuse)
  for (let i = 0; i < 3; i++) { const r = highs.solve(m.lp, { output_flag: false, time_limit: 30 }); if (r.Status !== res.Status) { console.log('repeat mismatch', r.Status); fails.push('2) repeat'); } }
  console.log('repeat solves OK');

  // 3) 4-week horizon
  const st4 = sample('2026-11-23'); st4.days = 28;
  const m4 = M.buildLP(st4); t = Date.now();
  const r4 = highs.solve(m4.lp, { output_flag: false, time_limit: 30, mip_rel_gap: 0.005 });
  const c4 = check(st4, M.readSolution(st4, r4, m4).sol);
  console.log(`28 days: vars=${m4.nx} status=${r4.Status} obj=${r4.ObjectiveValue} sec=${(Date.now()-t)/1000} short=${c4.short} nights=${c4.nights.join(',')} errs=${c4.errs.length}`);
  expect(!c4.errs.length, '3) 28 days');

  // 4) infeasible locks: 6 consecutive locked days with max 5
  const sti = sample('2026-11-23');
  for (let d = 0; d < 6; d++) sti.req['p2|'+M.addDays(sti.start, d)] = 'S';
  const ri = highs.solve(M.buildLP(sti).lp, { output_flag: false, time_limit: 10 });
  console.log('conflicting locks ->', ri.Status);
  expect(ri.Status === 'Infeasible', '4) conflicting locks');

  // 5) understaffed instance (3 people) still returns a schedule with reported shortage
  const sts = sample('2026-11-23'); sts.staff = sts.staff.slice(0, 3); sts.req = {};
  const ms = M.buildLP(sts); const rs = highs.solve(ms.lp, { output_flag: false, time_limit: 10 });
  const os = M.readSolution(sts, rs, ms), cs = check(sts, os.sol);
  console.log('understaffed ->', rs.Status, 'short', os.short, 'check', cs.short, 'errs', cs.errs.length);
  expect(os.short > 0 && os.short === cs.short && !cs.errs.length, '5) understaffed');

  // 6) two units sharing part of the staff: per-unit coverage, unit eligibility,
  //    and person-level rules (rest, consecutive days, weekly max) across both units
  const stu = sampleUnits('2026-11-23');
  const mu = M.buildLP(stu); t = Date.now();
  const ru = highs.solve(mu.lp, { output_flag: false, time_limit: 30, mip_rel_gap: 0.005 });
  const ou = M.readSolution(stu, ru, mu), cu = check(stu, ou.sol, ou.solB);
  const shared = stu.staff.filter(p => p.birimler.length > 1).map(p => {
    const us = new Set(Object.keys(ou.solB).filter(k => k.startsWith(p.id+'|')).map(k => ou.solB[k]));
    return `${p.ad}:${[...us].join('+')}`;
  });
  console.log(`2 units: vars=${mu.nx} cons=${mu.nc} status=${ru.Status} sec=${(Date.now()-t)/1000} short(lp)=${ou.short} short(check)=${cu.short} offHome=${cu.offHome} shared=[${shared.join(' ')}] errs`, cu.errs);
  expect(ru.Status === 'Optimal' && !cu.errs.length && ou.short === cu.short, '6) two units');

  // 6b) unit balance: with a balance weight (and no home-unit pull) shared staff split their shifts
  //     more evenly across their units than without it, at no extra shortage
  const gapsOf = (s, o) => s.staff.filter(p => p.birimler.length > 1).map(p => {
    const n = p.birimler.map(u => Object.keys(o.solB).filter(k => k.startsWith(p.id+'|') && o.solB[k] === u).length);
    return Math.max(...n) - Math.min(...n);
  });
  const solveUnits = (denge, disi, kidemli = true) => { const s = sampleUnits('2026-11-23'); s.w.birimDenge = denge; s.w.birimDisi = disi; s.rules.kidemli = kidemli;
    const mm = M.buildLP(s), rr = highs.solve(mm.lp, { output_flag: false, time_limit: 30, mip_rel_gap: 0.005 });
    const oo = M.readSolution(s, rr, mm); return { s, rr, oo, c: check(s, oo.sol, oo.solB), gaps: gapsOf(s, oo) }; };
  const sum = a => a.reduce((x, y) => x + y, 0);
  // With the senior rule on, seniors may stay unbalanced (Acil needs a senior on every shift, which outweighs balance).
  const b0 = solveUnits(0, 5), b1 = solveUnits(20, 0);
  console.log(`balance (senior rule on): without gaps=${b0.gaps.join(',')} (sum ${sum(b0.gaps)}) | with gaps=${b1.gaps.join(',')} (sum ${sum(b1.gaps)}) short=${b1.oo.short} senior=${b1.oo.senior} errs`, b1.c.errs);
  expect(b1.rr.Status === 'Optimal' && !b1.c.errs.length && sum(b1.gaps) < sum(b0.gaps) && b1.oo.short <= b0.oo.short && b1.oo.senior <= b0.oo.senior, '6b) unit balance reduces gaps');
  // Without competing rules, every shared person ends up within one shift between units.
  const c0 = solveUnits(0, 5, false), c1 = solveUnits(20, 0, false);
  console.log(`balance (senior rule off): without gaps=${c0.gaps.join(',')} | with gaps=${c1.gaps.join(',')} short=${c1.oo.short} errs`, c1.c.errs);
  expect(c1.rr.Status === 'Optimal' && !c1.c.errs.length && Math.max(...c1.gaps) <= 1 && c1.oo.short <= c0.oo.short, '6c) unit balance reaches ≤1');

  // 7) old single-demand data and a one-unit "units" list build the same model
  const a = M.buildLP(sample('2026-11-23'));
  const sb = sample('2026-11-23'); sb.units = [{id:'u1',kod:'B1',ad:'Birim 1',kidemli:true,demand:sb.demand}]; delete sb.demand;
  const b = M.buildLP(sb);
  console.log('single-unit compat ->', a.lp === b.lp ? 'same LP' : 'LP differs');
  expect(a.lp === b.lp, '7) single-unit compat');

  if (fails.length) { console.log('FAILED:', fails.join(', ')); process.exitCode = 1; }
  else console.log('ALL CHECKS PASSED');
})();
