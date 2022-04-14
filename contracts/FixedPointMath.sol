pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";


library FixedPointMath {
  using SafeMath for uint256;
  
  uint256 constant STEPS_IN_TAYLOR_SERIES = 16;
  uint256 constant LN_THREE_HALVES = 405465108108164381978013115;
  uint256 constant MAX_PRECISION_IN_LN = 10 ** 27;

  /** 
    @dev Multiply two values with a given precision and returns the result with the same precision   
  */
  function mul(uint256 a, uint256 b, uint256 precision) public pure returns(uint256) {
    return a.mul(b).div(precision);
  }
  
  /** 
    @dev Divide two values with a given precision and returns the result with the same precision   
  */
  function div(uint256 a, uint256 b, uint256 precision) public pure returns(uint256) {
    return a.mul(precision).div(b);
  }
  
  /** 
    @dev Calculates the natural logarithm of _x (_x with the precision in the param) and returns 
    the result with the same precision.
    It calculates it decreasing _x mulitplicatively until is close to 1 and then calculates it using
    the taylor series.
    This fn takes O(log x + s) time, where x is x and s is the amount of terms taken in the 
    taylor series(defined as a const)
  */
  function ln(uint256 _x, uint256 precision) public pure returns(uint256) {
    require(precision <= MAX_PRECISION_IN_LN, "Precision exceeded");
    // Based on this post: https://ethereum.stackexchange.com/a/8110
    
    uint256 y;
    uint256 log = 0;
    uint256 x = _x;
    uint256 i = 1;
    uint256 lnThreeHalvesWithPrecision = LN_THREE_HALVES.mul(precision).div(MAX_PRECISION_IN_LN);
    // uint256 lnTenNinethsWithPrecision = lnTenNineths.mul(precision).div(maxPrecision);
    // uint256 ln20over19WithPrecision = ln20over19.mul(precision).div(maxPrecision);
    
    // If we are too far from 1 ( x > 1.5);
    // get near using the identity ln( x * 3/2 ) = ln(x) + ln(3/2)
    while (x >= uint256(3).mul(precision).div(uint256(2))) {
      log = log.add(lnThreeHalvesWithPrecision);
      x = x.mul(2).div(3);
    }
        
    // Uses the taylor serie (around 1) to aproximate
    // Theory behind http://en.wikipedia.org/wiki/Natural_logarithm#Derivative.2C_Taylor_series
    x = x.sub(precision); // Variable change x = x - 1
    y = x;
    while (i < STEPS_IN_TAYLOR_SERIES) {
      log = log.add(y.div(i));  // Odd-th term

      i = i.add(1);
      y = mul(y, x, precision);

      log = log.sub(y.div(i)); // Even-th term
      
      i = i.add(1);
      y = mul(y, x, precision);
    }
    return log;
  }
}