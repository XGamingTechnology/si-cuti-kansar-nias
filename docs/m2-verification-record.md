# M2 Verification Record

M2 is **COMPLETE** and staging-verified against the following immutable source and images:

- Final staging source commit: `0aaf863`
- Application image: `sha256:fdc81191dbeeb898c4e0d699f474d4b42fdb5c107945132d9a8196f1c305b19a`
- Recovery image: `sha256:fc9dd1ef17ddfdb6a4baea8c1ac67dd51d37994801434c228e7fc1dd346237ad`

## Verification results

| Check                             | Result     |
| --------------------------------- | ---------- |
| Typecheck                         | PASS       |
| Lint                              | PASS       |
| Unit + HTTP tests                 | 89/89 PASS |
| Integration tests                 | 21/21 PASS |
| Staging health                    | healthy    |
| Live endpoint                     | 200        |
| Ready endpoint                    | 200        |
| Emergency recovery CLI smoke test | PASS       |
| Password-reset session revocation | Verified   |

## Browser UAT: Employee Excel import

**PASS**, including:

- valid workbook commit;
- active/inactive status;
- no account auto-provision;
- duplicate existing NIP rejection;
- no silent overwrite;
- mixed valid/invalid file blocked; and
- no partial import.

## Staging security closeout

- Database staging credentials rotated.
- Obsolete pre-rotation environment backup removed.
- Admin staging passwords rotated.

This record contains no credentials, connection strings, cookies, tokens, or employee data. It introduces no M3 formulas or assumptions. M3 remains blocked by `BAL-001` through `BAL-005` as stated in the implementation plan.
