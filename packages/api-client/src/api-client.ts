import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type {
  Scan,
  ScanResult,
  Vulnerability,
  Settings,
  CreateScanInput,
  UpdateSettingsInput,
  PaginationParams,
  PaginatedResponse,
} from '@security-analyzer/types';

/**
 * Security Analyzer API Client
 * Provides methods to interact with the Security Analyzer backend API
 */
export class SecurityAnalyzerClient {
  private client: AxiosInstance;

  /**
   * Create a new Security Analyzer API client
   * @param baseUrl - Base URL of the API (e.g., 'http://localhost:3000/api')
   * @param config - Optional axios configuration
   */
  constructor(baseUrl: string, config?: AxiosRequestConfig) {
    this.client = axios.create({
      baseURL: baseUrl,
      ...config,
    });
  }

  // ==================== Scan Methods ====================

  /**
   * Get all scans with optional pagination
   */
  async getScans(params?: PaginationParams): Promise<PaginatedResponse<Scan>> {
    const response = await this.client.get<PaginatedResponse<Scan>>('/scans', { params });
    return response.data;
  }

  /**
   * Get a single scan by ID
   */
  async getScan(id: string): Promise<Scan> {
    const response = await this.client.get<Scan>(`/scans/${id}`);
    return response.data;
  }

  /**
   * Create a new scan
   */
  async createScan(data: CreateScanInput): Promise<Scan> {
    const response = await this.client.post<Scan>('/scans', data);
    return response.data;
  }

  /**
   * Delete a scan by ID
   */
  async deleteScan(id: string): Promise<void> {
    await this.client.delete(`/scans/${id}`);
  }

  // ==================== Results Methods ====================

  /**
   * Get scan results for a specific scan
   */
  async getResults(scanId: string): Promise<ScanResult> {
    const response = await this.client.get<ScanResult>(`/scans/${scanId}/results`);
    return response.data;
  }

  /**
   * Get all vulnerabilities for a specific scan
   */
  async getVulnerabilities(scanId: string): Promise<Vulnerability[]> {
    const response = await this.client.get<Vulnerability[]>(`/scans/${scanId}/vulnerabilities`);
    return response.data;
  }

  // ==================== Settings Methods ====================

  /**
   * Get current settings
   */
  async getSettings(): Promise<Settings> {
    const response = await this.client.get<Settings>('/settings');
    return response.data;
  }

  /**
   * Update settings
   */
  async updateSettings(data: UpdateSettingsInput): Promise<Settings> {
    const response = await this.client.patch<Settings>('/settings', data);
    return response.data;
  }
}

export default SecurityAnalyzerClient;
