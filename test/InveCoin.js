const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { expectEvent, BN, constants } = require('openzeppelin-test-helpers');

const FixedPointMath = artifacts.require('FixedPointMath');
const InveCoin = artifacts.require('InveCoin');
const InveCrowdsale = artifacts.require('InveCrowdsale');
const MockUSDETHFeeder = artifacts.require('MockUSDETHFeeder');

const {
  advanceTime,
  concatPromises,
  deployFinishedCrowdsaleContract,
  deployOpenCrowdsale,
  getCurrentTime,
  setDistributionAddresses,
} = require('./utils');

const { expect } = chai;

const { ZERO_ADDRESS } = constants;

const monthToSeconds = 30 * 60 * 60 * 24;
const companyTokensPercentage = 48;

const conversionSecurityWeis = new BN(20); // Necesary because of the back and forth conversion
chai.use(chaiAsPromised);
chai.should();

contract('InveCoin', accounts => {
  const owner = accounts[0];
  const anUser = accounts[1];
  const anotherUser = accounts[2];
  const thirdUser = accounts[3];

  const companyA = accounts[4];
  const companyB = accounts[5];
  const companyC = accounts[6];

  const distributionAddresses = [companyA, companyB, companyC];
  const distributionPercentages = [10, 40, 50];
  const distributionMonthsToStart = [0, 9, 18];
  const distributionMonthsToEnd = [1, 18, 36];

  describe('Token', () => {
    describe('GIVEN the tokens is already in its pure ERC20 state', () => {
      let inveCoin;
      let inveCrowdsale;

      const openingTimeFromNow = 10;
      const crowdsaleDuration = 10000;
      const fundingCapInUsd = new BN('100000');
      const raisedPresaleInUsd = new BN('0');

      const addressesToWhitelist = [owner, anUser, anotherUser];
      const anUserInitialBalance = 100;
      const ownerInitialBalance = 1000;

      beforeEach(async () => {
        ({ inveCoin, inveCrowdsale } = await deployOpenCrowdsale(
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
        await inveCoin.mint(anUser, anUserInitialBalance, { from: owner });
        await inveCoin.mint(owner, ownerInitialBalance, { from: owner });

        await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
        await inveCrowdsale.finish({ from: owner });
      });

      describe('WHEN a user without enough balance wants to transfer tokens', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin.transfer(anotherUser, anUserInitialBalance + 1, { from: anUser }).should.be
            .rejected;
        });
      });

      describe('WHEN a user without enough allowance wants to transfer tokens', () => {
        it('THEN the transaction fails', async () => {
          const allowedAmount = 40;
          await inveCoin.approve(anUser, allowedAmount, { from: owner });
          await inveCoin.transferFrom(owner, anotherUser, allowedAmount + 1, { from: anUser })
            .should.be.rejected;
        });
      });

      describe('WHEN a user with balance wants to transfer tokens', () => {
        let logs;
        const transferedAmount = 20;
        beforeEach(async () => {
          ({ logs } = await inveCoin.transfer(anotherUser, transferedAmount, { from: anUser }));
        });
        it("THEN the sender's balance decreases", async () => {
          expect(await inveCoin.balanceOf(anUser)).to.be.bignumber.equal(
            new BN(anUserInitialBalance - transferedAmount),
          );
        });

        it("THEN the receiver's balance increases", async () => {
          expect(await inveCoin.balanceOf(anotherUser)).to.be.bignumber.equal(
            new BN(transferedAmount),
          );
        });

        it('THEN the logs is emitted', async () => {
          expectEvent.inLogs(logs, 'Transfer', {
            from: anUser,
            value: new BN(transferedAmount),
            to: anotherUser,
          });
        });
      });
      describe('WHEN a user with balance wants to use an allowance', () => {
        let logs;
        const allowedAmount = 40;
        const transferedAmount = allowedAmount;
        beforeEach(async () => {
          await inveCoin.approve(anUser, allowedAmount, { from: owner });
          ({ logs } = await inveCoin.transferFrom(owner, anotherUser, transferedAmount, {
            from: anUser,
          }));
        });

        it("THEN the allower's balance decreases", async () => {
          expect(await inveCoin.balanceOf(owner)).to.be.bignumber.equal(
            new BN(ownerInitialBalance - transferedAmount),
          );
        });

        it("THEN the receiver's balance increases", async () => {
          expect(await inveCoin.balanceOf(anotherUser)).to.be.bignumber.equal(
            new BN(transferedAmount),
          );
        });

        it("THEN the allowance 's balance decreases", async () => {
          expect(await inveCoin.allowance(anotherUser, owner)).to.be.bignumber.equal(
            new BN(allowedAmount - transferedAmount),
          );
        });

        it('THEN the logs is emitted', async () => {
          expectEvent.inLogs(logs, 'Transfer', {
            from: owner,
            value: new BN(transferedAmount),
            to: anotherUser,
          });
        });
      });
    });
  });
  describe('Token-Crowdsale integration', () => {
    describe('GIVEN a token has no crowdsale', () => {
      let inveCoin;
      let inveCrowdsale;
      beforeEach(async () => {
        inveCoin = await InveCoin.new(await getCurrentTime(), { from: owner });
        const usdEthFeeder = await MockUSDETHFeeder.new({ from: owner });

        const openingTime = (await getCurrentTime()) + 100;
        const closingTime = openingTime + 100;

        const fixedPointMath = await FixedPointMath.new();

        await InveCrowdsale.link('FixedPointMath', fixedPointMath.address);
        inveCrowdsale = await InveCrowdsale.new(
          '10000',
          '100',
          usdEthFeeder.address,
          owner,
          inveCoin.address,
          openingTime,
          closingTime,
          [],
          [],
          [],
          [],
          [],
          48,
          { from: owner },
        );
      });

      describe('WHEN a non-owner user tries to set the crowdsale', () => {
        it('THEN the tx fails', async () => {
          await inveCoin.setCrowdsale(inveCrowdsale.address, { from: anUser }).should.be.rejected;
        });
      });

      describe('WHEN the owner tries to set the crowdsale twice', () => {
        it('THEN the tx fails', async () => {
          await inveCoin.setCrowdsale(inveCrowdsale.address, { from: owner });
          await inveCoin
            .setCrowdsale(inveCrowdsale.address, { from: owner })
            .should.be.rejectedWith('Crowdsale already set');
        });
      });

      describe('WHEN the owner tries to set the crowdsale as address 0', () => {
        it('THEN the tx fails', async () => {
          await inveCoin
            .setCrowdsale(ZERO_ADDRESS, { from: owner })
            .should.be.rejectedWith('Invalid crowdsale');
        });
      });

      describe('WHEN the owner tries to set the crowdsale as address 0', () => {
        it('THEN the tx fails', async () => {
          await inveCoin
            .setCrowdsale(ZERO_ADDRESS, { from: owner })
            .should.be.rejectedWith('Invalid crowdsale');
        });
      });
    });

    describe('GIVEN the token has an open crowdsale', () => {
      let inveCrowdsale;
      let inveCoin;

      const openingTimeFromNow = 10;
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
        await setDistributionAddresses(
          inveCrowdsale,
          distributionAddresses,
          distributionPercentages,
          distributionMonthsToStart,
          distributionMonthsToEnd,
          owner,
        );
      });

      describe('WHEN a user tries to finish the crowdsale from the token ', () => {
        it('THEN the tx fails because the crowdsale should notify the token', async () => {
          await inveCoin.finishCrowdsale().should.be.rejectedWith('Sender is not set crowdsale');
        });
      });
      describe('WHEN a user tries to transfer its tokens', () => {
        it('THEN the tx success because the token is not paused', async () => {
          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          await inveCrowdsale.buyTokens(anotherUser, {
            from: anotherUser,
            value: priceOfFirstTokenInWei.add(conversionSecurityWeis),
          });

          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: owner });
          await inveCoin.claim({ from: anotherUser });

          const balance = await inveCoin.balanceOf(anotherUser);
          expect(balance).to.be.bignumber.gt(new BN(0));
          await inveCoin.transfer(anUser, balance, { from: anotherUser }).should.be.fulfilled;
        });
      });

      describe('WHEN the crowdsale finishes', () => {
        it("THEN the company token's are distributed", async () => {
          const priceOfFirstTokenInWei = await inveCrowdsale.priceOfNextTokenInWei();
          await inveCrowdsale.buyTokens(owner, {
            from: owner,
            value: priceOfFirstTokenInWei.mul(new BN(1000)),
          });

          await advanceTime(crowdsaleDuration + 1);
          const { logs } = await inveCrowdsale.finish({ from: owner });
          await inveCoin.claim({ from: owner });

          const tokensBought = await inveCoin.balanceOf(owner);

          const tokensDistributed = tokensBought
            .mul(new BN(companyTokensPercentage))
            .div(new BN(100 - companyTokensPercentage));

          expectEvent.inLogs(logs, 'CrowdsaleFinished', {
            tokensDistributed,
          });
        });
      });
    });

    describe('GIVEN a contract has a finished crowdsale', () => {
      let inveCoin;
      beforeEach(async () => {
        ({ inveCoin } = await deployFinishedCrowdsaleContract(
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

      describe('WHEN a minter tries to mint', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin
            .mint(owner, 2, { from: owner })
            .should.be.rejectedWith('Crowdsale has finished already');
        });
      });

      describe('WHEN a minter tries to add more vested tokens', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin
            .addVesting(owner, 2, 1, 2, false, true, { from: owner })
            .should.be.rejectedWith('Crowdsale has finished already');
        });
      });
    });
  });

  describe('Vesting', () => {
    describe('GIVEN the token has an open crowdsale', () => {
      let inveCoin;
      let inveCrowdsale;

      const openingTimeFromNow = 10;
      const crowdsaleDuration = 10000;
      const fundingCapInUsd = new BN('100000');
      const raisedPresaleInUsd = new BN('0');

      const addressesToWhitelist = [owner, anUser, anotherUser];
      beforeEach(async () => {
        /* eslint-disable */
        ({ inveCoin, inveCrowdsale } = await deployOpenCrowdsale(
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
      });
      describe('WHEN a non-minter tries to add vested tokens', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin.addVesting(anotherUser, 100, 3, 6, false, true, { from: anotherUser })
            .should.be.rejected;
        });
      });

      describe('WHEN a minter adds a vesting more than once', () => {
        it('THEN the transaction success', async () => {
          await inveCoin.addVesting(anUser, 100, 3, 6, false, true, { from: owner });
          await inveCoin.addVesting(anUser, 100, 3, 6, false, true, { from: owner });
        });

        it('should fail when adds a different kind of vesting for the same user', async () => {
          await inveCoin.addVesting(anUser, 100, 3, 6, false, true, { from: owner });
          await inveCoin
            .addVesting(anUser, 100, 2, 8, false, true, { from: owner })
            .should.be.rejectedWith('months to start must equal to the current vesting');
          await inveCoin
            .addVesting(anUser, 100, 3, 8, false, true, { from: owner })
            .should.be.rejectedWith('months to finish must equal to the current vesting');
        });

        it('should increment the amount of vesteable tokens available to be claimed', async () => {
          await inveCoin.addVesting(anUser, 100, 3, 6, false, true, { from: owner });
          expect((await inveCoin.vestings(anUser)).vesteableTokens.toNumber()).to.be.equal(100);
          await inveCoin.addVesting(anUser, 100, 3, 6, false, true, { from: owner });
          expect((await inveCoin.vestings(anUser)).vesteableTokens.toNumber()).to.be.equal(200);
        });
      });

      describe('WHEN a minter tries to add vesteable tokens and the length is inconsistent', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin
            .addVestingBatch([anUser], [100], [3, 2], [6], { from: owner })
            .should.be.rejectedWith('Arrays length mismatch');
        });
      });

      describe('WHEN a minter tries to add vesting tokens and the start and end month are equal', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin
            .addVesting(anUser, 100, 3, 3, false, true, { from: owner })
            .should.be.rejectedWith('No time to vest');
        });
      });

      describe('WHEN a minter tries to add vesting tokens and the start and end month are equal', () => {
        it('THEN the transaction fails', async () => {
          await inveCoin
            .addVesting(anUser, 0, 3, 6, false, true, { from: owner })
            .should.be.rejectedWith('No tokens to vest');
        });
      });
    });

    describe('GIVEN a contract has an open crowdsale', () => {
      describe('AND a user has 10 vested tokens charged as private', () => {
        let inveCoin;
        let presaleStartVestingTimestamp;
        beforeEach(async () => {
          presaleStartVestingTimestamp = await getCurrentTime();
          ({ inveCoin } = await deployFinishedCrowdsaleContract(
            owner,
            [anUser],
            [10],
            [6],
            [12],
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            48,
            presaleStartVestingTimestamp,
          ));
        });

        describe('WHEN he tries to claim them progressively', () => {
          it('THEN he can only claim the amount he is supposed to do every time and the final amount is 10', async () => {
            let logs;
            const expectedAmountsToTake = [1, 2, 2, 1, 2, 2];

            const checkNextStep = async amountExpected => {
              await advanceTime(monthToSeconds * 1);
              ({ logs } = await inveCoin.claim({ from: anUser }));
              expectEvent.inLogs(logs, 'TokensClaimed', {
                amount: new BN(amountExpected),
                user: anUser,
              });
              expectEvent.inLogs(logs, 'Transfer', {
                value: new BN(amountExpected),
                to: anUser,
                from: ZERO_ADDRESS,
              });
            };
            // Only five months because we want to add the last month later
            await advanceTime(monthToSeconds * 6);

            await concatPromises(expectedAmountsToTake, checkNextStep);
          });
        });
      });

      describe('AND a user has 10 vested tokens charged as private', () => {
        let inveCoin;
        let presaleStartVestingTimestamp;
        describe('WHEN he tries to claim them progressively',  () => {          
          it('THEN the user cannot claim before the crowdsale is over but after the crowdsale is over should su', async () => {
            const openingTimeFromNow = 100;
            const crowdsaleDuration = 10000;
            const fundingCapInUsd = new BN('100000');
            const raisedPresaleInUsd = new BN('0');
            const addressesToWhitelist = [owner, anUser, anotherUser];
            const companyPercentage = 48;
            const presaleStartVestingTimestamp = await getCurrentTime();  
            const discountThresholds = [2, 3, 4, 5].map(x => new BN(x));
            const discountValues = [10, 20, 30, 40].map(x => new BN(x));
            const discountIsPercentage = [true, true, true, true];
            const monthsToStartVestingDiscount = [3, 3, 3, 3].map(x => new BN(x));
            const monthsToEndVestingDiscount = [6, 6, 6, 6].map(x => new BN(x));
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
              companyPercentage,
              presaleStartVestingTimestamp,
            ));
            const precision = await inveCrowdsale.PRECISION();
            await setDistributionAddresses(
              inveCrowdsale,
              distributionAddresses,
              distributionPercentages,
              distributionMonthsToStart,
              distributionMonthsToEnd,
              owner,
            );
            await inveCrowdsale.buyTokens(anUser, {
              from: anUser,
              value: await inveCrowdsale.usdToWei(new BN(3).mul(precision)),
            });
            const tokensBought = await inveCoin.vestingBalanceOf(anUser);


            const startingBalance = await inveCoin.balanceOf(anUser);
            expect(startingBalance).to.be.bignumber.equal(new BN(0));
            
            await inveCoin.claim({ from: anUser }).should.be.rejectedWith('User start vesting date has not been reached yet');

            await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
            await inveCrowdsale.finish({ from: owner });
            await inveCoin.claim({ from: anUser }).should.be.rejectedWith('Has not reached vesting start date');
  
            const expectedAmountsToTake = [
              tokensBought.div(new BN(3)),
              tokensBought.div(new BN(3)),
              tokensBought.sub(tokensBought.div(new BN(3)).mul(new BN(2)))];

            // Only five months because we want to add the last month later
            await advanceTime(monthToSeconds * 3);

            const checkNextStep = async amountExpected => {
              await advanceTime(monthToSeconds * 1);
              ({ logs } = await inveCoin.claim({ from: anUser }));
              expectEvent.inLogs(logs, 'TokensClaimed', {
                amount: new BN(amountExpected),
                user: anUser,
              });
              expectEvent.inLogs(logs, 'Transfer', {
                value: new BN(amountExpected),
                to: anUser,
                from: ZERO_ADDRESS,
              });
            };

            await concatPromises(expectedAmountsToTake, checkNextStep);
          });
        });
      });

      describe('AND a user has 100 vested tokens charged as pre-sales', () => {
        let inveCoin;
        let inveCrowdsale;
        let presaleStartVestingTimestamp;

        const openingTimeFromNow = 100;
        const crowdsaleDuration = 10000;
        const fundingCapInUsd = new BN('100000');
        const raisedPresaleInUsd = new BN('0');
        const discountThresholds = [];
        const discountValues = [];
        const discountIsPercentage = [];
        const monthsToStartVestingDiscount = [];
        const monthsToEndVestingDiscount = [];
        const companyPercentage = 48;

        const addressesToWhitelist = [owner, anUser, anotherUser];
        beforeEach(async () => {
          presaleStartVestingTimestamp = await getCurrentTime();
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
            companyPercentage,
            presaleStartVestingTimestamp,
          ));
          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );
          await inveCoin.addVestingBatch([anUser], [100], [3], [6], { from: owner });
        });

        describe('WHEN he tries to claim them immediately', () => {
          it('THEN the transaction fails', async () => {
            await inveCoin
              .claim({ from: anUser })
              .should.be.rejectedWith('Has not reached vesting start date');
          });
        });

        describe('WHEN he claims them at the end of the 4th month', () => {
          it('THEN the users gets a third of his tokens', async () => {
            await advanceTime(monthToSeconds * 4);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(33), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(33),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(33);
          });

          it('THEN the users vestingBalance decreases a third of his tokens', async () => {
            const oldVestingBalance = await inveCoin.vestingBalanceOf(anUser);
            await advanceTime(monthToSeconds * 4);
            await inveCoin.claim({ from: anUser });
            await expect(await inveCoin.vestingBalanceOf(anUser)).to.be.bignumber.equal(
              oldVestingBalance.sub(new BN(33)),
            );
          });

          it('THEN the totalSupply doesnt change', async () => {
            await advanceTime(monthToSeconds * 4);
            const oldTotalSupply = await inveCoin.totalSupply();
            await inveCoin.claim({ from: anUser });
            expect(await inveCoin.totalSupply()).to.be.bignumber.equal(oldTotalSupply);
          });

          it('THEN the vestingSupply decreases in the amount received by the user tokens', async () => {
            await advanceTime(monthToSeconds * 4);
            const oldBalance = await inveCoin.balanceOf(anUser);
            const oldVestingSupply = await inveCoin.vestingSupply();
            await inveCoin.claim({ from: anUser });
            const newBalance = await inveCoin.balanceOf(anUser);
            const claimedAmount = newBalance.sub(oldBalance);
            expect(await inveCoin.vestingSupply()).to.be.bignumber.equal(
              oldVestingSupply.sub(claimedAmount),
            );
          });

          it('THEN the circulatingSupply increases in the amount received by the user tokens', async () => {
            await advanceTime(monthToSeconds * 4);
            const oldBalance = await inveCoin.balanceOf(anUser);
            const oldCirculatingSupply = await inveCoin.circulatingSupply();
            await inveCoin.claim({ from: anUser });
            const newBalance = await inveCoin.balanceOf(anUser);
            const claimedAmount = newBalance.sub(oldBalance);
            expect(await inveCoin.circulatingSupply()).to.be.bignumber.equal(
              oldCirculatingSupply.add(claimedAmount),
            );
          });
        });

        describe('WHEN he tries to claim them at the middle of the 5th month, i.e. at the middle of the vesting time', () => {
          it('THEN the transaction doesnt fail AND the user can claim a half of his tokens', async () => {
            await advanceTime(monthToSeconds * 4.5);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(50), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(50),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(50);
          });
        });

        describe('WHEN he tries to claim them at the middle at the 73%(arbitrary number) the vesting time', () => {
          it('THEN the transaction doesnt fail AND the user can claim a half of his tokens', async () => {
            const vestingDurationInMonths = 6 - 3;
            const monthsToStartVesting = 3;
            // Advance to the vesting starting point
            await advanceTime(monthToSeconds * monthsToStartVesting);
            // Advance 73% of the vesting duration
            await advanceTime((monthToSeconds * vestingDurationInMonths * 73) / 100);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(73), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(73),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(73);
          });
        });

        describe('WHEN he tries to claim them immediately', () => {
          describe('AND later he tries to claim them at the end of the 4th month', () => {
            it('THEN the transaction doesnt fail AND the user can claim his tokens', async () => {
              await inveCoin
                .claim({ from: anUser })
                .should.be.rejectedWith('Has not reached vesting start date');
              await advanceTime(monthToSeconds * 4);
              const { logs } = await inveCoin.claim({ from: anUser });
              expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(33), user: anUser });
              expectEvent.inLogs(logs, 'Transfer', {
                value: new BN(33),
                to: anUser,
                from: ZERO_ADDRESS,
              });
              await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(33);
            });
          });
        });

        describe('WHEN he tries to claim them on the 10th month', async () => {
          it('THEN he will only have 10 tokens', async () => {
            await advanceTime(monthToSeconds * 9);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(100), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(100),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(100);
          });
        });

        describe('WHEN he claims them ', async () => {
          it('THEN the totalSupply doesnt change', async () => {
            await advanceTime(monthToSeconds * 6);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(100), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(100),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(100);
          });
        });

        describe('WHEN he tries to claim twice them on the 7th month', async () => {
          it('THEN he will only have 10 tokens', async () => {
            await advanceTime(monthToSeconds * 6);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(100), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(100),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await inveCoin
              .claim({ from: anUser })
              .should.be.rejectedWith('The user has claimed all the tokens he can claim for now');
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(100);
          });
        });

        describe('WHEN he tries to claim at the end of the 4th month twice', () => {
          it('THEN the second transaction fails and the first one succeds', async () => {
            await advanceTime(monthToSeconds * 4);
            const { logs } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(33), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(33),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await inveCoin
              .claim({ from: anUser })
              .should.be.rejectedWith('The user has claimed all the tokens he can claim for now');
            await expect((await inveCoin.balanceOf(anUser)).toNumber()).to.be.equal(33);
          });
        });

        describe('AND another user has not', () => {
          it('THEN the second user can not claim any', async () => {
            await inveCoin.claim({ from: anotherUser }).should.be.rejected;
          });
        });

        describe('WHEN he tries to claim them progressively', () => {
          it('THEN he can only claim the amount he is supposed to do(rounded down) every time', async () => {
            let logs;
            await advanceTime(monthToSeconds * 4);
            ({ logs } = await inveCoin.claim({ from: anUser }));
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(33), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(33),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await advanceTime(monthToSeconds * 1);
            ({ logs } = await inveCoin.claim({ from: anUser }));
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(33), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(33),
              to: anUser,
              from: ZERO_ADDRESS,
            });
            await advanceTime(monthToSeconds * 1);
            ({ logs } = await inveCoin.claim({ from: anUser }));
            expectEvent.inLogs(logs, 'TokensClaimed', { amount: new BN(34), user: anUser });
            expectEvent.inLogs(logs, 'Transfer', {
              value: new BN(34),
              to: anUser,
              from: ZERO_ADDRESS,
            });
          });
        });

        describe('WHEN a company member tries to claim his tokens immediately', () => {
          it('THEN the transaction fails', async () => {
            await inveCoin
              .claim({ from: anUser })
              .should.be.rejectedWith('Has not reached vesting start date');
          });
        });

        describe('WHEN a company member tries to claim his tokens twice', () => {
          it('THEN the second transaction fails', async () => {
            await advanceTime(crowdsaleDuration + 1);
            await expect(await inveCoin.balanceOf(companyA)).to.be.bignumber.equal(new BN(0));
            await inveCrowdsale.finish({ from: owner });
            await inveCoin.claim({ from: companyA });
            await inveCoin
              .claim({ from: companyA })
              .should.be.rejectedWith('The user has claimed all the tokens he can claim for now');
          });
        });
      });

      describe('AND no one has vested tokens charged as pre-sales', () => {
        let inveCrowdsale;
        let inveCoin;

        const openingTimeFromNow = 100;

        const crowdsaleDuration = 10000;
        const fundingCapInUsd = new BN('100000');
        const raisedPresaleInUsd = new BN('0');
        const companyAddress = thirdUser;

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
          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: owner });
        });

        describe('WHEN any random person wants to claim tokens', () => {
          it('THEN cannot claim any token', async () => {
            await inveCoin
              .claim({ from: owner })
              .should.be.rejectedWith('User has not vesteable tokens');
            await inveCoin
              .claim({ from: owner })
              .should.be.rejectedWith('User has not vesteable tokens');
            await inveCoin
              .claim({ from: owner })
              .should.be.rejectedWith('User has not vesteable tokens');
          });
        });

        describe('WHEN any person from the company wants to claim tokens', () => {
          it('THEN he cannot claim any token', async () => {
            await inveCoin
              .claim({ from: companyAddress })
              .should.be.rejectedWith('User has not vesteable tokens');
          });
        });
      });

      describe('AND two users have vested tokens charged as pre-sales', () => {
        let inveCrowdsale;
        let inveCoin;
        let presaleStartVestingTimestamp;

        const openingTimeFromNow = 100;
        const crowdsaleDuration = 10000;
        const fundingCapInUsd = new BN('100000');
        const raisedPresaleInUsd = new BN('0');
        const discountThresholds = [];
        const discountValues = [];
        const discountIsPercentage = [];
        const monthsToStartVestingDiscount = [];
        const monthsToEndVestingDiscount = [];
        const companyPercentage = 48;

        const addressesToWhitelist = [owner, anUser, anotherUser];
        beforeEach(async () => {
          presaleStartVestingTimestamp = await getCurrentTime();
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
            companyPercentage,
            presaleStartVestingTimestamp,
          ));
          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );
          await inveCoin.addVestingBatch([anUser, anotherUser], [100, 100], [3, 3], [6, 6], {
            from: owner,
          });
          await advanceTime(crowdsaleDuration + 1); // Make the crowdsale able to finish
          await inveCrowdsale.finish({ from: owner });
        });
        describe('WHEN both claim their tokens separately', () => {
          it('THEN both transactions are successful', async () => {
            await advanceTime(monthToSeconds * 4);

            const { logs: logsFirstUser } = await inveCoin.claim({ from: anUser });
            expectEvent.inLogs(logsFirstUser, 'TokensClaimed', {
              amount: new BN(33),
              user: anUser,
            });
            expectEvent.inLogs(logsFirstUser, 'Transfer', {
              value: new BN(33),
              to: anUser,
              from: ZERO_ADDRESS,
            });

            const { logs: logsSecondUser } = await inveCoin.claim({ from: anotherUser });
            expectEvent.inLogs(logsSecondUser, 'TokensClaimed', {
              amount: new BN(33),
              user: anotherUser,
            });
            expectEvent.inLogs(logsSecondUser, 'Transfer', {
              value: new BN(33),
              to: anotherUser,
              from: ZERO_ADDRESS,
            });
          });
        });
      });

      describe('AND there are users that have pre-sale tokens and others that have private tokens', () => {
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
          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );
          // TODO Load tests that test at least 100 accounts
          await inveCoin.addVestingBatch([anUser], [100], [3], [6], { from: owner });
        });

        describe('WHEN the crowdsale is open', () => {
          it('should be able to claim tokens and receive the expected amount of tokens', async () => {
            await expect(await inveCoin.balanceOf(companyA)).to.be.bignumber.equal(new BN(0));
            await expect(await inveCoin.balanceOf(companyB)).to.be.bignumber.equal(new BN(0));
            await expect(await inveCoin.balanceOf(companyC)).to.be.bignumber.equal(new BN(0));

            const totalSupply = await inveCoin.totalSupply();

            await advanceTime(crowdsaleDuration + 1);
            await inveCrowdsale.finish({ from: owner });
            await advanceTime(monthToSeconds * distributionMonthsToEnd[2] + 1);

            await inveCoin.claim({ from: companyA });
            await inveCoin.claim({ from: companyB });
            await inveCoin.claim({ from: companyC });

            const companyTokens = totalSupply
              .mul(new BN(companyTokensPercentage))
              .div(new BN(100 - companyTokensPercentage));

            const expectedTokensA = companyTokens
              .mul(new BN(distributionPercentages[0]))
              .div(new BN(100));

            const expectedTokensB = companyTokens
              .mul(new BN(distributionPercentages[1]))
              .div(new BN(100));

            const expectedTokensC = companyTokens
              .mul(new BN(distributionPercentages[2]))
              .div(new BN(100));

            await expect(await inveCoin.balanceOf(companyA)).to.be.bignumber.equal(expectedTokensA);
            await expect(await inveCoin.balanceOf(companyB)).to.be.bignumber.equal(expectedTokensB);
            await expect(await inveCoin.balanceOf(companyC)).to.be.bignumber.equal(expectedTokensC);
          });
        });
      });

      
      describe('crowdsale is open', () => {
        let inveCrowdsale;

        const openingTimeFromNow = 100;
        const crowdsaleDuration = 10000;
        const fundingCapInUsd = new BN('100000');
        const raisedPresaleInUsd = new BN('0');

        const addressesToWhitelist = [owner, anUser, anotherUser];
        beforeEach(async () => {
          ({ inveCrowdsale } = await deployOpenCrowdsale(
            owner,
            openingTimeFromNow,
            crowdsaleDuration,
            fundingCapInUsd,
            raisedPresaleInUsd,
            addressesToWhitelist,
          ));
        });

        it('should not able to finish it without setting the distribution addresses', async () => {
          await advanceTime(crowdsaleDuration + 1);
          await inveCrowdsale
            .finish({ from: owner })
            .should.be.rejectedWith(
              'set the company distributions addresses before finish the crowdsale',
            );
        });

        it('should able to finish if the distribution is set', async () => {
          await advanceTime(crowdsaleDuration + 1);
          await inveCrowdsale
            .finish({ from: owner })
            .should.be.rejectedWith(
              'set the company distributions addresses before finish the crowdsale',
            );

          await setDistributionAddresses(
            inveCrowdsale,
            distributionAddresses,
            distributionPercentages,
            distributionMonthsToStart,
            distributionMonthsToEnd,
            owner,
          );

          await inveCrowdsale.finish({ from: owner }).should.be.fulfilled;
        });
      });
    });
  });
});
