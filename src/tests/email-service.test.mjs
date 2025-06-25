import { jest } from '@jest/globals';

// Mock AWS SDK before importing email service
const mockSend = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(),
  SendEmailCommand: jest.fn()
}));

// Import email service after mocking
const { sendJobSummaryEmail } = await import('../email-service.mjs');

describe('Email Service', () => {
  beforeEach(() => {
    // Set environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.SES_FROM_EMAIL = 'test@example.com';
    process.env.SES_TO_EMAILS = 'recipient1@example.com,recipient2@example.com';
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should skip email when configuration is missing', async () => {
    delete process.env.SES_FROM_EMAIL;
    
    const jobSummary = {
      processedCount: 100,
      successCount: 95,
      errorCount: 5,
      duration: 30000,
      startTime: Date.now() - 30000,
      tableName: 'TestTable',
      bucketName: 'test-bucket',
      expirationDays: 7,
      status: 'success'
    };
    
    // Should not throw error when configuration is missing
    await expect(sendJobSummaryEmail(jobSummary)).resolves.toBeUndefined();
  });

  test('should handle successful job summary', async () => {
    const jobSummary = {
      processedCount: 100,
      successCount: 95,
      errorCount: 5,
      duration: 30000,
      startTime: Date.now() - 30000,
      tableName: 'TestTable',
      bucketName: 'test-bucket',
      expirationDays: 7,
      status: 'success'
    };
    
    mockSend.mockResolvedValue({ MessageId: 'test-message-id' });
    
    await sendJobSummaryEmail(jobSummary);
    
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('should handle failed job summary', async () => {
    const jobSummary = {
      processedCount: 50,
      successCount: 30,
      errorCount: 20,
      duration: 15000,
      startTime: Date.now() - 15000,
      tableName: 'TestTable',
      bucketName: 'test-bucket',
      expirationDays: 7,
      status: 'failed',
      error: 'Test error message'
    };
    
    mockSend.mockResolvedValue({ MessageId: 'test-message-id' });
    
    await sendJobSummaryEmail(jobSummary);
    
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('should handle SES send error gracefully', async () => {
    const jobSummary = {
      processedCount: 100,
      successCount: 100,
      errorCount: 0,
      duration: 25000,
      startTime: Date.now() - 25000,
      tableName: 'TestTable',
      bucketName: 'test-bucket',
      expirationDays: 7,
      status: 'success'
    };
    
    const sesError = new Error('SES service error');
    mockSend.mockRejectedValue(sesError);
    
    // Should not throw error even when SES fails
    await expect(sendJobSummaryEmail(jobSummary)).resolves.toBeUndefined();
  });

  test('should parse multiple email addresses correctly', async () => {
    process.env.SES_TO_EMAILS = 'user1@example.com, user2@example.com , user3@example.com';
    
    const jobSummary = {
      processedCount: 10,
      successCount: 10,
      errorCount: 0,
      duration: 5000,
      startTime: Date.now() - 5000,
      tableName: 'TestTable',
      bucketName: 'test-bucket',
      expirationDays: 7,
      status: 'success'
    };
    
    mockSend.mockResolvedValue({ MessageId: 'test-message-id' });
    
    await sendJobSummaryEmail(jobSummary);
    
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});