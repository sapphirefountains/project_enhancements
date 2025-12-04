/**
 * @file This script provides a universal solution for auto-scrolling Frappe Gantt charts.
 * @description It uses a MutationObserver to detect any Gantt chart rendered on any
 * page within the Frappe Desk. Once a chart is detected, it programmatically scrolls
 * the timeline to center on the current date ('today'). This approach is robust and
 * works for the standard Task Gantt as well as custom Gantt implementations.
 */

(function() {
    'use strict';

    // Use a MutationObserver to watch for Gantt charts being added to the DOM.
    // This is more reliable than polling with setTimeout or setInterval.
    const observer = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Check if a .gantt-container was added.
                const gantt_container = document.querySelector('.gantt-container');

                if (gantt_container && !gantt_container.dataset.scrolled) {
                    // Mark the container as processed to prevent re-scrolling.
                    gantt_container.dataset.scrolled = 'true';

                    // Find the '.today-highlight' element which marks the current day.
                    const today_el = gantt_container.querySelector('.today-highlight');

                    if (today_el) {
                        // Calculate the position to scroll to, centering the 'today' highlight.
                        const container_width = gantt_container.clientWidth;
                        // Use getBoundingClientRect for accurate positioning relative to the viewport.
                        const element_rect = today_el.getBoundingClientRect();
                        const container_rect = gantt_container.getBoundingClientRect();

                        // Calculate the element's position relative to the container's left edge.
                        const element_left_relative = element_rect.left - container_rect.left;
                        const element_width = element_rect.width;

                        // Calculate the scroll position needed to center the element.
                        const scroll_to_position = gantt_container.scrollLeft + element_left_relative - (container_width / 2) + (element_width / 2);

                        // Use a smooth scroll for a better user experience.
                        gantt_container.scrollTo({
                            left: scroll_to_position,
                            behavior: 'smooth'
                        });
                    }
                }
            }
        }
    });

    // Start observing the entire document body for changes.
    // This is necessary because Gantt charts can be loaded into modals or other dynamic containers.
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
