-- 0011 — Seed the skill test question bank for the 3 Tier A launch categories.
-- Spec calls for 3 different test designs:
--   1. Spreadsheet: messy real-world source practical (20-25 min)
--   2. Tech: real existing codebase debugging (45-60 min, auto-graded)
--   3. Mentoring: subject-matter MCQ + live mock session roleplay
--
-- We seed:
--   * 12 MCQ questions per category (mix of difficulties)
--   * 2 practical questions per category (one for the practical component)
--
-- The test runner UI (app/dashboard/skills/test/test-runner.tsx) already supports
-- MCQ and practical question types. Run this to populate the bank and the
-- test runner will start showing real questions.

do $$
declare
  v_spreadsheet uuid;
  v_tech        uuid;
  v_mentoring   uuid;
begin
  select id into v_spreadsheet from skill_categories where slug = 'data-messy-source-entry';
  select id into v_tech        from skill_categories where slug = 'tech-bugfix-real-codebase';
  select id into v_mentoring   from skill_categories where slug = 'mentor-live-1on1';

  -- ===================================================================
  -- SPREADSHEET: Messy-source data entry
  -- ===================================================================
  insert into skill_test_questions (category_id, question_type, content, correct_answer, difficulty, time_estimate_seconds) values
    (v_spreadsheet, 'mcq',
     '{"prompt":"You receive a folder of 50 photographed paper invoices with skewed angles, shadows, and partial smudges. Several are in Hindi, some in English. What is the most defensible first step?","options":["Run them through an OCR tool and submit the output as-is","Manually transcribe each one from scratch","Run OCR, then have a human verify every ambiguous field against the original photo","Send them back to the client for cleaner scans"],"correct_option":"Run OCR, then have a human verify every ambiguous field against the original photo","wage_band":{"min":15000,"max":80000}}',
     '"C"', 2, 90),
    (v_spreadsheet, 'mcq',
     '{"prompt":"A vendor sends you 3 CSV exports of the same product list, but with different column names, conflicting prices, and ~15% duplicate SKUs with typos. What is the correct deliverable?","options":["Pick whichever export is most recent and use that","Merge into one canonical sheet, flag ambiguous rows for buyer review, write a 1-page summary of what was merged","Send all 3 back and ask the vendor to reconcile themselves","Average the prices and dedupe by name"],"correct_option":"Merge into one canonical sheet, flag ambiguous rows for buyer review, write a 1-page summary of what was merged","wage_band":{"min":15000,"max":80000}}',
     '"B"', 2, 120),
    (v_spreadsheet, 'mcq',
     '{"prompt":"You discover a row in a client spreadsheet where the value 1,200,000 is ambiguous (could be 1.2M, could be 12 lakh, could be 1,200). What do you do?","options":["Pick the most likely interpretation silently and move on","Insert your best guess, then mark the cell red and add a comment explaining the ambiguity for the client","Refuse to enter the row at all","Email the client once a day until they respond"],"correct_option":"Insert your best guess, then mark the cell red and add a comment explaining the ambiguity for the client","wage_band":{"min":15000,"max":80000}}',
     '"B"', 3, 120),
    (v_spreadsheet, 'mcq',
     '{"prompt":"A buyer''s CRM has 4,000 contacts with 30 columns. 12% have missing emails, 8% have multiple phone numbers, 5% are duplicates of each other. What is the right way to deliver this cleanup?","options":["Delete all duplicates silently","Deliver the cleaned sheet, a written log of every rule you applied, and a list of the top 50 records that needed manual judgment","Keep a copy of the original and only return what you think is correct","Charge per row cleaned"],"correct_option":"Deliver the cleaned sheet, a written log of every rule you applied, and a list of the top 50 records that needed manual judgment","wage_band":{"min":15000,"max":80000}}',
     '"B"', 3, 150),
    (v_spreadsheet, 'mcq',
     '{"prompt":"A client asks you to clean a spreadsheet and \"use AI to do it faster.\" You should:","options":["Use ChatGPT on the data and submit its output","Refuse outright and tell them AI can''t do it","Use AI as a first pass, then do a 100% human verification pass — and tell the client this is your approach","Quote them a lower price because AI made it fast"],"correct_option":"Use AI as a first pass, then do a 100% human verification pass — and tell the client this is your approach","wage_band":{"min":15000,"max":80000}}',
     '"C"', 3, 120),
    (v_spreadsheet, 'mcq',
     '{"prompt":"You are entering data from 200 handwritten medical forms. 30 of them have an unreadable patient name. What do you do?","options":["Make up plausible names to fill the rows","Leave the name cell blank for those 30 rows","Mark the cell with a clear \"UNREADABLE — see original scan\" tag and flag the row in a separate review document for the client","Refuse the entire job","correct_option":"Mark the cell with a clear \"UNREADABLE — see original scan\" tag and flag the row in a separate review document for the client","wage_band":{"min":15000,"max":80000}}',
     '"C"', 3, 150),
    (v_spreadsheet, 'mcq',
     '{"prompt":"Which of these is a real AI-resistance justification for spreadsheet/data work?","options":["It is fast","It is cheaper","AI/OCR still makes meaningful errors on genuinely messy real-world sources, and a human must verify against the original","Excel formulas are hard"],"correct_option":"AI/OCR still makes meaningful errors on genuinely messy real-world sources, and a human must verify against the original","wage_band":{"min":15000,"max":80000}}',
     '"C"', 1, 60),
    (v_spreadsheet, 'mcq',
     '{"prompt":"A buyer says \"just paste the data into ChatGPT to do it faster.\" The right response is:","options":["OK, do it","Politely decline and explain that for this kind of work, a verified human is more accurate and protects their data better","Charge more for the same work","Send them a tutorial on how to use ChatGPT themselves","correct_option":"Politely decline and explain that for this kind of work, a verified human is more accurate and protects their data better","wage_band":{"min":15000,"max":80000}}',
     '"B"', 2, 90),
    (v_spreadsheet, 'mcq',
     '{"prompt":"A client''s spreadsheet has 1,000 rows. 50 have a column that says \"see attached\". You should:","options":["Skip those 50 rows","Fill them in with N/A","Flag the 50 rows in a separate report and ask the client where the attached files are","Guess based on context"],"correct_option":"Flag the 50 rows in a separate report and ask the client where the attached files are","wage_band":{"min":15000,"max":80000}}',
     '"C"', 2, 120),
    (v_spreadsheet, 'mcq',
     '{"prompt":"What is the most defensible reason to charge more for a data entry job that \"looks simple\"?","options":["To maximize profit","Because the messiness is the work, and most clients underestimate it","Because the client is rich","To discourage the client","correct_option":"Because the messiness is the work, and most clients underestimate it","wage_band":{"min":15000,"max":80000}}',
     '"B"', 2, 90),
    (v_spreadsheet, 'mcq',
     '{"prompt":"A buyer gives you 4 spreadsheets of the same data with different formatting. The right approach is:","options":["Pick the most recent and use that","Refuse and tell them to consolidate themselves","Reconcile them into a single canonical sheet, document the rules, flag conflicts","Charge 4x and process all 4 separately","correct_option":"Reconcile them into a single canonical sheet, document the rules, flag conflicts","wage_band":{"min":15000,"max":80000}}',
     '"C"', 2, 120),
    (v_spreadsheet, 'mcq',
     '{"prompt":"Why is sensitive/confidential data handling a real HiVR category?","options":["Because clients like secrecy","Because the buyer will not paste their data into a third-party AI tool for privacy/compliance reasons — a contracted human with NDA is the right fit","Because we can charge more","Because lawyers require it","correct_option":"Because the buyer will not paste their data into a third-party AI tool for privacy/compliance reasons — a contracted human with NDA is the right fit","wage_band":{"min":15000,"max":80000}}',
     '"B"', 2, 90),

    -- PRACTICAL: Spreadsheet
    (v_spreadsheet, 'practical',
     '{"prompt":"You are given 5 photographed paper receipts. Transcribe each into a row in a CSV with columns: date, vendor, amount, currency. Use judgment where the image is unclear, mark uncertain fields with [UNCLEAR], and write a 3-bullet review note for the client highlighting the most ambiguous rows.","sample_input":"5 attached receipt images","rubric":"5 rows delivered with the correct schema; every ambiguous field marked [UNCLEAR] with a short reason; review note covers the 3 most-ambiguous rows; CSV is valid and openable in Excel/Sheets","time_limit_minutes":25}',
     '{"evaluation":"rubric-based","auto_gradable":false}',
     4, 1500);

  -- ===================================================================
  -- TECH: Bug fixes in a real existing codebase
  -- ===================================================================
  insert into skill_test_questions (category_id, question_type, content, correct_answer, difficulty, time_estimate_seconds) values
    (v_tech, 'mcq',
     '{"prompt":"A buyer''s Next.js app has a NextAuth callback that intermittently returns 500. The repo has existing conventions and a deployed staging env. You will get repo access. What is your first step?","options":["Rewrite the auth code from scratch","Reproduce the bug locally, then in the staging env, then add structured logging around the callback, then bisect recent commits","Guess based on the error name","Tell the buyer to use a different auth library","correct_option":"Reproduce the bug locally, then in the staging env, then add structured logging around the callback, then bisect recent commits","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 120),
    (v_tech, 'mcq',
     '{"prompt":"You are reviewing a 600-line PR. The buyer wants you to flag codebase-specific issues, not syntax. Your primary value is:","options":["Catching typos","Reading the existing codebase conventions and flagging where the PR deviates","Rewriting the PR in your own style","Checking for security issues only","correct_option":"Reading the existing codebase conventions and flagging where the PR deviates","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 120),
    (v_tech, 'mcq',
     '{"prompt":"A buyer''s deployment is failing in production but works in staging. You are given SSH access to the production box. What do you do FIRST?","options":["Restart the server","Check logs, recent deploys, env vars, and resource usage — do not change anything before diagnosis","Roll back to last working deploy without investigating","Email the buyer saying it''s not your problem","correct_option":"Check logs, recent deploys, env vars, and resource usage — do not change anything before diagnosis","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 120),
    (v_tech, 'mcq',
     '{"prompt":"You are integrating a third-party payment gateway into a buyer''s live app. The integration fails with a confusing API error. What is the right first move?","options":["Try random fixes until something works","Read the API error carefully, check your request against the API docs, check the live API response, then ask the buyer to confirm their account is in good standing on the gateway","Post on Stack Overflow","Tell the buyer the gateway is broken","correct_option":"Read the API error carefully, check your request against the API docs, check the live API response, then ask the buyer to confirm their account is in good standing on the gateway","wage_band":{"min":40000,"max":250000}}',
     '"B"', 3, 120),
    (v_tech, 'mcq',
     '{"prompt":"The spec for HiVR excludes which of the following tasks?","options":["Debugging a real failing build in production","Integrating a payment gateway with live API access","Writing a one-shot utility function from a clean spec","Deployment help in the buyer''s actual environment","correct_option":"Writing a one-shot utility function from a clean spec","wage_band":{"min":40000,"max":250000}}',
     '"C"', 2, 90),
    (v_tech, 'mcq',
     '{"prompt":"A real-codebase bug fix is being AI-resistant primarily because:","options":["The buyer''s codebase is secret","AI still struggles badly without full project context and history","The code is in an unusual language","The code is very long","correct_option":"AI still struggles badly without full project context and history","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 90),
    (v_tech, 'mcq',
     '{"prompt":"A frontend fix on an existing live site: which of these is in scope for HiVR?","options":["Build a brand new component from a clean spec","Fix a layout bug in a 5-year-old component that uses 2 deprecated libraries","Rewrite the entire homepage because the design is dated","A WordPress plugin tweak from a tutorial","correct_option":"Fix a layout bug in a 5-year-old component that uses 2 deprecated libraries","wage_band":{"min":40000,"max":250000}}',
     '"B"', 3, 90),
    (v_tech, 'mcq',
     '{"prompt":"What is the right way to deliver a perf audit for a live site?","options":["Run Lighthouse and send the report","Run a real-user measurement + Lighthouse + targeted profile traces + a prioritized list of fixes with effort estimates","Make the changes yourself and bill for them","Tell the buyer the site is slow","correct_option":"Run a real-user measurement + Lighthouse + targeted profile traces + a prioritized list of fixes with effort estimates","wage_band":{"min":40000,"max":250000}}',
     '"B"', 3, 120),
    (v_tech, 'mcq',
     '{"prompt":"A buyer asks you to fix a critical production bug but refuses to give you staging access. What do you do?","options":["Try to fix it blind","Push back: explain that you cannot reliably fix production without being able to reproduce, and offer to do best-effort without guarantees, with that risk in writing","Quit the job","Charge triple","correct_option":"Push back: explain that you cannot reliably fix production without being able to reproduce, and offer to do best-effort without guarantees, with that risk in writing","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 120),
    (v_tech, 'mcq',
     '{"prompt":"Which of these is most clearly AI-resistant and belongs on HiVR?","options":["Writing a single self-contained function from a clear spec with no codebase context","Debugging a real failing build with repo access, real server, real credentials","A one-shot CSS color tweak the buyer could do in 30 seconds with a tutorial","A generic best-practice review on isolated snippets","correct_option":"Debugging a real failing build with repo access, real server, real credentials","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 90),
    (v_tech, 'mcq',
     '{"prompt":"The HiVR wage band for Tech Micro-Tasks is higher than Spreadsheet because:","options":["Developers are smarter","Real-codebase debugging and live-environment work commands a premium specifically because it is hardest for AI to substitute","Buyers are richer","It is a Tier A category","correct_option":"Real-codebase debugging and live-environment work commands a premium specifically because it is hardest for AI to substitute","wage_band":{"min":40000,"max":250000}}',
     '"B"', 2, 90),
    (v_tech, 'mcq',
     '{"prompt":"You commit a fix to a buyer''s repo and tests pass locally. The buyer reports it still fails in staging. What do you do FIRST?","options":["Revert and refund","Re-read your diff, check the staging env for differences (env vars, build settings, deployed commit), then iterate in staging with the buyer watching","Claim it works on your machine","Ask the buyer to debug it","correct_option":"Re-read your diff, check the staging env for differences (env vars, build settings, deployed commit), then iterate in staging with the buyer watching","wage_band":{"min":40000,"max":250000}}',
     '"B"', 3, 120),

    -- PRACTICAL: Tech
    (v_tech, 'practical',
     '{"prompt":"A real, deliberately undocumented sandbox repo (a small Next.js app with an intentionally broken NextAuth callback that intermittently returns 500) is provided. Find the root cause, write a fix, and submit a PR-style diff. The repo has no documentation, no comments, and an unfamiliar structure. You have 60 minutes.","sample_input":"GitHub repo URL provided in test environment","rubric":"Root cause correctly identified (race condition, env var issue, or session mishandling); minimal targeted fix; no extraneous refactors; tests pass; no new security regressions; PR description explains the why","time_limit_minutes":60}',
     '{"evaluation":"test-suite + admin spot-check","auto_gradable":true,"test_cases":[{"name":"all_existing_tests_pass","weight":0.5},{"name":"regression_test_for_bug_fails_before_fix","weight":0.2},{"name":"regression_test_for_bug_passes_after_fix","weight":0.2},{"name":"no_unrelated_changes","weight":0.1}]}',
     5, 3600);

  -- ===================================================================
  -- MENTORING: Live adaptive 1:1 sessions
  -- ===================================================================
  insert into skill_test_questions (category_id, question_type, content, correct_answer, difficulty, time_estimate_seconds) values
    (v_mentoring, 'mcq',
     '{"prompt":"A student asks \"Can you just send me the solution to this calculus problem?\" The right HiVR-style response is:","options":["Send the solution","Refuse and tell them to ask a chatbot","Walk through it live, asking them what they tried and where they got stuck, adjusting the explanation to their confusion in real time","Charge more and send it","correct_option":"Walk through it live, asking them what they tried and where they got stuck, adjusting the explanation to their confusion in real time","wage_band":{"min":20000,"max":150000}}',
     '"C"', 2, 120),
    (v_mentoring, 'mcq',
     '{"prompt":"A student you''re mentoring for JEE keeps making the same algebra mistake. What is the right approach?","options":["Tell them to study harder","Notice the pattern, ask them to articulate the rule they''re applying, then walk through 2-3 counter-examples that break it, then re-test","Solve all the remaining problems for them","Drop them as a student","correct_option":"Notice the pattern, ask them to articulate the rule they''re applying, then walk through 2-3 counter-examples that break it, then re-test","wage_band":{"min":20000,"max":150000}}',
     '"B"', 3, 120),
    (v_mentoring, 'mcq',
     '{"prompt":"Why is \"live, adaptive 1:1\" on HiVR, not \"answer my doubt in writing\"?","options":["It is more expensive","It is a commodity that any chatbot does better","The value is the live interaction and a real person''s accountability, not the information itself","Writers are scarce","correct_option":"The value is the live interaction and a real person''s accountability, not the information itself","wage_band":{"min":20000,"max":150000}}',
     '"C"', 2, 90),
    (v_mentoring, 'mcq',
     '{"prompt":"During a live session, you realize the student is confused by something you assumed they knew. What is the right move?","options":["Push through to finish the syllabus","Stop, acknowledge the gap, backfill the missing concept with a quick worked example, then resume","Assign it as homework","Cancel the session","correct_option":"Stop, acknowledge the gap, backfill the missing concept with a quick worked example, then resume","wage_band":{"min":20000,"max":150000}}',
     '"B"', 2, 90),
    (v_mentoring, 'mcq',
     '{"prompt":"Exam-strategy mentoring on HiVR is distinctive because:","options":["Mentors are more expensive","The mentor has direct, repeated experience of a specific exam and that lived pattern-knowledge is not in generic AI training data at that specificity","It is more fashionable","The platform is exclusive","correct_option":"The mentor has direct, repeated experience of a specific exam and that lived pattern-knowledge is not in generic AI training data at that specificity","wage_band":{"min":20000,"max":150000}}',
     '"B"', 2, 90),
    (v_mentoring, 'mcq',
     '{"prompt":"A student asks for help on an assignment due in 2 hours. They admit they haven''t started. HiVR is built on:","options":["Doing the assignment for them","Helping them with anything that gets them a good grade","Helping them understand the underlying concepts and structure their work, but not doing the work for them","Refusing all urgent requests","correct_option":"Helping them understand the underlying concepts and structure their work, but not doing the work for them","wage_band":{"min":20000,"max":150000}}',
     '"C"', 2, 120),
    (v_mentoring, 'mcq',
     '{"prompt":"Accountability coaching on HiVR is structured as:","options":["Daily motivational messages","Regular scheduled check-ins over weeks/months, keeping the student on a study plan, with the mentor as the human accountability partner","A single 1-hour session","Group webinars","correct_option":"Regular scheduled check-ins over weeks/months, keeping the student on a study plan, with the mentor as the human accountability partner","wage_band":{"min":20000,"max":150000}}',
     '"B"', 2, 90),
    (v_mentoring, 'mcq',
     '{"prompt":"When a student''s question is clearly something a chatbot could answer well in 30 seconds, the right move is:","options":["Answer it yourself to show expertise","Honestly tell them: \"this is exactly what a chatbot does well — use it for this one — save our session time for the parts where a real human helps you more\"","Refuse","Pretend you don''t know","correct_option":"Honestly tell them: \"this is exactly what a chatbot does well — use it for this one — save our session time for the parts where a real human helps you more","wage_band":{"min":20000,"max":150000}}',
     '"C"', 2, 90),
    (v_mentoring, 'mcq',
     '{"prompt":"For a human-signed-off essay review on HiVR, your job is:","options":["Fix all the grammar","Give substantive feedback on argument, structure, and substance — and stake your name on \"this is genuinely ready to submit\"","Just say \"looks good\" if it doesn''t have spelling errors","Charge by the word","correct_option":"Give substantive feedback on argument, structure, and substance — and stake your name on \"this is genuinely ready to submit\"","wage_band":{"min":20000,"max":150000}}',
     '"B"', 3, 120),
    (v_mentoring, 'mcq',
     '{"prompt":"A language conversation practice session is fundamentally:","options":["Vocabulary drills","A live spoken exchange with real-time correction, adaptation to the learner''s level, and conversation management — an interaction product, not a content product","A reading-aloud exercise","A grammar lecture","correct_option":"A live spoken exchange with real-time correction, adaptation to the learner''s level, and conversation management — an interaction product, not a content product","wage_band":{"min":20000,"max":150000}}',
     '"B"', 2, 90),
    (v_mentoring, 'mcq',
     '{"prompt":"What is the correct framing for a mentor on HiVR?","options":["You are a teacher, deliver knowledge","You are a learning partner — your value is real-time adaptability, accountability, and judgment, not content","You are a chatbot with a face","You are a content creator","correct_option":"You are a learning partner — your value is real-time adaptability, accountability, and judgment, not content","wage_band":{"min":20000,"max":150000}}',
     '"B"', 1, 60),
    (v_mentoring, 'mcq',
     '{"prompt":"During a live session the student gets visibly frustrated. What is the right move?","options":["Continue with the planned content","Pause, acknowledge the frustration, offer to take a 2-minute break or switch to a related-but-different angle, then check in before resuming","End the session","Charge extra","correct_option":"Pause, acknowledge the frustration, offer to take a 2-minute break or switch to a related-but-different angle, then check in before resuming","wage_band":{"min":20000,"max":150000}}',
     '"B"', 3, 90),

    -- PRACTICAL: Mentoring
    (v_mentoring, 'practical',
     '{"prompt":"Record a 5-minute mock mentoring session. The role-play scenario: a student is stuck on a concept in the area of your expertise. The student plays confused and disengaged. Your job: read the confusion in real time, adapt your explanation, and keep them engaged. Submit the recording (or a written transcript if recording is unavailable) plus a 200-word self-reflection on what you noticed and how you adapted.","sample_input":"A role-play prompt describing the student''s situation","rubric":"Detects the student''s confusion within the first 60 seconds; adjusts explanation style (analogy, example, slower pace) within 2 minutes; uses at least 2 different explanation approaches; keeps engagement through a question or a check-in; self-reflection identifies at least 2 specific moments and the rationale for the adaptation","time_limit_minutes":15}',
     '{"evaluation":"rubric-based","auto_gradable":false}',
     4, 900);

  raise notice 'Seeded 39 questions across 3 categories (12 MCQ + 1 practical per category).';
end $$;
