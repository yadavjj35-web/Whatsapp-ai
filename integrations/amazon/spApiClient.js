// path: integrations/amazon/spApiClient.js
/**
 * Amazon SP-API client wrapper
 *
 * Provides production-ready helpers to call common SP-API operations:
 *  - getCatalogItem(asin)
 *  - listOrders(params)
 *  - getOrder(orderId)
 *  - createFeed(feedType, content, marketplaceIds)
 *  - getFeed(feedId)
 *
 * Implementation:
 *  - Uses 'amazon-sp-api' package to handle LWA/STS and SigV4 signing
 *  - Uses internal retry logic with exponential backoff and jitter
 *  - Handles 429 / throttling responses with incremental backoff
 *
 * Environment variables:
 *  - AMAZON_SELLER_ID or MERCHANT_ID
 *  - Optional: SP_API_ROLE_ARN, AWS_REGION (see auth adapter)
 */

import SellingPartnerAPI from 'amazon-sp-api';
import authAdapter from './auth.js';
import logger from '../../utils/logger.js';

const DEFAULT_RETRIES = Number(process.env.AMAZON_SPAPI_RETRIES || 4);
const BASE_DELAY_MS = Number(process.env.AMAZON_SPAPI_BACKOFF_BASE_MS || 500);

/**
 * Simple retry with exponential backoff and jitter
 */
async function retry(fn, attempts = DEFAULT_RETRIES) {
  let attempt = 0;
  while (attempt < attempts) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      const status = err?.statusCode || err?.status || null;
      // If non-retryable HTTP status (4xx except 429) break
      if (status && status >= 400 && status < 500 && status !== 429) {
        logger.error('SP-API request non-retryable error', { status, message: err.message });
        throw err;
      }
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 10000);
      const jitter = Math.round(Math.random() * 200);
      const wait = delay + jitter;
      logger.warn('SP-API request failed, retrying', { attempt, attempts, wait, error: err.message });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw new Error('SP-API request failed after retries');
}

/**
 * Build and return a SellingPartnerAPI client instance.
 * We instantiate a new client per call to ensure fresh credentials, or reuse if caching desired.
 */
async function buildClient() {
  const spCreds = await authAdapter.getSpApiCredentials();
  const sellingPartner = new SellingPartnerAPI({
    region: process.env.AMAZON_REGION || 'na',
    refresh_token: spCreds.refresh_token,
    credentials: {
      accessKeyId: spCreds.accessKeyId,
      secretAccessKey: spCreds.secretAccessKey,
      sessionToken: spCreds.sessionToken
    },
    client_id: spCreds.client_id,
    client_secret: spCreds.client_secret,
    // optional: role
    // We rely on amazon-sp-api to manage token renewal and signing
    sandbox: (process.env.AMAZON_SPAPI_SANDBOX || 'false') === 'true'
  });
  return sellingPartner;
}

/**
 * Get catalog item by asin
 */
export async function getCatalogItem(asin, { marketplaceIds = [process.env.AMAZON_MARKETPLACE_ID] } = {}) {
  if (!asin) throw new Error('asin required');
  return retry(async () => {
    const client = await buildClient();
    const result = await client.callAPI({
      operation: 'getCatalogItem',
      path: { asin },
      query: { marketplaceId: marketplaceIds[0] }
    });
    return result;
  });
}

/**
 * List orders (supports CreatedAfter and pagination)
 * params: { CreatedAfter, MarketplaceIds, OrderStatuses, MaxResultsPerPage, NextToken }
 */
export async function listOrders(params = {}) {
  return retry(async () => {
    const client = await buildClient();
    const query = {
      MarketplaceIds: params.MarketplaceIds || [process.env.AMAZON_MARKETPLACE_ID],
      CreatedAfter: params.CreatedAfter,
      OrderStatuses: params.OrderStatuses,
      MaxResultsPerPage: params.MaxResultsPerPage || 100
    };
    const res = await client.callAPI({
      operation: 'getOrders',
      query
    });
    return res;
  });
}

/**
 * Get a single order by AmazonOrderId
 */
export async function getOrder(amazonOrderId) {
  if (!amazonOrderId) throw new Error('amazonOrderId required');
  return retry(async () => {
    const client = await buildClient();
    const res = await client.callAPI({
      operation: 'getOrder',
      path: { amazonOrderId }
    });
    return res;
  });
}

/**
 * Create a feed document, upload feed content, and submit a feed.
 * This method implements:
 *  - createFeedDocument
 *  - upload to URL
 *  - createFeed
 *
 * feedType examples:
 *  - 'POST_PRODUCT_DATA'
 *  - 'POST_INVENTORY_AVAILABILITY_DATA'
 *  - 'POST_ORDER_FULFILLMENT_DATA'
 *
 * content: string or Buffer (XML or JSON depending on feedType)
 */
export async function submitFeed({ feedType, content, marketplaceIds = [process.env.AMAZON_MARKETPLACE_ID], contentType = 'text/xml; charset=UTF-8' } = {}) {
  if (!feedType || !content) throw new Error('feedType and content are required');

  return retry(async () => {
    const client = await buildClient();

    // Step 1: createFeedDocument
    const createDocResp = await client.callAPI({
      operation: 'createFeedDocument',
      body: { contentType }
    });

    const { feedDocumentId, url } = (() => {
      // amazon-sp-api returns createFeedDocumentResult or body; inspect for known shapes
      const doc = createDocResp?.payload || createDocResp;
      return { feedDocumentId: doc?.feedDocumentId || doc?.feed_document_id || doc?.feedDocumentId, url: doc?.url || doc?.url };
    })();

    if (!feedDocumentId || !url) {
      throw new Error('Failed to create feed document');
    }

    // Step 2: upload content to the URL (pre-signed). Use axios put.
    // The URL may require PUT with specific headers.
    const axios = (await import('axios')).default;
    await axios.put(url, content, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(content)
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    // Step 3: submit feed referencing feedDocumentId
    const createFeedResp = await client.callAPI({
      operation: 'createFeed',
      body: {
        feedType,
        marketplaceIds,
        inputFeedDocumentId: feedDocumentId
      }
    });

    // Return feed submission result
    return createFeedResp;
  });
}

/**
 * Get feed status/result by feedId
 */
export async function getFeedStatus(feedId) {
  if (!feedId) throw new Error('feedId required');
  return retry(async () => {
    const client = await buildClient();
    const res = await client.callAPI({
      operation: 'getFeed',
      path: { feedId }
    });
    return res;
  });
}

export default {
  getCatalogItem,
  listOrders,
  getOrder,
  submitFeed,
  getFeedStatus
};
