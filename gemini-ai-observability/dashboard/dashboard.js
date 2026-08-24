// ============================================================
// GEMINI OBSERVABILITY - MULTI-AI DASHBOARD
// ============================================================

// Chart instances
let employeeInteractionChart;
let providerInteractionChart;
let providerSessionChart;
let employeeAiChart;
let latencyChart;


// ============================================================
// CHART CONFIGURATION
// ============================================================

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,

    // Disable animation so charts don't continuously animate
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


        // ----------------------------------------------------
        // CHECK API RESPONSES
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // PARSE JSON
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // DEBUG LOGGING
        // ----------------------------------------------------

        console.log('=================================');
        console.log('AI OBSERVABILITY DASHBOARD');
        console.log('=================================');

        console.log('Summary:', summary);

        console.log(
            'Employees:',
            employees
        );

        console.log(
            'Providers:',
            providers
        );

        console.log(
            'Products:',
            products
        );

        console.log(
            'Employee Products:',
            employeeProducts
        );


        // ----------------------------------------------------
        // UPDATE DASHBOARD
        // ----------------------------------------------------

        updateMetrics(summary);

        updateEmployeeCharts(employees);

        updateProviderCharts(providers);

        updateEmployeeProductChart(
            employeeProducts
        );

        updateTable(employees);

        updateAIStatus(products);


        // ----------------------------------------------------
        // LAST UPDATED
        // ----------------------------------------------------

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

    // --------------------------------------------------------
    // TOTAL INTERACTIONS
    // --------------------------------------------------------

    const interactions =
        document.getElementById(
            'interactions'
        );

    if (interactions) {

        interactions.textContent =
            Number(summary.interactions) || 0;
    }


    // --------------------------------------------------------
    // TOTAL SESSIONS
    // --------------------------------------------------------

    const sessions =
        document.getElementById(
            'sessions'
        );

    if (sessions) {

        sessions.textContent =
            Number(summary.sessions) || 0;
    }


    // --------------------------------------------------------
    // ACTIVE EMPLOYEES
    // --------------------------------------------------------

    const employees =
        document.getElementById(
            'employees'
        );

    if (employees) {

        employees.textContent =
            Number(
                summary.active_employees
            ) || 0;
    }


    // --------------------------------------------------------
    // AVERAGE LATENCY
    // --------------------------------------------------------

    const latency =
        document.getElementById(
            'latency'
        );

    if (latency) {

        latency.textContent =
            summary.avg_latency_ms != null
                ? `${summary.avg_latency_ms} ms`
                : 'N/A';
    }


    // --------------------------------------------------------
    // TOTAL TOKENS
    // --------------------------------------------------------

    const tokens =
        document.getElementById(
            'tokens'
        );

    if (tokens) {

        tokens.textContent =
            Number(
                summary.total_tokens
            ) || 0;
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


    // --------------------------------------------------------
    // LABELS
    // --------------------------------------------------------

    const labels =
        employees.map(
            employee =>
                employee.email
        );


    // --------------------------------------------------------
    // INTERACTIONS
    // --------------------------------------------------------

    const interactions =
        employees.map(
            employee =>
                Number(
                    employee.interactions
                ) || 0
        );


    // --------------------------------------------------------
    // CANVAS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // UPDATE EXISTING CHART
    // --------------------------------------------------------

    if (employeeInteractionChart) {

        employeeInteractionChart.data.labels =
            labels;

        employeeInteractionChart.data.datasets[0].data =
            interactions;

        employeeInteractionChart.update('none');

        return;
    }


    // --------------------------------------------------------
    // CREATE CHART
    // --------------------------------------------------------

    employeeInteractionChart =
        new Chart(
            canvas,
            {

                type: 'bar',

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                'Interactions',

                            data:
                                interactions
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


    // --------------------------------------------------------
    // LABELS
    // --------------------------------------------------------

    const labels =
        providers.map(
            provider =>
                formatProductName(
                    provider.provider
                )
        );


    // --------------------------------------------------------
    // INTERACTIONS
    // --------------------------------------------------------

    const interactions =
        providers.map(
            provider =>
                Number(
                    provider.interactions
                ) || 0
        );


    // --------------------------------------------------------
    // SESSIONS
    // --------------------------------------------------------

    const sessions =
        providers.map(
            provider =>
                Number(
                    provider.sessions
                ) || 0
        );


    // --------------------------------------------------------
    // LATENCY
    // --------------------------------------------------------

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


    if (!interactionCanvas) {

        console.error(
            'Canvas not found: providerInteractionChart'
        );

    }

    else if (providerInteractionChart) {

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

                                label:
                                    'Interactions',

                                data:
                                    interactions
                            }

                        ]
                    },

                    options: chartOptions
                }
            );
    }


    // ========================================================
    // SESSIONS BY AI
    // ========================================================

    const sessionCanvas =
        document.getElementById(
            'providerSessionChart'
        );


    if (!sessionCanvas) {

        console.error(
            'Canvas not found: providerSessionChart'
        );

    }

    else if (providerSessionChart) {

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

                                label:
                                    'Sessions',

                                data:
                                    sessions
                            }

                        ]
                    },

                    options: chartOptions
                }
            );
    }


    // ========================================================
    // AVERAGE LATENCY BY AI
    // ========================================================

    const latencyCanvas =
        document.getElementById(
            'latencyChart'
        );


    if (!latencyCanvas) {

        console.error(
            'Canvas not found: latencyChart'
        );

    }

    else if (latencyChart) {

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

                                data:
                                    latency
                            }

                        ]
                    },

                    options: chartOptions
                }
            );
    }
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


    // --------------------------------------------------------
    // CANVAS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // EMPLOYEES
    // --------------------------------------------------------

    const employees = [
        ...new Set(
            employeeProducts.map(
                row => row.email
            )
        )
    ];


    // --------------------------------------------------------
    // PRODUCTS
    // --------------------------------------------------------

    const products = [
        ...new Set(
            employeeProducts.map(
                row => row.product
            )
        )
    ];


    // --------------------------------------------------------
    // DATASETS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // UPDATE EXISTING CHART
    // --------------------------------------------------------

    if (employeeAiChart) {

        employeeAiChart.data.labels =
            employees;

        employeeAiChart.data.datasets =
            datasets;

        employeeAiChart.update('none');

        return;
    }


    // --------------------------------------------------------
    // CREATE CHART
    // --------------------------------------------------------

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


            // ------------------------------------------------
            // Determine AI usage
            // ------------------------------------------------

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


            // ------------------------------------------------
            // Total
            // ------------------------------------------------

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


            // ------------------------------------------------
            // Table row
            // ------------------------------------------------

            row.innerHTML = `

                <td>
                    ${employee.email || '-'}
                </td>

                <td>
                    ${employee.department || '-'}
                </td>

                <td>
                    ${gemini}
                </td>

                <td>
                    ${chatgpt}
                </td>

                <td>
                    ${claude}
                </td>

                <td>
                    ${copilot}
                </td>

                <td>
                    ${perplexity}
                </td>

                <td>
                    ${total}
                </td>

                <td>
                    ${Number(employee.sessions) || 0}
                </td>

                <td>
                    ${
                        employee.avg_latency_ms != null
                            ? employee.avg_latency_ms + ' ms'
                            : 'N/A'
                    }
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


    return String(product)
        .charAt(0)
        .toUpperCase()
        +
        String(product).slice(1);
}


// ============================================================
// INITIAL LOAD
// ============================================================

loadDashboard();


// ============================================================
// AUTO REFRESH
// ============================================================

// Refresh every 5 seconds
setInterval(
    loadDashboard,
    5000
);