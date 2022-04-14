pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./IUsdEthFeeder.sol";
import "./Config.sol";

/**
  @title FiatCurrencyConverter
  @dev Contract that handles all the fiat to crypto and crypto to
  fiat convertions. Note that because of using uints the two functions
  are PRACTICALLY not the exact inverse of each other; but IDEALLY they
  are 
 */
contract FiatCurrencyConverter is Config, Ownable {

  using SafeMath for uint256;

  IUsdEthFeeder public _usdEthFeeder;

  /**
    @dev Constructor of the ToFiatCurrencyConverter
    @param usdEthFeeder Rate Feeder contract. Must comply IUsdEthFeeder interface
  */
  constructor(IUsdEthFeeder usdEthFeeder) public {
    _usdEthFeeder = usdEthFeeder;
  }

  /**
    @dev Change the usd/eth feeder contract. Only the owner of this contract can call this function
    @param newFeeder New Rate Feeder contract. Must comply IUsdEthFeeder interface

  */
  function changeFeeder(IUsdEthFeeder newFeeder) public onlyOwner {
    _usdEthFeeder = newFeeder;
  }

  /**
    @dev Convert dollars to weis
    @param usdAmount Amount in dollars with precision to convert
    @return weiAmount Same amount measured in weis, rounded down
   */
  function usdToWei(uint256 usdAmount) public view returns (uint256) {
    uint256 weisInADollar = _usdEthFeeder.read();
    return usdAmount.mul(weisInADollar).div(PRECISION);
    
  }

  /**
    @dev Convert weis to dollars
    @param weiAmount Amount in weis to convert
    @return usdAmount Same amount measured in dollars with precision, rounded down
   */  
  function weiToUsd(uint256 weiAmount) public view returns (uint256) {
    uint256 weisInADollar = _usdEthFeeder.read();
    return weiAmount.mul(PRECISION).div(weisInADollar);
  }
}
