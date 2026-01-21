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
    }
});
