# Presigned URL Regenerator

AWS SAM application that automatically regenerates presigned URLs for files stored in S3 and referenced in DynamoDB table. The application runs every 5 days at 02:00 AM using EventBridge scheduled events.

## Architecture

- **Lambda Function**: Processes DynamoDB items and regenerates presigned URLs
- **EventBridge Rule**: Triggers the Lambda function on a cron schedule (every 5 days at 02:00 AM)
- **DynamoDB**: Stores file metadata with presigned URLs
- **S3**: Contains the actual files referenced by the presigned URLs

## Features

- Automatic presigned URL regeneration with configurable expiration (default: 7 days)
- Batch processing for efficient DynamoDB scanning
- Error handling with retry logic for throttling
- Comprehensive logging and monitoring
- Configurable parameters via SAM template

## Prerequisites

- AWS CLI configured with appropriate permissions
- AWS SAM CLI installed
- Node.js 18+ installed
- Access to DynamoDB table and S3 bucket

## Configuration

The application uses the following parameters:

- `TableName`: DynamoDB table name (default: GalleriesCamel)
- `S3BucketName`: S3 bucket name where files are stored
- `PresignedUrlExpirationDays`: Number of days for presigned URL expiration (default: 7)

## Deployment

1. **Build the application:**
   ```bash
   sam build
   ```

2. **Deploy with guided configuration:**
   ```bash
   sam deploy --guided
   ```

3. **Or deploy with parameters:**
   ```bash
   sam deploy \
     --parameter-overrides \
     TableName=GalleriesCamel \
     S3BucketName=your-bucket-name \
     PresignedUrlExpirationDays=7
   ```

## DynamoDB Table Schema

The application expects the following fields in your DynamoDB table:

```
GalleriesCamel:
  - fileName (String) - Primary key component
  - eventId (String) - Primary key component (alternative to username)
  - username (String) - Primary key component (alternative to eventId)
  - originalFileObjectKey (String) - S3 object key for original file
  - compressedFileObjectKey (String) - S3 object key for compressed file
  - originalFilePresignedUrl (String) - Generated presigned URL for original file
  - compressedFilePresignedUrl (String) - Generated presigned URL for compressed file
  - presignDateTime (String) - ISO timestamp of last URL generation
```

## IAM Permissions

The Lambda function requires the following permissions:

- `dynamodb:Scan` - To read all items from the table
- `dynamodb:UpdateItem` - To update presigned URLs and timestamp
- `s3:GetObject` - To generate presigned URLs for S3 objects
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` - For CloudWatch logging

## Monitoring

- **CloudWatch Logs**: Function logs are automatically created with 30-day retention
- **CloudWatch Metrics**: Lambda function metrics (duration, errors, invocations)
- **EventBridge Metrics**: Scheduled rule execution metrics

## Schedule Configuration

The EventBridge rule uses the cron expression: `cron(0 2 */5 * ? *)`

This translates to:
- `0` - Minute: 0 (top of the hour)
- `2` - Hour: 02:00 AM
- `*/5` - Day of month: Every 5th day
- `*` - Month: Every month
- `?` - Day of week: Any day
- `*` - Year: Every year

## Testing

1. **Run unit tests:**
   ```bash
   npm test
   ```

2. **Test locally with SAM:**
   ```bash
   sam local invoke PresignedUrlRegeneratorFunction
   ```

3. **Manual trigger (after deployment):**
   ```bash
   aws lambda invoke \
     --function-name your-stack-name-presigned-url-regenerator \
     --payload '{}' \
     response.json
   ```

## Error Handling

The application includes comprehensive error handling:

- **DynamoDB Throttling**: Automatic retry with exponential backoff
- **S3 Access Errors**: Logged as warnings, processing continues
- **Individual Item Failures**: Logged but don't stop batch processing
- **Missing Object Keys**: Gracefully skipped with warnings

## Cost Optimization

- Uses efficient DynamoDB scanning with configurable batch sizes
- Implements delays between batches to avoid throttling charges
- CloudWatch log retention set to 30 days to control costs
- Lambda memory and timeout optimized for typical workloads

## Troubleshooting

1. **Check CloudWatch Logs** for detailed execution information
2. **Verify IAM permissions** for DynamoDB and S3 access
3. **Confirm S3 bucket and object permissions** for presigned URL generation
4. **Check EventBridge rule status** and execution history

## Security Best Practices

- Uses least privilege IAM policies
- Environment variables for sensitive configuration
- No hardcoded credentials or sensitive data
- VPC deployment optional (not required for this use case)

## Cleanup

To remove all resources:

```bash
sam delete
```

This will remove the Lambda function, IAM roles, EventBridge rule, and CloudWatch log groups.