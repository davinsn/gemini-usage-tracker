// ============================================================
// AI OBSERVABILITY - MULTI-AI DASHBOARD
// ============================================================

// ============================================================
// CHART INSTANCES
// ============================================================

let employeeInteractionChart;
let providerInteractionChart;
let providerSessionChart;
let employeeAiChart;
let latencyChart;
let providerTokenChart;


// ============================================================
// CHART CONFIGURATION
// ============================================================

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,

    plugins: {
        legend: {
            display: true
        }
    },

    scales: {
        y: {
            beginAtZero: true
        }
    }
};


// ============================================================
// AI PRODUCT CONFIGURATION
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
    }

};


// ============================================================
// NUMBER FORMATTER
// ============================================================

function formatNumber(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '0';
    }

    return number.toLocaleString();
}


// ============================================================
// TOKEN VALUE HELPER
// ============================================================
// Supports different possible backend field names.
//
// Preferred:
// total_tokens
//
// Also supports:
// estimated_tokens
// tokens
//
// This makes the dashboard more tolerant of backend changes.
// ============================================================

function getTokenValue(row) {

    if (!row) {
        return 0;
    }

    return Number(
        row.total_tokens ??
        row.estimated_tokens ??
        row.tokens ??
        0
    ) || 0;
}


// ============================================================
// LOAD DASHBOARD
// ============================================================

async function loadDashboard() {

    try {

        const [
            summaryResponse,
            employeeResponse,
            providerResponse,
            productResponse,
            employeeProductResponse
        ] = await Promise.all([

            fetch('/api/usage/summary'),

            fetch('/api/usage/by-employee'),

            fetch('/api/usage/by-provider'),

            fetch('/api/usage/by-product'),

            fetch('/api/usage/by-employee-product')

        ]);


        // ====================================================
        // CHECK API RESPONSES
        // ====================================================

        if (
            !summaryResponse.ok ||
            !employeeResponse.ok ||
            !providerResponse.ok ||
            !productResponse.ok ||
            !employeeProductResponse.ok
        ) {

            throw new Error(
                'One or more API requests failed'
            );

        }


        // ====================================================
        // PARSE JSON
        // ====================================================

        const summary =
            await summaryResponse.json();

        const employees =
            await employeeResponse.json();

        const providers =
            await providerResponse.json();

        const products =
            await productResponse.json();

        const employeeProducts =
            await employeeProductResponse.json();


        // ====================================================
        // DEBUG
        // ====================================================

        console.log('=================================');
        console.log('AI OBSERVABILITY DASHBOARD');
        console.log('=================================');

        console.log('Summary:', summary);

        console.log('Employees:', employees);

        console.log('Providers:', providers);

        console.log('Products:', products);

        console.log(
            'Employee Products:',
            employeeProducts
        );

        console.log(
            'TOTAL ESTIMATED TOKENS:',
            getTokenValue(summary)
        );


        // ====================================================
        // UPDATE DASHBOARD
        // ====================================================

        updateMetrics(summary);

        updateEmployeeCharts(employees);

        updateProviderCharts(providers);

        updateTokenChart(providers);

        updateEmployeeProductChart(
            employeeProducts
        );

        updateTable(employees);

        updateAIStatus(products);


        // ====================================================
        // LAST UPDATED
        // ====================================================

        const lastUpdated =
            document.getElementById(
                'lastUpdated'
            );

        if (lastUpdated) {

            lastUpdated.textContent =
                new Date().toLocaleTimeString();

        }

    }

    catch (error) {

        console.error(
            'Dashboard loading failed:',
            error
        );

    }

}


// ============================================================
// KPI METRICS
// ============================================================

function updateMetrics(summary) {

    // ========================================================
    // TOTAL INTERACTIONS
    // ========================================================

    const interactions =
        document.getElementById(
            'interactions'
        );

    if (interactions) {

        interactions.textContent =
            formatNumber(
                summary.interactions
            );

    }


    // ========================================================
    // TOTAL SESSIONS
    // ========================================================

    const sessions =
        document.getElementById(
            'sessions'
        );

    if (sessions) {

        sessions.textContent =
            formatNumber(
                summary.sessions
            );

    }


    // ========================================================
    // ACTIVE EMPLOYEES
    // ========================================================

    const employees =
        document.getElementById(
            'employees'
        );

    if (employees) {

        employees.textContent =
            formatNumber(
                summary.active_employees
            );

    }


    // ========================================================
    // AVERAGE LATENCY
    // ========================================================

    const latency =
        document.getElementById(
            'latency'
        );

    if (latency) {

        latency.textContent =
            summary.avg_latency_ms != null

                ? `${Number(
                    summary.avg_latency_ms
                ).toFixed(0)} ms`

                : 'N/A';

    }


    // ========================================================
    // TOTAL ESTIMATED TOKENS
    // ========================================================

    const tokens =
        document.getElementById(
            'tokens'
        );

    if (tokens) {

        tokens.textContent =
            formatNumber(
                getTokenValue(summary)
            );

    }

}


// ============================================================
// EMPLOYEE INTERACTIONS
// ============================================================

function updateEmployeeCharts(employees) {

    if (!Array.isArray(employees)) {

        console.error(
            'Employee data is not an array:',
            employees
        );

        return;
    }


    // ========================================================
    // LABELS
    // ========================================================

    const labels =
        employees.map(
            employee =>
                employee.email || 'Unknown'
        );


    // ========================================================
    // INTERACTIONS
    // ========================================================

    const interactions =
        employees.map(
            employee =>
                Number(
                    employee.interactions
                ) || 0
        );


    // ========================================================
    // CANVAS
    // ========================================================

    const canvas =
        document.getElementById(
            'employeeInteractionChart'
        );

    if (!canvas) {

        console.error(
            'Canvas not found: employeeInteractionChart'
        );

        return;
    }


    // ========================================================
    // UPDATE
    // ========================================================

    if (employeeInteractionChart) {

        employeeInteractionChart.data.labels =
            labels;

        employeeInteractionChart.data.datasets[0].data =
            interactions;

        employeeInteractionChart.update('none');

        return;
    }


    // ========================================================
    // CREATE
    // ========================================================

    employeeInteractionChart =
        new Chart(
            canvas,
            {
                type: 'bar',

                data: {

                    labels: labels,

                    datasets: [

                        {
                            label: 'Interactions',

                            data: interactions
                        }

                    ]
                },

                options: chartOptions
            }
        );

}


// ============================================================
// PROVIDER CHARTS
// ============================================================

function updateProviderCharts(providers) {

    if (!Array.isArray(providers)) {

        console.error(
            'Provider data is not an array:',
            providers
        );

        return;
    }


    // ========================================================
    // LABELS
    // ========================================================

    const labels =
        providers.map(
            provider =>
                formatProductName(
                    provider.provider ||
                    provider.product
                )
        );


    // ========================================================
    // INTERACTIONS
    // ========================================================

    const interactions =
        providers.map(
            provider =>
                Number(
                    provider.interactions
                ) || 0
        );


    // ========================================================
    // SESSIONS
    // ========================================================

    const sessions =
        providers.map(
            provider =>
                Number(
                    provider.sessions
                ) || 0
        );


    // ========================================================
    // LATENCY
    // ========================================================

    const latency =
        providers.map(
            provider =>
                Number(
                    provider.avg_latency_ms
                ) || 0
        );


    // ========================================================
    // INTERACTIONS BY AI
    // ========================================================

    const interactionCanvas =
        document.getElementById(
            'providerInteractionChart'
        );

    if (interactionCanvas) {

        if (providerInteractionChart) {

            providerInteractionChart.data.labels =
                labels;

            providerInteractionChart.data.datasets[0].data =
                interactions;

            providerInteractionChart.update('none');

        }

        else {

            providerInteractionChart =
                new Chart(
                    interactionCanvas,
                    {

                        type: 'bar',

                        data: {

                            labels: labels,

                            datasets: [

                                {
                                    label: 'Interactions',

                                    data: interactions
                                }

                            ]

                        },

                        options: chartOptions

                    }
                );

        }

    }


    // ========================================================
    // SESSIONS BY AI
    // ========================================================

    const sessionCanvas =
        document.getElementById(
            'providerSessionChart'
        );

    if (sessionCanvas) {

        if (providerSessionChart) {

            providerSessionChart.data.labels =
                labels;

            providerSessionChart.data.datasets[0].data =
                sessions;

            providerSessionChart.update('none');

        }

        else {

            providerSessionChart =
                new Chart(
                    sessionCanvas,
                    {

                        type: 'bar',

                        data: {

                            labels: labels,

                            datasets: [

                                {
                                    label: 'Sessions',

                                    data: sessions
                                }

                            ]

                        },

                        options: chartOptions

                    }
                );

        }

    }


    // ========================================================
    // LATENCY BY AI
    // ========================================================

    const latencyCanvas =
        document.getElementById(
            'latencyChart'
        );

    if (latencyCanvas) {

        if (latencyChart) {

            latencyChart.data.labels =
                labels;

            latencyChart.data.datasets[0].data =
                latency;

            latencyChart.update('none');

        }

        else {

            latencyChart =
                new Chart(
                    latencyCanvas,
                    {

                        type: 'bar',

                        data: {

                            labels: labels,

                            datasets: [

                                {
                                    label:
                                        'Average Latency (ms)',

                                    data: latency
                                }

                            ]

                        },

                        options: chartOptions

                    }
                );

        }

    }

}


// ============================================================
// TOKEN USAGE BY AI
// ============================================================

function updateTokenChart(providers) {

    if (!Array.isArray(providers)) {

        console.error(
            'Provider token data is not an array:',
            providers
        );

        return;
    }


    const canvas =
        document.getElementById(
            'providerTokenChart'
        );

    if (!canvas) {

        console.error(
            'Canvas not found: providerTokenChart'
        );

        return;
    }


    // ========================================================
    // LABELS
    // ========================================================

    const labels =
        providers.map(
            provider =>
                formatProductName(
                    provider.product ||
                    provider.provider
                )
        );


    // ========================================================
    // ESTIMATED TOKENS
    // ========================================================

    const tokens =
        providers.map(
            provider =>
                getTokenValue(provider)
        );


    console.log(
        'Token chart data:',
        providers.map(
            provider => ({
                provider:
                    provider.provider,

                product:
                    provider.product,

                tokens:
                    getTokenValue(provider)
            })
        )
    );


    // ========================================================
    // UPDATE EXISTING CHART
    // ========================================================

    if (providerTokenChart) {

        providerTokenChart.data.labels =
            labels;

        providerTokenChart.data.datasets[0].data =
            tokens;

        providerTokenChart.update('none');

        return;
    }


    // ========================================================
    // CREATE CHART
    // ========================================================

    providerTokenChart =
        new Chart(
            canvas,
            {

                type: 'bar',

                data: {

                    labels: labels,

                    datasets: [

                        {
                            label:
                                'Estimated Tokens',

                            data:
                                tokens
                        }

                    ]

                },

                options: {

                    ...chartOptions,

                    plugins: {

                        ...chartOptions.plugins,

                        tooltip: {

                            callbacks: {

                                label: function(context) {

                                    return (
                                        'Estimated Tokens: ' +
                                        formatNumber(
                                            context.raw
                                        )
                                    );

                                }

                            }

                        }

                    }

                }

            }
        );

}


// ============================================================
// EMPLOYEE × AI PRODUCT
// ============================================================

function updateEmployeeProductChart(
    employeeProducts
) {

    if (!Array.isArray(employeeProducts)) {

        console.error(
            'Employee product data is not an array:',
            employeeProducts
        );

        return;
    }


    const canvas =
        document.getElementById(
            'employeeAiChart'
        );

    if (!canvas) {

        console.error(
            'Canvas not found: employeeAiChart'
        );

        return;
    }


    // ========================================================
    // EMPLOYEES
    // ========================================================

    const employees = [
        ...new Set(
            employeeProducts.map(
                row =>
                    row.email
            )
        )
    ];


    // ========================================================
    // PRODUCTS
    // ========================================================

    const products = [
        ...new Set(
            employeeProducts.map(
                row =>
                    row.product
            )
        )
    ];


    // ========================================================
    // INTERACTION DATASETS
    // ========================================================

    const datasets =
        products.map(
            product => {

                return {

                    label:
                        formatProductName(
                            product
                        ),

                    data:
                        employees.map(
                            email => {

                                const row =
                                    employeeProducts.find(
                                        item =>
                                            item.email ===
                                                email &&
                                            item.product ===
                                                product
                                    );

                                return row
                                    ? Number(
                                        row.interactions
                                    ) || 0
                                    : 0;

                            }
                        )

                };

            }
        );


    // ========================================================
    // UPDATE
    // ========================================================

    if (employeeAiChart) {

        employeeAiChart.data.labels =
            employees;

        employeeAiChart.data.datasets =
            datasets;

        employeeAiChart.update('none');

        return;
    }


    // ========================================================
    // CREATE
    // ========================================================

    employeeAiChart =
        new Chart(
            canvas,
            {

                type: 'bar',

                data: {

                    labels:
                        employees,

                    datasets:
                        datasets

                },

                options: {

                    ...chartOptions,

                    scales: {

                        x: {

                            stacked: true

                        },

                        y: {

                            beginAtZero: true,

                            stacked: true

                        }

                    }

                }

            }
        );

}


// ============================================================
// EMPLOYEE TABLE
// ============================================================

function updateTable(employees) {

    const table =
        document.getElementById(
            'employeeTable'
        );

    if (!table) {

        console.error(
            'Employee table not found'
        );

        return;
    }


    table.innerHTML = '';


    employees.forEach(
        employee => {

            const row =
                document.createElement(
                    'tr'
                );


            // ==================================================
            // AI INTERACTIONS
            // ==================================================

            const gemini =
                Number(
                    employee.gemini
                ) || 0;

            const chatgpt =
                Number(
                    employee.chatgpt
                ) || 0;

            const claude =
                Number(
                    employee.claude
                ) || 0;

            const copilot =
                Number(
                    employee.copilot
                ) || 0;

            const perplexity =
                Number(
                    employee.perplexity
                ) || 0;


            // ==================================================
            // TOTAL INTERACTIONS
            // ==================================================

            const total =
                Number(
                    employee.interactions
                ) ||
                (
                    gemini +
                    chatgpt +
                    claude +
                    copilot +
                    perplexity
                );


            // ==================================================
            // ESTIMATED TOKENS
            // ==================================================

            const totalTokens =
                getTokenValue(employee);


            // ==================================================
            // TABLE ROW
            // ==================================================

            row.innerHTML = `

                <td>
                    ${employee.email || '-'}
                </td>

                <td>
                    ${employee.department || '-'}
                </td>

                <td>
                    ${formatNumber(gemini)}
                </td>

                <td>
                    ${formatNumber(chatgpt)}
                </td>

                <td>
                    ${formatNumber(claude)}
                </td>

                <td>
                    ${formatNumber(copilot)}
                </td>

                <td>
                    ${formatNumber(perplexity)}
                </td>

                <td>
                    ${formatNumber(total)}
                </td>

                <td>
                    ${formatNumber(
                        employee.sessions
                    )}
                </td>

                <td>
                    ${
                        employee.avg_latency_ms != null
                            ? Number(
                                employee.avg_latency_ms
                            ).toFixed(0) + ' ms'
                            : 'N/A'
                    }
                </td>

                <td>
                    ${formatNumber(totalTokens)}
                </td>

            `;

            table.appendChild(row);

        }
    );

}


// ============================================================
// AI STATUS
// ============================================================

function updateAIStatus(products) {

    const status =
        document.querySelector(
            '.status'
        );

    if (!status) {
        return;
    }

    if (!Array.isArray(products)) {
        return;
    }


    const activeProducts =
        products.filter(
            product =>
                Number(
                    product.interactions
                ) > 0
        );


    status.innerHTML = `

        <span class="status-dot"></span>

        ${activeProducts.length}

        AI

        ${
            activeProducts.length === 1
                ? 'Product'
                : 'Products'
        }

        Connected

    `;

}


// ============================================================
// PRODUCT NAME FORMATTER
// ============================================================

function formatProductName(product) {

    if (!product) {
        return 'Unknown';
    }


    const key =
        String(product)
            .toLowerCase();


    if (AI_PRODUCTS[key]) {

        return AI_PRODUCTS[key].name;

    }


    return (
        String(product)
            .charAt(0)
            .toUpperCase()
        +
        String(product).slice(1)
    );

}


// ============================================================
// INITIAL LOAD
// ============================================================

loadDashboard();


// ============================================================
// AUTO REFRESH
// ============================================================
// Refresh every 5 seconds
// ============================================================

setInterval(
    loadDashboard,
    5000
);