// Tabs switching between the panes of the sidebar
export function setupSidebarTabs(sidebar) {
    const tabs = sidebar.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(other => {
                other.classList.toggle('active', other === tab);
                sidebar.querySelector(`#${other.dataset.pane}`).hidden = other !== tab;
            });
        });
    });
}
