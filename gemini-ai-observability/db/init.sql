CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    email TEXT NOT NULL UNIQUE,

    department TEXT,

    role TEXT,

    status TEXT NOT NULL DEFAULT 'active',

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER NOT NULL
        REFERENCES employees(id),

    -- AI company/provider
    -- Examples: google, openai, anthropic, microsoft
    provider TEXT NOT NULL DEFAULT 'google',

    -- Specific AI product
    -- Examples: gemini, chatgpt, claude, copilot, perplexity
    product TEXT NOT NULL DEFAULT 'gemini',

    event_type TEXT NOT NULL,

    session_id TEXT,

    interaction_id TEXT,

    model TEXT,

    occurred_at TEXT NOT NULL,

    latency_ms INTEGER,

    prompt_length INTEGER,

    response_length INTEGER,

    prompt_tokens INTEGER,

    response_tokens INTEGER,

    total_tokens INTEGER,

    metadata TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(employee_id, interaction_id)
);


CREATE INDEX IF NOT EXISTS idx_usage_events_employee_time
ON usage_events(employee_id, occurred_at DESC);


CREATE INDEX IF NOT EXISTS idx_usage_events_time
ON usage_events(occurred_at DESC);


CREATE INDEX IF NOT EXISTS idx_usage_events_provider
ON usage_events(provider);


CREATE INDEX IF NOT EXISTS idx_usage_events_product
ON usage_events(product);


CREATE INDEX IF NOT EXISTS idx_usage_events_employee_product
ON usage_events(employee_id, product);


CREATE VIEW IF NOT EXISTS daily_usage AS
SELECT

    e.id AS employee_id,

    e.email,

    e.department,

    DATE(u.occurred_at) AS usage_date,

    COUNT(*) FILTER (
        WHERE u.event_type = 'interaction_started'
    ) AS interactions,

    COUNT(DISTINCT u.session_id) AS sessions,

    ROUND(
        AVG(u.latency_ms)
        FILTER (
            WHERE u.latency_ms IS NOT NULL
        )
    ) AS avg_latency_ms

FROM employees e

JOIN usage_events u
    ON u.employee_id = e.id

GROUP BY
    e.id,
    e.email,
    e.department,
    DATE(u.occurred_at);


CREATE VIEW IF NOT EXISTS daily_provider_usage AS
SELECT

    e.id AS employee_id,

    e.email,

    e.department,

    u.provider,

    u.product,

    DATE(u.occurred_at) AS usage_date,

    COUNT(*) FILTER (
        WHERE u.event_type = 'interaction_started'
    ) AS interactions,

    COUNT(DISTINCT u.session_id) AS sessions,

    ROUND(
        AVG(u.latency_ms)
        FILTER (
            WHERE u.latency_ms IS NOT NULL
        )
    ) AS avg_latency_ms,

    SUM(
        COALESCE(u.total_tokens, 0)
    ) AS total_tokens

FROM employees e

JOIN usage_events u
    ON u.employee_id = e.id

GROUP BY
    e.id,
    e.email,
    e.department,
    u.provider,
    u.product,
    DATE(u.occurred_at);