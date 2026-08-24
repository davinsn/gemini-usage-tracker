import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import DatabaseConstructor from 'better-sqlite3';

const __dirname = path.dirname(
    fileURLToPath(import.meta.url)
);

const app = express();

const port = Number(
    process.env.PORT || 4000
);

// ============================================================
// DATABASE
// ============================================================

const dbPath =
    process.env.DATABASE_PATH ||
    path.join(
        __dirname,
        '..',
        '..',
        'db',
        'gemini_observability.sqlite3'
    );

const initSqlPath =
    path.join(
        __dirname,
        '..',
        '..',
        'db',
        'init.sql'
    );

// Make sure the DB directory exists
fs.mkdirSync(
    path.dirname(dbPath),
    { recursive: true }
);

console.log('=================================');
console.log('[ai-obs] DATABASE PATH:');
console.log(dbPath);
console.log('[ai-obs] INIT SQL PATH:');
console.log(initSqlPath);
console.log('=================================');

// Open SQLite database
const db = new DatabaseConstructor(dbPath);

// Enable WAL
db.pragma('journal_mode = WAL');

// ------------------------------------------------------------
// CREATE TABLES
// ------------------------------------------------------------

if (!fs.existsSync(initSqlPath)) {
    throw new Error(
        `[ai-obs] init.sql not found at: ${initSqlPath}`
    );
}

const initSql = fs.readFileSync(
    initSqlPath,
    'utf8'
);

if (!initSql.trim()) {
    throw new Error(
        '[ai-obs] init.sql is empty'
    );
}

console.log('[ai-obs] Initialising database schema...');

db.exec(initSql);

console.log(
    '[ai-obs] Database schema initialised'
);

// ------------------------------------------------------------
// VERIFY TABLES
// ------------------------------------------------------------

const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
`).all();

console.log(
    '[ai-obs] DATABASE TABLES:',
    tables
);

if (tables.length === 0) {
    throw new Error(
        '[ai-obs] No SQLite tables were created. Check db/init.sql'
    );
}

console.log(
    `[ai-obs] SQLite database ready: ${dbPath}`
);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    cors({
        origin: true
    })
);

app.use(
    express.json({
        limit: '256kb'
    })
);

// ============================================================
// DASHBOARD
// ============================================================

app.use(
    express.static(
        path.join(
            __dirname,
            '..',
            '..',
            'dashboard'
        )
    )
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/', (_req, res) => {
    try {
        db.prepare(
            'SELECT 1'
        ).get();

        res.json({
            ok: true,
            service: 'ai-observability-api',
            db: 'sqlite'
        });

    } catch (error) {

        console.error(
            '[ai-obs] HEALTH ERROR:',
            error
        );

        res.status(503).json({
            ok: false,
            error: 'database_unavailable'
        });
    }
});

// ============================================================
// VALIDATION
// ============================================================

function validEmail(email) {

    return (
        typeof email === 'string' &&
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    );
}

// ============================================================
// SUPPORTED AI PRODUCTS
// ============================================================

const allowedProducts = {

    gemini: {
        provider: 'google'
    },

    chatgpt: {
        provider: 'openai'
    },

    claude: {
        provider: 'anthropic'
    },

    copilot: {
        provider: 'microsoft'
    },

    perplexity: {
        provider: 'perplexity'
    }

};

function validProduct(product) {

    return (
        typeof product === 'string' &&
        Object.prototype.hasOwnProperty.call(
            allowedProducts,
            product
        )
    );
}

// ============================================================
// PREPARED STATEMENTS
// ============================================================

const upsertEmployee = db.prepare(`
    INSERT INTO employees (
        email,
        department,
        role
    )
    VALUES (
        @email,
        @department,
        @role
    )
    ON CONFLICT(email) DO UPDATE SET

        department =
            COALESCE(
                @department,
                department
            ),

        role =
            COALESCE(
                @role,
                role
            )
`);

const getEmployeeId = db.prepare(
    'SELECT id FROM employees WHERE email = ?'
);

// ============================================================
// INSERT EVENT
// ============================================================

const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO usage_events
    (
        employee_id,
        provider,
        product,
        event_type,
        session_id,
        interaction_id,
        model,
        occurred_at,
        latency_ms,
        prompt_length,
        response_length,
        prompt_tokens,
        response_tokens,
        total_tokens,
        metadata
    )
    VALUES
    (
        @employee_id,
        @provider,
        @product,
        @event_type,
        @session_id,
        @interaction_id,
        @model,
        @occurred_at,
        @latency_ms,
        @prompt_length,
        @response_length,
        @prompt_tokens,
        @response_tokens,
        @total_tokens,
        @metadata
    )
`);

// ============================================================
// COMPLETE EVENT
// ============================================================

const completeEvent = db.prepare(`
    UPDATE usage_events

    SET

        provider =
            @provider,

        product =
            @product,

        latency_ms =
            @latency_ms,

        prompt_length =
            @prompt_length,

        response_length =
            @response_length,

        prompt_tokens =
            @prompt_tokens,

        response_tokens =
            @response_tokens,

        total_tokens =
            @total_tokens,

        model =
            @model,

        metadata =
            @metadata

    WHERE employee_id =
        @employee_id

      AND interaction_id =
        @interaction_id

      AND product =
        @product
`);

// ============================================================
// DUMMY COMPANY EMPLOYEES
// ============================================================

const dummyEmployees = [

    {
        email: 'ali@company.com',
        department: 'Engineering',
        role: 'Software Engineer'
    },

    {
        email: 'davin@company.com',
        department: 'Engineering',
        role: 'Software Engineer'
    },

    {
        email: 'sarah@company.com',
        department: 'Marketing',
        role: 'Marketing Executive'
    },

    {
        email: 'jason@company.com',
        department: 'Finance',
        role: 'Financial Analyst'
    },

    {
        email: 'mei@company.com',
        department: 'Human Resources',
        role: 'HR Executive'
    },

    {
        email: 'daniel@company.com',
        department: 'Engineering',
        role: 'Backend Developer'
    },

    {
        email: 'farah@company.com',
        department: 'Operations',
        role: 'Operations Executive'
    },

    {
        email: 'ryan@company.com',
        department: 'Sales',
        role: 'Sales Executive'
    }

];

// ============================================================
// SEED EMPLOYEES
// ============================================================

const seedEmployees = db.transaction(() => {

    for (const employee of dummyEmployees) {

        upsertEmployee.run({

            email:
                employee.email,

            department:
                employee.department,

            role:
                employee.role
        });
    }

});

seedEmployees();

console.log(
    `[ai-obs] Loaded ${dummyEmployees.length} dummy employees`
);

// ============================================================
// DUMMY AI USAGE PROFILES
// ============================================================

const usageProfiles = {

    'ali@company.com': {

        gemini: {
            sessions: 24,
            interactions: 183
        },

        chatgpt: {
            sessions: 17,
            interactions: 121
        },

        claude: {
            sessions: 9,
            interactions: 63
        }
    },

    'davin@company.com': {

        gemini: {
            sessions: 31,
            interactions: 247
        },

        chatgpt: {
            sessions: 24,
            interactions: 183
        },

        claude: {
            sessions: 14,
            interactions: 96
        },

        copilot: {
            sessions: 8,
            interactions: 52
        }
    },

    'sarah@company.com': {

        gemini: {
            sessions: 18,
            interactions: 96
        },

        chatgpt: {
            sessions: 13,
            interactions: 74
        },

        claude: {
            sessions: 11,
            interactions: 61
        }
    },

    'jason@company.com': {

        gemini: {
            sessions: 12,
            interactions: 64
        },

        chatgpt: {
            sessions: 9,
            interactions: 47
        }
    },

    'mei@company.com': {

        gemini: {
            sessions: 21,
            interactions: 119
        },

        claude: {
            sessions: 15,
            interactions: 88
        },

        chatgpt: {
            sessions: 10,
            interactions: 57
        }
    },

    'daniel@company.com': {

        gemini: {
            sessions: 27,
            interactions: 156
        },

        chatgpt: {
            sessions: 19,
            interactions: 113
        },

        claude: {
            sessions: 12,
            interactions: 71
        },

        copilot: {
            sessions: 16,
            interactions: 89
        },

        perplexity: {
            sessions: 7,
            interactions: 34
        }
    },

    'farah@company.com': {

        gemini: {
            sessions: 15,
            interactions: 83
        },

        chatgpt: {
            sessions: 11,
            interactions: 61
        },

        perplexity: {
            sessions: 6,
            interactions: 28
        }
    },

    'ryan@company.com': {

        gemini: {
            sessions: 19,
            interactions: 102
        },

        chatgpt: {
            sessions: 14,
            interactions: 76
        },

        claude: {
            sessions: 8,
            interactions: 41
        }
    }

};

// ============================================================
// SEED DUMMY MULTI-AI USAGE
// ============================================================

function seedDummyUsage() {

    const existing = db
        .prepare(`
            SELECT COUNT(*) AS count
            FROM usage_events
            WHERE metadata LIKE '%dummy_seed%'
        `)
        .get();

    if (existing.count > 0) {
        console.log(
            `[ai-obs] Dummy usage already exists: ${existing.count} rows`
        );

        return;
    }

    console.log(
        '[ai-obs] Creating dummy multi-AI usage data...'
    );

    const seedUsage = db.transaction(() => {

        for (const employee of dummyEmployees) {

            const employeeRow =
                getEmployeeId.get(
                    employee.email
                );

            if (!employeeRow) {
                throw new Error(
                    `Employee not found: ${employee.email}`
                );
            }

            const employeeId =
                employeeRow.id;

            const employeeProfiles =
                usageProfiles[
                    employee.email
                ];

            if (!employeeProfiles) {
                continue;
            }

            for (
                const [product, profile]
                of Object.entries(employeeProfiles)
            ) {

                const productConfig =
                    allowedProducts[product];

                if (!productConfig) {
                    console.warn(
                        `[ai-obs] Unknown product: ${product}`
                    );

                    continue;
                }

                const provider =
                    productConfig.provider;

                let interactionsRemaining =
                    profile.interactions;

                for (
                    let sessionNumber = 1;
                    sessionNumber <= profile.sessions;
                    sessionNumber++
                ) {

                    if (
                        interactionsRemaining <= 0
                    ) {
                        break;
                    }

                    const remainingSessions =
                        profile.sessions -
                        sessionNumber +
                        1;

                    let interactionsThisSession =
                        Math.ceil(
                            interactionsRemaining /
                            remainingSessions
                        );

                    if (
                        sessionNumber % 3 === 0
                    ) {
                        interactionsThisSession += 1;
                    }

                    interactionsThisSession =
                        Math.min(
                            interactionsThisSession,
                            interactionsRemaining
                        );

                    const sessionId =
                        `dummy-${product}-${employee.email}-${sessionNumber}`;

                    for (
                        let interactionNumber = 1;
                        interactionNumber <=
                        interactionsThisSession;
                        interactionNumber++
                    ) {

                        const interactionId =
                            `dummy-${product}-${employee.email}-${sessionNumber}-${interactionNumber}`;

                        const latency =
                            Math.floor(
                                500 +
                                Math.random() * 900
                            );

                        const promptLength =
                            Math.floor(
                                40 +
                                Math.random() * 600
                            );

                        const responseLength =
                            Math.floor(
                                100 +
                                Math.random() * 1800
                            );

                        const promptTokens =
                            Math.floor(
                                promptLength / 4
                            );

                        const responseTokens =
                            Math.floor(
                                responseLength / 4
                            );

                        const totalTokens =
                            promptTokens +
                            responseTokens;

                        const daysAgo =
                            Math.floor(
                                Math.random() * 30
                            );

                        const hoursAgo =
                            Math.floor(
                                Math.random() * 24
                            );

                        const occurredAt =
                            new Date(
                                Date.now()
                                -
                                daysAgo *
                                24 *
                                60 *
                                60 *
                                1000
                                -
                                hoursAgo *
                                60 *
                                60 *
                                1000
                            ).toISOString();

                        const modelMap = {
                            gemini:
                                'gemini-2.5-flash',

                            chatgpt:
                                'gpt-5',

                            claude:
                                'claude-sonnet',

                            copilot:
                                'copilot',

                            perplexity:
                                'sonar'
                        };

                        const model =
                            modelMap[product];

                        const metadata =
                            JSON.stringify({
                                source:
                                    'dummy_seed',

                                provider,

                                product,

                                account_type:
                                    'company',

                                browser:
                                    'Chrome',

                                generated:
                                    true
                            });

                        // ------------------------------------------------
                        // INSERT INTERACTION
                        // ------------------------------------------------

                        insertEvent.run({

                            employee_id:
                                employeeId,

                            provider,

                            product,

                            event_type:
                                'interaction_started',

                            session_id:
                                sessionId,

                            interaction_id:
                                interactionId,

                            model,

                            occurred_at:
                                occurredAt,

                            latency_ms:
                                null,

                            prompt_length:
                                null,

                            response_length:
                                null,

                            prompt_tokens:
                                null,

                            response_tokens:
                                null,

                            total_tokens:
                                null,

                            metadata
                        });

                        // ------------------------------------------------
                        // COMPLETE INTERACTION
                        // ------------------------------------------------

                        completeEvent.run({

                            employee_id:
                                employeeId,

                            provider,

                            product,

                            interaction_id:
                                interactionId,

                            latency_ms:
                                latency,

                            prompt_length:
                                promptLength,

                            response_length:
                                responseLength,

                            prompt_tokens:
                                promptTokens,

                            response_tokens:
                                responseTokens,

                            total_tokens:
                                totalTokens,

                            model,

                            metadata
                        });
                    }

                    interactionsRemaining -=
                        interactionsThisSession;
                }
            }
        }
    });

    // Actually execute transaction
    seedUsage();

    // ------------------------------------------------------------
    // VERIFY INSERTION
    // ------------------------------------------------------------

    const usageCount =
        db.prepare(`
            SELECT COUNT(*) AS count
            FROM usage_events
        `).get();

    const employeeCount =
        db.prepare(`
            SELECT COUNT(*) AS count
            FROM employees
        `).get();

    console.log(
        `[ai-obs] Employees in DB: ${employeeCount.count}`
    );

    console.log(
        `[ai-obs] Usage events in DB: ${usageCount.count}`
    );

    if (usageCount.count === 0) {
        throw new Error(
            '[ai-obs] Dummy usage seeding completed but usage_events is empty'
        );
    }

    console.log(
        '[ai-obs] Dummy multi-AI usage created successfully'
    );
}

seedDummyUsage();


// ============================================================
// DATABASE DEBUG
// ============================================================

console.log('=================================');
console.log('[ai-obs] DATABASE VERIFICATION');
console.log('=================================');

const employeeCount =
    db.prepare(`
        SELECT COUNT(*) AS count
        FROM employees
    `).get();

const usageCount =
    db.prepare(`
        SELECT COUNT(*) AS count
        FROM usage_events
    `).get();

console.log(
    '[ai-obs] Employees:',
    employeeCount.count
);

console.log(
    '[ai-obs] Usage events:',
    usageCount.count
);

console.log(
    '[ai-obs] Sample usage:',
    db.prepare(`
        SELECT
            id,
            employee_id,
            provider,
            product,
            event_type,
            session_id,
            interaction_id,
            total_tokens
        FROM usage_events
        LIMIT 5
    `).all()
);

console.log('=================================');

// ============================================================
// EVENT INGESTION
// ============================================================

app.post(
    '/api/usage/events',
    (req, res) => {

        const body =
            req.body || {};

        const {

            email,
            department,
            role,
            provider,
            product,
            event_type,
            session_id,
            interaction_id,
            model,
            occurred_at,
            latency_ms,
            prompt_length,
            response_length,
            prompt_tokens,
            response_tokens,
            total_tokens,
            metadata

        } = body;

        // VALIDATION

        if (
            !validEmail(email) ||
            !validProduct(product) ||
            typeof event_type !== 'string' ||
            !occurred_at
        ) {

            return res.status(400).json({

                error:
                    'email, product, event_type and occurred_at are required'

            });
        }

        const expectedProvider =
            allowedProducts[
                product
            ].provider;

        if (
            provider &&
            provider !== expectedProvider
        ) {

            return res.status(400).json({

                error:
                    'provider does not match product'

            });
        }

        try {

            const insertAll =
                db.transaction(() => {

                    // EMPLOYEE

                    upsertEmployee.run({

                        email,

                        department:
                            department ?? null,

                        role:
                            role ?? null

                    });

                    const employeeId =
                        getEmployeeId
                            .get(email)
                            .id;

                    const interactionId =
                        interaction_id ||
                        crypto.randomUUID();

                    const metadataJson =
                        JSON.stringify(
                            metadata ?? {}
                        );

                    const finalProvider =
                        expectedProvider;

                    // COMPLETED EVENT

                    if (
                        event_type ===
                        'interaction_completed'
                    ) {

                        const result =
                            completeEvent.run({

                                employee_id:
                                    employeeId,

                                provider:
                                    finalProvider,

                                product,

                                interaction_id:
                                    interactionId,

                                latency_ms:
                                    latency_ms ??
                                    null,

                                prompt_length:
                                    prompt_length ??
                                    null,

                                response_length:
                                    response_length ??
                                    null,

                                prompt_tokens:
                                    prompt_tokens ??
                                    null,

                                response_tokens:
                                    response_tokens ??
                                    null,

                                total_tokens:
                                    total_tokens ??
                                    null,

                                model:
                                    model ??
                                    null,

                                metadata:
                                    metadataJson

                            });

                        return {

                            inserted:
                                result.changes === 1,

                            event_id:
                                null

                        };
                    }

                    // NEW EVENT

                    const result =
                        insertEvent.run({

                            employee_id:
                                employeeId,

                            provider:
                                finalProvider,

                            product,

                            event_type,

                            session_id:
                                session_id ??
                                null,

                            interaction_id:
                                interactionId,

                            model:
                                model ??
                                null,

                            occurred_at,

                            latency_ms:
                                latency_ms ??
                                null,

                            prompt_length:
                                prompt_length ??
                                null,

                            response_length:
                                response_length ??
                                null,

                            prompt_tokens:
                                prompt_tokens ??
                                null,

                            response_tokens:
                                response_tokens ??
                                null,

                            total_tokens:
                                total_tokens ??
                                null,

                            metadata:
                                metadataJson
                        });

                    return {

                        inserted:
                            result.changes === 1,

                        event_id:
                            result.lastInsertRowid

                    };
                });

            const {
                inserted,
                event_id
            } = insertAll();

            res.status(201).json({

                accepted:
                    true,

                inserted,

                event_id:
                    inserted
                        ? event_id
                        : null
            });

        } catch (error) {

            console.error(
                '[ai-obs] EVENT INGESTION ERROR:',
                error
            );

            res.status(500).json({

                error:
                    'event_ingestion_failed'

            });
        }
    }
);

// ============================================================
// OVERALL USAGE SUMMARY
// ============================================================

app.get(
    '/api/usage/summary',
    (_req, res) => {

        try {

            const row = db.prepare(`
                          SELECT

                              COUNT(DISTINCT interaction_id)
                              FILTER (
                                  WHERE interaction_id IS NOT NULL
                              ) AS interactions,

                              COUNT(DISTINCT employee_id)
                              FILTER (
                                  WHERE interaction_id IS NOT NULL
                              ) AS active_employees,

                              COUNT(DISTINCT session_id)
                              FILTER (
                                  WHERE session_id IS NOT NULL
                              ) AS sessions,

                              ROUND(
                                  AVG(latency_ms)
                                  FILTER (
                                      WHERE latency_ms IS NOT NULL
                                  )
                              ) AS avg_latency_ms,

                              COALESCE(
                                  SUM(total_tokens),
                                  0
                              ) AS total_tokens

                          FROM usage_events
                      `).get();

            res.json(row);

        } catch (error) {

            console.error(
                '[ai-obs] SUMMARY ERROR:',
                error
            );

            res.status(500).json({

                error:
                    'summary_failed'

            });
        }
    }
);

// ============================================================
// USAGE BY EMPLOYEE
// ============================================================

app.get(
    '/api/usage/by-employee',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT

                        e.email,

                        e.department,

                        e.role,

                        COUNT(*)
                        FILTER (
                            WHERE u.event_type =
                            'interaction_started'
                        ) AS interactions,

                        COUNT(
                            DISTINCT u.session_id
                        )
                        FILTER (
                            WHERE u.session_id
                            IS NOT NULL
                        ) AS sessions,

                        ROUND(
                            AVG(u.latency_ms)
                            FILTER (
                                WHERE u.latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN u.event_type =
                                    'interaction_completed'
                                    THEN u.total_tokens
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS total_tokens

                    FROM employees e

                    LEFT JOIN usage_events u
                        ON u.employee_id =
                           e.id

                    GROUP BY

                        e.id,
                        e.email,
                        e.department,
                        e.role

                    ORDER BY
                        interactions DESC

                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] EMPLOYEE SUMMARY ERROR:',
                error
            );

            res.status(500).json({

                error:
                    'employee_summary_failed'

            });
        }
    }
);

// ============================================================
// USAGE BY PROVIDER
// ============================================================

app.get(
    '/api/usage/by-provider',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT

                        provider,

                        COUNT(*) FILTER (
                            WHERE event_type =
                            'interaction_started'
                        ) AS interactions,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        COUNT(
                            DISTINCT employee_id
                        ) AS employees,

                        ROUND(
                            AVG(latency_ms)
                            FILTER (
                                WHERE latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN event_type =
                                    'interaction_completed'
                                    THEN total_tokens
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS total_tokens

                    FROM usage_events

                    GROUP BY provider

                    ORDER BY
                        interactions DESC

                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] PROVIDER SUMMARY ERROR:',
                error
            );

            res.status(500).json({

                error:
                    'provider_summary_failed'

            });
        }
    }
);

// ============================================================
// USAGE BY PRODUCT
// ============================================================

app.get(
    '/api/usage/by-product',
    (_req, res) => {

        try {

            const rows = db.prepare(`
                SELECT

                    provider,

                    product,

                    COUNT(*) FILTER (
                        WHERE event_type =
                        'interaction_started'
                    ) AS interactions,

                    COUNT(
                        DISTINCT session_id
                    ) AS sessions,

                    COUNT(
                        DISTINCT employee_id
                    ) AS employees,

                    ROUND(
                        AVG(latency_ms)
                        FILTER (
                            WHERE latency_ms IS NOT NULL
                        )
                    ) AS avg_latency_ms,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN event_type =
                                'interaction_completed'
                                THEN total_tokens
                                ELSE 0
                            END
                        ),
                        0
                    ) AS total_tokens

                FROM usage_events

                GROUP BY
                    provider,
                    product

                ORDER BY
                    interactions DESC
            `).all();


            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] PRODUCT SUMMARY ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'product_summary_failed'
            });

        }

    }
);




// ============================================================
// MULTI-AI DASHBOARD SUMMARY
// ============================================================

app.get(
    '/api/usage/multi-ai',
    (_req, res) => {

        try {

            const products = db.prepare(`
                SELECT

                    product,

                    provider,

                    COUNT(*) FILTER (
                        WHERE event_type =
                        'interaction_started'
                    ) AS interactions,

                    COUNT(
                        DISTINCT session_id
                    ) AS sessions,

                    COUNT(
                        DISTINCT employee_id
                    ) AS employees,

                    ROUND(
                        AVG(latency_ms)
                        FILTER (
                            WHERE latency_ms IS NOT NULL
                        )
                    ) AS avg_latency_ms,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN event_type =
                                'interaction_completed'
                                THEN total_tokens
                                ELSE 0
                            END
                        ),
                        0
                    ) AS total_tokens

                FROM usage_events

                GROUP BY
                    product,
                    provider

                ORDER BY
                    interactions DESC
            `).all();


            const employees = db.prepare(`
                SELECT

                    e.email,

                    e.department,

                    e.role,

                    u.product,

                    u.provider,

                    COUNT(*) FILTER (
                        WHERE u.event_type =
                        'interaction_started'
                    ) AS interactions,

                    COUNT(
                        DISTINCT u.session_id
                    ) AS sessions,

                    ROUND(
                        AVG(u.latency_ms)
                        FILTER (
                            WHERE u.latency_ms IS NOT NULL
                        )
                    ) AS avg_latency_ms,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN u.event_type =
                                'interaction_completed'
                                THEN u.total_tokens
                                ELSE 0
                            END
                        ),
                        0
                    ) AS total_tokens

                FROM employees e

                LEFT JOIN usage_events u
                    ON u.employee_id = e.id

                GROUP BY

                    e.id,
                    e.email,
                    e.department,
                    e.role,
                    u.product,
                    u.provider

                ORDER BY
                    e.email,
                    interactions DESC
            `).all();


            res.json({
                products,
                employees
            });


        } catch (error) {

            console.error(
                '[ai-obs] MULTI-AI ERROR:',
                error
            );

            res.status(500).json({
                error:
                    'multi_ai_summary_failed'
            });

        }

    }
);

// ============================================================
// USAGE BY EMPLOYEE + PRODUCT
// ============================================================

app.get(
    '/api/usage/by-employee-product',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT

                        e.email,

                        e.department,

                        e.role,

                        u.provider,

                        u.product,

                        COUNT(*) FILTER (
                            WHERE u.event_type =
                            'interaction_started'
                        ) AS interactions,

                        COUNT(
                            DISTINCT u.session_id
                        ) AS sessions,

                        ROUND(
                            AVG(u.latency_ms)
                            FILTER (
                                WHERE u.latency_ms
                                IS NOT NULL
                            )
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN u.event_type =
                                    'interaction_completed'
                                    THEN u.total_tokens
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS total_tokens

                    FROM employees e

                    JOIN usage_events u
                        ON u.employee_id =
                           e.id

                    GROUP BY

                        e.id,
                        e.email,
                        e.department,
                        e.role,
                        u.provider,
                        u.product

                    ORDER BY

                        e.email,

                        interactions DESC

                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] EMPLOYEE PRODUCT ERROR:',
                error
            );

            res.status(500).json({

                error:
                    'employee_product_summary_failed'

            });
        }
    }
);

// ============================================================
// DAILY USAGE
// ============================================================

app.get(
    '/api/usage/daily',
    (_req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT

                        usage_date,

                        SUM(interactions)
                            AS interactions,

                        SUM(sessions)
                            AS sessions,

                        ROUND(
                            AVG(avg_latency_ms)
                        ) AS avg_latency_ms

                    FROM daily_usage

                    GROUP BY usage_date

                    ORDER BY usage_date ASC

                `).all();

            res.json(rows);

        } catch (error) {

            console.error(
                '[ai-obs] DAILY USAGE ERROR:',
                error
            );

            res.status(500).json({

                error:
                    'daily_usage_failed'

            });
        }
    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    port,
    () => {

        console.log(
            `[ai-obs] AI observability API listening on http://localhost:${port}`
        );

        console.log(
            '[ai-obs] Supported products: Gemini, ChatGPT, Claude, Copilot, Perplexity'
        );
    }
);