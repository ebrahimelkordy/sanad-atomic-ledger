# خطة 12 — الفرونت إند (Next.js Dashboard) — التكملة

## ✅ Part A — Sanad Design System Extraction (Complete)
- Step 0.5–5: Design tokens, fonts, UI components, configs, dependencies all done

## ❌ Part B — API Connection & Integration (Need to Complete)

### B1 — Backend: Enable CORS in main.ts
- [ ] Add `app.enableCors()` to Nest.js bootstrap

### B2 — Backend: Add filtering/pagination support
- [ ] Add query params (status, search, page, limit) to OrderController
- [ ] Add pagination support to FinanceController (ledger, summary)

### B3 — Backend: QR Code endpoint
- [ ] Add endpoint `GET /tenants/whatsapp-numbers/:id/qr` to return QR code data

### B4 — Frontend: Wire up filter params to API
- [ ] Pass statusFilter/search to `api.getOrders()`
- [ ] Add pagination controls to orders table
- [ ] Pass ledgerSearch to `api.getLedger()`

### B5 — Frontend: Add polling for connection status
- [ ] Add `usePolling` hook or useEffect interval to refresh WhatsApp numbers status

### B6 — Verify full build passes
- [ ] Run `npm run build` and fix any errors
