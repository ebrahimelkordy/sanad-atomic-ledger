const fs = require('fs');
const p = 'apps/backend/test/finance-reconciliation.spec.ts';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(`mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        id: 'le-1', ...pending,
        authorized_action_by: MANAGER,
      });`, `mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        ...pending, id: 'le-1',
        authorized_action_by: MANAGER,
      });`);
c = c.replace(`mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        id: 'le-2', ...pending, authorized_action_by: MANAGER,
      });`, `mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        ...pending, id: 'le-2', authorized_action_by: MANAGER,
      });`);
c = c.replace(`mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        id: 'le-3', ...pending, authorized_action_by: MANAGER,
      });`, `mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        ...pending, id: 'le-3', authorized_action_by: MANAGER,
      });`);
fs.writeFileSync(p, c);
let v = fs.readFileSync(p, 'utf8');
let r = (v.match(/id: 'le-\d+', \.\.\.pending/g) || []).length;
let g = (v.match(/\.\.\.pending, id: 'le-\d+'/g) || []).length;
console.log(`Bad: ${r}, Good: ${g}`);
if (r === 0) console.log('ALL FIXED!');
