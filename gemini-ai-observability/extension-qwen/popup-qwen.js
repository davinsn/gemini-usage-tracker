console.log('[qwen-obs] Popup loaded');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loginView = document.getElementById('loginView');
const loggedInView = document.getElementById('loggedInView');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');

// ============================================================
// RENDER STATE
// ============================================================

function renderAuthenticated(employee) {

    statusDot.classList.add('connected');
    statusText.textContent =
        employee?.email
            ? `Connected as ${employee.email}`
            : 'Connected';

    loginView.style.display = 'none';
    loggedInView.style.display = 'block';
}

function renderLoggedOut() {

    statusDot.classList.remove('connected');
    statusText.textContent = 'Not logged in';

    loginView.style.display = 'block';
    loggedInView.style.display = 'none';
}

function setError(message) {
    errorMessage.textContent = message || '';
}

// ============================================================
// INITIAL STATUS CHECK
// ============================================================

async function refreshStatus() {

    try {

        const response = await chrome.runtime.sendMessage({
            type: 'QWEN_OBS_GET_AUTH_STATUS'
        });

        if (response?.authenticated) {
            renderAuthenticated(response.employee);
        } else {
            renderLoggedOut();
        }

    } catch (error) {

        console.error(
            '[qwen-obs] Failed to check auth status:',
            error
        );

        statusText.textContent = 'Status unavailable';
        renderLoggedOut();
    }
}

// ============================================================
// LOGIN
// ============================================================

loginButton.addEventListener('click', async () => {

    setError('');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        setError('Enter both email and password.');
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

    try {

        const response = await chrome.runtime.sendMessage({
            type: 'QWEN_OBS_LOGIN',
            email,
            password
        });

        if (response?.success) {

            passwordInput.value = '';
            renderAuthenticated(response.employee);

        } else {

            setError(
                response?.error === 'login_failed' ||
                response?.error === 'Invalid email or password'
                    ? 'Invalid email or password.'
                    : 'Login failed. Please try again.'
            );
        }

    } catch (error) {

        console.error('[qwen-obs] Login error:', error);
        setError('Login failed. Please try again.');

    } finally {

        loginButton.disabled = false;
        loginButton.textContent = 'Log In';
    }
});

// ============================================================
// LOGOUT
// ============================================================

logoutButton.addEventListener('click', async () => {

    logoutButton.disabled = true;

    try {

        await chrome.runtime.sendMessage({
            type: 'QWEN_OBS_LOGOUT'
        });

        renderLoggedOut();

    } catch (error) {

        console.error('[qwen-obs] Logout error:', error);

    } finally {

        logoutButton.disabled = false;
    }
});

// ============================================================
// INIT
// ============================================================

refreshStatus();