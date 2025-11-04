<script>
  import { createEventDispatcher } from 'svelte';
  import { parseCSV, downloadTemplate } from '../utils/csvParser';

  const dispatch = createEventDispatcher();

  let fileInput;
  let selectedFile = null;
  let parsing = false;
  let parseResult = null;
  let previewRoles = [];

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    selectedFile = file;
    parseFile(file);
  }

  async function parseFile(file) {
    parsing = true;
    parseResult = null;
    previewRoles = [];

    try {
      const text = await file.text();
      const result = parseCSV(text);
      
      parseResult = result;
      previewRoles = result.roles.slice(0, 10); // Show first 10 for preview
    } catch (error) {
      parseResult = {
        roles: [],
        errors: [error.message],
        totalRows: 0,
        successCount: 0,
        errorCount: 1
      };
    } finally {
      parsing = false;
    }
  }

  function handleImport() {
    if (!parseResult || parseResult.roles.length === 0) {
      return;
    }

    dispatch('import', { roles: parseResult.roles });
  }

  function handleCancel() {
    dispatch('cancel');
  }

  function clearFile() {
    selectedFile = null;
    parseResult = null;
    previewRoles = [];
    if (fileInput) {
      fileInput.value = '';
    }
  }
</script>

<div class="bulk-upload">
  <div class="upload-header">
    <h2>Bulk Upload Volunteer Roles</h2>
    <p>Import multiple roles from a CSV file</p>
  </div>

  <div class="template-section">
    <h3>📋 CSV Template</h3>
    <p>Download the template to see the required format:</p>
    <button class="btn btn-secondary" on:click={downloadTemplate}>
      Download CSV Template
    </button>
    
    <div class="format-info">
      <h4>Required Columns:</h4>
      <ul>
        <li><code>name</code> - Role name (required)</li>
        <li><code>event_date</code> - Date in YYYY-MM-DD format (required)</li>
        <li><code>start_time</code> - Time in HH:MM format, e.g., 07:00 (required)</li>
        <li><code>end_time</code> - Time in HH:MM format, e.g., 09:00 (required)</li>
        <li><code>positions_total</code> - Number of positions (required)</li>
      </ul>
      
      <h4>Optional Columns:</h4>
      <ul>
        <li><code>description</code> - Role description</li>
        <li><code>location</code> - Meeting point or location</li>
        <li><code>domain_name</code> - Domain name (e.g., "Course Marshals", "Registration & Check-in")</li>
        <li><code>leader_email</code> - Direct leader assignment (email address of volunteer leader)</li>
      </ul>
      <p class="info-note">
        <strong>Note:</strong> If both <code>domain_name</code> and <code>leader_email</code> are provided, 
        the domain assignment takes precedence (recommended approach).
      </p>
    </div>
  </div>

  <div class="upload-section">
    <h3>📤 Upload CSV</h3>
    
    <div class="file-input-wrapper">
      <input
        type="file"
        accept=".csv"
        bind:this={fileInput}
        on:change={handleFileSelect}
        id="csv-upload"
      />
      <label for="csv-upload" class="file-label">
        {selectedFile ? selectedFile.name : 'Choose CSV file...'}
      </label>
      
      {#if selectedFile}
        <button class="btn-clear" on:click={clearFile}>✕</button>
      {/if}
    </div>

    {#if parsing}
      <div class="parsing">Parsing CSV file...</div>
    {/if}
  </div>

  {#if parseResult}
    <div class="results-section">
      <div class="result-summary {parseResult.errorCount > 0 ? 'has-errors' : 'success'}">
        <h3>Parse Results</h3>
        <div class="stats">
          <div class="stat">
            <span class="stat-value">{parseResult.totalRows}</span>
            <span class="stat-label">Total Rows</span>
          </div>
          <div class="stat success">
            <span class="stat-value">{parseResult.successCount}</span>
            <span class="stat-label">Valid Roles</span>
          </div>
          {#if parseResult.errorCount > 0}
            <div class="stat error">
              <span class="stat-value">{parseResult.errorCount}</span>
              <span class="stat-label">Errors</span>
            </div>
          {/if}
        </div>
      </div>

      {#if parseResult.errors.length > 0}
        <div class="errors-section">
          <h4>⚠️ Errors Found:</h4>
          <ul class="error-list">
            {#each parseResult.errors as error}
              <li>{error}</li>
            {/each}
          </ul>
          <p class="error-note">
            Fix these errors in your CSV and upload again. Valid rows will still be imported.
          </p>
        </div>
      {/if}

      {#if previewRoles.length > 0}
        <div class="preview-section">
          <h4>📋 Preview (first {previewRoles.length} roles)</h4>
          <div class="preview-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Positions</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {#each previewRoles as role}
                  <tr>
                    <td>
                      <strong>{role.name}</strong>
                      {#if role.description}
                        <div class="preview-desc">{role.description}</div>
                      {/if}
                    </td>
                    <td>{role.event_date}</td>
                    <td>{role.start_time} - {role.end_time}</td>
                    <td>{role.positions_total}</td>
                    <td>{role.location || '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          
          {#if parseResult.roles.length > 10}
            <p class="preview-note">
              ... and {parseResult.roles.length - 10} more roles
            </p>
          {/if}
        </div>
      {/if}

      <div class="actions">
        <button class="btn btn-secondary" on:click={handleCancel}>
          Cancel
        </button>
        
        <button
          class="btn btn-primary"
          on:click={handleImport}
          disabled={parseResult.roles.length === 0}
        >
          Import {parseResult.roles.length} {parseResult.roles.length === 1 ? 'Role' : 'Roles'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .bulk-upload {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .upload-header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #dee2e6;
  }

  .upload-header h2 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .upload-header p {
    margin: 0;
    color: #6c757d;
  }

  .template-section,
  .upload-section {
    margin-bottom: 2rem;
  }

  .template-section h3,
  .upload-section h3 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-size: 1.2rem;
  }

  .template-section p {
    margin-bottom: 1rem;
    color: #495057;
  }

  .format-info {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 8px;
    margin-top: 1rem;
  }

  .format-info h4 {
    margin: 0 0 0.75rem 0;
    color: #495057;
    font-size: 1rem;
  }

  .format-info ul {
    margin: 0 0 1rem 0;
    padding-left: 1.5rem;
    color: #495057;
  }

  .format-info ul:last-child {
    margin-bottom: 0;
  }

  .format-info li {
    margin-bottom: 0.5rem;
  }

  .format-info code {
    background: white;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-family: monospace;
    color: #007bff;
  }

  .info-note {
    margin-top: 1rem;
    padding: 1rem;
    background: #e7f3ff;
    border-left: 4px solid #007bff;
    border-radius: 4px;
    color: #004085;
    font-size: 0.9rem;
  }

  .info-note strong {
    font-weight: 600;
  }

  .file-input-wrapper {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  input[type="file"] {
    display: none;
  }

  .file-label {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 2px dashed #ced4da;
    border-radius: 8px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    color: #495057;
  }

  .file-label:hover {
    border-color: #007bff;
    background: #f8f9fa;
  }

  .btn-clear {
    padding: 0.5rem 1rem;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-clear:hover {
    background: #c82333;
  }

  .parsing {
    text-align: center;
    padding: 2rem;
    color: #007bff;
    font-weight: 600;
  }

  .results-section {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 2px solid #dee2e6;
  }

  .result-summary {
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .result-summary.success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
  }

  .result-summary.has-errors {
    background: #fff3cd;
    border: 1px solid #ffeeba;
  }

  .result-summary h3 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .stats {
    display: flex;
    gap: 2rem;
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: 2rem;
    font-weight: bold;
    color: #1a1a1a;
  }

  .stat.success .stat-value {
    color: #28a745;
  }

  .stat.error .stat-value {
    color: #dc3545;
  }

  .stat-label {
    display: block;
    font-size: 0.9rem;
    color: #6c757d;
  }

  .errors-section {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .errors-section h4 {
    margin: 0 0 1rem 0;
    color: #721c24;
  }

  .error-list {
    margin: 0 0 1rem 0;
    padding-left: 1.5rem;
    color: #721c24;
  }

  .error-list li {
    margin-bottom: 0.5rem;
  }

  .error-note {
    margin: 0;
    color: #856404;
    font-size: 0.9rem;
    font-style: italic;
  }

  .preview-section {
    margin-bottom: 2rem;
  }

  .preview-section h4 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .preview-table {
    overflow-x: auto;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    background: #f8f9fa;
    padding: 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
  }

  td {
    padding: 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }

  tr:hover {
    background: #f8f9fa;
  }

  .preview-desc {
    font-size: 0.85rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .preview-note {
    margin-top: 1rem;
    text-align: center;
    color: #6c757d;
    font-style: italic;
  }

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding-top: 1.5rem;
    border-top: 1px solid #dee2e6;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: white;
    color: #6c757d;
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }
</style>

