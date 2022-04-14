const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { expectEvent, BN } = require('openzeppelin-test-helpers');
const BigNumber = require('bignumber.js');

const {
  advanceTime,
  deployFinishedCrowdsaleContract,
  deployOpenCrowdsale,
  toBN,
  usdToContractUsd,
  setDistributionAddresses,
} = require('./utils');

const { expect } = chai;

chai.use(chaiAsPromised);
chai.should();

const millionBN = toBN('1e6');

const conversionSecurityWeis = toBN(20); // Necesary because of the back and forth conversion

const expectedPrecision = toBN(1e6);
const monthToSeconds = 30 * 60 * 60 * 24;

contract('InveCoin', accounts => {
  const owner = accounts[0];
  const anUser = accounts[1];
  const anotherUser = accounts[2];
  const thirdUser = accounts[3];

  const companyA = accounts[4];
  const companyB = accounts[5];
  const companyC = accounts[6];

  const distributionAddresses = [companyA, companyB, companyC];
  const distributionPercentages = [15, 35, 50];
  const distributionMonthsToStart = [0, 9, 18];
  const distributionMonthsToEnd = [1, 18, 36];

  describe('Crowdsale - Price Rule', () => {
    const cases = [
      {
        raised: new BigNumber(0),
        expectedPrice: new BigNumber('1'),
        contribution: millionBN,
        expectedTokens: new BigNumber('747265.9086'),
      },
      {
        raised: new BigNumber(1e6),
        expectedPrice: new BigNumber('1.584240585'),
        contribution: millionBN,
        expectedTokens: new BigNumber('562517.539'),
      },
      {
        raised: new BigNumber(2e6),
        expectedPrice: new BigNumber('1.937199982'),
        contribution: millionBN,
        expectedTokens: new BigNumber('482425.7108'),
      },
      {
        raised: new BigNumber(21e6),
        expectedPrice: new BigNumber('3.722270416'),
        contribution: millionBN,
        expectedTokens: new BigNumber('267192.1846'),
      },
      {
        raised: new BigNumber(33e6),
        expectedPrice: new BigNumber('4.11689819'),
        contribution: millionBN,
        expectedTokens: new BigNumber('242122.3309'),
      },
    ];
    cases.forEach(({ raised, expectedPrice, contribution, expectedTokens }) => {
      describe(`GIVEN the amount in raised is ${raised}`, async () => {
        let inveCrowdsale;
        let inveCoin;
        let precision;

        const openingTimeFromNow = 10;
        const crowdsaleDuration = 10000;
        const fundingCapInUsd = toBN('1e9');
        const raisedPresaleInUsd = toBN('3870000');
        const addressesToWhitelist = [owner, anUser, anotherUser];
        beforeEach(async () => {
          ({ inveCrowdsale, inveCoin } = await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
          ));
          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );

          precision = await inveCrowdsale.PRECISION();
          if (raised.gt(0)) {
            const raisedWithPrecision = usdToContractUsd(raised, precision);
            await inveCrowdsale.buyTokens(owner, {
              from: owner,
              value: await inveCrowdsale.usdToWei(raisedWithPrecision),
            });
          }
        });
        describe('WHEN a user asks for the price', () => {
          it(`THEN the price is ${expectedPrice}`, async () => {
            expect(await inveCrowdsale.priceOfNextTokenInUsd()).to.be.bignumber.closeTo(
              usdToContractUsd(expectedPrice, precision),
              usdToContractUsd(expectedPrice, precision).div(expectedPrecision),
            );
          });
        });
        describe(`WHEN a user sends ${contribution} USD`, () => {
          beforeEach(async () => {
            const contributionWithPrecision = usdToContractUsd(contribution, precision);
            await inveCrowdsale.buyTokens(anUser, {
              from: anUser,
              value: await inveCrowdsale.usdToWei(contributionWithPrecision),
            });
            await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
            await inveCrowdsale.finish({ from: owner });
            await inveCoin.claim({ from: anUser });
          });
          it(`THEN the tokens that the user has incremented in ${expectedTokens}`, async () => {
            const tokensWithPrecision = expectedTokens.times(precision);
            expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.closeTo(
              toBN(tokensWithPrecision),
              toBN(tokensWithPrecision).div(expectedPrecision),
            );
          });
        });
      });
    });
  });

  describe('Crowdsale - Price Rule AND Discounts', () => {
    const cases = [
      {
        raised: new BigNumber(0),
        expectedPrice: new BigNumber('1'),
        contribution: new BigNumber('100010'), // Just above the third discount
        expectedTokens: new BigNumber('96157').div('0.67').integerValue(), // Discount of 0.33
      },
      {
        raised: new BigNumber(2e6),
        expectedPrice: new BigNumber('1.937199982'),
        contribution: millionBN, // Max Discount
        expectedTokens: new BigNumber('1e6').div('0.2').integerValue(), // Contribution over constant pricce
      },
      {
        raised: new BigNumber(33e6),
        expectedPrice: new BigNumber('4.11689819'),
        contribution: new BigNumber('300030'), // Just above the sixth discount
        expectedTokens: new BigNumber('72807').div('0.29').integerValue(), // Discount of 0.71
      },
    ];
    cases.forEach(({ raised, expectedPrice, contribution, expectedTokens }) => {
      describe(`GIVEN the amount in raised is ${raised}`, async () => {
        let inveCrowdsale;
        let inveCoin;
        let precision;
        const PRECISION = '1e18'; // Ideally we should take this from the contract
        const discountThresholds = [
          new BigNumber(30000).toFixed(),
          new BigNumber(50000).toFixed(),
          new BigNumber(100000).toFixed(),
          new BigNumber(150000).toFixed(),
          new BigNumber(200000).toFixed(),
          new BigNumber(300000).toFixed(),
          new BigNumber(500000).toFixed(),
        ];
        // Discount percentage or fixed price
        const discountValues = [10, 17, 33, 50, 67, 71, toBN(new BigNumber(0.2).times(PRECISION))];
        const monthsToStartVestingDiscount = [3, 3, 3, 3, 3, 3, 3];
        const monthsToEndVestingDiscount = [6, 6, 6, 6, 6, 6, 6];
        const discountIsPercentage = [true, true, true, true, true, true, false];
        const openingTimeFromNow = 10;
        const crowdsaleDuration = 10000;
        const fundingCapInUsd = toBN('1e9');
        const raisedPresaleInUsd = toBN('3870000');
        const addressesToWhitelist = [owner, anUser, anotherUser];
        beforeEach(async () => {
          ({ inveCrowdsale, inveCoin } = await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ));
          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );
          precision = await inveCrowdsale.PRECISION();

          if (raised.gt(0)) {
            const raisedWithPrecision = usdToContractUsd(raised, precision);

            await inveCrowdsale.buyTokens(owner, {
              from: owner,
              value: await inveCrowdsale.usdToWei(raisedWithPrecision),
            });
          }
        });
        describe('WHEN a user asks for the price', () => {
          it(`THEN the price is ${expectedPrice}`, async () => {
            expect(await inveCrowdsale.priceOfNextTokenInUsd()).to.be.bignumber.closeTo(
              usdToContractUsd(expectedPrice, precision),
              usdToContractUsd(expectedPrice, precision).div(expectedPrecision),
            );
          });
        });
        describe(`WHEN a user sends ${contribution} USD`, () => {
          beforeEach(async () => {
            const contributionWithPrecision = usdToContractUsd(contribution, precision);
            await inveCrowdsale.buyTokens(anUser, {
              from: anUser,
              value: await inveCrowdsale.usdToWei(contributionWithPrecision),
            });
          });
          it(`THEN the tokens that the user has incremented in ${expectedTokens}`, async () => {
            const tokensWithPrecision = expectedTokens.times(precision);
            expect(await inveCoin.vestingBalanceOf(anUser)).to.be.bignumber.closeTo(
              toBN(tokensWithPrecision),
              toBN(tokensWithPrecision).div(expectedPrecision),
            );
          });
        });
      });
    });
  });

  describe('Crowdsale - Creation', () => {
    describe('GIVEN the blockchain node is up', () => {
      describe('WHEN a user wants to create a token with a crowdsale', () => {
        let inveCrowdsale;

        const openingTimeFromNow = 10;
        const crowdsaleDuration = 10000;
        const fundingCapInUsd = 100;
        const raisedPresaleInUsd = 10;
        const addressesToWhitelist = [owner, anUser, anotherUser];

        const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
        const discountValues = [10, 20, 30, 40].map(x => new BN(x));
        const discountIsPercentage = [true, true, true, true];
        const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
        const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
        beforeEach(async () => {
          ({ inveCrowdsale } = await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ));
          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );
        });

        it('THEN he is able to do it and the crowdsale is open', async () => {
          await expect((await inveCrowdsale.isOpen()).valueOf()).to.be.true;
        });

        it('THEN he is able to do it and the toWhitelisted addresses are marked as whitelisted', async () => {
          await expect(await inveCrowdsale.isWhitelisted(owner)).to.be.true;
          await expect(await inveCrowdsale.isWhitelisted(anUser)).to.be.true;
          await expect(await inveCrowdsale.isWhitelisted(anotherUser)).to.be.true;
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and the arrays are unordered', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];

          const discountsThresholds = [5, 4, 3, 2].map(x => new BN(x));
          const discountValues = [40, 30, 20, 10].map(x => new BN(x));
          const discountIsPercentage = [true, true, true, true];
          const monthsToStartVestingDiscount = [40, 20, 10, 5].map(x => new BN(x));
          const monthsToEndVestingDiscount = [80, 40, 20, 5].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Unordered array');
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and in a discount row the vesting option is invalid', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];

          const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
          const discountValues = [10, 20, 30, 40].map(x => new BN(x));
          const discountIsPercentage = [true, true, true, true];
          const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
          const monthsToEndVestingDiscount = [10, 10, 40, 80].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Invalid discount rule. Vesting duration must be positive');
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and in a discount row the percentage is 0', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];

          const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
          const discountValues = [10, 20, 0, 40].map(x => new BN(x));
          const discountIsPercentage = [true, true, true, true];
          const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
          const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Invalid discount rule. No discount set');
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and in a discount row the percentage is 100', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];
          const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
          const discountValues = [10, 20, 30, 100].map(x => new BN(x));
          const discountIsPercentage = [true, true, true, true];
          const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
          const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Invalid discount rule. Discount too high');
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and in a discount row the fixedPrice is 0', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];
          const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
          const discountValues = [10, 20, 30, 0].map(x => new BN(x));
          const discountIsPercentage = [true, true, true, false];
          const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
          const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Invalid discount rule. Discount too high');
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and in a discount row the fixedPrice is 0', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];
          const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
          const discountValues = [10, 20, 30, 0].map(x => new BN(x));
          const discountIsPercentage = [true, true, true, false];
          const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
          const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Invalid discount rule. Discount too high');
        });
      });

      describe('WHEN a user wants to create a token with a crowdsale and the discount table length is inconsistent', () => {
        it('THEN the tx fails', async () => {
          const openingTimeFromNow = 10;
          const crowdsaleDuration = 10000;
          const fundingCapInUsd = 100;
          const raisedPresaleInUsd = 10;
          const addressesToWhitelist = [owner, anUser, anotherUser];

          const discountsThresholds = [2, 3, 4, 5, 6].map(x => new BN(x));
          const discountValues = [10].map(x => new BN(x));
          const discountIsPercentage = [true];
          const monthsToStartVestingDiscount = [5].map(x => new BN(x));
          const monthsToEndVestingDiscount = [10].map(x => new BN(x));
          await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
            discountsThresholds,
            discountValues,
            discountIsPercentage,
            monthsToStartVestingDiscount,
            monthsToEndVestingDiscount,
          ).should.be.rejectedWith('Arrays length mismatch');
        });
      });
    });
  });

  describe('Crowdsale - Flow', () => {
    describe('GIVEN the crowdsale just started', () => {
      let inveCrowdsale;
      let inveCoin;
      let usdEthFeeder;
      let precision;

      const openingTimeFromNow = 10;
      const crowdsaleDuration = 10000;
      const fundingCapInUsd = new BN('100');
      const raisedPresaleInUsd = new BN('10');
      const crowdsaleRaisedCapInUsd = fundingCapInUsd.sub(raisedPresaleInUsd);
      const addressesToWhitelist = [owner, anUser, anotherUser];
      beforeEach(async () => {
        ({ inveCrowdsale, inveCoin, usdEthFeeder } = await deployOpenCrowdsale(
          owner,
          openingTimeFromNow,
          crowdsaleDuration,
          fundingCapInUsd,
          raisedPresaleInUsd,
          addressesToWhitelist,
        ));
        await setDistributionAddresses(
          inveCrowdsale,
          distributionAddresses,
          distributionPercentages,
          distributionMonthsToStart,
          distributionMonthsToEnd,
          owner,
        );
        precision = await inveCrowdsale.PRECISION();
      });

      describe('WHEN a not whitelisted user is used as a beneficiary', () => {
        it('THEN the tx fails', async () => {
          const notWhitelistedUser = thirdUser;
          const aDollarWithPrecision = await inveCrowdsale.PRECISION();
          const weiEquivalentToADollar = await inveCrowdsale.usdToWei(aDollarWithPrecision);

          await inveCrowdsale.buyTokens(notWhitelistedUser, {
            from: owner,
            value: weiEquivalentToADollar,
          }).should.be.rejected;
        });
      });

      describe('WHEN a not whitelisted user is used as a beneficiary and sender', () => {
        it('THEN the tx fails', async () => {
          const notWhitelistedUser = thirdUser;
          const aDollarWithPrecision = await inveCrowdsale.PRECISION();
          const weiEquivalentToADollar = await inveCrowdsale.usdToWei(aDollarWithPrecision);

          await inveCrowdsale.buyTokens(notWhitelistedUser, {
            from: notWhitelistedUser,
            value: weiEquivalentToADollar,
          }).should.be.rejected;
        });
      });
      describe('WHEN a user asks for the price of the next token', () => {
        it('THEN the response is 1 dollar', async () => {
          const aDollarWithPrecision = await inveCrowdsale.PRECISION();

          expect(await inveCrowdsale.priceOfNextTokenInUsd()).to.be.bignumber.closeTo(
            aDollarWithPrecision,
            aDollarWithPrecision.div(expectedPrecision),
          );
        });
      });

      describe('WHEN a user asks for the price of the next token', () => {
        it('THEN the response is the equivalent 1 dollar in wei', async () => {
          const aDollarWithPrecision = await inveCrowdsale.PRECISION();
          const weiEquivalentToADollar = await inveCrowdsale.usdToWei(aDollarWithPrecision);

          expect(await inveCrowdsale.priceOfNextTokenInWei()).to.be.bignumber.closeTo(
            weiEquivalentToADollar,
            weiEquivalentToADollar.div(expectedPrecision),
          );
        });
      });

      describe('WHEN a user wants to buy a token for the next token price', () => {
        it('THEN the transaction succeds and he is able to do it', async () => {
          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const { logs } = await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
          });

          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: anUser });
          await inveCoin.claim({ from: anUser });

          const tokensWithPrecision = new BigNumber(1).times(precision);
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.closeTo(
            toBN(tokensWithPrecision),
            toBN(tokensWithPrecision).div(expectedPrecision),
          );
          expectEvent.inLogs(logs, 'TokensPurchased', {
            beneficiary: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
            purchaser: anUser,
          });
        });
      });

      describe('WHEN a user wants to buy tokens for more than the funding cap', () => {
        it('THEN the transaction fails and the user gets nothing', async () => {
          const crowdsaleRaisedCapInWei = await inveCrowdsale.usdToWei(
            crowdsaleRaisedCapInUsd.mul(await inveCrowdsale.PRECISION()),
          );
          await inveCrowdsale
            .buyTokens(owner, { from: owner, value: crowdsaleRaisedCapInWei.add(new BN(1)) })
            .should.be.rejectedWith('The cap will be surpassed');
          expect(await inveCoin.balanceOf(owner)).to.be.bignumber.equal(new BN(0));
        });
      });

      describe('WHEN a user buys tokens succesfully and then wants to buy an amount that surpasses the funding cap', () => {
        it('THEN the second transaction fails and the user gets only the first lot of tokens', async () => {
          const crowdsaleRaisedCapInWei = await inveCrowdsale.usdToWei(
            crowdsaleRaisedCapInUsd.mul(await inveCrowdsale.PRECISION()),
          );

          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const surpassingCapAmountInWei = await crowdsaleRaisedCapInWei
            .sub(priceOfFirstTokenInWei.add(conversionSecurityWeis))
            .add(new BN(1));
          const { logs } = await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
          });

          await inveCrowdsale
            .buyTokens(anUser, { from: anUser, value: surpassingCapAmountInWei })
            .should.be.rejectedWith('The cap will be surpassed');

          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: anUser });
          await inveCoin.claim({ from: anUser });

          const tokensWithPrecision = new BigNumber(1).times(precision);
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.closeTo(
            toBN(tokensWithPrecision),
            toBN(tokensWithPrecision).div(expectedPrecision),
          );
          expectEvent.inLogs(logs, 'TokensPurchased', {
            beneficiary: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
            purchaser: anUser,
          });
        });
      });

      describe('AND a user bought tokens', () => {
        describe('WHEN the ether rate changes', () => {
          it('THEN the raised amount holds the same', async () => {
            const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
            await inveCrowdsale.buyTokens(owner, {
              from: owner,
              value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
            });
            const firstTotalRaisedInUsd = await inveCrowdsale.totalRaisedInUsd();
            const oldRate = await usdEthFeeder.read();
            const newRate = oldRate.div(new BN(2));
            await usdEthFeeder.write(newRate);
            const newTotalRaisedInUsd = await inveCrowdsale.totalRaisedInUsd();
            expect(newTotalRaisedInUsd).to.be.bignumber.equal(firstTotalRaisedInUsd);
          });
        });
      });

      describe('WHEN the users buy tokens while the rate is changing', () => {
        it('THEN the raised amount is updated with the dollars worth at the moment', async () => {
          const firstRate = await usdEthFeeder.read();
          const initialTotalRaisedInUsd = await inveCrowdsale.totalRaisedInUsd();
          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const priceOfFirstTokenInUsd = await inveCrowdsale.priceOfNextTokenInUsd();
          await inveCrowdsale.buyTokens(owner, {
            from: owner,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
          });
          const firstTotalRaisedInUsd = await inveCrowdsale.totalRaisedInUsd();
          expect(firstTotalRaisedInUsd).to.be.bignumber.closeTo(
            initialTotalRaisedInUsd.add(priceOfFirstTokenInUsd),
            initialTotalRaisedInUsd.add(priceOfFirstTokenInUsd).div(expectedPrecision),
          );

          const secondRate = firstRate.div(new BN(2));
          await usdEthFeeder.write(secondRate);
          const priceOfSecondTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const priceOfSecondTokenInUsd = await inveCrowdsale.priceOfNextTokenInUsd();
          await inveCrowdsale.buyTokens(owner, {
            from: owner,
            value: priceOfSecondTokenInWei.add(conversionSecurityWeis),
          });
          const secondTotalRaisedInUsd = await inveCrowdsale.totalRaisedInUsd();
          expect(secondTotalRaisedInUsd).to.be.bignumber.closeTo(
            firstTotalRaisedInUsd.add(priceOfSecondTokenInUsd),
            firstTotalRaisedInUsd.add(priceOfSecondTokenInUsd).div(expectedPrecision),
          );

          const thirdRate = secondRate.div(new BN(2));
          await usdEthFeeder.write(thirdRate);
          const priceOfThirdTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const priceOfThirdTokenInUsd = await inveCrowdsale.priceOfNextTokenInUsd();
          await inveCrowdsale.buyTokens(owner, {
            from: owner,
            value: priceOfThirdTokenInWei.add(conversionSecurityWeis),
          });
          const thirdTotalRaisedInUsd = await inveCrowdsale.totalRaisedInUsd();
          expect(thirdTotalRaisedInUsd).to.be.bignumber.closeTo(
            secondTotalRaisedInUsd.add(priceOfThirdTokenInUsd),
            secondTotalRaisedInUsd.add(priceOfThirdTokenInUsd).div(expectedPrecision),
          );
        });
      });
      describe('WHEN the users buys tokens without a vesting scheme', () => {
        let tokensAmount;
        beforeEach(async () => {
          const priceOfNextToken = await inveCrowdsale.priceOfNextTokenInWei();
          tokensAmount = await inveCoin.vestingBalanceOf(anUser);

          await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: priceOfNextToken,
          });
          tokensAmount = await inveCoin.vestingBalanceOf(anUser);
        });
        it('THEN he cannot claim them right away', async () => {
          await inveCoin
            .claim({ from: anUser })
            .should.be.rejectedWith('User start vesting date has not been reached yet');
        });
        it('THEN he can claim them all as soon as the crowdsale finishes ', async () => {
          await advanceTime(crowdsaleDuration + 1);
          await inveCrowdsale.finish({ from: anUser });
          await inveCoin.claim({ from: anUser });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(tokensAmount);
        });
      });
      describe('WHEN asks for the prices while the rate is changing', () => {
        it('THEN the price of the tokens in weis is updated proportionally and the price in USD doesnt change at all', async () => {
          const firstPriceOfNextTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const firstPriceOfNextTokenInUsd = await inveCrowdsale.priceOfNextTokenInUsd();

          const firstRate = await usdEthFeeder.read();
          const secondRate = firstRate.div(new BN(2));
          await usdEthFeeder.write(secondRate);

          const secondPriceOfNextTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const secondPriceOfNextTokenInUsd = await inveCrowdsale.priceOfNextTokenInUsd();

          expect(secondPriceOfNextTokenInWei).to.be.bignumber.equal(
            firstPriceOfNextTokenInWei.div(new BN(2)),
          );
          expect(secondPriceOfNextTokenInUsd).to.be.bignumber.equal(firstPriceOfNextTokenInUsd);
        });
      });
    });

    describe('GIVEN the crowdsale has finished but the explicit finish has not been called yet', () => {
      let inveCrowdsale;
      let inveCoin;

      const openingTimeFromNow = 10;
      const crowdsaleDuration = 10000;
      const fundingCap = 1000000;
      const raisedPresaleInUsd = 10;
      const addressesToWhitelist = [owner, anUser, anotherUser];
      beforeEach(async () => {
        ({ inveCrowdsale, inveCoin } = await deployOpenCrowdsale(
          owner,
          openingTimeFromNow,
          crowdsaleDuration,
          fundingCap,
          raisedPresaleInUsd,
          addressesToWhitelist,
        ));

        await setDistributionAddresses(
          inveCrowdsale,
          distributionAddresses,
          distributionPercentages,
          distributionMonthsToStart,
          distributionMonthsToEnd,
          owner,
        );
        await advanceTime(crowdsaleDuration + 1);
      });

      describe('WHEN a user wants to buy tokens', () => {
        it('THEN the transaction fails and the user gets nothing', async () => {
          const priceOfNextToken = await inveCrowdsale.priceOfNextTokenInWei();

          await inveCrowdsale
            .buyTokens(owner, { from: owner, value: priceOfNextToken })
            .should.be.rejectedWith('Crowdsale has finished already');
          expect(await inveCoin.balanceOf(owner)).to.be.bignumber.equal(new BN(0));
        });
      });

      describe('WHEN the owner wants to call the explicit finish method', () => {
        it('THEN the crowdsale finishes', async () => {
          await inveCrowdsale.finish({ from: owner });
        });
      });

      describe('WHEN any wants to call the explicit finish method', () => {
        it('THEN the crowdsale finishes', async () => {
          await inveCrowdsale.finish({ from: owner });
        });
      });
    });

    describe('GIVEN the crowdsale has finished', () => {
      let inveCrowdsale;
      let inveCoin;

      beforeEach(async () => {
        ({ inveCrowdsale, inveCoin } = await deployFinishedCrowdsaleContract(
          owner,
          [],
          [],
          [],
          [],
          distributionAddresses,
          distributionPercentages,
          distributionMonthsToStart,
          distributionMonthsToEnd,
        ));
      });

      describe('WHEN someone tries to finish the crowdsale again', () => {
        it('THEN the tx fails', async () => {
          await inveCoin
            .finishCrowdsale({ from: owner })
            .should.be.rejectedWith('Crowdsale has finished already');
        });
      });

      describe('WHEN a user wants to buy tokens', () => {
        it('THEN the transaction fails and the user gets nothing', async () => {
          const priceOfNextToken = await inveCrowdsale.priceOfNextTokenInWei();

          await inveCrowdsale
            .buyTokens(owner, { from: owner, value: priceOfNextToken })
            .should.be.rejectedWith('Crowdsale has finished already');
          expect(await inveCoin.balanceOf(owner)).to.be.bignumber.equal(new BN(0));
        });
      });

      describe('WHEN a user wants to buy tokens', () => {
        it('THEN the transaction fails and the user gets nothing', async () => {
          const priceOfNextToken = await inveCrowdsale.priceOfNextTokenInWei();

          await inveCrowdsale
            .buyTokens(owner, { from: owner, value: priceOfNextToken })
            .should.be.rejectedWith('Crowdsale has finished already');
          expect(await inveCoin.balanceOf(owner)).to.be.bignumber.equal(new BN(0));
        });
      });
    });
  });

  describe('Crowdsale - Discounts', () => {
    describe('GIVEN a crowdsale with discounts just started', () => {
      let inveCrowdsale;
      let config;
      let inveCoin;
      const openingTimeFromNow = 10;
      const crowdsaleDuration = 10000;
      const fundingCapInUsd = 100;
      const raisedPresaleInUsd = 10;
      const addressesToWhitelist = [owner, anUser, anotherUser];

      const discountsThresholds = [2, 3, 4, 5].map(x => new BN(x));
      const discountValues = [10, 20, 30, 40].map(x => new BN(x));
      const discountIsPercentage = [true, true, true, true];
      const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
      const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
      beforeEach(async () => {
        ({ inveCoin, inveCrowdsale, config } = await deployOpenCrowdsale(
          owner,
          openingTimeFromNow,
          crowdsaleDuration,
          fundingCapInUsd,
          raisedPresaleInUsd,
          addressesToWhitelist,
          discountsThresholds,
          discountValues,
          discountIsPercentage,
          monthsToStartVestingDiscount,
          monthsToEndVestingDiscount,
        ));

        // Assert that the following tests can be run
        await setDistributionAddresses(
          inveCrowdsale,
          distributionAddresses,
          distributionPercentages,
          distributionMonthsToStart,
          distributionMonthsToEnd,
          owner,
        );

        // precision = await inveCrowdsale.PRECISION();
        // Assert that the following tests can be ran
        expect(
          (await inveCrowdsale.priceOfNextTokenInUsd()).div(await config.PRECISION()),
        ).to.be.bignumber.lte(new BN(discountsThresholds[0]));
        expect(new BN(fundingCapInUsd - raisedPresaleInUsd)).to.be.bignumber.gte(
          new BN(discountsThresholds[discountsThresholds.length - 1]),
        );
      });

      describe('WHEN a user wants to buy a little amount of tokens', () => {
        it('THEN he will do it without a discount', async () => {
          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          const { logs } = await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
          });
          expectEvent.inLogs(logs, 'TokensPurchased', {
            beneficiary: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
            purchaser: anUser,
          });
        });

        it('THEN he wont have his tokens right away', async () => {
          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
          });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(toBN(0));
        });
      });

      describe('WHEN a user wants to buy a huge amount of tokens', () => {
        it('THEN he will do it with the max discount', async () => {
          const amountOfDollarsWithPrecision = new BN(6).mul(await config.PRECISION());
          const amountOfDollarsInWei = await inveCrowdsale.usdToWei(amountOfDollarsWithPrecision);
          const { logs } = await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: amountOfDollarsInWei.add(conversionSecurityWeis),
          });
          const tokensVested = await inveCoin.vestingBalanceOf(anUser);
          expectEvent.inLogs(logs, 'TokensDelivered', {
            weiSent: amountOfDollarsInWei.add(conversionSecurityWeis),
            tokenAmount: tokensVested,
            discountValueUsed: discountValues[discountsThresholds.length - 1],
            discountIsPercentage: true,
            monthsToStartVesting: monthsToStartVestingDiscount[discountsThresholds.length - 1],
            monthsToEndVesting: monthsToEndVestingDiscount[discountsThresholds.length - 1],
          });
        });

        it('THEN he will have them in a vesting state and he will be able to claim them in the right month', async () => {
          const amountOfDollarsWithPrecision = new BN(
            discountsThresholds[discountsThresholds.length - 1] + 1,
          ).mul(await config.PRECISION());
          await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: await inveCrowdsale.usdToWei(amountOfDollarsWithPrecision),
          });
          const tokensToVest = await inveCoin.vestingBalanceOf(anUser);

          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: owner });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(new BN(0));
          await advanceTime(
            monthsToEndVestingDiscount[discountsThresholds.length - 1] * monthToSeconds,
          );
          await inveCoin.claim({ from: anUser });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(tokensToVest);
        });
      });

      describe('WHEN a user wants to buy an arbitrary amount of tokens', () => {
        it('THEN he will do it with the discount that belongs to that amount', async () => {
          const amountOfDollarsWithPrecision = new BN(3).mul(await config.PRECISION());
          const amountOfDollarsInWei = await inveCrowdsale.usdToWei(amountOfDollarsWithPrecision);
          const { logs } = await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: amountOfDollarsInWei,
          });
          const tokensVested = await inveCoin.vestingBalanceOf(anUser);
          expectEvent.inLogs(logs, 'TokensDelivered', {
            weiSent: amountOfDollarsInWei,
            tokenAmount: tokensVested,
            discountValueUsed: new BN(20),
            discountIsPercentage: true,
            monthsToStartVesting: new BN(10),
            monthsToEndVesting: new BN(20),
          });
        });

        it('THEN he will have them in a vesting state and he will be able to claim them in the right month', async () => {
          const amountOfDollarsWithPrecision = new BN(3).mul(await config.PRECISION());
          await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: await inveCrowdsale.usdToWei(amountOfDollarsWithPrecision),
          });
          const tokensToVest = await inveCoin.vestingBalanceOf(anUser);

          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: owner });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(new BN(0));
          await advanceTime(20 * monthToSeconds);
          await inveCoin.claim({ from: anUser });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(tokensToVest);
        });
      });
    });
    describe('GIVEN a crowdsale with fixedPrice discounts just started', () => {
      let inveCrowdsale;
      let config;
      let inveCoin;
      let precision;

      const openingTimeFromNow = 10;
      const crowdsaleDuration = 10000;
      const fundingCapInUsd = 1e8;
      const raisedPresaleInUsd = 10;
      const fixedPrice = new BN((2e17).toString());
      const maxThreshold = new BN('5456456');
      const addressesToWhitelist = [owner, anUser, anotherUser];

      const discountsThresholds = [2, 3, 4, maxThreshold].map(x => new BN(x));
      const discountValues = [10, 20, 30, fixedPrice].map(x => new BN(x));
      const discountIsPercentage = [true, true, true, false];
      const monthsToStartVestingDiscount = [5, 10, 20, 40].map(x => new BN(x));
      const monthsToEndVestingDiscount = [10, 20, 40, 80].map(x => new BN(x));
      beforeEach(async () => {
        ({ inveCoin, inveCrowdsale, config } = await deployOpenCrowdsale(
          owner,
          openingTimeFromNow,
          crowdsaleDuration,
          fundingCapInUsd,
          raisedPresaleInUsd,
          addressesToWhitelist,
          discountsThresholds,
          discountValues,
          discountIsPercentage,
          monthsToStartVestingDiscount,
          monthsToEndVestingDiscount,
        ));
        await setDistributionAddresses(
          inveCrowdsale,
          distributionAddresses,
          distributionPercentages,
          distributionMonthsToStart,
          distributionMonthsToEnd,
          owner,
        );
        precision = await inveCrowdsale.PRECISION();
        // Assert that the following tests can be ran
        expect(
          (await inveCrowdsale.priceOfNextTokenInUsd()).div(await config.PRECISION()),
        ).to.be.bignumber.lte(new BN(discountsThresholds[0]));
        expect(new BN(fundingCapInUsd - raisedPresaleInUsd)).to.be.bignumber.gte(
          new BN(discountsThresholds[discountsThresholds.length - 1]),
        );
      });

      describe('WHEN a user wants to buy a discount that amerits the fixed price discount', () => {
        let logs;
        let amountOfDollarsWithPrecision;
        let amountOfDollarsInWei;
        beforeEach(async () => {
          amountOfDollarsWithPrecision = maxThreshold.mul(await config.PRECISION());
          amountOfDollarsInWei = await inveCrowdsale.usdToWei(amountOfDollarsWithPrecision);

          ({ logs } = await inveCrowdsale.buyTokens(anUser, {
            from: anUser,
            value: amountOfDollarsInWei,
          }));
        });
        it('THEN he will do it with the right discount', async () => {
          expectEvent.inLogs(logs, 'TokensDelivered', {
            weiSent: amountOfDollarsInWei,
            tokenAmount: amountOfDollarsWithPrecision.mul(precision).div(fixedPrice),
            discountValueUsed: fixedPrice,
            discountIsPercentage: false,
            monthsToStartVesting: new BN(40),
            monthsToEndVesting: new BN(80),
          });
        });

        it('THEN the amount of tokens is inversely proportial to the fixed price', async () => {
          const tokensToVest = await inveCoin.vestingBalanceOf(anUser);
          expect(tokensToVest).to.be.bignumber.closeTo(
            amountOfDollarsWithPrecision.mul(precision).div(fixedPrice),
            amountOfDollarsWithPrecision
              .mul(precision)
              .div(fixedPrice)
              .div(expectedPrecision),
          );
        });

        it('THEN he will have them in a vesting state and he will be able to claim them in the right month', async () => {
          const tokensToVest = await inveCoin.vestingBalanceOf(anUser);

          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: owner });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(new BN(0));
          await advanceTime(80 * monthToSeconds);
          await inveCoin.claim({ from: anUser });
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(tokensToVest);
        });
      });
    });
  });
  describe('Crowd sale - company distributions', () => {
    let inveCrowdsale;
    let inveCoin;

    const openingTimeFromNow = 100;
    const crowdsaleDuration = 10000;
    const fundingCapInUsd = new BN('100000');
    const raisedPresaleInUsd = new BN('0');

    const addressesToWhitelist = [owner, anUser, anotherUser];
    beforeEach(async () => {
      ({ inveCrowdsale, inveCoin } = await deployOpenCrowdsale(
        owner,
        openingTimeFromNow,
        crowdsaleDuration,
        fundingCapInUsd,
        raisedPresaleInUsd,
        addressesToWhitelist,
      ));

      // TODO Load tests that test at least 100 accounts
      await inveCoin.addVestingBatch([anUser], [100], [3], [6], { from: owner });
    });

    it('should allow to set the distribution addresses', async () => {
      await inveCrowdsale.setDistributionAddresses([companyA], [100], [1], [5], { from: owner })
        .should.be.fulfilled;
    });

    it('should fail when setting the distribution addresses twice', async () => {
      await inveCrowdsale.setDistributionAddresses([companyA], [100], [1], [5], { from: owner })
        .should.be.fulfilled;

      await inveCrowdsale
        .setDistributionAddresses([companyA], [100], [1], [5], { from: owner })
        .should.be.rejectedWith('company distributions are already set');
    });

    it('should fail when setting an empty distribution', async () => {
      await inveCrowdsale
        .setDistributionAddresses([], [], [], [], { from: owner })
        .should.be.rejectedWith('provide at least one address to distribute the company tokens');
    });

    it('should fail when setting a distribution with invalid months', async () => {
      await inveCrowdsale
        .setDistributionAddresses([companyA], [100], [3], [1], { from: owner })
        .should.be.rejectedWith('invalid vesting time');
    });

    it('should fail when setting a distribution with differents amounts of arguments', async () => {
      await inveCrowdsale
        .setDistributionAddresses([companyA], [100], [1], [3, 3, 4], { from: owner })
        .should.be.rejectedWith('Arrays length mismatch');

      await inveCrowdsale
        .setDistributionAddresses([companyA], [100], [1], [3, 3, 4], { from: owner })
        .should.be.rejectedWith('Arrays length mismatch');
    });

    it('should fail when setting a distribution with invalid percentages', async () => {
      await inveCrowdsale
        .setDistributionAddresses([companyA], [55], [1], [3], { from: owner })
        .should.be.rejectedWith('you have to distribute all the company tokens');

      await inveCrowdsale
        .setDistributionAddresses([companyA, companyB], [55, 44], [1, 2], [3, 6], { from: owner })
        .should.be.rejectedWith('you have to distribute all the company tokens');
    });
  });
});
