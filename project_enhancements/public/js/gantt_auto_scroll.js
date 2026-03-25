/**
 * @file This script provides a robust auto-scrolling functionality for Frappe Gantt charts.
 * @description It uses a MutationObserver to detect when a Gantt chart is added to the DOM.
 * Once a chart is detected, a nested MutationObserver waits for the '.today-highlight'
 * element to be rendered, then smoothly scrolls it into the horizontal center of the view.
 * This ensures that whenever a Gantt chart is loaded, the user's attention is immediately
 * drawn to the current date, improving usability on large project timelines.
 */
document.addEventListener("DOMContentLoaded", () => {
	const GANTT_SCROLL_LOGIC = {
		/**
		 * Initiates the scroll to the 'today' highlight element within the Gantt chart.
		 * @param {HTMLElement} gantt_container - The container of the Gantt chart SVG.
		 */
		scrollToToday: function (gantt_container) {
			const today_el = gantt_container.querySelector(".today-highlight");
			if (!today_el) return;

			const scroll_el =
				gantt_container.closest(".gantt-scroll-wrapper") ||
				gantt_container.closest(".gantt-container");
			if (!scroll_el) return;

			this.executeScroll(scroll_el, today_el);
		},

		/**
		 * Calculates the target scroll position and performs the scroll.
		 * @param {HTMLElement} scroll_el - The scrollable container element.
		 * @param {HTMLElement} today_el - The element representing today's date.
		 */
		executeScroll: function (scroll_el, today_el) {
			const container_width = scroll_el.offsetWidth;
			const today_pos = parseFloat(today_el.getAttribute("x"));
			const scroll_left = today_pos - container_width / 2;

			scroll_el.scrollTo({
				left: scroll_left,
				behavior: "smooth",
			});
		},
	};

	/**
	 * Watches for the '.today-highlight' element to be added to the Gantt container.
	 * @param {HTMLElement} ganttContainer - The Gantt chart's main container element.
	 */
	function waitForTodayHighlight(ganttContainer) {
		// First, check if the element already exists.
		if (ganttContainer.querySelector(".today-highlight")) {
			GANTT_SCROLL_LOGIC.scrollToToday(ganttContainer);
			return;
		}

		// If not, set up an observer to wait for it.
		const observer = new MutationObserver((mutations, obs) => {
			for (const mutation of mutations) {
				if (mutation.addedNodes.length > 0) {
					// Check if any of the added nodes are the highlight or contain it.
					const todayHighlight = ganttContainer.querySelector(".today-highlight");
					if (todayHighlight) {
						GANTT_SCROLL_LOGIC.scrollToToday(ganttContainer);
						obs.disconnect(); // Clean up the observer once the job is done.
						return;
					}
				}
			}
		});

		observer.observe(ganttContainer, {
			childList: true,
			subtree: true,
		});
	}

	/**
	 * The main observer that watches for Gantt charts being added to the document body.
	 */
	const bodyObserver = new MutationObserver((mutations) => {
		// Optimization: Only run on pages that might have a Gantt chart.
		// This prevents unnecessary processing on heavy pages like "Purchase Order".
		if (window.frappe && window.frappe.get_route) {
			const route = frappe.get_route();
			if (Array.isArray(route)) {
				const isRelevantPage = route.some((part) => {
					if (typeof part !== "string") return false;
					const p = part.toLowerCase();
					return p === "project" || p === "task" || p === "project_dashboard";
				});

				if (!isRelevantPage) return;
			}
		}

		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType === 1) {
					// Ensure it's an element node.
					// Check if the added node is a Gantt container or contains one.
					const ganttContainer = node.matches(".gantt-container")
						? node
						: node.querySelector(".gantt-container");

					if (ganttContainer) {
						// Once the container is found, start the nested observation.
						waitForTodayHighlight(ganttContainer);
					}
				}
			});
		});
	});

	bodyObserver.observe(document.body, {
		childList: true,
		subtree: true,
	});
});
