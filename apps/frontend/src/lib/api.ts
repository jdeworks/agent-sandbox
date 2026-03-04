import { SecurityAnalyzerClient } from '@security-analyzer/api-client';
import type {
  Scan,
  ScanResult,
  Vulnerability,
  CreateScanInput,
  Settings,
  PaginatedResponse,
} from '@security-analyzer/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create a singleton client instance
const client = new SecurityAnalyzerClient(API_BASE_URL);

// Wrapper functions with proper typing
export const getScans = async (params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Scan>> => {
  return client.getScans(params);
};

export const getScan = async (id: string): Promise<Scan> => {
  return client.getScan(id);
};

export const createScan = async (data: CreateScanInput): Promise<Scan> => {
  return client.createScan(data);
};

export const deleteScan = async (id: string): Promise<void> => {
  return client.deleteScan(id);
};

export const getScanResults = async (scanId: string): Promise<ScanResult> => {
  return client.getResults(scanId);
};

export const getVulnerabilities = async (scanId: string): Promise<Vulnerability[]> => {
  return client.getVulnerabilities(scanId);
};

export const getSettings = async (): Promise<Settings> => {
  return client.getSettings();
};

export const updateSettings = async (data: Partial<Settings>): Promise<Settings> => {
  return client.updateSettings(data);
};

export default client;
