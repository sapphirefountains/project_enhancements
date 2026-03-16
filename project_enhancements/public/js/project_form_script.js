/* global project_enhancements */

frappe.ui.form.on('Project', {
    refresh: function(frm) {
        // Stop execution of custom buttons/trees if document is not saved yet
        if (frm.is_new()) {
            return;
        }

        // =========================================================================
        // 1. STATE CLEANUP: Destroy old tree instance when navigating between projects
        // =========================================================================
        if (frm.task_tree_instance && frm._current_task_tree_project !== frm.doc.name) {
            console.log(`Cleaning up Task Tree cache from previous project: ${frm._current_task_tree_project}`);
            if (frm.task_tree_instance.sortableInstances) {
                frm.task_tree_instance.sortableInstances.forEach(instance => instance.destroy());
            }
            if (frm.get_field('custom_tasks_html') && frm.get_field('custom_tasks_html').$wrapper) {
                frm.get_field('custom_tasks_html').$wrapper.empty();
            }
            frm.task_tree_instance = null;
        }
        frm._current_task_tree_project = frm.doc.name;

        // =========================================================================
        // 2. ORIGINAL REPO LOGIC: Move Activity and Connections sections
        // =========================================================================
        const formTabs = frm.$wrapper.find('.form-tabs');
        const detailsTab = formTabs.find('.nav-item[data-label="Details"]');
        const activitySection = frm.$wrapper.find('[data-label="Activity"]');
        const activitySectionContainer = activitySection.closest('.frappe-control');
        const connectionsSection = frm.$wrapper.find('[data-label="Connections"]');

        if (detailsTab.length && activitySection.length) {
            detailsTab.closest('.form-layout').find('.tab-content .tab-pane[data-label="Details"]').append(activitySectionContainer);
            if (connectionsSection.length) {
                detailsTab.closest('.form-layout').find('.tab-content .tab-pane[data-label="Details"]').append(connectionsSection.closest('.frappe-control'));
            }
        }

        // =========================================================================
        // 3. TREE VIEW FORCED LOADER (No Lazy Loading)
        // =========================================================================
        const force_load_task_tree = async (frm) => {
            try {
                if (!frm._task_tree_loaded) {
                    await frappe.require('/assets/project_enhancements/js/task_tree_manager.js');
                    frm._task_tree_loaded = true;
                }
                if (window.project_enhancements && project_enhancements.TaskTreeManager) {
                    const wrapperField = frm.get_field('custom_tasks_html');
                    if (wrapperField && wrapperField.$wrapper) {
                        if (!frm.task_tree_instance) {
                            console.log(`Forcing Task Tree render for Project: ${frm.doc.name}`);
                            frm.task_tree_instance = new project_enhancements.TaskTreeManager({
                                wrapper: wrapperField.$wrapper,
                                projectName: frm.doc.name
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to force load Task Tree:', error);
            }
        };

        // Execute unconditionally upon form refresh!
        if (frappe.has_permission("Task", "read")) {
            force_load_task_tree(frm);
        }

        // =========================================================================
        // 4. ORIGINAL REPO LOGIC: Deep linking logic from Dashboard
        // =========================================================================
        const checkAndSwitchToScopeTab = () => {
            if (window.location.hash === '#custom_scope') {
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

        checkAndSwitchToScopeTab();
        $(window).on('hashchange', checkAndSwitchToScopeTab);

        // =========================================================================
        // 5. HIDE STANDARD VIEW BUTTON
        // =========================================================================
        const styleId = 'hide-standard-view-btn-style';
        if (!document.getElementById(styleId)) {
            const styleEl = document.createElement('style');
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
            if (frm.page && frm.page.wrapper) {
                frm.page.wrapper.find('.inner-group-button[data-label="View"]').hide();
            }
        }, 100);

        // =========================================================================
        // 6. CUSTOM "VIEW TASKS" DROPDOWN
        // =========================================================================
        if (frappe.has_permission("Task", "read")) {
            
            frm.add_custom_button(__('Calendar'), async function() {
                frappe.dom.freeze(__('Navigating to Calendar View...'));
                try {
                    frappe.route_options = { project: frm.doc.name };
                    await frappe.set_route('List', 'Task', 'Calendar');
                } catch (error) {
                    frappe.msgprint({ title: __('Error'), message: __('Failed to navigate to Calendar View.'), indicator: 'red' });
                } finally {
                    frappe.dom.unfreeze();
                }
            }, __('View Tasks'));

            frm.add_custom_button(__('Kanban'), async function() {
                frappe.dom.freeze(__('Navigating to Kanban Board...'));
                try {
                    frappe.route_options = { project: frm.doc.name };
                    await frappe.set_route('List', 'Task', 'Kanban');
                } catch (error) {
                    frappe.msgprint({ title: __('Error'), message: __('Failed to navigate to Kanban Board.'), indicator: 'red' });
                } finally {
                    frappe.dom.unfreeze();
                }
            }, __('View Tasks'));

            frm.add_custom_button(__('Gantt'), async function() {
                frappe.dom.freeze(__('Navigating to Gantt Chart...'));
                try {
                    frappe.route_options = { project: frm.doc.name };
                    await frappe.set_route('List', 'Task', 'Gantt');
                } catch (error) {
                    frappe.msgprint({ title: __('Error'), message: __('Failed to navigate to Gantt Chart.'), indicator: 'red' });
                } finally {
                    frappe.dom.unfreeze();
                }
            }, __('View Tasks'));

            frm.add_custom_button(__('Tree View'), function() {
                window.location.hash = '#custom_scope';
                setTimeout(() => {
                    const scopeTab = frm.$wrapper.find('.form-tabs .nav-item[data-label="Scope"], .form-tabs .nav-item[data-fieldname="custom_scope"]');
                    if (scopeTab.length) {
                        const tabLink = scopeTab.find('a.nav-link');
                        if (tabLink.length) {
                            tabLink.click();
                        } else {
                            scopeTab.click();
                        }
                    }
                }, 100);
            }, __('View Tasks'));

            setTimeout(() => {
                const newBtnGroup = frm.page.wrapper.find('.inner-group-button[data-label="View Tasks"] button, .custom-btn-group[data-label="View Tasks"] button').first();
                if(newBtnGroup.length) {
                    newBtnGroup.removeClass('btn-default').addClass('btn-primary');
                }
            }, 300);
        }
    }
});
