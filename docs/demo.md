# Demo checklist

1. Verify the deployed database has migrations 001–006 and `/health/ready` returns ready. Test Google sign-in and refresh a protected route to confirm the session persists.
2. Connect a public Codeforces handle. Show the real imported profile, distinct accepted solves, submissions, topic chart, and last sync time. For a large account, continue the historical import until the cursor is complete.
3. Open the 38-topic branching roadmap. Pan, zoom, search, inspect prerequisites and official challenge links. Show a historical accepted submission marked verified. Only accepted submissions to assigned problems can complete a node.
4. Solve an assigned problem on Codeforces, return to the app, and select **Sync Progress**. Confirm verification, updated analytics, recommendations, and the next unlock. Wrong answers and duplicate accepted submissions do not count as new unique solves.
5. Open recommendations and explain a suggested unsolved, optional practice problem. Open Code Review, submit Python, C++, or Java code, and revisit the saved review.

The automated tests use deterministic Codeforces fixtures. A live end-to-end demonstration needs a configured Supabase project, authentication, network access to Codeforces, and an actual accepted submission; it cannot be certified by fixture tests alone.
