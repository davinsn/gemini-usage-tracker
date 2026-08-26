// ============================================================
// AI OBSERVABILITY - MULTI-AI USAGE TRACKER
// SERVER.JS
// ============================================================

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import DatabaseConstructor from 'better-sqlite3';

// ============================================================
// PATH SETUP
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// APP CONFIGURATION
// ============================================================

const app = express();

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// DATABASE
// ============================================================

const DB_PATH = path.join(
    __dirname,
    'gemini_observability.sqlite3'
);

const db = new DatabaseConstructor(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// CREATE TABLES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        department TEXT,
        password_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        employee_id INTEGER,

        email TEXT,

        provider TEXT,

        product TEXT,

        event_type TEXT,

        session_id TEXT,

        interaction_id TEXT,

        model TEXT,

        occurred_at TEXT,

        latency_ms INTEGER,

        prompt_length INTEGER,

        response_length INTEGER,

        prompt_tokens INTEGER,

        response_tokens INTEGER,

        total_tokens INTEGER,

        estimated_tokens INTEGER,

        metadata TEXT,

        created_at TEXT DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (employee_id)
            REFERENCES employees(id)
            ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_employee
        ON usage_events(employee_id);

    CREATE INDEX IF NOT EXISTS idx_usage_email
        ON usage_events(email);

    CREATE INDEX IF NOT EXISTS idx_usage_provider
        ON usage_events(provider);

    CREATE INDEX IF NOT EXISTS idx_usage_product
        ON usage_events(product);

    CREATE INDEX IF NOT EXISTS idx_usage_session
        ON usage_events(session_id);

    CREATE INDEX IF NOT EXISTS idx_usage_interaction
        ON usage_events(interaction_id);

    CREATE INDEX IF NOT EXISTS idx_usage_occurred
        ON usage_events(occurred_at);
`);

// ============================================================
// AI PRODUCTS
// ============================================================

const AI_PRODUCTS = {
    gemini: {
        name: 'Gemini',
        provider: 'Google'
    },

    chatgpt: {
        name: 'ChatGPT',
        provider: 'OpenAI'
    },

    claude: {
        name: 'Claude',
        provider: 'Anthropic'
    },

    copilot: {
        name: 'Copilot',
        provider: 'Microsoft'
    },

    perplexity: {
        name: 'Perplexity',
        provider: 'Perplexity'
    },

    qwen: {
        name: 'Qwen',
        provider: 'Alibaba'
    }
};

// ============================================================
// AI PRICING
// ============================================================
//
// USD PER TOKEN
//
// These values are estimates used by the dashboard.
// They should be updated when the relevant provider pricing
// changes.
//
// ============================================================

const AI_PRICING = {

    gemini: {
        input: 0.0000001,
        output: 0.0000004
    },

    chatgpt: {
        input: 0.000005,
        output: 0.000015
    },

    claude: {
        input: 0.000003,
        output: 0.000015
    },

    copilot: {
        input: 0.000005,
        output: 0.000015
    },

    perplexity: {
        input: 0.000001,
        output: 0.000001
    },

    qwen: {
        input: 0.000001,
        output: 0.000002
    }
};

// ============================================================
// NORMALIZE PRODUCT
// ============================================================

function normalizeProduct(product) {

    if (!product) {
        return null;
    }

    const key = String(product)
        .trim()
        .toLowerCase();

    if (AI_PRODUCTS[key]) {
        return key;
    }

    return key;
}

// ============================================================
// NORMALIZE PROVIDER
// ============================================================

function normalizeProvider(provider) {

    if (!provider) {
        return null;
    }

    return String(provider)
        .trim()
        .toLowerCase();
}

// ============================================================
// NUMBER HELPER
// ============================================================

function numberOrZero(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return number;
}

// ============================================================
// TOKEN CALCULATOR
// ============================================================

function calculateEventCost(event) {

    if (!event) {
        return 0;
    }

    const product =
        normalizeProduct(
            event.product
        );

    const pricing =
        AI_PRICING[product];

    if (!pricing) {
        return 0;
    }

    const promptTokens =
        numberOrZero(
            event.prompt_tokens
        );

    const responseTokens =
        numberOrZero(
            event.response_tokens
        );

    return (
        promptTokens * pricing.input
    ) + (
        responseTokens * pricing.output
    );
}

// ============================================================
// FIND EMPLOYEE
// ============================================================

function findEmployee(email) {

    if (!email) {
        return null;
    }

    return db.prepare(`
        SELECT *
        FROM employees
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
    `).get(email);
}

// ============================================================
// GET EMPLOYEE BY ID
// ============================================================

function getEmployeeById(id) {

    if (!id) {
        return null;
    }

    return db.prepare(`
        SELECT *
        FROM employees
        WHERE id = ?
        LIMIT 1
    `).get(id);
}

// ============================================================
// BNM EXCHANGE RATE
// ============================================================
//
// BNM OpenAPI
//
// USD -> MYR
//
// The endpoint returns a list of currencies.
// We find USD and use the middle rate.
//
// ============================================================

let cachedBnmRate = null;
let cachedBnmRateTime = 0;

const BNM_CACHE_DURATION =
    15 * 60 * 1000;

// ============================================================
// FETCH BNM USD/MYR
// ============================================================

async function fetchBnmUsdMyrRate() {

    const now = Date.now();

    if (
        cachedBnmRate !== null &&
        (now - cachedBnmRateTime)
            < BNM_CACHE_DURATION
    ) {

        return cachedBnmRate;
    }

    const url =
        'https://api.bnm.gov.my/public/exchange-rate?session=0900&quote=rm';

    try {

        const response =
            await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        Accept:
                            'application/vnd.BNM.API.v1+json',

                        'User-Agent':
                            'AI-Observability-Dashboard/1.0'
                    }
                }
            );

        if (!response.ok) {

            throw new Error(
                `BNM API returned HTTP ${response.status}`
            );
        }

        const json =
            await response.json();

        if (
            !json ||
            !Array.isArray(json.data)
        ) {

            throw new Error(
                'Invalid response from BNM API'
            );
        }

        const usd =
            json.data.find(
                item =>
                    String(
                        item.currency_code
                    ).toUpperCase()
                    === 'USD'
            );

        if (!usd) {

            throw new Error(
                'USD exchange rate was not found in BNM response'
            );
        }

        const rate =
            numberOrZero(
                usd.rate?.middle_rate
            );

        if (rate <= 0) {

            throw new Error(
                'BNM returned an invalid USD/MYR middle rate'
            );
        }

        cachedBnmRate = rate;
        cachedBnmRateTime = now;

        return rate;

    } catch (error) {

        console.error(
            'BNM exchange-rate request failed:',
            error.message
        );

        // If BNM was previously available, keep using
        // the last successful rate.

        if (cachedBnmRate !== null) {
            return cachedBnmRate;
        }

        // Do not silently invent a new exchange rate.
        return null;
    }
}

// ============================================================
// BNM EXCHANGE RATE ENDPOINT
// ============================================================

app.get(
    '/api/exchange-rate',
    async (req, res) => {

        try {

            const rate =
                await fetchBnmUsdMyrRate();

            if (rate === null) {

                return res.status(503).json({
                    success: false,
                    source: 'Bank Negara Malaysia',
                    currency_pair: 'USD/MYR',
                    rate: null,
                    message:
                        'Unable to retrieve USD/MYR rate from BNM'
                });
            }

            return res.json({
                success: true,
                source:
                    'Bank Negara Malaysia',
                currency_pair:
                    'USD/MYR',
                base_currency:
                    'USD',
                quote_currency:
                    'MYR',
                rate,
                fetched_at:
                    new Date().toISOString()
            });

        } catch (error) {

            console.error(
                'Exchange-rate endpoint error:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Failed to retrieve exchange rate'
            });
        }
    }
);

// ============================================================
// EVENT INSERT STATEMENT
// ============================================================

const insertEvent =
    db.prepare(`
        INSERT INTO usage_events (
            employee_id,
            email,
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
            estimated_tokens,
            metadata
        )
        VALUES (
            @employee_id,
            @email,
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
            @estimated_tokens,
            @metadata
        )
    `);

// ============================================================
// POST USAGE EVENT
// ============================================================

app.post(
    '/api/usage/events',
    (req, res) => {

        try {

            const body =
                req.body || {};

            const email =
                body.email
                ? String(body.email)
                    .trim()
                    .toLowerCase()
                : null;

            const provider =
                normalizeProvider(
                    body.provider
                );

            const product =
                normalizeProduct(
                    body.product
                );

            const eventType =
                body.event_type ||
                body.eventType ||
                'interaction';

            const sessionId =
                body.session_id ||
                body.sessionId ||
                null;

            const interactionId =
                body.interaction_id ||
                body.interactionId ||
                crypto.randomUUID();

            const model =
                body.model ||
                null;

            const occurredAt =
                body.occurred_at ||
                body.occurredAt ||
                new Date().toISOString();

            const latencyMs =
                numberOrZero(
                    body.latency_ms ??
                    body.latencyMs
                );

            const promptLength =
                numberOrZero(
                    body.prompt_length ??
                    body.promptLength
                );

            const responseLength =
                numberOrZero(
                    body.response_length ??
                    body.responseLength
                );

            const promptTokens =
                numberOrZero(
                    body.prompt_tokens ??
                    body.promptTokens
                );

            const responseTokens =
                numberOrZero(
                    body.response_tokens ??
                    body.responseTokens
                );

            const totalTokens =
                numberOrZero(
                    body.total_tokens ??
                    body.totalTokens ??
                    (
                        promptTokens +
                        responseTokens
                    )
                );

            const estimatedTokens =
                numberOrZero(
                    body.estimated_tokens ??
                    body.estimatedTokens ??
                    totalTokens
                );

            const metadata =
                typeof body.metadata === 'string'
                    ? body.metadata
                    : JSON.stringify(
                        body.metadata || {}
                    );

            // ------------------------------------------------
            // VALIDATION
            // ------------------------------------------------

            if (!email) {

                return res.status(400).json({
                    success: false,
                    error:
                        'email is required'
                });
            }

            if (!product) {

                return res.status(400).json({
                    success: false,
                    error:
                        'product is required'
                });
            }

            // ------------------------------------------------
            // FIND EMPLOYEE
            // ------------------------------------------------

            const employee =
                findEmployee(email);

            const employeeId =
                employee
                    ? employee.id
                    : null;

            // ------------------------------------------------
            // INSERT
            // ------------------------------------------------

            const result =
                insertEvent.run({
                    employee_id:
                        employeeId,

                    email,

                    provider,

                    product,

                    event_type:
                        eventType,

                    session_id:
                        sessionId,

                    interaction_id:
                        interactionId,

                    model,

                    occurred_at:
                        occurredAt,

                    latency_ms:
                        latencyMs,

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

                    estimated_tokens:
                        estimatedTokens,

                    metadata
                });

            return res.status(201).json({
                success: true,
                event_id: result.lastInsertRowid,
                employee_id:
                    employeeId,
                product,
                provider
            });

        } catch (error) {

            console.error(
                'Usage event insertion failed:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Failed to record usage event'
            });
        }
    }
);

// ============================================================
// SUMMARY
// ============================================================

app.get(
    '/api/usage/summary',
    (req, res) => {

        try {

            const summary =
                db.prepare(`
                    SELECT

                        COUNT(*) AS interactions,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        COUNT(
                            DISTINCT
                            CASE
                                WHEN email IS NOT NULL
                                THEN email
                            END
                        ) AS active_employees,

                        AVG(
                            CASE
                                WHEN latency_ms > 0
                                THEN latency_ms
                            END
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(prompt_tokens),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(response_tokens),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(total_tokens),
                            0
                        ) AS total_tokens,

                        COALESCE(
                            SUM(estimated_tokens),
                            0
                        ) AS estimated_tokens

                    FROM usage_events
                `)
                .get();

            return res.json(
                summary
            );

        } catch (error) {

            console.error(
                'Summary error:',
                error
            );

            return res.status(500).json({
                error:
                    'Failed to load summary'
            });
        }
    }
);

// ============================================================
// BY EMPLOYEE
// ============================================================

app.get(
    '/api/usage/by-employee',
    (req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        COALESCE(
                            e.email,
                            u.email
                        ) AS email,

                        COALESCE(
                            e.name,
                            ''
                        ) AS name,

                        COALESCE(
                            e.department,
                            ''
                        ) AS department,

                        COUNT(u.id)
                            AS interactions,

                        COUNT(
                            DISTINCT
                            u.session_id
                        ) AS sessions,

                        AVG(
                            CASE
                                WHEN u.latency_ms > 0
                                THEN u.latency_ms
                            END
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(
                                u.prompt_tokens
                            ),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(
                                u.response_tokens
                            ),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(
                                u.total_tokens
                            ),
                            0
                        ) AS total_tokens,

                        COALESCE(
                            SUM(
                                u.estimated_tokens
                            ),
                            0
                        ) AS estimated_tokens,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(u.product)
                                        = 'gemini'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS gemini,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(u.product)
                                        = 'chatgpt'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS chatgpt,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(u.product)
                                        = 'claude'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS claude,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(u.product)
                                        = 'copilot'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS copilot,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(u.product)
                                        = 'perplexity'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS perplexity,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(u.product)
                                        = 'qwen'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS qwen

                    FROM usage_events u

                    LEFT JOIN employees e
                        ON e.id = u.employee_id

                    GROUP BY
                        COALESCE(
                            e.email,
                            u.email
                        )

                    ORDER BY
                        interactions DESC
                `)
                .all();

            return res.json(
                rows
            );

        } catch (error) {

            console.error(
                'Employee usage error:',
                error
            );

            return res.status(500).json({
                error:
                    'Failed to load employee usage'
            });
        }
    }
);

// ============================================================
// BY PROVIDER / PRODUCT
// ============================================================

app.get(
    '/api/usage/by-provider',
    (req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        provider,

                        product,

                        COUNT(*) AS interactions,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        AVG(
                            CASE
                                WHEN latency_ms > 0
                                THEN latency_ms
                            END
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(prompt_tokens),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(response_tokens),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(total_tokens),
                            0
                        ) AS total_tokens,

                        COALESCE(
                            SUM(estimated_tokens),
                            0
                        ) AS estimated_tokens

                    FROM usage_events

                    GROUP BY
                        provider,
                        product

                    ORDER BY
                        interactions DESC
                `)
                .all();

            return res.json(
                rows
            );

        } catch (error) {

            console.error(
                'Provider usage error:',
                error
            );

            return res.status(500).json({
                error:
                    'Failed to load provider usage'
            });
        }
    }
);

// ============================================================
// BY PRODUCT
// ============================================================

app.get(
    '/api/usage/by-product',
    (req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        product,

                        provider,

                        COUNT(*) AS interactions,

                        COUNT(
                            DISTINCT session_id
                        ) AS sessions,

                        AVG(
                            CASE
                                WHEN latency_ms > 0
                                THEN latency_ms
                            END
                        ) AS avg_latency_ms,

                        COALESCE(
                            SUM(prompt_tokens),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(response_tokens),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(total_tokens),
                            0
                        ) AS total_tokens,

                        COALESCE(
                            SUM(estimated_tokens),
                            0
                        ) AS estimated_tokens

                    FROM usage_events

                    GROUP BY
                        product,
                        provider

                    ORDER BY
                        interactions DESC
                `)
                .all();

            return res.json(
                rows
            );

        } catch (error) {

            console.error(
                'Product usage error:',
                error
            );

            return res.status(500).json({
                error:
                    'Failed to load product usage'
            });
        }
    }
);

// ============================================================
// EMPLOYEE × PRODUCT
// ============================================================

app.get(
    '/api/usage/by-employee-product',
    (req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT

                        COALESCE(
                            e.email,
                            u.email
                        ) AS email,

                        u.product,

                        u.provider,

                        COUNT(*) AS interactions,

                        COUNT(
                            DISTINCT u.session_id
                        ) AS sessions,

                        COALESCE(
                            SUM(
                                u.prompt_tokens
                            ),
                            0
                        ) AS prompt_tokens,

                        COALESCE(
                            SUM(
                                u.response_tokens
                            ),
                            0
                        ) AS response_tokens,

                        COALESCE(
                            SUM(
                                u.total_tokens
                            ),
                            0
                        ) AS total_tokens,

                        COALESCE(
                            SUM(
                                u.estimated_tokens
                            ),
                            0
                        ) AS estimated_tokens

                    FROM usage_events u

                    LEFT JOIN employees e
                        ON e.id = u.employee_id

                    GROUP BY

                        COALESCE(
                            e.email,
                            u.email
                        ),

                        u.product,

                        u.provider

                    ORDER BY
                        email,
                        interactions DESC
                `)
                .all();

            return res.json(
                rows
            );

        } catch (error) {

            console.error(
                'Employee product error:',
                error
            );

            return res.status(500).json({
                error:
                    'Failed to load employee product usage'
            });
        }
    }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    '/api/health',
    (req, res) => {

        res.json({
            success: true,
            service:
                'AI Observability',
            database:
                'connected',
            timestamp:
                new Date().toISOString()
        });
    }
);

// ============================================================
// STATIC DASHBOARD
// ============================================================

const dashboardPath = path.join(
    __dirname,
    '..',
    '..',
    'dashboard'
);

app.use(
    express.static(dashboardPath)
);

// ============================================================
// DASHBOARD ROUTE
// ============================================================

app.get(
    '/',
    (req, res) => {
        res.sendFile(
            path.join(
                dashboardPath,
                'index.html'
            )
        );
    }
);
// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log('');
        console.log(
            '=============================================='
        );

        console.log(
            'AI OBSERVABILITY SERVER'
        );

        console.log(
            '=============================================='
        );

        console.log(
            `Dashboard: http://localhost:${PORT}`
        );

        console.log(
            `API:       http://localhost:${PORT}/api`
        );

        console.log(
            `Database:  ${DB_PATH}`
        );

        console.log(
            'BNM:       USD/MYR exchange rate enabled'
        );

        console.log(
            '=============================================='
        );

        console.log('');
    }
);