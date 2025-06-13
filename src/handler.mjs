import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
 * Update item in DynamoDB with new presigned URLs
 * @param {Object} item - DynamoDB item
 * @returns {Promise<void>}
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
      return;
    }

    // Construct primary key
    const key = {};
    if (item.eventId && item.fileName) {
      key.eventId = item.eventId;
      key.fileName = item.fileName;
    } else if (item.username && item.fileName) {
      key.username = item.username;
      key.fileName = item.fileName;
    } else {
      console.error('Unable to determine primary key for item:', item);
      return;
    }

    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'UPDATED_NEW'
    });

    await docClient.send(updateCommand);
    console.log(`Successfully updated presigned URLs for item: ${item.fileName}`);

  } catch (error) {
    console.error(`Error updating item ${item.fileName}:`, error);
    throw error;
  }
}

/**
 * Process items in batches
 * @param {Array} items - Array of DynamoDB items
 * @returns {Promise<void>}
 */
async function processItemsBatch(items) {
  const promises = items.map(item => updateItemPresignedUrls(item));
  
  try {
    await Promise.allSettled(promises);
  } catch (error) {
    console.error('Error processing batch:', error);
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

  try {
    // Validate environment variables
    if (!TABLE_NAME || !S3_BUCKET_NAME) {
      throw new Error('Required environment variables TABLE_NAME and S3_BUCKET_NAME must be set');
    }

    console.log(`Configuration: TABLE_NAME=${TABLE_NAME}, S3_BUCKET_NAME=${S3_BUCKET_NAME}, EXPIRATION_DAYS=${PRESIGNED_URL_EXPIRATION_DAYS}`);

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
          
          // Process items in current batch
          await processItemsBatch(result.Items);
          processedCount += result.Items.length;
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
    const successMessage = `Successfully processed ${processedCount} items in ${duration}ms`;
    console.log(successMessage);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: successMessage,
        processedCount,
        errorCount,
        duration
      })
    };

  } catch (error) {
    const errorMessage = `Error in presigned URL regeneration: ${error.message}`;
    console.error(errorMessage, error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: errorMessage,
        processedCount,
        errorCount,
        error: error.message
      })
    };
  }
};