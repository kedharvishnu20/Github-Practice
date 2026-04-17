/**
 * Plugin System for Pipeline Nodes
 * Allows dynamic registration of custom node types
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'plugin-system' });

class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.hooks = {
      beforeNodeExecute: [],
      afterNodeExecute: [],
      onError: [],
      onData: []
    };
    this.nodeTypes = new Map();
  }

  /**
   * Register a plugin
   */
  register(plugin) {
    if (!plugin.name || !plugin.version) {
      throw new Error('Plugin must have name and version');
    }

    const key = `${plugin.name}@${plugin.version}`;
    
    if (this.plugins.has(key)) {
      logger.warn(`Plugin ${key} already registered, skipping`);
      return false;
    }

    // Validate plugin structure
    this._validatePlugin(plugin);

    // Register plugin
    this.plugins.set(key, {
      ...plugin,
      registeredAt: Date.now(),
      status: 'active'
    });

    // Register hooks
    if (plugin.hooks) {
      this._registerHooks(plugin);
    }

    // Register custom node types
    if (plugin.nodeTypes) {
      this._registerNodeTypes(plugin);
    }

    // Call plugin onRegister lifecycle
    if (plugin.onRegister) {
      try {
        plugin.onRegister(this);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onRegister failed`, error);
      }
    }

    logger.info(`Plugin ${key} registered successfully`);
    return true;
  }

  /**
   * Validate plugin structure
   */
  _validatePlugin(plugin) {
    const requiredFields = ['name', 'version'];
    const missingFields = requiredFields.filter(f => !plugin[f]);

    if (missingFields.length > 0) {
      throw new Error(`Plugin missing required fields: ${missingFields.join(', ')}`);
    }

    // Check for conflicting names
    if (plugin.nodeTypes) {
      for (const nodeType of Object.keys(plugin.nodeTypes)) {
        if (this.nodeTypes.has(nodeType)) {
          logger.warn(`Node type ${nodeType} already registered by another plugin`);
        }
      }
    }
  }

  /**
   * Register plugin hooks
   */
  _registerHooks(plugin) {
    for (const [hookName, hookFn] of Object.entries(plugin.hooks)) {
      if (this.hooks[hookName]) {
        this.hooks[hookName].push({
          plugin: plugin.name,
          fn: hookFn
        });
        logger.debug(`Registered hook ${hookName} from plugin ${plugin.name}`);
      } else {
        logger.warn(`Unknown hook ${hookName} in plugin ${plugin.name}`);
      }
    }
  }

  /**
   * Register custom node types from plugin
   */
  _registerNodeTypes(plugin) {
    for (const [typeName, NodeClass] of Object.entries(plugin.nodeTypes)) {
      this.nodeTypes.set(typeName, {
        class: NodeClass,
        plugin: plugin.name,
        registeredAt: Date.now()
      });
      logger.debug(`Registered node type ${typeName} from plugin ${plugin.name}`);
    }
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginName, version = null) {
    let key = pluginName;
    
    if (version) {
      key = `${pluginName}@${version}`;
    } else {
      // Find any version
      for (const k of this.plugins.keys()) {
        if (k.startsWith(`${pluginName}@`)) {
          key = k;
          break;
        }
      }
    }

    const plugin = this.plugins.get(key);
    if (!plugin) {
      logger.warn(`Plugin ${key} not found`);
      return false;
    }

    // Call plugin onUnregister lifecycle
    if (plugin.onUnregister) {
      try {
        plugin.onUnregister(this);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onUnregister failed`, error);
      }
    }

    // Remove hooks
    this._unregisterHooks(plugin.name);

    // Remove node types
    this._unregisterNodeTypes(plugin.name);

    // Remove plugin
    this.plugins.delete(key);
    logger.info(`Plugin ${key} unregistered`);

    return true;
  }

  /**
   * Unregister hooks from a plugin
   */
  _unregisterHooks(pluginName) {
    for (const [hookName, hooks] of Object.entries(this.hooks)) {
      this.hooks[hookName] = hooks.filter(h => h.plugin !== pluginName);
    }
  }

  /**
   * Unregister node types from a plugin
   */
  _unregisterNodeTypes(pluginName) {
    for (const [typeName, info] of this.nodeTypes.entries()) {
      if (info.plugin === pluginName) {
        this.nodeTypes.delete(typeName);
      }
    }
  }

  /**
   * Execute hooks
   */
  async executeHook(hookName, context) {
    const hooks = this.hooks[hookName] || [];
    const results = [];

    for (const { plugin, fn } of hooks) {
      try {
        const result = await fn(context, this);
        results.push({ plugin, result });
      } catch (error) {
        logger.error(`Hook ${hookName} failed in plugin ${plugin}`, error);
        results.push({ plugin, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get registered plugin
   */
  getPlugin(name, version = null) {
    if (version) {
      return this.plugins.get(`${name}@${version}`);
    }

    // Return latest version
    for (const [key, plugin] of this.plugins.entries()) {
      if (key.startsWith(`${name}@`)) {
        return plugin;
      }
    }

    return null;
  }

  /**
   * Get all plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Get registered node type
   */
  getNodeType(typeName) {
    return this.nodeTypes.get(typeName);
  }

  /**
   * Get all registered node types
   */
  getAllNodeTypes() {
    return Array.from(this.nodeTypes.entries()).map(([name, info]) => ({
      name,
      plugin: info.plugin,
      registeredAt: info.registeredAt
    }));
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      totalPlugins: this.plugins.size,
      activePlugins: Array.from(this.plugins.values()).filter(p => p.status === 'active').length,
      totalNodeTypes: this.nodeTypes.size,
      hooksCount: Object.entries(this.hooks).reduce((sum, [, hooks]) => sum + hooks.length, 0),
      plugins: Array.from(this.plugins.values()).map(p => ({
        name: p.name,
        version: p.version,
        status: p.status,
        registeredAt: p.registeredAt,
        hooksRegistered: p.hooks ? Object.keys(p.hooks).length : 0,
        nodeTypesRegistered: p.nodeTypes ? Object.keys(p.nodeTypes).length : 0
      }))
    };
  }
}

/**
 * Base class for creating plugins
 */
class BasePlugin {
  constructor(config) {
    this.name = config.name;
    this.version = config.version;
    this.description = config.description || '';
    this.author = config.author || '';
    this.hooks = {};
    this.nodeTypes = {};
  }

  /**
   * Register a hook
   */
  addHook(hookName, fn) {
    this.hooks[hookName] = fn;
    return this;
  }

  /**
   * Register a custom node type
   */
  addNodeType(typeName, NodeClass) {
    this.nodeTypes[typeName] = NodeClass;
    return this;
  }

  /**
   * Lifecycle: called when plugin is registered
   */
  onRegister(registry) {
    // Override in subclass
  }

  /**
   * Lifecycle: called when plugin is unregistered
   */
  onUnregister(registry) {
    // Override in subclass
  }
}

/**
 * Example: Custom node plugin
 */
class CustomNodePlugin extends BasePlugin {
  constructor(config) {
    super({
      name: config.name,
      version: config.version,
      description: config.description,
      author: config.author
    });

    // Add custom nodes
    if (config.nodes) {
      for (const [name, NodeClass] of Object.entries(config.nodes)) {
        this.addNodeType(name, NodeClass);
      }
    }

    // Add hooks
    if (config.onBeforeExecute) {
      this.addHook('beforeNodeExecute', config.onBeforeExecute);
    }

    if (config.onAfterExecute) {
      this.addHook('afterNodeExecute', config.onAfterExecute);
    }
  }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();

export default {
  PluginRegistry,
  BasePlugin,
  CustomNodePlugin,
  pluginRegistry
};
