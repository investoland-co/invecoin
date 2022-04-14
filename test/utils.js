const { BN } = require('openzeppelin-test-helpers');
const BigNumber = require('bignumber.js');

const InveCoin = artifacts.require('InveCoin');
const MockWallet = artifacts.require('MockWallet');
const MockUSDETHFeeder = artifacts.require('MockUSDETHFeeder');
const InveCrowdsale = artifacts.require('InveCrowdsale');
const FixedPointMath = artifacts.require('FixedPointMath');
const Config = artifacts.require('Config');

const advanceTime = time =>
  new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [time],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      },
    );
  });

const advanceBlock = () =>
  new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: '2.0',
        method: 'evm_mine',
        id: new Date().getTime(),
      },
      err => {
        if (err) {
          return reject(err);
        }
        const newBlockHash = web3.eth.getBlock('latest').hash;

        return resolve(newBlockHash);
      },
    );
  });

const getCurrentTime = async () => (await web3.eth.getBlock('latest')).timestamp;

const advanceTimeAndBlock = async time => {
  await advanceTime(time);
  await advanceBlock();

  return Promise.resolve(web3.eth.getBlock('latest'));
};

const usdToContractUsd = (usdValue, PRECISION) => {
  const usdValueBigNumber = new BigNumber(usdValue.toString());
  const PRECISIONBigNumber = new BigNumber(PRECISION.toString());
  const result = usdValueBigNumber.times(PRECISIONBigNumber);
  return new BN(result.toFixed());
};

const toBN = number => new BN(new BigNumber(number).toFixed());
const concatPromises = (parameters, promiseGenerator) =>
  parameters.reduce(async (previousPromise, nextID) => {
    await previousPromise;
    return promiseGenerator(nextID);
  }, Promise.resolve());

const setDistributionAddresses = async (
  crowdsale,
  distributionAddresses,
  distributionPercentages,
  distributionMonthsToStart,
  distributionMonthsToEnd,
  from) => {
  await crowdsale.setDistributionAddresses(
    distributionAddresses,
    distributionPercentages,
    distributionMonthsToStart,
    distributionMonthsToEnd,
    { from },
  );
};

const deployOpenCrowdsale = async (
  owner,
  openingTimeFromNow,
  crowdsaleDuration,
  fundingCapInUsd = 1000,
  raisedInPresaleInUsd = 0,
  addressesToWhitelist = [],
  discountThresholds = [],
  discountValues = [],
  discountIsPercentage = [],
  monthsToStartVestingDiscount = [],
  monthsToEndVestingDiscount = [],
  companyPercentage = 48,
  presaleStartVestingTimestamp = new BN(1559908800), // 7th June
) => {
  const config = await Config.new({ from: owner });
  const PRECISION = await config.PRECISION();

  const fixedPointMath = await FixedPointMath.new();
  const usdEthFeeder = await MockUSDETHFeeder.new({ from: owner });
  const wallet = await MockWallet.new({ from: owner });

  const openingTime = (await getCurrentTime()) + openingTimeFromNow;
  const closingTime = openingTime + crowdsaleDuration;

  const inveCoin = await InveCoin.new(presaleStartVestingTimestamp, { from: owner });

  await InveCrowdsale.link('FixedPointMath', fixedPointMath.address);
  const inveCrowdsale = await InveCrowdsale.new(
    usdToContractUsd(fundingCapInUsd, PRECISION),
    usdToContractUsd(raisedInPresaleInUsd, PRECISION),
    usdEthFeeder.address,
    wallet.address,
    inveCoin.address,
    openingTime,
    closingTime,
    discountThresholds.map(usdValue => usdToContractUsd(usdValue, PRECISION)),
    discountValues,
    discountIsPercentage,
    monthsToStartVestingDiscount,
    monthsToEndVestingDiscount,
    companyPercentage,
    { from: owner },
  );
  await inveCoin.setCrowdsale(inveCrowdsale.address, { from: owner });

  const whitelist = address => inveCrowdsale.addWhitelisted(address, { from: owner });

  await concatPromises(addressesToWhitelist, whitelist);

  await advanceTime(openingTimeFromNow); // Open the crowdsale
  return {
    inveCoin,
    wallet,
    usdEthFeeder,
    inveCrowdsale,
    config,
  };
};

const deployFinishedCrowdsaleContract = async (
  owner,
  vestingUsers = [],
  vestingAmounts = [],
  monthsToStartVesting = [],
  monthsToEndVesting = [],
  distributionAddresses = [],
  distributionPercentages = [],
  distributionMonthsToStart = [],
  distributionMonthsToEnd = [],
  companyPercentage = 48,
  presaleStartVestingTimestamp = new BN(1559908800), // 7th June
) => {
  const openingTimeFromNow = 10;
  const crowdsaleDuration = 10;

  // This params dont really matter as the crowdsale will be finished anyway
  const fundingCapInUsd = 20000;
  const raisedInPresaleInUsd = 1;

  const contracts = await deployOpenCrowdsale(
    owner,
    openingTimeFromNow,
    crowdsaleDuration,
    fundingCapInUsd,
    raisedInPresaleInUsd,
    [], [], [], [], [], [],
    companyPercentage,
    presaleStartVestingTimestamp,
  );

  await setDistributionAddresses(
    contracts.inveCrowdsale,
    distributionAddresses,
    distributionPercentages,
    distributionMonthsToStart,
    distributionMonthsToEnd,
    owner,
  );

  await contracts.inveCoin.addVestingBatch(
    vestingUsers,
    vestingAmounts,
    monthsToStartVesting,
    monthsToEndVesting,
  );
  await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
  await contracts.inveCrowdsale.finish({ from: owner });

  return contracts;
};

module.exports = {
  advanceTime,
  advanceBlock,
  advanceTimeAndBlock,
  getCurrentTime,
  concatPromises,
  deployFinishedCrowdsaleContract,
  deployOpenCrowdsale,
  toBN,
  usdToContractUsd,
  setDistributionAddresses,
};
