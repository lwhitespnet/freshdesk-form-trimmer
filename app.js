let client;
const CORE_FIELDS = ['subject', 'description', 'status', 'priority', 'group_id', 'responder_id', 'requester_id'];

// Enhanced logging function that shows in the UI
function debugLog(message, data = null) {
  console.log(message, data);
  
  // Also show debug info in the UI
  const debugDiv = document.getElementById('debug-output') || createDebugDiv();
  const logEntry = document.createElement('div');
  logEntry.style.cssText = 'margin:2px 0;padding:4px;background:#f0f0f0;font-size:11px;border-radius:2px;';
  logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
  
  if (data) {
    const dataDiv = document.createElement('pre');
    dataDiv.style.cssText = 'margin:2px 0;padding:4px;background:#e0e0e0;font-size:10px;overflow:auto;max-height:100px;';
    dataDiv.textContent = JSON.stringify(data, null, 2);
    logEntry.appendChild(dataDiv);
  }
  
  debugDiv.appendChild(logEntry);
  debugDiv.scrollTop = debugDiv.scrollHeight;
}

function createDebugDiv() {
  const debugDiv = document.createElement('div');
  debugDiv.id = 'debug-output';
  debugDiv.style.cssText = 'max-height:300px;overflow-y:auto;border:1px solid #ccc;padding:8px;margin:8px 0;background:white;';
  
  const title = document.createElement('h5');
  title.textContent = 'Debug Output:';
  title.style.margin = '0 0 8px 0';
  
  document.body.appendChild(title);
  document.body.appendChild(debugDiv);
  return debugDiv;
}

function onAppActivated() {
  debugLog('🚀 App activated, fetching ticket data...');
  
  return client.data.get('ticket')
    .then(({ ticket }) => {
      debugLog('✅ Ticket loaded', {
        id: ticket.id,
        portal_form_id: ticket.portal_form_id,
        subject: ticket.subject
      });
      
      if (!ticket.portal_form_id) {
        debugLog('⚠️ No portal_form_id found - this might be an agent-created ticket');
        return Promise.reject('No portal form ID');
      }
      
      return Promise.all([
        ticket.portal_form_id,
        fetchFormFields(ticket.portal_form_id),
        fetchAllCustomFields()
      ]);
    })
    .then(([formId, formFields, allFields]) => {
      debugLog('📋 Form fields fetched', {
        formId,
        formFieldCount: formFields.length,
        formFields: formFields.map(f => ({ name: f.name, key: f.key, label: f.label }))
      });
      
      debugLog('📝 All custom fields fetched', {
        totalFields: allFields.length,
        allFields: allFields
      });
      
      // Try both name and key approaches
      const formFieldNames = new Set(formFields.map(f => f.name).filter(Boolean));
      const formFieldKeys = new Set(formFields.map(f => f.key).filter(Boolean));
      const coreFieldsSet = new Set(CORE_FIELDS);
      
      debugLog('🔍 Field sets created', {
        formFieldNames: Array.from(formFieldNames),
        formFieldKeys: Array.from(formFieldKeys),
        coreFields: Array.from(coreFieldsSet)
      });
      
      // Determine which fields to hide (try name first, then key)
      const fieldsToHide = allFields.filter(fieldIdentifier => {
        const shouldKeepByName = formFieldNames.has(fieldIdentifier) || coreFieldsSet.has(fieldIdentifier);
        const shouldKeepByKey = formFieldKeys.has(fieldIdentifier) || coreFieldsSet.has(fieldIdentifier);
        return !shouldKeepByName && !shouldKeepByKey;
      });
      
      debugLog('👁️ Fields to hide', {
        count: fieldsToHide.length,
        fields: fieldsToHide
      });
      
      // Attempt to hide fields
      let hiddenCount = 0;
      let failedCount = 0;
      
      fieldsToHide.forEach(fieldKey => {
        client.interface.trigger('hideField', { fieldKey: fieldKey })
          .then(() => {
            hiddenCount++;
            debugLog(`✅ Hidden field: ${fieldKey}`);
          })
          .catch(error => {
            failedCount++;
            debugLog(`❌ Failed to hide field: ${fieldKey}`, error);
          });
      });
      
      // Summary after a short delay
      setTimeout(() => {
        debugLog('📊 Summary', {
          totalFieldsProcessed: fieldsToHide.length,
          hiddenSuccessfully: hiddenCount,
          failedToHide: failedCount
        });
      }, 1000);
      
    })
    .catch(error => {
      debugLog('💥 Error in onAppActivated', error);
    });
}

function fetchFormFields(formId) {
  debugLog(`🔄 Fetching form fields for form ID: ${formId}`);
  
  return client.request({
    url: `/api/v2/portal/forms/${formId}/ticket_fields`,
    method: 'GET'
  })
  .then(response => {
    debugLog('✅ Form fields API response', response);
    return response.ticket_fields || [];
  })
  .catch(error => {
    debugLog('❌ Error fetching form fields', error);
    throw error;
  });
}

function fetchAllCustomFields() {
  debugLog('🔄 Fetching all custom fields');
  
  return client.request({
    url: '/api/v2/ticket_fields',
    method: 'GET'
  })
  .then(response => {
    debugLog('✅ All fields API response', response);
    const fieldIdentifiers = response.ticket_fields.map(f => f.name || f.key).filter(Boolean);
    return fieldIdentifiers;
  })
  .catch(error => {
    debugLog('❌ Error fetching all fields', error);
    throw error;
  });
}

// Alternative field hiding approach if the first doesn't work
function alternativeHideFields(fieldsToHide) {
  debugLog('🔄 Trying alternative hide method');
  
  fieldsToHide.forEach(fieldKey => {
    // Try different field hiding approaches
    const hideAttempts = [
      () => client.interface.trigger('hideField', { fieldKey }),
      () => client.interface.trigger('hideField', { field: fieldKey }),
      () => client.interface.trigger('hide', { fieldKey }),
      () => client.interface.trigger('hide', { field: fieldKey })
    ];
    
    hideAttempts.forEach((attempt, index) => {
      try {
        attempt().then(() => {
          debugLog(`✅ Alternative hide method ${index + 1} worked for: ${fieldKey}`);
        }).catch(err => {
          debugLog(`❌ Alternative hide method ${index + 1} failed for ${fieldKey}:`, err);
        });
      } catch (err) {
        debugLog(`💥 Alternative hide method ${index + 1} threw error for ${fieldKey}:`, err);
      }
    });
  });
}

// Initialize the app
app.initialized()
  .then(_client => {
    client = _client;
    debugLog('🎯 App initialized successfully');
    
    // Set up event listeners
    client.events.on('app.activated', onAppActivated);
    
    debugLog('📡 Event listeners registered');
  })
  .catch(error => {
    debugLog('💥 App initialization failed', error);
  });