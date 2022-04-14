const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { BN } = require('openzeppelin-test-helpers');

const { toBN } = require('./utils');

const FixedPointMath = artifacts.require('FixedPointMath');

const { expect } = chai;
const expectedPrecision = new BN('1e9');
chai.use(chaiAsPromised);
chai.should();
contract('FixedPointMath', () => {
  let lib;
  before(async () => {
    lib = await FixedPointMath.new();
  });
  describe('Logarithm', () => {
    const cases = [
      {
        x: toBN('3e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('1098612288670000000'),
      },
      {
        x: toBN('15e26'),
        precision: toBN('1e27'),
        expectedValue: toBN('405465108108164381978013115'),
      },
      {
        x: toBN('27182818284'),
        precision: toBN('1e10'),
        expectedValue: toBN('1e10'),
      },
      {
        x: toBN('1e19'),
        precision: toBN('1e19'),
        expectedValue: toBN('0'),
      },
      {
        x: toBN('5e25'),
        precision: toBN('1e19'),
        expectedValue: toBN('154249484703983744787'),
      },
    ];
    cases.forEach(({ x, precision, expectedValue }) => {
      it(`Ln(${x}) with precision ${precision}`, async () => {
        const ln = await lib.ln(x, precision);
        expect(ln).to.be.bignumber.closeTo(expectedValue, expectedValue.div(expectedPrecision));
      });
    });
  });

  describe('Multiplication', () => {
    const cases = [
      {
        a: toBN('3e18'),
        b: toBN('3e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('9e18'),
      },
      {
        a: toBN('3e15'),
        b: toBN('3e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('9e15'),
      },
      {
        a: toBN('3e15'),
        b: toBN('5e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('15e15'),
      },
      {
        a: toBN('3e30'),
        b: toBN('3e30'),
        precision: toBN('1e18'),
        expectedValue: toBN('9e42'),
      },
      {
        a: toBN('3'),
        b: toBN('3e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('9'),
      },
      {
        a: toBN('1e18'),
        b: toBN('1e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('1e18'),
      },
    ];
    cases.forEach(({ a, b, precision, expectedValue }) => {
      it(`${a} and ${b} with precision ${precision}`, async () => {
        const mult = await lib.mul(a, b, precision);
        expect(mult).to.be.bignumber.closeTo(expectedValue, expectedValue.div(expectedPrecision));
      });
    });
  });

  describe('Division', () => {
    const cases = [
      {
        a: toBN('3e18'),
        b: toBN('1'),
        precision: toBN('1e18'),
        expectedValue: toBN('3e36'),
      },
      {
        a: toBN('3e18'),
        b: toBN('3e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('1e18'),
      },
      {
        a: toBN('10e18'),
        b: toBN('3e18'),
        precision: toBN('1e18'),
        expectedValue: toBN('3333333333333333333'),
      },
    ];
    cases.forEach(({ a, b, precision, expectedValue }) => {
      it(`${a} / ${b} with precision ${precision}`, async () => {
        const div = await lib.div(a, b, precision);
        expect(div).to.be.bignumber.closeTo(expectedValue, expectedValue.div(expectedPrecision));
      });
    });
  });
});
