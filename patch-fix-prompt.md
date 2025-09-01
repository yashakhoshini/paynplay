# Fix Git Patch File - ChatGPT Prompt

## Problem
I have a `patch.diff` file that contains code changes in a custom format, but `git apply patch.diff` fails because it's not in the proper git patch format.

## Current patch.diff format
The file uses this format:
```
@@ -454,16 +454,16 @@ export async function appendWithdrawalOwner(row: {
-      row.request_id,
-      String(row.user_id),
-      row.username,
-      String(row.amount_usd),
-      row.method,
-      row.payment_tag_or_address,
-      row.request_timestamp_iso,
-      '',        // paid_at_iso initially empty
-      'PENDING', // status
-      row.notes || ''
+      row.request_id,                // payout_id
+      String(row.user_id),           // user_id
+      row.username,                  // username
+      String(row.amount_usd),        // amount_usd
+      row.method,                    // channel
+      row.payment_tag_or_address,    // owner_wallet_or_handle
+      row.request_timestamp_iso,     // request_timestamp_iso
+      '',                            // paid_at_iso initially empty
+      'PENDING',                     // status
+      row.notes || ''                // notes
```

## Required Solution
Convert this custom patch format to a proper git patch format that `git apply` can understand.

## Git Patch Format Requirements
A valid git patch should have:
1. `diff --git a/filename b/filename` header
2. `index` line with file hashes
3. `--- a/filename` and `+++ b/filename` lines
4. Proper `@@` hunk headers with line numbers
5. `-` for removed lines, `+` for added lines
6. Context lines (unchanged code)

## Instructions for ChatGPT
1. Read the entire `patch.diff` file
2. Convert each `@@` hunk to proper git patch format
3. Add the required git patch headers
4. Ensure proper line numbering in hunk headers
5. Create a new file called `valid-patch.diff` with the converted format
6. Test that `git apply valid-patch.diff` works

## Example of proper git patch format
```
diff --git a/src/sheets.ts b/src/sheets.ts
index 68dec4d..34c0673 100644
--- a/src/sheets.ts
+++ b/src/sheets.ts
@@ -454,16 +454,16 @@ export async function appendWithdrawalOwner(row: {
-      row.request_id,
-      String(row.user_id),
-      row.username,
-      String(row.amount_usd),
-      row.method,
-      row.payment_tag_or_address,
-      row.request_timestamp_iso,
-      '',        // paid_at_iso initially empty
-      'PENDING', // status
-      row.notes || ''
+      row.request_id,                // payout_id
+      String(row.user_id),           // user_id
+      row.username,                  // username
+      String(row.amount_usd),        // amount_usd
+      row.method,                    // channel
+      row.payment_tag_or_address,    // owner_wallet_or_handle
+      row.request_timestamp_iso,     // request_timestamp_iso
+      '',                            // paid_at_iso initially empty
+      'PENDING',                     // status
+      row.notes || ''                // notes
```

## Files to convert
- `src/sheets.ts` - multiple hunks
- `src/index.ts` - multiple hunks

Please convert the entire `patch.diff` file to proper git patch format.

