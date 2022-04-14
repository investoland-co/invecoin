const config = require('./deploy_configs.js');

const InveCoin = artifacts.require('InveCoin');
const FixedPointMath = artifacts.require('FixedPointMath');
const InveCrowdsale = artifacts.require('InveCrowdsale');
const USDETHFeeder = artifacts.require('MockUSDETHFeeder');

module.exports = async (deployer, network) => {
  if (network !== 'development') {
    await deployer.deploy(USDETHFeeder);

    await deployer.deploy(InveCoin, config.presaleStartVestingTimestamp, 1572566399);
    await deployer.deploy(FixedPointMath);
    await deployer.link(FixedPointMath, InveCrowdsale);
    await deployer.deploy(
      InveCrowdsale,
      config.fundingCapInUsd,
      config.raisedInPresaleInUsd,
      USDETHFeeder.address,
      config.walletAddress,
      InveCoin.address,
      config.openingTime,
      config.closingTime,
      config.discountThresholds,
      config.discountValues,
      config.discountIsPercentage,
      config.monthsToStartVestingDiscount,
      config.monthsToEndVestingDiscount,
      config.companyPercentage,
    );

    const inveCoin = await InveCoin.deployed();
    await inveCoin.setCrowdsale(InveCrowdsale.address);
    const inveCrowdsale = await InveCrowdsale.deployed();

    await inveCrowdsale.setDistributionAddresses(
      config.companyAddresses,
      config.companyDistributionPercentages,
      config.monthsToStartVestingCompany,
      config.monthsToEndVestingCompany,
    );
  }
};
