export const config = {
  port: process.env.PORT || 4026,
  env: process.env.NODE_ENV || 'development',
  govTokenSymbol: 'VOTE',
  contractAddress: process.env.CONTRACT_ADDRESS || '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
};
