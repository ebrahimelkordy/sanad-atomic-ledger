# Fix Progress Tracker

## Issue 1 — Add `findByPhoneNumber()` to tenant-whatsapp-number.repository.ts
- [x] Fix — Already existed in the file!

## Issue 2 — Add `updateConnectionStatus()` to tenant-whatsapp-number.repository.ts
- [x] Fix — Already existed in the file!

## Issue 3 — Install Memurai (Redis ≥ 5.0 for Windows)
- [ ] Fix — Redis 3.0.504 still installed. Memurai not available via winget. May need manual download.

## Issue 4 — Update Baileys from @adiwajshing/baileys to @whiskeysockets/baileys
- [x] Fix — package.json updated, baileys-session-manager.service.ts imports updated, package installed.

## Issue 5 — SettlementService and OrderProcessorService: remove PrismaService direct import
- [x] Fix — Created `TransactionRunner` service injected instead of `PrismaService` directly.
  - [x] `OrderProcessorService` updated to use `this.tx.run()`
  - [x] `SettlementService` updated to use `this.tx.run()`
  - [x] `TransactionRunner` registered in `RepositoriesModule`
