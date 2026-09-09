// Module Registry - Central definition of available modules
// P5 Gen2-16: Capability Bus foundation for modular execution

class ModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  /**
   * Register a new module
   * @param {string} moduleUUID - Unique identifier
   * @param {object} definition - Module definition
   */
  register(moduleUUID, definition) {
    if (this.modules.has(moduleUUID)) {
      throw new Error(`Module already registered: ${moduleUUID}`);
    }

    this.modules.set(moduleUUID, {
      registeredAt: new Date().toISOString(),
      ...definition,
    });
  }

  /**
   * Unregister a module
   * @param {string} moduleUUID
   */
  unregister(moduleUUID) {
    this.modules.delete(moduleUUID);
  }

  /**
   * Get module definition
   * @param {string} moduleUUID
   */
  get(moduleUUID) {
    return this.modules.get(moduleUUID);
  }

  /**
   * List all registered modules
   */
  list() {
    return Array.from(this.modules.values());
  }

  /**
   * Check if module exists
   * @param {string} moduleUUID
   */
  has(moduleUUID) {
    return this.modules.has(moduleUUID);
  }

  /**
   * Initialize default modules (prototype)
   */
  initializeDefaults() {
    const defaults = {
      'jira-create-task': {
        type: 'connector',
        name: 'Jira Create Task',
        description: 'Create a new task in Jira',
        endpoint: '/api/connectors/jira',
        method: 'POST',
        requiredParams: ['projectKey', 'summary', 'assignee'],
        optionalParams: ['description', 'priority', 'labels'],
      },
      'github-create-issue': {
        type: 'connector',
        name: 'GitHub Create Issue',
        description: 'Create a new GitHub issue',
        endpoint: '/api/connectors/github',
        method: 'POST',
        requiredParams: ['repo', 'title', 'body'],
        optionalParams: ['labels', 'assignees', 'milestone'],
      },
      'cloudflare-r2-upload': {
        type: 'storage',
        name: 'Cloudflare R2 Upload',
        description: 'Upload file to Cloudflare R2',
        endpoint: '/api/storage/r2',
        method: 'POST',
        requiredParams: ['bucket', 'key', 'body'],
        optionalParams: ['contentType', 'contentEncoding'],
      },
      'cloudflare-d1-query': {
        type: 'storage',
        name: 'Cloudflare D1 Query',
        description: 'Execute query on D1 database',
        endpoint: '/api/storage/d1',
        method: 'POST',
        requiredParams: ['databaseId', 'sql'],
        optionalParams: ['params'],
      },
    };

    Object.entries(defaults).forEach(([uuid, def]) => {
      this.register(uuid, def);
    });
  }
}

export { ModuleRegistry };