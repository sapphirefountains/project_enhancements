/**
 * @file This script enhances the standard Frappe Task list's Gantt view.
 * @description It uses a MutationObserver to reliably detect when the Gantt chart
 * has been rendered in the DOM, and then programmatically scrolls the timeline to
 * center on the current date ('today'). This is necessary because the standard
 * Gantt view does not have a built-in option to scroll to today by default.
 */

// Ensure this script only runs on the Gantt view for the Task Doctype.
if (frappe.views.GanttView && frappe.get_route()[0] === 'List' && frappe.get_route()[1] === 'Task' && frappe.get_route()[2] === 'Gantt') {

    // Use a MutationObserver to watch for the Gantt chart being added to the DOM.
    // This is more reliable than setTimeout or setInterval.
    const observer = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const gantt_container = document.querySelector('.gantt-container');

                // If the gantt-container is found, we know the chart is ready.
                if (gantt_container) {
                    // Disconnect the observer as we've found what we need.
                    observer.disconnect();

                    // Find the '.today-highlight' element which marks the current day.
                    const today_el = gantt_container.querySelector('.today-highlight');

                    if (today_el) {
                        // Calculate the position to scroll to. We aim to center the 'today'
                        // highlight in the visible area of the container.
                        const container_width = gantt_container.clientWidth;
                        const element_left = today_el.getClientRects()[0].x;
                        const element_width = today_el.getClientRects()[0].width;

                        // Calculate the offset needed to center the element.
                        // We subtract half the container's width to bring the element to the left edge,
                        // then add back half the element's width to center it.
                        const scroll_to_position = gantt_container.scrollLeft + element_left - (container_width / 2) + (element_width / 2);

                        // Animate the scroll for a smoother user experience.
                        gantt_container.scrollTo({
                            left: scroll_to_position,
                            behavior: 'smooth'
                        });
                    }
                    break; // Exit the loop once the container is found and processed.
                }
            }
        }
    });

    // Start observing the target node for configured mutations.
    // The '.layout-main-section' is a stable parent element that will contain the Gantt chart.
    observer.observe(document.querySelector('.layout-main-section'), {
        childList: true,
        subtree: true
    });
}
