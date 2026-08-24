// config.js

export const employees = [
    {
        email: "adam@company.com",
        name: "Adam",
        department: "Engineering",
        sessions: 24,
        interactions: 183,
        avgLatencyMs: 820,
        totalUsageMinutes: 142
    },
    {
        email: "davin@company.com",
        name: "Davin",
        department: "Engineering",
        sessions: 31,
        interactions: 247,
        avgLatencyMs: 760,
        totalUsageMinutes: 186
    },
    {
        email: "sarah@company.com",
        name: "Sarah",
        department: "Marketing",
        sessions: 18,
        interactions: 96,
        avgLatencyMs: 910,
        totalUsageMinutes: 87
    },
    {
        email: "jason@company.com",
        name: "Jason",
        department: "Finance",
        sessions: 12,
        interactions: 64,
        avgLatencyMs: 1040,
        totalUsageMinutes: 53
    },
    {
        email: "mei@company.com",
        name: "Mei",
        department: "HR",
        sessions: 21,
        interactions: 119,
        avgLatencyMs: 880,
        totalUsageMinutes: 102
    }
];


// ============================================================
// GENERATE DUMMY SESSIONS + INTERACTIONS
// ============================================================

export const sessions = [];
export const interactions = [];

let sessionCounter = 1;
let interactionCounter = 1;

for (const employee of employees) {

    let interactionsRemaining = employee.interactions;

    for (
        let sessionNumber = 1;
        sessionNumber <= employee.sessions;
        sessionNumber++
    ) {

        // Spread interactions across sessions
        const sessionsRemaining =
            employee.sessions - sessionNumber + 1;

        let sessionInteractions =
            Math.ceil(
                interactionsRemaining /
                sessionsRemaining
            );

        // Small random variation
        const variation =
            Math.floor(Math.random() * 3) - 1;

        sessionInteractions =
            Math.max(
                1,
                sessionInteractions + variation
            );

        sessionInteractions =
            Math.min(
                sessionInteractions,
                interactionsRemaining
            );

        const sessionId =
            `session-${sessionCounter++}`;

        const sessionStart =
            new Date(
                Date.now() -
                Math.floor(Math.random() * 30) *
                24 * 60 * 60 * 1000
            );

        const sessionDuration =
            Math.floor(
                10 +
                Math.random() * 40
            );

        const sessionEnd =
            new Date(
                sessionStart.getTime() +
                sessionDuration * 60 * 1000
            );

        // ----------------------------------------------------
        // SESSION
        // ----------------------------------------------------

        sessions.push({
            id: sessionId,
            employeeEmail: employee.email,
            startedAt: sessionStart.toISOString(),
            endedAt: sessionEnd.toISOString(),
            durationMinutes: sessionDuration,
            interactions: sessionInteractions
        });

        // ----------------------------------------------------
        // INTERACTIONS
        // ----------------------------------------------------

        for (
            let i = 1;
            i <= sessionInteractions;
            i++
        ) {

            const latencyVariation =
                Math.floor(
                    Math.random() * 200
                ) - 100;

            const latency =
                Math.max(
                    100,
                    employee.avgLatencyMs +
                    latencyVariation
                );

            interactions.push({

                id:
                    `interaction-${interactionCounter++}`,

                sessionId:
                    sessionId,

                employeeEmail:
                    employee.email,

                timestamp:
                    new Date(
                        sessionStart.getTime() +
                        Math.random() *
                        sessionDuration *
                        60 * 1000
                    ).toISOString(),

                latencyMs:
                    latency,

                promptLength:
                    Math.floor(
                        50 +
                        Math.random() * 500
                    ),

                responseLength:
                    Math.floor(
                        100 +
                        Math.random() * 1500
                    ),

                model:
                    "gemini",

                status:
                    "completed"

            });
        }

        interactionsRemaining -=
            sessionInteractions;

        if (interactionsRemaining <= 0) {
            break;
        }
    }
}