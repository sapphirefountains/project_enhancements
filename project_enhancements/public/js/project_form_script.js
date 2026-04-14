/* global project_enhancements */

frappe.ui.form.on("Project", {
	refresh: function (frm) {
		if (frm.is_new()) {
			return;
		}

		// =========================================================================
		// 1. STATE CLEANUP FOR SPA NAVIGATION
		// =========================================================================
		console.log(
			`Project form refreshed: ${frm.doc.name}. Cleaning up old tree state to prevent detached nodes.`
		);
		if (frm.task_tree_instance) {
			if (frm.task_tree_instance.sortableInstances) {
				frm.task_tree_instance.sortableInstances.forEach((instance) => instance.destroy());
			}
			frm.task_tree_instance = null;
		}
		if (frm.get_field("custom_tasks_html") && frm.get_field("custom_tasks_html").$wrapper) {
			frm.get_field("custom_tasks_html").$wrapper.empty();
		}
		frm._current_task_tree_project = frm.doc.name;

		// =========================================================================
		// 2. ORIGINAL REPO LOGIC: Move Activity and Connections sections
		// =========================================================================
		const formTabs = frm.$wrapper.find(".form-tabs");
		const detailsTab = formTabs.find('.nav-item[data-label="Details"]');
		const activitySection = frm.$wrapper.find('[data-label="Activity"]');
		const activitySectionContainer = activitySection.closest(".frappe-control");
		const connectionsSection = frm.$wrapper.find('[data-label="Connections"]');

		if (detailsTab.length && activitySection.length) {
			detailsTab
				.closest(".form-layout")
				.find('.tab-content .tab-pane[data-label="Details"]')
				.append(activitySectionContainer);
			if (connectionsSection.length) {
				detailsTab
					.closest(".form-layout")
					.find('.tab-content .tab-pane[data-label="Details"]')
					.append(connectionsSection.closest(".frappe-control"));
			}
		}

		// =========================================================================
		// 3. TREE VIEW RENDERER
		// =========================================================================
		if (frappe.has_permission("Task", "read")) {
			const wrapperField = frm.get_field("custom_tasks_html");

			if (wrapperField && wrapperField.$wrapper) {
				const renderTaskTree = function () {
					if (this.$wrapper && this.$wrapper.children().length === 0) {
						const docName = frm.doc.name;

						frappe
							.require("/assets/project_enhancements/js/task_tree_manager.js")
							.then(() => {
								if (
									window.project_enhancements &&
									project_enhancements.TaskTreeManager
								) {
									console.log(`Rendering Task Tree for Project: ${docName}`);

									if (frm.task_tree_instance) {
										if (frm.task_tree_instance.sortableInstances) {
											frm.task_tree_instance.sortableInstances.forEach(
												(instance) => instance.destroy()
											);
										}
										frm.task_tree_instance = null;
									}

									this.$wrapper
										.empty()
										.html('<div class="task-tree-container"></div>');

									frm.task_tree_instance =
										new project_enhancements.TaskTreeManager({
											wrapper: this.$wrapper.find(".task-tree-container"),
											projectName: docName,
										});
								}
							});
					}
				};

				// Override refresh to ensure Frappe's tab lazy rendering doesn't clear our DOM
				// By re-instantiating on refresh, it loads automatically just like gantt (or any other field)
				// when its parent wrapper is available or brought into view.
				const original_refresh = wrapperField.refresh;
				wrapperField.refresh = function () {
					if (original_refresh) {
						original_refresh.call(this);
					}
					renderTaskTree.call(this);
				};
				wrapperField.refresh();
			}
		}

		// =========================================================================
		// 4. ORIGINAL REPO LOGIC: Deep linking logic from Dashboard
		// =========================================================================
		const checkAndSwitchToScopeTab = () => {
			if (window.location.hash === "#custom_scope") {
				setTimeout(() => {
					const scopeTab = formTabs.find(
						'.nav-item[data-label="Scope"], .nav-item[data-fieldname="custom_scope"]'
					);
					if (scopeTab.length) {
						const tabLink = scopeTab.find("a.nav-link");
						if (tabLink.length) {
							tabLink.click();
						} else {
							scopeTab.click();
						}
					}
				}, 300);
			}
		};

		checkAndSwitchToScopeTab();
		$(window).on("hashchange", checkAndSwitchToScopeTab);

		// =========================================================================
		// 5. HIDE STANDARD VIEW BUTTON
		// =========================================================================
		const styleId = "hide-standard-view-btn-style";
		if (!document.getElementById(styleId)) {
			const styleEl = document.createElement("style");
			styleEl.id = styleId;
			styleEl.innerHTML = `
                .inner-group-button[data-label="View"],
                .custom-btn-group[data-label="View"] {
                    display: none !important;
                }
            `;
			document.head.appendChild(styleEl);
		}

		setTimeout(() => {
			if (frm.page && frm.page.clear_custom_button) {
				try {
					frm.page.clear_custom_button('View');
				} catch (e) {
					console.warn("Failed to clear standard 'View' button via API, CSS fallback active.", e);
				}
			}
		}, 100);

		// =========================================================================
		// 6. CUSTOM "VIEW TASKS" DROPDOWN
		// =========================================================================
		if (frappe.has_permission("Task", "read")) {
			// Helper to wait for an element without hardcoded timeouts
			const waitForElement = (selector, timeout = 3000) => {
				return new Promise((resolve, reject) => {
					if (document.querySelector(selector)) {
						return resolve(document.querySelector(selector));
					}

					const observer = new MutationObserver(() => {
						if (document.querySelector(selector)) {
							observer.disconnect();
							resolve(document.querySelector(selector));
						}
					});

					observer.observe(document.body, {
						childList: true,
						subtree: true
					});

					setTimeout(() => {
						observer.disconnect();
						reject(new Error(`Timeout waiting for element: ${selector}`));
					}, timeout);
				});
			};

			// Create parent dropdown first
			frm.add_custom_button(
				__("Calendar"),
				async function () {
					frappe.dom.freeze(__("Navigating to Calendar View..."));
					try {
						frappe.route_options = { project: frm.doc.name };
						await frappe.set_route("List", "Task", "Calendar");
					} catch (error) {
						frappe.msgprint({
							title: __("Error"),
							message: __("Failed to navigate to Calendar View."),
							indicator: "red",
						});
					} finally {
						frappe.dom.unfreeze();
					}
				},
				__("View Tasks")
			);

			// Yield execution then check if parent rendered, followed by adding the remaining options
			setTimeout(() => {
				waitForElement('.inner-group-button[data-label="View Tasks"], .custom-btn-group[data-label="View Tasks"]')
					.then((dropdownGroupEl) => {
						frm.add_custom_button(
							__("Kanban"),
							async function () {
								frappe.dom.freeze(__("Navigating to Kanban Board..."));
								try {
									frappe.route_options = { project: frm.doc.name };
									await frappe.set_route("List", "Task", "Kanban");
								} catch (error) {
									frappe.msgprint({
										title: __("Error"),
										message: __("Failed to navigate to Kanban Board."),
										indicator: "red",
									});
								} finally {
									frappe.dom.unfreeze();
								}
							},
							__("View Tasks")
						);

						frm.add_custom_button(
							__("Gantt"),
							async function () {
								frappe.dom.freeze(__("Navigating to Gantt Chart..."));
								try {
									frappe.route_options = { project: frm.doc.name };
									await frappe.set_route("List", "Task", "Gantt");
								} catch (error) {
									frappe.msgprint({
										title: __("Error"),
										message: __("Failed to navigate to Gantt Chart."),
										indicator: "red",
									});
								} finally {
									frappe.dom.unfreeze();
								}
							},
							__("View Tasks")
						);

						frm.add_custom_button(
							__("Tree View"),
							function () {
								window.location.hash = "#custom_scope";
								setTimeout(() => {
									const scopeTab = frm.$wrapper.find(
										'.form-tabs .nav-item[data-label="Scope"], .form-tabs .nav-item[data-fieldname="custom_scope"]'
									);
									if (scopeTab.length) {
										const tabLink = scopeTab.find("a.nav-link");
										if (tabLink.length) {
											tabLink.click();
										} else {
											scopeTab.click();
										}
									}
								}, 100);
							},
							__("View Tasks")
						);

						// Style parent button
						const btnGroup = $(dropdownGroupEl).find('button').first();
						if (btnGroup.length) {
							btnGroup.removeClass("btn-default").addClass("btn-primary");
						}
					})
					.catch((err) => {
						console.error(err);
					});
			}, 0);
		}
	},
});
