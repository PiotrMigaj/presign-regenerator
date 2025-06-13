import { jest } from '@jest/globals';

// Mock AWS SDK before importing handler
const mockSend = jest.fn();
const mockFrom = jest.fn().mockReturnValue({ send: mockSend });

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));

jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: mockFrom
  },
  ScanCommand: jest.fn(),
  UpdateCommand: jest.fn()
}));

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  GetObjectCommand: jest.fn()
}));

jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn()
}));

// Import handler after mocking
const { regeneratePresignedUrls } = await import('../handler.mjs');

describe('regeneratePresignedUrls', () => {
  beforeEach(() => {
    // Set environment variables
    process.env.TABLE_NAME = 'GalleriesCamel';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.PRESIGNED_URL_EXPIRATION_DAYS = '7';
    process.env.AWS_REGION = 'us-east-1';
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should handle missing environment variables', async () => {
    delete process.env.TABLE_NAME;
    
    const event = {};
    const context = {};
    
    const result = await regeneratePresignedUrls(event, context);
    
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toContain('Required environment variables');
  });

  test('should return success response structure', async () => {
    const event = {};
    const context = {};
    
    // Mock successful execution
    mockSend.mockResolvedValue({
      Items: [],
      LastEvaluatedKey: null
    });
    
    const result = await regeneratePresignedUrls(event, context);
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty('processedCount');
    expect(JSON.parse(result.body)).toHaveProperty('duration');
  });

  test('should handle DynamoDB scan with items', async () => {
    const event = {};
    const context = {};
    
    const mockItems = [
      {
        fileName: 'test1.jpg',
        eventId: 'event1',
        originalFileObjectKey: 'original/test1.jpg',
        compressedFileObjectKey: 'compressed/test1.jpg'
      }
    ];
    
    mockSend.mockResolvedValue({
      Items: mockItems,
      LastEvaluatedKey: null
    });
    
    const result = await regeneratePresignedUrls(event, context);
    
    expect(result.statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalled();
  });

  test('should handle pagination with LastEvaluatedKey', async () => {
    const event = {};
    const context = {};
    
    // First call returns items with LastEvaluatedKey
    // Second call returns empty items with no LastEvaluatedKey
    mockSend
      .mockResolvedValueOnce({
        Items: [{ fileName: 'test1.jpg', eventId: 'event1' }],
        LastEvaluatedKey: { fileName: 'test1.jpg', eventId: 'event1' }
      })
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: null
      });
    
    const result = await regeneratePresignedUrls(event, context);
    
    expect(result.statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('should handle DynamoDB errors gracefully', async () => {
    const event = {};
    const context = {};
    
    const error = new Error('DynamoDB error');
    error.name = 'ServiceException';
    mockSend.mockRejectedValue(error);
    
    const result = await regeneratePresignedUrls(event, context);
    
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toContain('Error in presigned URL regeneration');
  });

  test('should handle throughput exceeded exception with retry', async () => {
    const event = {};
    const context = {};
    
    const throughputError = new Error('Throughput exceeded');
    throughputError.name = 'ProvisionedThroughputExceededException';
    
    // First call throws throughput error, second call succeeds
    mockSend
      .mockRejectedValueOnce(throughputError)
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: null
      });
    
    const result = await regeneratePresignedUrls(event, context);
    
    expect(result.statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});