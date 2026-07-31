export const environment = {
  production: false,
  appName: 'FreshBasket',
  apiBaseUrl: 'https://j8c0xjlxa1.execute-api.us-east-1.amazonaws.com/dev',
  ordersPath: '/orders',
  cognito: {
    userPoolId: 'us-east-1_N09ec4PPl',
    userPoolClientId: '3ke9ugr3lbmk44gmasfooc8vje',
    region: 'us-east-1',
  },
  useLiveApi: false,
  amplify: {
    appUrl: 'http://127.0.0.1:4200',
  },
  cloudFront: {
    enabled: false,
    distributionDomain: '',
  },
};
