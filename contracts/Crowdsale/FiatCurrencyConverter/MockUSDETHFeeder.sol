pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./IUsdEthFeeder.sol";

/**
 * @title Mock USD-ETH Feeder for testing purposes
 * @dev MockUSDETHFeeder A contract used for testing purposes only. It defines the WEI/USD rate hardcoded
 */
contract MockUSDETHFeeder is IUsdEthFeeder, Ownable {

  uint256 private _rate = 7234334203206400; // Default price

  /** 
    @dev Function that returns the ETH-USD Ratio
    @return rate Number of Weis equivalent to a full dollar
  */
  function read() public view returns (uint256) {
    return _rate;
  }

  /** 
    @dev Function that lets the owner change the ETH-USD Ratio
    @param newRate Number of Weis equivalent to a full dollar
  */
  function write(uint256 newRate) public onlyOwner {
    _rate = newRate;
  }
}
