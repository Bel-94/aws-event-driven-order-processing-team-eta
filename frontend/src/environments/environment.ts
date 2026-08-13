/**
 * Production environment.
 *
 * Deployment path (judges should see this story):
 *   Browser → AWS Amplify Hosting → CloudFront (CDN) → Angular SPA
 *   App API calls → API Gateway → Lambda → DynamoDB / EventBridge / SQS
 *
 * Amplify owns static hosting + build; CloudFront is the edge layer it attaches.
 * Never hardcode stage URLs in components — swap via fileReplacements.
 */
export const environment = {
  production: true,
  appName: 'FreshBasket',
  apiBaseUrl: 'https://j8c0xjlxa1.execute-api.us-east-1.amazonaws.com/dev',
  ordersPath: '/orders',
  /**
   * Cognito — swap placeholder AuthService for Amplify Auth / cognito-idp later.
   * Pool/client IDs come from the order-processing-cognito stack outputs.
   */
  cognito: {
    userPoolId: 'us-east-1_N09ec4PPl',
    userPoolClientId: '3ke9ugr3lbmk44gmasfooc8vje',
    region: 'us-east-1',
  },
  /**
   * Backend stacks were torn down. Keep false for Amplify-only UI demos (local mock auth/orders).
   * Flip to true only after Cognito + API Gateway are redeployed.
   */
  useLiveApi: false,
  amplify: {
    /** Filled after Amplify recreate. */
    appUrl: 'https://main.ddeqrohhkgyk6.amplifyapp.com',
  },
  cloudFront: {
    enabled: true,
    distributionDomain: 'main.ddeqrohhkgyk6.amplifyapp.com',
  },
};
