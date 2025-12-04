
frappe.listview_settings['Task'] = {
    onload: function(listview) {
        // This function is called when the list view is loaded.
        // We will check if the current view is 'Gantt'.
        if (listview.current_view === 'Gantt') {
            setup_gantt_autoscroll(listview);
        }
    },
    on_render: function(listview) {
        // This function is called when the view is re-rendered (e.g., switching to Gantt).
        if (listview.current_view === 'Gantt') {
            setup_gantt_autoscroll(listview);
        }
    }
};

function setup_gantt_autoscroll(listview) {
    const gantt_container_selector = '.gantt-container';
    const target_node = listview.wrapper.find('.layout-main-section').get(0);

    if (!target_node) {
        return;
    }

    // Create an observer instance linked to the callback function
    const observer = new MutationObserver((mutationsList, observer) => {
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const gantt_container = listview.wrapper.find(gantt_container_selector);
                if (gantt_container.length > 0) {
                    // Use a small delay to ensure the gantt object is available after the container is added.
                    setTimeout(() => {
                        const gantt_view = listview.gantt_view;
                        if (gantt_view && gantt_view.gantt) {
                            gantt_view.gantt.scroll_current();
                        }
                    }, 100); // A very short delay is still helpful.
                    observer.disconnect(); // Stop observing once we've found and scrolled the gantt.
                    break;
                }
            }
        }
    });

    // Start observing the target node for configured mutations
    observer.observe(target_node, { childList: true, subtree: true });

    // Also check if the element is already there, in case the script runs after rendering
    const gantt_container = listview.wrapper.find(gantt_container_selector);
    if (gantt_container.length > 0) {
        setTimeout(() => {
            const gantt_view = listview.gantt_view;
            if (gantt_view && gantt_view.gantt) {
                gantt_view.gantt.scroll_current();
            }
        }, 100);
        observer.disconnect();
    }
}
