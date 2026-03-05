import { SecurityAnalyzerClient } from '@security-analyzer/api-client';
import type {
  Scan,
  ScanResult,
  Vulnerability,
  ScannerMetadata,
  CreateScanInput,
  Settings,
  PaginatedResponse,
  ScannerSetting,
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

export const uploadFolder = async (
  formData: FormData
): Promise<{ scanId: string; target: string }> => {
  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Upload failed');
  }
  return response.json();
};

export default client;

export const getScanners = async (): Promise<ScannerMetadata[]> => {
  const response = await fetch(`${API_BASE_URL}/scanners`);
  if (!response.ok) {
    throw new Error('Failed to fetch scanners');
  }
  return response.json();
};

export const getScannerConfigs = async (): Promise<ScannerSetting[]> => {
  const response = await fetch(`${API_BASE_URL}/settings/scanners`);
  if (!response.ok) {
    throw new Error('Failed to fetch scanner configs');
  }
  return response.json();
};

export const updateScannerConfigs = async (
  configs: ScannerSetting[]
): Promise<ScannerSetting[]> => {
  const response = await fetch(`${API_BASE_URL}/settings/scanners`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configs),
  });
  if (!response.ok) {
    throw new Error('Failed to update scanner configs');
  }
  return response.json();
};
