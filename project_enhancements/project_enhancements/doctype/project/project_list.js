// This tells the Frappe framework that we are adding custom settings
// to the List View for the "Project" DocType.
frappe.listview_settings['Project'] = {

    // The 'setup' function runs once when the list view is first being built.
    setup: function(listview) {

        // This is our browser-side debug message. It will appear in the
        // F12 Developer Console.
        console.log("Browser DEBUG: Calling server script for group_by settings.");

        // This is the command to "call" our Python function on the server.
        frappe.call({
            // This is the full "address" of our Python function:
            // app_name.module_name.doctype.[doctype_name].[filename].[function_name]
            method: "project_enhancements.project_enhancements.doctype.project.project.get_project_grouping_option",
            
            // The 'callback' function runs after the server sends back a response.
            callback: function(r) {
                // 'r' is the response object from the server. We log the whole thing.
                console.log("Browser DEBUG: Received response from server:", r); 
                
                // We check if the response ('r') has a 'message' property,
                // and if that message contains our 'group_by' key.
                if (r.message && r.message.group_by) {
                    console.log("Browser DEBUG: Applying group_by setting:", r.message.group_by);

                    // We apply the setting from the server to the list view object.
                    listview.group_by = r.message.group_by;

                    // Finally, we tell the list view to redraw itself with the new setting.
                    listview.refresh();
                } else {
                    console.error("Browser DEBUG: Invalid response from server or missing group_by key in message.");
                }
            }
        });
    }
};
