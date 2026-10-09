import { escapeHtml } from './html.js';

// Show a short confirmation in the top right corner that fades away
export function showToast(title, detail, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.innerHTML = `
        <i class="bi bi-check-circle-fill"></i>
        <div>
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-detail">${escapeHtml(detail)}</div>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
