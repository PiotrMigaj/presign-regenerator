import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { sendJobSummaryEmail } from './email-service.mjs';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION
});

// Environment variables
const TABLE_NAME = process.env.TABLE_NAME;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const PRESIGNED_URL_EXPIRATION_DAYS = parseInt(process.env.PRESIGNED_URL_EXPIRATION_DAYS || '7');

// Constants
const EXPIRATION_SECONDS = PRESIGNED_URL_EXPIRATION_DAYS * 24 * 60 * 60;
const BATCH_SIZE = 25; // DynamoDB batch write limit

/**
 * Generate presigned URL for S3 object
 * @param {string} objectKey - S3 object key
 * @returns {Promise<string>} - Presigned URL
 */
async function generatePresignedUrl(objectKey) {
  if (!objectKey) {
    throw new Error('Object key is required');
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: objectKey
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: EXPIRATION_SECONDS
    });
    return presignedUrl;
  } catch (error) {
    console.error(`Error generating presigned URL for ${objectKey}:`, error);
    throw error;
  }
}

/**
 * Determine the primary key for a DynamoDB item
 * Since fileName is the partition key, we use it as the primary key
 * @param {Object} item - DynamoDB item
 * @returns {Object|null} - Primary key object or null if cannot be determined
 */
function determinePrimaryKey(item) {
  // Log the item structure for debugging
  console.log(`Determining key for item:`, JSON.stringify(item, null, 2));

  // Since fileName is the partition key, prioritize it
  if (item.fileName) {
    const key = { fileName: item.fileName };
    console.log(`Using fileName as partition key:`, JSON.stringify(key, null, 2));
    return key;
  }

  // Fallback patterns if fileName is not available
  const fallbackPatterns = [
    // Pattern 1: id field (common single key pattern)
    () => {
      if (item.id) {
        return { id: item.id };
      }
      return null;
    },
    
    // Pattern 2: eventId only (single key)
    () => {
      if (item.eventId) {
        return { eventId: item.eventId };
      }
      return null;
    },
    
    // Pattern 3: username only (single key)
    () => {
      if (item.username) {
        return { username: item.username };
      }
      return null;
    }
  ];

  // Try fallback patterns
  for (const pattern of fallbackPatterns) {
    const key = pattern();
    if (key) {
      console.log(`Using fallback key pattern:`, JSON.stringify(key, null, 2));
      return key;
    }
  }

  console.error('No valid key found for item:', JSON.stringify(item, null, 2));
  return null;
}

/**
 * Update item in DynamoDB with new presigned URLs
 * @param {Object} item - DynamoDB item
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateItemPresignedUrls(item) {
  try {
    const updates = {};
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Generate new presigned URLs
    if (item.originalFileObjectKey) {
      try {
        const originalPresignedUrl = await generatePresignedUrl(item.originalFileObjectKey);
        updates.originalFilePresignedUrl = originalPresignedUrl;
        updateExpressions.push('#opurl = :opurl');
        expressionAttributeNames['#opurl'] = 'originalFilePresignedUrl';
        expressionAttributeValues[':opurl'] = originalPresignedUrl;
      } catch (error) {
        console.warn(`Failed to generate presigned URL for original file ${item.originalFileObjectKey}:`, error.message);
      }
    }

    if (item.compressedFileObjectKey) {
      try {
        const compressedPresignedUrl = await generatePresignedUrl(item.compressedFileObjectKey);
        updates.compressedFilePresignedUrl = compressedPresignedUrl;
        updateExpressions.push('#cpurl = :cpurl');
        expressionAttributeNames['#cpurl'] = 'compressedFilePresignedUrl';
        expressionAttributeValues[':cpurl'] = compressedPresignedUrl;
      } catch (error) {
        console.warn(`Failed to generate presigned URL for compressed file ${item.compressedFileObjectKey}:`, error.message);
      }
    }

    // Update presignDateTime
    const currentDateTime = new Date().toISOString();
    updateExpressions.push('#pdt = :pdt');
    expressionAttributeNames['#pdt'] = 'presignDateTime';
    expressionAttributeValues[':pdt'] = currentDateTime;

    // Skip update if no URLs were generated
    if (updateExpressions.length === 1) { // Only presignDateTime
      console.warn(`No presigned URLs generated for item ${item.fileName || 'unknown'}`);
      return { success: false, error: 'No presigned URLs generated' };
    }

    // Determine primary key
    const key = determinePrimaryKey(item);
    if (!key) {
      console.error('Unable to determine primary key for item:', JSON.stringify(item, null, 2));
      return { success: false, error: 'Unable to determine primary key' };
    }

    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'UPDATED_NEW'
    });

    console.log(`Attempting to update item with key:`, JSON.stringify(key, null, 2));
    console.log(`Update expression:`, updateCommand.UpdateExpression);
    
    const result = await docClient.send(updateCommand);
    console.log(`Successfully updated presigned URLs for item: ${item.fileName || 'unknown'}`);
    return { success: true };

  } catch (error) {
    console.error(`Error updating item ${item.fileName || 'unknown'}:`, error);
    console.error(`Item details:`, JSON.stringify(item, null, 2));
    return { success: false, error: error.message };
  }
}

/**
 * Process items in batches
 * @param {Array} items - Array of DynamoDB items
 * @returns {Promise<{successCount: number, errorCount: number}>}
 */
async function processItemsBatch(items) {
  const promises = items.map(item => updateItemPresignedUrls(item));
  
  try {
    const results = await Promise.allSettled(promises);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Count results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
      } else {
        errorCount++;
        if (result.status === 'rejected') {
          console.error(`Failed to process item ${index}:`, result.reason);
        } else if (result.value.error) {
          console.error(`Failed to process item ${index}:`, result.value.error);
        }
      }
    });

    return { successCount, errorCount };
  } catch (error) {
    console.error('Error processing batch:', error);
    return { successCount: 0, errorCount: items.length };
  }
}

/**
 * Main Lambda handler function
 * @param {Object} event - Lambda event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} - Response object
 */
export const regeneratePresignedUrls = async (event, context) => {
  console.log('Starting presigned URL regeneration process');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  let processedCount = 0;
  let errorCount = 0;
  let successCount = 0;
  let jobStatus = 'success';
  let jobError = null;

  try {
    // Validate environment variables
    if (!TABLE_NAME || !S3_BUCKET_NAME) {
      throw new Error('Required environment variables TABLE_NAME and S3_BUCKET_NAME must be set');
    }

    console.log(`Configuration: TABLE_NAME=${TABLE_NAME}, S3_BUCKET_NAME=${S3_BUCKET_NAME}, EXPIRATION_DAYS=${PRESIGNED_URL_EXPIRATION_DAYS}`);
    console.log(`Table schema: fileName is the partition key (single primary key)`);

    let lastEvaluatedKey = null;
    let hasMoreItems = true;

    // Scan DynamoDB table in batches
    while (hasMoreItems) {
      const scanParams = {
        TableName: TABLE_NAME,
        Limit: BATCH_SIZE
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      console.log(`Scanning table ${TABLE_NAME} with params:`, scanParams);

      try {
        const scanCommand = new ScanCommand(scanParams);
        const result = await docClient.send(scanCommand);

        if (result.Items && result.Items.length > 0) {
          console.log(`Processing ${result.Items.length} items`);
          
          // Log first item structure for debugging
          if (result.Items.length > 0) {
            console.log('Sample item structure:', JSON.stringify(result.Items[0], null, 2));
          }
          
          // Process items in current batch
          const batchResults = await processItemsBatch(result.Items);
          processedCount += result.Items.length;
          successCount += batchResults.successCount;
          errorCount += batchResults.errorCount;
        }

        // Check if there are more items to process
        lastEvaluatedKey = result.LastEvaluatedKey;
        hasMoreItems = !!lastEvaluatedKey;

        // Add small delay between batches to avoid throttling
        if (hasMoreItems) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (scanError) {
        console.error('Error scanning DynamoDB table:', scanError);
        errorCount++;
        
        // Continue processing if it's a recoverable error
        if (scanError.name === 'ProvisionedThroughputExceededException') {
          console.log('Throughput exceeded, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        throw scanError;
      }
    }

    const duration = Date.now() - startTime;
    const successMessage = `Successfully processed ${processedCount} items (${successCount} successful, ${errorCount} errors) in ${duration}ms`;
    console.log(successMessage);

    // Prepare job summary for email
    const jobSummary = {
      processedCount,
      successCount,
      errorCount,
      duration,
      startTime,
      tableName: TABLE_NAME,
      bucketName: S3_BUCKET_NAME,
      expirationDays: PRESIGNED_URL_EXPIRATION_DAYS,
      status: jobStatus
    };

    // Send email notification
    await sendJobSummaryEmail(jobSummary);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: successMessage,
        processedCount,
        successCount,
        errorCount,
        duration
      })
    };

  } catch (error) {
    jobStatus = 'failed';
    jobError = error.message;
    
    const errorMessage = `Error in presigned URL regeneration: ${error.message}`;
    console.error(errorMessage, error);

    // Prepare job summary for email (even for failures)
    const jobSummary = {
      processedCount,
      successCount,
      errorCount,
      duration: Date.now() - startTime,
      startTime,
      tableName: TABLE_NAME || 'Unknown',
      bucketName: S3_BUCKET_NAME || 'Unknown',
      expirationDays: PRESIGNED_URL_EXPIRATION_DAYS,
      status: jobStatus,
      error: jobError
    };

    // Send email notification for failure
    await sendJobSummaryEmail(jobSummary);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: errorMessage,
        processedCount,
        successCount,
        errorCount,
        error: error.message
      })
    };
  }
};