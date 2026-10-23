# AlgoMentor AI: 3–5 minute demo

## Before presenting

- Use the deployed frontend and backend URLs. Confirm `/health/ready` returns 200 and the dashboard says the API and database are connected.
- Sync a **real public** Codeforces handle beforehand, including older pages if offered. Use a handle with enough varied solved problems to show a skill chart and recommendations. Do not call mocked test fixtures live data.
- Sign in with a real Supabase email link before the demo. Confirm one roadmap milestone can be saved and reopened.
- Configure a real Gemini or OpenAI key and test one review with your own short solution. If these checks fail, show the actual setup/error state and state which dependency is unavailable.

## Walkthrough

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:30 | Overview and connection state | “AlgoMentor AI turns public coding history into a learning plan. This dashboard is connected to our FastAPI API and Supabase PostgreSQL.” |
| 0:30–1:15 | Real Codeforces handle, saved solves, topic chart | “The official public API supplies profile, submissions, and problem metadata. Syncs deduplicate submissions; large histories resume in pages. Each problem counts once toward solved totals.” |
| 1:15–2:00 | Skill estimates and rationale | “Scores use distinct solves, rating difficulty, observed failures, and recent activity. The components and confidence are visible. Sparse or incomplete data produces no exact score.” |
| 2:00–2:40 | Recommendations page, one explanation and direct link | “Solved problems are filtered out. We rank the remaining catalog by weak topic, rating fit, prerequisites, and variety, and show why each problem appears.” |
| 2:40–3:25 | Roadmap, mark one ready milestone complete | “These twelve topics form a prerequisite graph. Completion persists to my signed-in account, and the next ready milestone can use the available skill evidence.” |
| 3:25–4:25 | Code review, saved feedback and history | “I paste my own solution and optional problem context. The backend sends text to a configured AI provider, validates the structured response, and stores the review. It never runs the code, and the feedback is advisory.” |
| 4:25–4:50 | Architecture or README | “React and Vite run on Vercel, FastAPI on Render, and Supabase provides PostgreSQL and Auth. API keys stay on the backend; the OpenAPI contract generates frontend types.” |

If an external service is unavailable, do not replace it with fixture data. Show its real error or insufficient-data state, explain what was verified locally, and move to the next working flow.
