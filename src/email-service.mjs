import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Initialize SES client
const sesClient = new SESClient({
  region: process.env.AWS_REGION
});

/**
 * Format duration in milliseconds to human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format timestamp to readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Formatted date
 */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Generate HTML email template for job summary
 * @param {Object} jobSummary - Job execution summary
 * @returns {string} - HTML email content
 */
function generateEmailHTML(jobSummary) {
  const {
    processedCount,
    successCount,
    errorCount,
    duration,
    startTime,
    tableName,
    bucketName,
    expirationDays,
    status
  } = jobSummary;

  const successRate = processedCount > 0 ? ((successCount / processedCount) * 100).toFixed(1) : '0';
  const statusColor = status === 'success' ? '#10B981' : '#EF4444';
  const statusIcon = status === 'success' ? '✅' : '❌';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Presigned URL Regeneration Summary</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
            margin-top: 10px;
            background-color: ${statusColor};
            color: white;
        }
        .content {
            padding: 30px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 20px;
            margin: 25px 0;
        }
        .metric-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .metric-value {
            font-size: 28px;
            font-weight: 700;
            color: #1a202c;
            margin-bottom: 5px;
        }
        .metric-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.5px;
        }
        .success-rate {
            color: #10B981;
        }
        .error-count {
            color: #EF4444;
        }
        .details-section {
            background: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
        }
        .details-title {
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
        }
        .details-title::before {
            content: "ℹ️";
            margin-right: 8px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 500;
            color: #6b7280;
        }
        .detail-value {
            font-weight: 600;
            color: #374151;
        }
        .footer {
            background: #f9fafb;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
        }
        .timestamp {
            font-size: 12px;
            color: #9ca3af;
            margin-top: 10px;
        }
        .unsubscribe {
            font-size: 11px;
            color: #9ca3af;
            margin-top: 15px;
        }
        .unsubscribe a {
            color: #9ca3af;
            text-decoration: underline;
        }
        @media (max-width: 480px) {
            .summary-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            .detail-row {
                flex-direction: column;
                gap: 4px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${statusIcon} Presigned URL Regeneration</h1>
            <div class="status-badge">
                ${status.toUpperCase()}
            </div>
        </div>
        
        <div class="content">
            <div class="summary-grid">
                <div class="metric-card">
                    <div class="metric-value">${processedCount}</div>
                    <div class="metric-label">Total Processed</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value success-rate">${successCount}</div>
                    <div class="metric-label">Successful</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value error-count">${errorCount}</div>
                    <div class="metric-label">Errors</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value success-rate">${successRate}%</div>
                    <div class="metric-label">Success Rate</div>
                </div>
            </div>

            <div class="details-section">
                <div class="details-title">Job Details</div>
                <div class="detail-row">
                    <span class="detail-label">Execution Time:</span>
                    <span class="detail-value">${formatDuration(duration)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Started At:</span>
                    <span class="detail-value">${formatDate(startTime)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">DynamoDB Table:</span>
                    <span class="detail-value">${tableName}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">S3 Bucket:</span>
                    <span class="detail-value">${bucketName}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">URL Expiration:</span>
                    <span class="detail-value">${expirationDays} days</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>This is an automated notification from your AWS Lambda function.</p>
            <div class="timestamp">
                Generated on ${formatDate(Date.now())}
            </div>
            <div class="unsubscribe">
                This is a system notification. To modify email preferences, update your Lambda function configuration.
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate plain text email for job summary
 * @param {Object} jobSummary - Job execution summary
 * @returns {string} - Plain text email content
 */
function generateEmailText(jobSummary) {
  const {
    processedCount,
    successCount,
    errorCount,
    duration,
    startTime,
    tableName,
    bucketName,
    expirationDays,
    status
  } = jobSummary;

  const successRate = processedCount > 0 ? ((successCount / processedCount) * 100).toFixed(1) : '0';
  const statusIcon = status === 'success' ? '✅' : '❌';

  return `
${statusIcon} PRESIGNED URL REGENERATION SUMMARY

Status: ${status.toUpperCase()}

METRICS:
- Total Processed: ${processedCount}
- Successful: ${successCount}
- Errors: ${errorCount}
- Success Rate: ${successRate}%

JOB DETAILS:
- Execution Time: ${formatDuration(duration)}
- Started At: ${formatDate(startTime)}
- DynamoDB Table: ${tableName}
- S3 Bucket: ${bucketName}
- URL Expiration: ${expirationDays} days

---
This is an automated notification from your AWS Lambda function.
Generated on ${formatDate(Date.now())}

This is a system notification. To modify email preferences, update your Lambda function configuration.
`;
}

/**
 * Send email notification with job summary
 * @param {Object} jobSummary - Job execution summary
 * @returns {Promise<void>}
 */
export async function sendJobSummaryEmail(jobSummary) {
  const fromEmail = process.env.SES_FROM_EMAIL;
  const toEmails = process.env.SES_TO_EMAILS?.split(',').map(email => email.trim()) || [];

  if (!fromEmail || toEmails.length === 0) {
    console.warn('SES email configuration missing. Skipping email notification.');
    console.warn(`SES_FROM_EMAIL: ${fromEmail}, SES_TO_EMAILS: ${process.env.SES_TO_EMAILS}`);
    return;
  }

  // Improved subject line to avoid spam triggers
  const statusText = jobSummary.status === 'success' ? 'Completed Successfully' : 'Failed';
  const subject = `[AWS Lambda] Presigned URL Regeneration ${statusText} - ${jobSummary.processedCount} items`;

  const emailParams = {
    Source: fromEmail,
    Destination: {
      ToAddresses: toEmails
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: generateEmailHTML(jobSummary),
          Charset: 'UTF-8'
        },
        Text: {
          Data: generateEmailText(jobSummary),
          Charset: 'UTF-8'
        }
      }
    },
    // Add email headers to improve deliverability
    Tags: [
      {
        Name: 'EmailType',
        Value: 'SystemNotification'
      },
      {
        Name: 'Source',
        Value: 'AWSLambda'
      }
    ],
    ConfigurationSetName: undefined // You can set this if you have a configuration set
  };

  try {
    const command = new SendEmailCommand(emailParams);
    const result = await sesClient.send(command);
    console.log(`Email notification sent successfully. MessageId: ${result.MessageId}`);
  } catch (error) {
    console.error('Failed to send email notification:', error);
    // Don't throw the error to avoid failing the main job
  }
}