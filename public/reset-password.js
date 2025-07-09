/*
 * reset-password.js
 * This script handles the password reset form on the reset-password.html page.
 */
document.addEventListener('DOMContentLoaded', () => {
    const resetForm = document.getElementById('reset-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const resetMessage = document.getElementById('reset-message');
    const resetSubmitBtn = document.getElementById('reset-submit-btn');

    // Get the reset token from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showMessage('No reset token found. Please request a new password reset link.', 'error');
        resetSubmitBtn.disabled = true;
    }

    const showMessage = (message, type) => {
        resetMessage.textContent = message;
        resetMessage.className = `form-message ${type}`;
    };

    resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword !== confirmPassword) {
            showMessage('Passwords do not match.', 'error');
            return;
        }

        if (!token) {
            showMessage('Invalid or missing reset token.', 'error');
            return;
        }

        resetSubmitBtn.disabled = true;
        resetSubmitBtn.textContent = 'Resetting...';

        try {
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: newPassword }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            showMessage(data.message, 'success');
            // Redirect to the main page after a successful reset
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);

        } catch (error) {
            showMessage(error.message, 'error');
            resetSubmitBtn.disabled = false;
            resetSubmitBtn.textContent = 'Reset Password';
        }
    });
});
