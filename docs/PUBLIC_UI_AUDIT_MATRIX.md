# DizyTrades public UI/CSS route matrix (28 September 2026)

The existing Chromium accessibility, account, and responsive suites already cover terminal, Scanner, Structure, Journal, Performance, owner diagnostics/backup, overlays, keyboard focus and modal containment. This additional slice covers public marketing/account entry routes that were missing from the consolidated viewport sweep.

Automated matrix: home, About, Contact, DIZY, DizyDEX, DizyQuant research, Investors, public Business Plan, Academy, Login, Signup and the tokenless Forgot Password, Resend Verification, Reset Password, Verify Email and MFA Recovery routes at **360×800**, **667×375** (phone landscape), **768×1024** and **1440×900**. It asserts a single main landmark, non-empty title, no page-level horizontal overflow, and a usable mobile navigation toggle where present. Reduced-motion preferences are enabled. Browser failure artifacts are collected by the existing CI job.

This is test coverage, **not a claim that every UI state was visually approved**: human review and real-device checks are still required for Android/iOS, landscape, accessible zoom, market disconnection, authenticated owner account data, and all actual trading/chart drawing workflows. New CSS changes should fix specific reproduced failures in focused PRs. Never upload screenshots containing private balances, user information or credentials to public CI.

Tracking: [DizyTrades UI/CSS audit #377](https://github.com/DizygoticCode/DizyTrades/issues/377). No server deployment or guarded-execution work is part of this matrix.
