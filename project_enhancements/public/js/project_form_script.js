/* global project_enhancements */

// The frappe.ui.form.on event is triggered when a form is loaded in Frappe.
// We are targeting the 'Project' DocType specifically.
frappe.ui.form.on('Project', {
    // The 'refresh' trigger ensures our script runs every time the form is loaded or refreshed.
    refresh: function(frm) {
        // We select the '.form-tabs' container which holds all the main tabs like "Details", "Scope", etc.
        const formTabs = frm.$wrapper.find('.form-tabs');

        // From within the form tabs, we are looking for a tab with the data-label "Details".
        // This is the main "Details" tab on the Project page.
        const detailsTab = formTabs.find('.nav-item[data-label="Details"]');

        // We are searching for a section with the label "Activity".
        // Frappe typically renders sections with a 'data-label' attribute.
        const activitySection = frm.$wrapper.find('[data-label="Activity"]');

        // We also need to find the parent container of the "Activity" section.
        // In Frappe forms, sections are often contained within a '.frappe-control' div.
        const activitySectionContainer = activitySection.closest('.frappe-control');

        // To correctly move the "Activity" section, we also need to find the section that comes right after it.
        // This is often a "Section Break" that visually separates different parts of the form.
        const connectionsSection = frm.$wrapper.find('[data-label="Connections"]');

        // Now, we will check if both the "Details" tab and the "Activity" section are present on the page.
        if (detailsTab.length && activitySection.length) {
            // If they exist, we will move the "Activity" section's container to the bottom of the "Details" tab content area.
            // The '.tab-pane' with the corresponding 'data-label' holds the content for that tab.
            detailsTab.closest('.form-layout').find('.tab-content .tab-pane[data-label="Details"]').append(activitySectionContainer);

            // After moving the "Activity" section, we also move the "Connections" section right after it
            // to maintain the intended form structure.
            if (connectionsSection.length) {
                detailsTab.closest('.form-layout').find('.tab-content .tab-pane[data-label="Details"]').append(connectionsSection.closest('.frappe-control'));
            }
        }

        // Deep linking logic from Dashboard using URL fragment
        const checkAndSwitchToScopeTab = () => {
            if (window.location.hash === '#custom_scope') {
                // Wait for standard form initialization to complete
                setTimeout(() => {
                    const scopeTab = formTabs.find('.nav-item[data-label="Scope"], .nav-item[data-fieldname="custom_scope"]');
                    if (scopeTab.length) {
                        const tabLink = scopeTab.find('a.nav-link');
                        if (tabLink.length) {
                            tabLink.click();
                        } else {
                            scopeTab.click();
                        }
                    }
                }, 300);
            }
        };

        // Check on initial load
        checkAndSwitchToScopeTab();

        // Check when hash changes (e.g. Back/Forward navigation)
        $(window).on('hashchange', checkAndSwitchToScopeTab);

        // Add 'View Tasks' Custom Button
        if (!frm.is_new()) {
            setTimeout(() => {
                // Ensure the button isn't duplicated
                if (frm.page.get_menu_item(__('View Tasks'))) {
                    frm.page.remove_menu_item(__('View Tasks'));
                }
                if (frm.page.get_inner_group_button(__('View Tasks'))) {
                    frm.page.remove_inner_button(__('View Tasks'));
                }

                // Add the primary button next to 'Merge Project' / 'Actions'
                let btn = frm.page.add_button(__('View Tasks'), function() {
                    // Non-blocking state mutation to navigate to the Scope tab natively
                    window.location.hash = '#custom_scope';
                });

                // Style as primary button
                if (btn) {
                    btn.addClass('btn-primary');
                    // Add an icon to visually distinguish the action
                    btn.html(`<svg class="icon icon-sm"><use href="#icon-node-tree"></use></svg> <span class="hidden-xs">${__('View Tasks')}</span>`);
                }

                // 1. Calendar View Handler
                frm.add_custom_button(__('Calendar View'), async function() {
                    frappe.dom.freeze(__('Navigating to Calendar View...'));

                    try {
                        frappe.route_options = { project: frm.doc.name };
                        await frappe.set_route('List', 'Task', 'Calendar');
                    } catch (error) {
                        console.error('Routing failed:', error);
                        frappe.show_alert({ message: __('Failed to navigate to Calendar View.'), indicator: 'red' });
                    } finally {
                        frappe.dom.unfreeze();
                    }
                }, __('View'));

                // 2. Custom Tree View Handler
                frm.add_custom_button(__('Tree View'), async function() {
                    frappe.dom.freeze(__('Loading Tree View...'));

                    try {
                        window.location.hash = '#custom_scope';

                        // Wait a tick for the hash change to propagate and the tab to switch
                        await new Promise(resolve => setTimeout(resolve, 50));

                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout loading task_tree_manager.js')), 5000)
                        );

                        let requirePromise;
                        if (!frm._task_tree_loaded) {
                            requirePromise = frappe.require('/assets/project_enhancements/js/task_tree_manager.js').then(() => {
                                frm._task_tree_loaded = true;
                            });
                        } else {
                            requirePromise = Promise.resolve();
                        }

                        await Promise.race([requirePromise, timeoutPromise]);

                        if (frm.task_tree_instance) {
                            if (frm.task_tree_instance.sortableInstances) {
                                frm.task_tree_instance.sortableInstances.forEach(instance => instance.destroy());
                            }
                            if (frm.get_field('custom_tasks_html') && frm.get_field('custom_tasks_html').$wrapper) {
                                frm.get_field('custom_tasks_html').$wrapper.empty();
                            }
                            frm.task_tree_instance = null;
                        }

                        if (window.project_enhancements && project_enhancements.TaskTreeManager) {
                            frm.task_tree_instance = new project_enhancements.TaskTreeManager({
                                wrapper: frm.get_field('custom_tasks_html').$wrapper,
                                projectName: frm.doc.name
                            });
                        } else {
                            throw new Error('TaskTreeManager class not found');
                        }
                    } catch (error) {
                        console.error('Tree View loading failed:', error);
                        frappe.show_alert({ message: __('Failed to load Tree View.'), indicator: 'red' });
                    } finally {
                        frappe.dom.unfreeze();
                    }
                }, __('View'));

            }, 10);
        }
    }
});
