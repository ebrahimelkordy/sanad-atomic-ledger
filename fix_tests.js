const fs = require('fs');
const p = 'apps/backend/test/finance-reconciliation.spec.ts';
let c = fs.readFileSync(p, 'utf8');

// Fix 3 occurrences of "id: 'le-X', ...pending," -> "...pending, id: 'le-X',"
c = c.replace("id: 'le-1', ...pending,", "...pending, id: 'le-1',");
c = c.replace("id: 'le-2', ...pending,", "...pending, id: 'le-2',");
c = c.replace("id: 'le-3', ...pending,", "...pending, id: 'le-3',");

fs.writeFileSync(p, c);

let v = fs.readFileSync(p, 'utf8');
let r = (v.match(/id: 'le-\d+', \.\.\.pending/g) || []).length;
let g = (v.match(/\.\.\.pending, id: 'le-\d+'/g) || []).length;
console.log('Bad (id before ...pending): ' + r);
console.log('Good (...pending before id): ' + g);
if (r === 0) console.log('ALL FIXED!');
else process.exit(1);
