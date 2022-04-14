const dotenv = require('dotenv');
const moment = require('moment');
const BigNumber = require('bignumber.js');

const TWO_MONTHS_IN_SECONDS = 2 * 30 * 24 * 60 * 60;
const PRECISION = new BigNumber('1e18'); // Change this if the contract is using another precision

module.exports = {
  walletAddress: process.env.RECEPTION_ADDRESS, // CHANGE THIS. Wallet where the funds will be redirected to
  companyAddress: process.env.RECEPTION_ADDRESS, // CHANGE THIS. Wallet where the funds will be redirected to
  openingTime:
    moment()
      .utc()
      .unix() + 400, // Change this. Unix timestamp in UTC *** CHANGE TO + 400 to DEPLOY!!! ****
  //closingTime: moment.utc('2019-11-07 10:20:00').unix(),
  closingTime: moment().utc().unix() + 600,
  presaleStartVestingTimestamp: moment('2019-06-07 00:00:00')
    .utc()
    .unix(), // Reference time for the vesting of presale tokens
  // Change this. Max amount to raise including presale and crowdsale times PRECISION
  fundingCapInUsd: new BigNumber(37870000).times(1e18).toFixed(),

  // Change this. Amount raised in the presale
  raisedInPresaleInUsd: new BigNumber(2825265).times(1e18).toFixed(),

  // Minimum amount of dollars * PRECISION to apply the discount of that row
  discountThresholds: [
    new BigNumber(30000).times(PRECISION).toFixed(),
    new BigNumber(50000).times(PRECISION).toFixed(),
    new BigNumber(100000).times(PRECISION).toFixed(),
    new BigNumber(150000).times(PRECISION).toFixed(),
    new BigNumber(200000).times(PRECISION).toFixed(),
    new BigNumber(300000).times(PRECISION).toFixed(),
    new BigNumber(500000).times(PRECISION).toFixed(),
  ],
  // Discount percentage or fixed price
  discountValues: [10, 17, 33, 50, 67, 71, new BigNumber(0.2).times(PRECISION)],
  monthsToStartVestingDiscount: [3, 3, 3, 3, 3, 3, 3],
  monthsToEndVestingDiscount: [6, 6, 6, 6, 6, 6, 6],

  // True for every row where the discount is applied as a percentage,
  // false where the token should be as a fixed price
  discountIsPercentage: [true, true, true, true, true, true, false],

  companyPercentage: 48, // Percentage of tokens the company should have at the end

  // Company distribution params
  companyAddresses: ['0x84773d192f7224a7CD1f25904E4e4dF47414FDBa', '0x8313a4Ad9f7d6892832a5850Fd8e98169d1FF85a', '0x204D4879a3975E97c852Cd89df57Ce08A6d2Aa20', '0x0246016A535C837DeDcc6ffa656220B59A70DBEe', '0x6BC56A57AaEBfF467F39F25FA1E247FcBA3B4983', '0x9108016019Fc5ee5fC8FAC44444659CBA2f8B5aE'], // Change this. addresses to distribute to
  companyDistributionPercentages: [10, 6, 1, 3, 17, 63],
  monthsToStartVestingCompany: [4, 4, 4, 4, 0, 13],
  monthsToEndVestingCompany: [13, 13, 13, 13, 1, 31],
};
