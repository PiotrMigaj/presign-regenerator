# Presigned URL Regenerator

AWS SAM application that automatically regenerates presigned URLs for files stored in S3 and referenced in DynamoDB table. The application runs every 5 days at 02:00 AM using EventBridge scheduled events and sends email notifications with job summaries.

## Architecture

- **Lambda Function**: Processes DynamoDB items and regenerates presigned URLs
- **EventBridge Rule**: Triggers the Lambda function on a cron schedule (every 5 days at 02:00 AM)
- **DynamoDB**: Stores file metadata with presigned URLs
- **S3**: Contains the actual files referenced by the presigned URLs
- **SES**: Sends email notifications with job execution summaries

## Features

- Automatic presigned URL regeneration with configurable expiration (default: 7 days)
- Batch processing for efficient DynamoDB scanning
- Error handling with retry logic for throttling
- Comprehensive logging and monitoring
- **Email notifications** with beautiful HTML summaries including:
  - Job execution statistics (processed, successful, errors, success rate)
  - Execution time and duration
  - Configuration details (table name, bucket, expiration)
  - Professional HTML layout with responsive design
  - **Anti-spam optimizations** for better email deliverability
- Configurable parameters via SAM template

## Prerequisites

- AWS CLI configured with appropriate permissions
- AWS SAM CLI installed
- Node.js 18+ installed
- Access to DynamoDB table and S3 bucket
- **SES configured** with verified email addresses for notifications

## Email Deliverability Setup

To prevent emails from going to spam, follow these steps:

### 1. **Domain Verification (Recommended)**
Instead of just verifying individual email addresses, verify your entire domain:

```bash
# Verify your domain (replace with your domain)
aws ses verify-domain-identity --domain yourdomain.com
```

Then add the required DNS records (TXT record for verification, MX record if needed).

### 2. **Set up SPF, DKIM, and DMARC Records**
Add these DNS records to your domain:

**SPF Record (TXT):**
```
v=spf1 include:amazonses.com ~all
```

**DMARC Record (TXT) for _dmarc.yourdomain.com:**
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
```

**DKIM:** Enable DKIM signing in SES console for your domain.

### 3. **Use a Professional From Address**
Use an address like:
- `notifications@yourdomain.com`
- `noreply@yourdomain.com`
- `system@yourdomain.com`

Avoid generic addresses like `test@gmail.com` or personal email addresses.

### 4. **Request Production Access**
Move out of SES sandbox to improve reputation:

```bash
# Request production access through AWS Support or SES console
```

### 5. **Warm Up Your Sending Reputation**
- Start with low volume
- Monitor bounce and complaint rates
- Maintain good sending practices

## Configuration

The application uses the following parameters:

- `TableName`: DynamoDB table name (default: GalleriesCamel)
- `S3BucketName`: S3 bucket name where files are stored
- `PresignedUrlExpirationDays`: Number of days for presigned URL expiration (default: 7)
- `SESFromEmail`: Email address to send notifications from (must be verified in SES)
- `SESToEmails`: Comma-separated list of email addresses to send notifications to

## SES Setup

### Quick Setup (Individual Email Verification):
```bash
aws ses verify-email-identity --email-address your-sender@example.com
aws ses verify-email-identity --email-address recipient@example.com
```

### Professional Setup (Domain Verification):
1. **Verify your domain:**
   ```bash
   aws ses verify-domain-identity --domain yourdomain.com
   ```

2. **Add DNS records** as shown in SES console

3. **Enable DKIM signing** in SES console

4. **Set up SPF/DMARC records** as described above

## Deployment

1. **Build the application:**
   ```bash
   sam build
   ```

2. **Deploy with guided configuration:**
   ```bash
   sam deploy --guided
   ```

3. **Deploy with parameters (recommended for production):**
   ```bash
   sam deploy \
     --parameter-overrides \
     TableName=GalleriesCamel \
     S3BucketName=your-bucket-name \
     PresignedUrlExpirationDays=7 \
     SESFromEmail=notifications@yourdomain.com \
     SESToEmails=admin@yourdomain.com,team@yourdomain.com
   ```

## Email Notifications

The application sends professional HTML email notifications with anti-spam optimizations:

### Anti-Spam Features:
- ✅ **Professional subject lines** without spam trigger words
- ✅ **Proper email headers** and metadata
- ✅ **Both HTML and plain text** versions
- ✅ **Unsubscribe information** (system notification note)
- ✅ **Clean, professional design** without suspicious elements
- ✅ **Proper sender identification**
- ✅ **Consistent sending patterns**

### Success Email Features:
- ✅ Success status indicator
- Detailed metrics (total processed, successful, errors, success rate)
- Execution time and duration
- Configuration details
- Responsive HTML design
- Professional styling with gradients and cards

### Failure Email Features:
- ❌ Failure status indicator
- Error details and partial completion statistics
- Same professional layout for consistency
- Helps with quick troubleshooting

## Troubleshooting Email Delivery

### If emails still go to spam:

1. **Check your domain reputation:**
   - Use tools like MXToolbox or Mail-tester.com
   - Verify SPF, DKIM, and DMARC records

2. **Monitor SES metrics:**
   - Check bounce rate (should be < 5%)
   - Check complaint rate (should be < 0.1%)
   - Review sending statistics in SES console

3. **Whitelist the sender:**
   - Add your sender address to Gmail contacts
   - Create a Gmail filter to never send to spam

4. **Check email content:**
   - Avoid spam trigger words
   - Maintain good text-to-image ratio
   - Use professional language

5. **Gradual volume increase:**
   - Start with fewer emails
   - Gradually increase volume
   - Maintain consistent sending patterns

### Gmail-Specific Tips:
- Add sender to contacts
- Create filter: `from:(your-sender@domain.com)` → Never send to Spam
- Check "Promotions" and "Updates" tabs
- Mark emails as "Important" when they arrive

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
- `ses:SendEmail`, `ses:SendRawEmail` - To send email notifications
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` - For CloudWatch logging

## Monitoring

- **CloudWatch Logs**: Function logs are automatically created with 30-day retention
- **CloudWatch Metrics**: Lambda function metrics (duration, errors, invocations)
- **EventBridge Metrics**: Scheduled rule execution metrics
- **Email Notifications**: Immediate notification of job completion with detailed summaries
- **SES Metrics**: Email delivery statistics in SES console (bounces, complaints, delivery)

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

4. **Test email functionality:**
   - Trigger the function manually to receive a test email
   - Check SES sending statistics in AWS console
   - Verify email delivery to all configured recipients
   - Use mail-tester.com to check spam score

## Error Handling

The application includes comprehensive error handling:

- **DynamoDB Throttling**: Automatic retry with exponential backoff
- **S3 Access Errors**: Logged as warnings, processing continues
- **Individual Item Failures**: Logged but don't stop batch processing
- **Missing Object Keys**: Gracefully skipped with warnings
- **SES Email Failures**: Logged but don't fail the main job
- **Email Configuration Issues**: Gracefully skipped with warnings

## Cost Optimization

- Uses efficient DynamoDB scanning with configurable batch sizes
- Implements delays between batches to avoid throttling charges
- CloudWatch log retention set to 30 days to control costs
- Lambda memory and timeout optimized for typical workloads
- SES costs are minimal (first 62,000 emails per month are free)

## Security Best Practices

- Uses least privilege IAM policies
- Environment variables for sensitive configuration
- No hardcoded credentials or sensitive data
- VPC deployment optional (not required for this use case)
- SES sender verification prevents email spoofing
- Conditional SES permissions based on verified sender address
- Domain-based email authentication (SPF, DKIM, DMARC)

## Cleanup

To remove all resources:

```bash
sam delete
```

This will remove the Lambda function, IAM roles, EventBridge rule, and CloudWatch log groups. Note that SES verified email addresses and DNS records will remain and need to be removed manually if desired.

## Email Template Customization

The email templates are defined in `src/email-service.mjs` and can be customized:

- **HTML Template**: Modify `generateEmailHTML()` function for styling changes
- **Plain Text Template**: Modify `generateEmailText()` function for text-only clients
- **Subject Line**: Customize the subject line format in `sendJobSummaryEmail()`
- **Styling**: Update CSS in the HTML template for branding consistency

The current design features:
- Modern gradient header
- Responsive grid layout for metrics
- Professional color scheme
- Mobile-friendly design
- Clear typography and spacing
- Anti-spam optimizations