// Tabs switching between the panes of the sidebar
export function setupSidebarTabs(sidebar) {
    const tabs = sidebar.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(other => {
                other.classList.toggle('active', other === tab);
                sidebar.querySelector(`#${other.dataset.pane}`).hidden = other !== tab;
            });
            sidebar.classList.remove('collapsed');
        });
    });
    
    // On small screens the sidebar is a bottom sheet that can be folded away
    const collapse = sidebar.querySelector('.sidebar-collapse');
    collapse.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        collapse.querySelector('i').className = sidebar.classList.contains('collapsed') ? 'bi bi-chevron-up' : 'bi bi-chevron-down';
    });
}
