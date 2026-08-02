// path: integrations/amazon/auth.js
/**
 * Amazon SP-API Authentication Adapter
 *
 * Responsible for:
 *  - Validating required environment variables for SP-API
 *  - Building credentials object for amazon-sp-api client
 *  - Optionally performing AWS STS assume-role (if SP_API_ROLE_ARN provided)
 *
 * Required environment variables:
 *  - LWA_CLIENT_ID
 *  - LWA_CLIENT_SECRET
 *  - SP_API_REFRESH_TOKEN
 *  - AWS_ACCESS_KEY_ID
 *  - AWS_SECRET_ACCESS_KEY
 *  - AWS_REGION (optional; defaults to us-east-1)
 *  - SP_API_ROLE_ARN (optional; if present, use STS to assume role)
 *
 * Exports:
 *  - getSpApiCredentials() -> returns object with credentials to initialize SellingPartnerAPI
 *
 * Notes:
 *  - The 'amazon-sp-api' library accepts credentials in its constructor and will handle refresh using LWA credentials.
 *  - If role assumption is required, this module will use @aws-sdk/client-sts to assume the role and return temporary credentials.
 */

import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import logger from '../../utils/logger.js';

const {
  LWA_CLIENT_ID,
  LWA_CLIENT_SECRET,
  SP_API_REFRESH_TOKEN,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION = 'us-east-1',
  SP_API_ROLE_ARN
} = process.env;

if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET || !SP_API_REFRESH_TOKEN || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  logger.warn('Amazon SP-API environment variables missing. Ensure LWA_CLIENT_ID, LWA_CLIENT_SECRET, SP_API_REFRESH_TOKEN and AWS credentials are configured.');
}

/**
 * Optionally assume a role via STS if SP_API_ROLE_ARN is set.
 * Returns credentials: { accessKeyId, secretAccessKey, sessionToken, expiration }
 */
export async function assumeRoleIfConfigured(sessionName = 'spapi-session') {
  if (!SP_API_ROLE_ARN) {
    // Return static credentials from env
    return {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      sessionToken: undefined,
      expiration: undefined
    };
  }

  const sts = new STSClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const cmd = new AssumeRoleCommand({
      RoleArn: SP_API_ROLE_ARN,
      RoleSessionName: sessionName,
      DurationSeconds: 3600 // 1 hour
    });
    const resp = await sts.send(cmd);
    const creds = resp.Credentials;
    logger.info('Assumed AWS role for SP-API', { roleArn: SP_API_ROLE_ARN, expiration: creds.Expiration });
    return {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration
    };
  } catch (err) {
    logger.error('Failed to assume role for SP-API', { error: err.message });
    throw err;
  }
}

/**
 * Build the credential object required by amazon-sp-api library.
 * Returns object:
 * {
 *   region,
 *   credentials: { accessKeyId, secretAccessKey, sessionToken? },
 *   refresh_token,
 *   client_id,
 *   client_secret,
 *   role: { arn: SP_API_ROLE_ARN } (optional)
 * }
 */
export async function getSpApiCredentials() {
  const awsCreds = await assumeRoleIfConfigured();
  const creds = {
    region: process.env.AMAZON_REGION || process.env.AMAZON_SELLER_REGION || 'na',
    refresh_token: SP_API_REFRESH_TOKEN,
    client_id: LWA_CLIENT_ID,
    client_secret: LWA_CLIENT_SECRET,
    accessKeyId: awsCreds.accessKeyId,
    secretAccessKey: awsCreds.secretAccessKey,
    // sessionToken optional
    sessionToken: awsCreds.sessionToken
  };
  return creds;
}

export default { getSpApiCredentials, assumeRoleIfConfigured };
