/**
 * Prompt Template Loader
 *
 * Loads prompt templates from the templates folder.
 * Supports:
 * - JSON files for metadata (.json)
 * - Markdown files for content (.md)
 * - Template inheritance (extends)
 * - Variable substitution
 *
 * Template Structure:
 * - {name}.json: Metadata (variables, extends, description)
 * - {name}.md: Prompt content with {VARIABLE} placeholders
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TemplateMetadata {
  name: string;
  description: string;
  version: string;
  extends: string | null;
  variables: Record<string, string>;
  outputFormat: string;
  requiredFields?: string[];
  focus?: string;
}

export interface LoadedTemplate {
  metadata: TemplateMetadata;
  content: string;
}

export class PromptTemplateLoader {
  private templatesDir: string;
  private cache: Map<string, LoadedTemplate> = new Map();

  constructor(templatesDir: string = path.join(__dirname, '../templates/prompts')) {
    this.templatesDir = templatesDir;
  }

  /**
   * Load template metadata from JSON file
   */
  private loadMetadata(templateName: string): TemplateMetadata {
    const jsonPath = path.join(this.templatesDir, `${templateName}.json`);

    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Template metadata not found: ${jsonPath}`);
    }

    const content = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(content);

    return {
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      extends: parsed.extends || null,
      variables: parsed.variables || {},
      outputFormat: parsed.outputFormat || 'json',
      requiredFields: parsed.requiredFields,
      focus: parsed.focus,
    };
  }

  /**
   * Load template content from MD file
   */
  private loadContent(templateName: string): string {
    const mdPath = path.join(this.templatesDir, `${templateName}.md`);

    if (!fs.existsSync(mdPath)) {
      throw new Error(`Template content not found: ${mdPath}`);
    }

    return fs.readFileSync(mdPath, 'utf-8');
  }

  /**
   * Load a template by name (resolves inheritance)
   */
  loadTemplate(templateName: string): LoadedTemplate {
    // Check cache first
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName)!;
    }

    const metadata = this.loadMetadata(templateName);
    let content = this.loadContent(templateName);

    // Resolve inheritance chain
    if (metadata.extends) {
      const parentTemplate = this.loadTemplate(metadata.extends);

      // Merge variables (child overrides parent)
      const mergedVariables = {
        ...parentTemplate.metadata.variables,
        ...metadata.variables,
      };
      metadata.variables = mergedVariables;

      // For content, include parent context reference
      const inheritanceNote = `
---
*This template extends: ${metadata.extends}*
*Parent variables available: ${Object.keys(parentTemplate.metadata.variables).join(', ')}*
---`;

      content = content + inheritanceNote;
    }

    const loaded: LoadedTemplate = {
      metadata,
      content,
    };

    // Cache the template
    this.cache.set(templateName, loaded);

    return loaded;
  }

  /**
   * Get template for a specific vulnerability category
   */
  getTemplateForCategory(category: string): LoadedTemplate {
    // Map category to template name
    const categoryToTemplate: Record<string, string> = {
      // SQL Injection
      sqli: 'sqli-analysis',
      'sql injection': 'sqli-analysis',
      sql_injection: 'sqli-analysis',
      // XSS
      xss: 'xss-analysis',
      'cross-site scripting': 'xss-analysis',
      xss反射: 'xss-analysis',
      xss存储: 'xss-analysis',
      // Command Injection
      cmdi: 'cmdi-analysis',
      'command injection': 'cmdi-analysis',
      'cmd injection': 'cmdi-analysis',
      rce: 'cmdi-analysis',
      'remote code execution': 'cmdi-analysis',
      // Hardcoded Secrets
      hardsecrets: 'hardsecrets-analysis',
      'hardcoded secrets': 'hardsecrets-analysis',
      'hardcoded credentials': 'hardsecrets-analysis',
      secrets: 'hardsecrets-analysis',
    };

    const templateName = categoryToTemplate[category.toLowerCase()] || 'exploit-analysis';
    return this.loadTemplate(templateName);
  }

  /**
   * Substitute variables in template content
   */
  substituteVariables(templateContent: string, variables: Record<string, string>): string {
    let result = templateContent;

    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    // Remove any remaining unfilled placeholders with a warning
    const remainingPlaceholders = result.match(/\{[A-Z_]+\}/g);
    if (remainingPlaceholders) {
      console.warn(`Warning: Unfilled template variables: ${remainingPlaceholders.join(', ')}`);
      result = result.replace(/\{[A-Z_]+\}/g, '[UNDEFINED]');
    }

    return result;
  }

  /**
   * Build prompt from template name and context
   */
  buildPrompt(templateName: string, variables: Record<string, string>): string {
    const template = this.loadTemplate(templateName);
    return this.substituteVariables(template.content, variables);
  }

  /**
   * Build prompt from category (auto-selects template)
   */
  buildPromptForCategory(
    category: string,
    context: {
      repo?: string;
      branch?: string;
      file?: string;
      line?: number;
      code?: string;
      severity?: string;
      cwe?: string;
      language?: string;
      // Category-specific
      context?: string;
      dbType?: string;
      osType?: string;
      secretType?: string;
      serviceType?: string;
      shellUsed?: string;
      isReflected?: boolean;
      isStored?: boolean;
      queryContext?: string;
    }
  ): string {
    const template = this.getTemplateForCategory(category);

    const variables: Record<string, string> = {
      REPO: context.repo || 'unknown',
      BRANCH: context.branch || 'main',
      FILE: context.file || 'unknown',
      LINE: context.line?.toString() || '0',
      CATEGORY: category,
      SEVERITY: context.severity || 'medium',
      CWE: context.cwe || 'Unknown',
      LANGUAGE: context.language || 'plaintext',
      // Extended variables
      CONTEXT: context.context || 'text',
      DB_TYPE: context.dbType || 'PostgreSQL',
      OS_TYPE: context.osType || 'Linux',
      SECRET_TYPE: context.secretType || 'API Key',
      SERVICE_TYPE: context.serviceType || 'Unknown',
      SHELL_USED: context.shellUsed || 'bash',
      IS_REFLECTED: context.isReflected ? 'Reflected' : 'Unknown',
      IS_STORED: context.isStored ? 'Stored' : 'Unknown',
      QUERY_CONTEXT: context.queryContext || 'direct query',
    };

    return this.substituteVariables(template.content, variables);
  }

  /**
   * List all available templates
   */
  listTemplates(): { name: string; metadata: TemplateMetadata }[] {
    const files = fs.readdirSync(this.templatesDir);
    const templateNames = [
      ...new Set(files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))),
    ];

    return templateNames.map((name) => {
      const metadata = this.loadMetadata(name);
      return { name, metadata };
    });
  }

  /**
   * Get available template categories
   */
  getCategories(): string[] {
    const templates = this.listTemplates();
    return templates.map((t) => t.name.replace('-analysis', ''));
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Default instance for easy import
const defaultLoader = new PromptTemplateLoader();

export { defaultLoader };
export default PromptTemplateLoader;
